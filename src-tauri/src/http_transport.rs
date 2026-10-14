use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use reqwest::header::{HeaderMap, HeaderName, HeaderValue, CONTENT_LENGTH};
use reqwest::{Client, Method, Response, Url};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime};
use tauri::State;
use tokio::sync::Semaphore;

const MAX_CONCURRENT_REQUESTS: usize = 3;
const MAX_PENDING_REQUESTS: usize = 13;
const FAILURE_BACKOFF_BASE: Duration = Duration::from_millis(500);
const FAILURE_BACKOFF_MAX: Duration = Duration::from_secs(30);
const MAX_RETRY_AFTER: Duration = Duration::from_millis(2_147_000_000);
const HTTP_USER_AGENT: &str = "http/2.8.0";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HttpRequest {
  pub url: String,
  pub method: Option<String>,
  pub headers: Option<HashMap<String, String>>,
  pub body: Option<String>,
  pub body_base64: Option<String>,
  pub timeout: Option<u64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HttpResponse {
  pub status: u16,
  pub headers: HashMap<String, String>,
  pub body_base64: String,
  pub url: String,
}

#[derive(Default)]
struct HostState {
  failures: HashMap<String, u32>,
  cooldown_until: HashMap<String, Instant>,
}

pub struct HttpTransportState {
  client: Client,
  active: Arc<Semaphore>,
  pending: AtomicUsize,
  hosts: Mutex<HostState>,
}

impl HttpTransportState {
  pub fn new() -> Result<Self, String> {
    let client = Client::builder()
      // 旧plugin-httpのUser-Agentを維持し、Cookie Jarは全ウィンドウで共有する。
      .user_agent(HTTP_USER_AGENT)
      .cookie_store(true)
      .timeout(Duration::from_secs(30))
      .build()
      .map_err(|error| format!("HTTPクライアントを初期化できませんでした: {error}"))?;
    Ok(Self {
      client,
      active: Arc::new(Semaphore::new(MAX_CONCURRENT_REQUESTS)),
      pending: AtomicUsize::new(0),
      hosts: Mutex::new(HostState::default()),
    })
  }

  async fn request(&self, request: HttpRequest) -> Result<HttpResponse, String> {
    let _pending = self.reserve_pending()?;
    let url = parse_http_url(&request.url)?;
    let host = url.host_str().unwrap_or_default().to_ascii_lowercase();

    let _permit = loop {
      let permit = self
        .active
        .clone()
        .acquire_owned()
        .await
        .map_err(|error| format!("HTTP要求枠を取得できませんでした: {error}"))?;
      let wait = self.cooldown_remaining(&host);
      if let Some(wait) = wait {
        drop(permit);
        tokio::time::sleep(wait).await;
        continue;
      }
      break permit;
    };

    let result = self.send_request(&url, &request).await;
    match &result {
      Ok(response) => self.record_response(&host, response),
      Err(_) => self.record_failure(&host, FAILURE_BACKOFF_BASE),
    }
    result
  }

  fn reserve_pending(&self) -> Result<PendingRequest<'_>, String> {
    let mut pending = self.pending.load(Ordering::Relaxed);
    loop {
      if pending >= MAX_PENDING_REQUESTS {
        return Err("HTTP待ち行列が上限に達しました".to_string());
      }
      match self.pending.compare_exchange_weak(
        pending,
        pending + 1,
        Ordering::AcqRel,
        Ordering::Relaxed,
      ) {
        Ok(_) => return Ok(PendingRequest(&self.pending)),
        Err(actual) => pending = actual,
      }
    }
  }

  fn cooldown_remaining(&self, host: &str) -> Option<Duration> {
    self
      .hosts
      .lock()
      .ok()?
      .cooldown_until
      .get(host)
      .map(|until| until.saturating_duration_since(Instant::now()))
      .filter(|remaining| !remaining.is_zero())
  }

  async fn send_request(&self, url: &Url, request: &HttpRequest) -> Result<HttpResponse, String> {
    let method = request
      .method
      .as_deref()
      .unwrap_or("GET")
      .parse::<Method>()
      .map_err(|error| format!("HTTPメソッドが不正です: {error}"))?;
    let headers = build_headers(request.headers.as_ref())?;

    let response = if method == Method::GET && url.scheme() == "http" {
      let mut secure_url = url.clone();
      secure_url
        .set_scheme("https")
        .map_err(|_| "HTTPS URLへ変換できませんでした".to_string())?;
      match self.send_once(&secure_url, &method, &headers, request).await {
        Ok(response) => response,
        Err(error) => {
          if has_sensitive_headers(&headers) {
            return Err(error);
          }
          log::warn!("HTTPS接続に失敗したため、元のHTTP URLで再試行します: {error}");
          self.send_once(url, &method, &headers, request).await?
        }
      }
    } else {
      self.send_once(url, &method, &headers, request).await?
    };
    response_to_http_response(response).await
  }

  async fn send_once(
    &self,
    url: &Url,
    method: &Method,
    headers: &HeaderMap,
    request: &HttpRequest,
  ) -> Result<Response, String> {
    let mut builder = self.client.request(method.clone(), url.clone()).headers(headers.clone());
    if let Some(body) = &request.body {
      builder = builder.body(body.as_bytes().to_vec());
    } else if let Some(body) = &request.body_base64 {
      let bytes = BASE64
        .decode(body)
        .map_err(|error| format!("HTTP要求本文のBase64が不正です: {error}"))?;
      builder = builder.body(bytes);
    } else if (method == Method::POST || method == Method::PUT)
      && !headers.contains_key(CONTENT_LENGTH)
    {
      builder = builder.header(CONTENT_LENGTH, "0");
    }
    if let Some(timeout) = request.timeout {
      builder = builder.timeout(Duration::from_millis(timeout));
    }
    builder
      .send()
      .await
      .map_err(|error| format!("HTTP通信に失敗しました: {error}"))
  }

  fn record_response(&self, host: &str, response: &HttpResponse) {
    if response.status == 429 {
      let retry_after = response
        .headers
        .iter()
        .find(|(name, _)| name.eq_ignore_ascii_case("retry-after"))
        .and_then(|(_, value)| parse_retry_after(value));
      let delay = retry_after.unwrap_or_else(|| self.next_failure_delay(host));
      self.record_failure(host, delay);
      return;
    }
    if response.status == 408 || response.status >= 500 {
      self.record_failure(host, self.next_failure_delay(host));
      return;
    }

    if let Ok(mut hosts) = self.hosts.lock() {
      hosts.failures.remove(host);
      if hosts
        .cooldown_until
        .get(host)
        .is_some_and(|until| *until <= Instant::now())
      {
        hosts.cooldown_until.remove(host);
      }
    }
  }

  fn next_failure_delay(&self, host: &str) -> Duration {
    let failures = self
      .hosts
      .lock()
      .ok()
      .and_then(|hosts| hosts.failures.get(host).copied())
      .unwrap_or_default();
    FAILURE_BACKOFF_BASE
      .checked_mul(2_u32.saturating_pow(failures))
      .unwrap_or(FAILURE_BACKOFF_MAX)
      .min(FAILURE_BACKOFF_MAX)
  }

  fn record_failure(&self, host: &str, delay: Duration) {
    if let Ok(mut hosts) = self.hosts.lock() {
      *hosts.failures.entry(host.to_string()).or_default() += 1;
      let until = Instant::now() + delay;
      hosts
        .cooldown_until
        .entry(host.to_string())
        .and_modify(|current| *current = (*current).max(until))
        .or_insert(until);
    }
  }
}

struct PendingRequest<'a>(&'a AtomicUsize);

impl Drop for PendingRequest<'_> {
  fn drop(&mut self) {
    self.0.fetch_sub(1, Ordering::AcqRel);
  }
}

fn parse_http_url(raw_url: &str) -> Result<Url, String> {
  let url = Url::parse(raw_url).map_err(|error| format!("URLを解釈できませんでした: {error}"))?;
  if !matches!(url.scheme(), "http" | "https") {
    return Err("URLはHTTPまたはHTTPSである必要があります".to_string());
  }
  Ok(url)
}

fn build_headers(headers: Option<&HashMap<String, String>>) -> Result<HeaderMap, String> {
  let mut result = HeaderMap::new();
  for (name, value) in headers.into_iter().flatten() {
    let name = HeaderName::from_bytes(name.as_bytes())
      .map_err(|error| format!("HTTPヘッダー名が不正です: {error}"))?;
    let value = HeaderValue::from_str(value)
      .map_err(|error| format!("HTTPヘッダー値が不正です: {error}"))?;
    result.insert(name, value);
  }
  Ok(result)
}

fn has_sensitive_headers(headers: &HeaderMap) -> bool {
  headers.contains_key("authorization") || headers.contains_key("cookie")
}

fn response_header_name(name: &str) -> String {
  match name {
    "etag" => "ETag".to_string(),
    "last-modified" => "Last-Modified".to_string(),
    _ => name
      .split('-')
      .map(|part| {
        let mut chars = part.chars();
        chars
          .next()
          .map(|first| first.to_ascii_uppercase().to_string() + chars.as_str())
          .unwrap_or_default()
      })
      .collect::<Vec<_>>()
      .join("-"),
  }
}

fn parse_retry_after(value: &str) -> Option<Duration> {
  let delay = if let Ok(seconds) = value.trim().parse::<u64>() {
    Duration::from_secs(seconds)
  } else {
    let retry_at = httpdate::parse_http_date(value).ok()?;
    retry_at
      .duration_since(SystemTime::now())
      .unwrap_or(Duration::ZERO)
  };
  Some(delay.min(MAX_RETRY_AFTER))
}

async fn response_to_http_response(response: Response) -> Result<HttpResponse, String> {
  let status = response.status().as_u16();
  let url = response.url().to_string();
  let headers = response
    .headers()
    .iter()
    .filter_map(|(name, value)| {
      value
        .to_str()
        .ok()
        .map(|value| (response_header_name(name.as_str()), value.to_string()))
    })
    .collect();
  let body = response
    .bytes()
    .await
    .map_err(|error| format!("HTTP応答を読み込めませんでした: {error}"))?
    .to_vec();
  Ok(HttpResponse {
    status,
    headers,
    body_base64: BASE64.encode(body),
    url,
  })
}

#[tauri::command]
pub async fn shared_http_request(
  state: State<'_, HttpTransportState>,
  request: HttpRequest,
) -> Result<HttpResponse, String> {
  state.request(request).await
}

#[cfg(test)]
mod tests {
  use super::*;
  use std::io::{Read, Write};
  use std::net::TcpListener;
  use std::thread::JoinHandle;

  fn start_http_server(response: &'static [u8]) -> (Url, JoinHandle<String>) {
    let listener = TcpListener::bind("127.0.0.1:0").expect("test server binds");
    let url = Url::parse(&format!("http://{}/resource", listener.local_addr().unwrap()))
      .expect("test server URL parses");
    let server = std::thread::spawn(move || {
      let (mut stream, _) = listener.accept().expect("request connects");
      stream
        .set_read_timeout(Some(Duration::from_secs(5)))
        .expect("read timeout is set");
      let mut request = Vec::new();
      let mut buffer = [0; 1024];
      loop {
        let count = stream.read(&mut buffer).expect("request can be read");
        assert!(count > 0, "request should include its complete headers and body");
        request.extend_from_slice(&buffer[..count]);
        let Some(header_end) = request.windows(4).position(|part| part == b"\r\n\r\n") else {
          continue;
        };
        let headers = String::from_utf8_lossy(&request[..header_end]);
        let content_length = headers
          .lines()
          .find_map(|line| {
            let (name, value) = line.split_once(':')?;
            name.eq_ignore_ascii_case("content-length")
              .then(|| value.trim().parse::<usize>().ok())
              .flatten()
          })
          .unwrap_or_default();
        if request.len() >= header_end + 4 + content_length {
          stream.write_all(response).expect("response is written");
          return String::from_utf8(request).expect("request is valid ASCII/UTF-8");
        }
      }
    });
    (url, server)
  }

  fn start_https_first_http_server(response: &'static [u8]) -> (Url, JoinHandle<String>) {
    let listener = TcpListener::bind("127.0.0.1:0").expect("test server binds");
    let url = Url::parse(&format!("http://{}/resource", listener.local_addr().unwrap()))
      .expect("test server URL parses");
    let server = std::thread::spawn(move || {
      let (mut tls_stream, _) = listener.accept().expect("HTTPS-first request connects");
      tls_stream
        .set_read_timeout(Some(Duration::from_secs(5)))
        .expect("TLS read timeout is set");
      let mut tls_hello = [0; 1024];
      let _ = tls_stream.read(&mut tls_hello).expect("TLS hello is read");
      drop(tls_stream);

      let (mut stream, _) = listener.accept().expect("HTTP fallback connects");
      stream
        .set_read_timeout(Some(Duration::from_secs(5)))
        .expect("HTTP read timeout is set");
      let mut request = Vec::new();
      let mut buffer = [0; 1024];
      loop {
        let count = stream.read(&mut buffer).expect("HTTP request can be read");
        assert!(count > 0, "request should include its complete headers and body");
        request.extend_from_slice(&buffer[..count]);
        let Some(header_end) = request.windows(4).position(|part| part == b"\r\n\r\n") else {
          continue;
        };
        let headers = String::from_utf8_lossy(&request[..header_end]);
        let content_length = headers
          .lines()
          .find_map(|line| {
            let (name, value) = line.split_once(':')?;
            name.eq_ignore_ascii_case("content-length")
              .then(|| value.trim().parse::<usize>().ok())
              .flatten()
          })
          .unwrap_or_default();
        if request.len() >= header_end + 4 + content_length {
          stream.write_all(response).expect("response is written");
          return String::from_utf8(request).expect("request is valid ASCII/UTF-8");
        }
      }
    });
    (url, server)
  }

  fn test_response(status: u16, headers: HashMap<String, String>) -> HttpResponse {
    HttpResponse {
      status,
      headers,
      body_base64: String::new(),
      url: "https://example.com/".to_string(),
    }
  }

  #[test]
  fn all_windows_share_the_global_pending_limit() {
    let state = HttpTransportState::new().expect("transport initializes");
    let mut accepted = Vec::new();
    let mut rejected = 0;

    for _ in 0..1_000 {
      match state.reserve_pending() {
        Ok(request) => accepted.push(request),
        Err(_) => rejected += 1,
      }
    }

    assert_eq!(accepted.len(), MAX_PENDING_REQUESTS);
    assert_eq!(rejected, 1_000 - MAX_PENDING_REQUESTS);
    drop(accepted);
    assert!(state.reserve_pending().is_ok());
  }

  #[test]
  fn shared_transport_has_three_global_network_permits() {
    let state = HttpTransportState::new().expect("transport initializes");
    let permits: Vec<_> = (0..MAX_CONCURRENT_REQUESTS)
      .map(|_| state.active.clone().try_acquire_owned().expect("permit is available"))
      .collect();

    assert!(state.active.clone().try_acquire_owned().is_err());
    drop(permits);
    assert_eq!(state.active.available_permits(), MAX_CONCURRENT_REQUESTS);
  }

  #[test]
  fn rate_limit_cooldown_is_shared_by_all_windows() {
    let state = HttpTransportState::new().expect("transport initializes");
    state.record_response(
      "example.com",
      &HttpResponse {
        status: 429,
        headers: HashMap::from([("Retry-After".to_string(), "2".to_string())]),
        body_base64: String::new(),
        url: "https://example.com/".to_string(),
      },
    );

    assert!(state.cooldown_remaining("example.com").unwrap() >= Duration::from_secs(1));
  }

  #[test]
  fn retry_after_is_capped_to_a_safe_timer_range() {
    assert_eq!(
      parse_retry_after("18446744073709551615"),
      Some(MAX_RETRY_AFTER)
    );
  }

  #[test]
  fn http_urlとhttps_urlだけを受け付ける() {
    assert_eq!(parse_http_url("http://example.com").unwrap().scheme(), "http");
    assert_eq!(parse_http_url("https://example.com").unwrap().scheme(), "https");
    assert!(parse_http_url("file:///secret").is_err());
    assert!(parse_http_url("not a URL").is_err());
  }

  #[test]
  fn httpヘッダーを検証して大文字小文字を無視して扱う() {
    assert!(build_headers(None).unwrap().is_empty());
    let headers = HashMap::from([("X-Token".to_string(), "value".to_string())]);
    assert_eq!(build_headers(Some(&headers)).unwrap()["x-token"], "value");
    assert!(build_headers(Some(&HashMap::from([("bad header".into(), "x".into())]))).is_err());
    assert!(build_headers(Some(&HashMap::from([("x-token".into(), "\n".into())]))).is_err());
  }

  #[test]
  fn httpsへ引き継いではいけない認証ヘッダーを検出する() {
    assert!(!has_sensitive_headers(&HeaderMap::new()));
    assert!(has_sensitive_headers(&HeaderMap::from_iter([(
      reqwest::header::AUTHORIZATION,
      HeaderValue::from_static("Bearer secret"),
    )])));
    assert!(has_sensitive_headers(&HeaderMap::from_iter([(
      reqwest::header::COOKIE,
      HeaderValue::from_static("session=secret"),
    )])));
  }

  #[test]
  fn 応答ヘッダー名を互換形式へ変換する() {
    assert_eq!(response_header_name("etag"), "ETag");
    assert_eq!(response_header_name("last-modified"), "Last-Modified");
    assert_eq!(response_header_name("content-type"), "Content-Type");
    assert_eq!(response_header_name("x-custom-header"), "X-Custom-Header");
    assert_eq!(response_header_name("x--empty"), "X--Empty");
  }

  #[test]
  fn retry_afterの秒数と_http日時を解析する() {
    assert_eq!(parse_retry_after(" 2 "), Some(Duration::from_secs(2)));
    assert_eq!(parse_retry_after("invalid"), None);
    assert_eq!(parse_retry_after("Sun, 06 Nov 1994 08:49:37 GMT"), Some(Duration::ZERO));
    let future = httpdate::fmt_http_date(SystemTime::now() + Duration::from_secs(60));
    assert!(parse_retry_after(&future).unwrap() > Duration::from_secs(1));
  }

  #[test]
  fn ステータスに応じてホスト別の待機状態を更新する() {
    let state = HttpTransportState::new().unwrap();
    state.record_response("example.com", &test_response(503, HashMap::new()));
    assert_eq!(state.hosts.lock().unwrap().failures["example.com"], 1);
    state.record_response("example.com", &test_response(408, HashMap::new()));
    assert_eq!(state.hosts.lock().unwrap().failures["example.com"], 2);
    assert_eq!(state.next_failure_delay("example.com"), Duration::from_secs(2));

    state.record_response(
      "example.com",
      &test_response(429, HashMap::from([("retry-after".into(), "4".into())])),
    );
    assert!(state.cooldown_remaining("example.com").unwrap() >= Duration::from_secs(3));
    assert_eq!(state.hosts.lock().unwrap().failures["example.com"], 3);

    state.record_response("example.com", &test_response(404, HashMap::new()));
    assert!(!state.hosts.lock().unwrap().failures.contains_key("example.com"));
    assert_eq!(state.next_failure_delay("example.com"), FAILURE_BACKOFF_BASE);
  }

  #[test]
  fn retry_afterがない429は段階的待機を使う() {
    let state = HttpTransportState::new().unwrap();
    state.record_response("example.com", &test_response(429, HashMap::new()));
    assert!(state.cooldown_remaining("example.com").unwrap() > Duration::ZERO);
    assert_eq!(state.hosts.lock().unwrap().failures["example.com"], 1);
  }

  #[test]
  fn 成功後は期限切れの待機状態を消す() {
    let state = HttpTransportState::new().unwrap();
    {
      let mut hosts = state.hosts.lock().unwrap();
      hosts.failures.insert("example.com".into(), 3);
      hosts
        .cooldown_until
        .insert("example.com".into(), Instant::now() - Duration::from_secs(1));
    }
    state.record_response("example.com", &test_response(200, HashMap::new()));
    let hosts = state.hosts.lock().unwrap();
    assert!(!hosts.failures.contains_key("example.com"));
    assert!(!hosts.cooldown_until.contains_key("example.com"));
  }

  #[test]
  fn バックオフを最大30秒に制限する() {
    let state = HttpTransportState::new().unwrap();
    state.hosts.lock().unwrap().failures.insert("example.com".into(), 100);
    assert_eq!(state.next_failure_delay("example.com"), FAILURE_BACKOFF_MAX);
  }

  #[test]
  fn getの_http通信結果をヘッダーと_base64本文で返す() {
    let (url, server) = start_http_server(
      b"HTTP/1.1 201 Created\r\nETag: abc\r\nContent-Type: text/plain\r\nContent-Length: 5\r\nConnection: close\r\n\r\nhello",
    );
    let state = HttpTransportState::new().unwrap();
    let response = tauri::async_runtime::block_on(async {
      let response = state
        .send_once(&url, &Method::GET, &HeaderMap::new(), &HttpRequest {
          url: url.to_string(),
          method: None,
          headers: None,
          body: None,
          body_base64: None,
          timeout: Some(5_000),
        })
        .await
        .unwrap();
      response_to_http_response(response).await.unwrap()
    });
    let request = server.join().unwrap();
    assert!(request.starts_with("GET /resource HTTP/1.1"));
    assert_eq!(response.status, 201);
    assert_eq!(response.headers["ETag"], "abc");
    assert_eq!(response.body_base64, "aGVsbG8=");
    assert!(response.url.starts_with("http://127.0.0.1:"));
  }

  #[test]
  fn putは_base64本文と指定ヘッダーを送信する() {
    let (url, server) = start_http_server(
      b"HTTP/1.1 200 OK\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
    );
    let state = HttpTransportState::new().unwrap();
    let method = Method::PUT;
    let headers = build_headers(Some(&HashMap::from([("x-token".into(), "value".into())]))).unwrap();
    tauri::async_runtime::block_on(async {
      state
        .send_once(&url, &method, &headers, &HttpRequest {
          url: url.to_string(),
          method: Some("PUT".into()),
          headers: None,
          body: None,
          body_base64: Some("aGVsbG8=".into()),
          timeout: None,
        })
        .await
        .unwrap();
    });
    let request = server.join().unwrap();
    assert!(request.starts_with("PUT /resource HTTP/1.1"));
    assert!(request.to_ascii_lowercase().contains("x-token: value"));
    assert!(request.ends_with("hello"));
  }

  #[test]
  fn postの空本文にはcontent_lengthを設定する() {
    let (url, server) = start_http_server(
      b"HTTP/1.1 200 OK\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
    );
    let state = HttpTransportState::new().unwrap();
    tauri::async_runtime::block_on(async {
      state
        .send_once(&url, &Method::POST, &HeaderMap::new(), &HttpRequest {
          url: url.to_string(),
          method: Some("POST".into()),
          headers: None,
          body: None,
          body_base64: None,
          timeout: None,
        })
        .await
        .unwrap();
    });
    assert!(server.join().unwrap().to_ascii_lowercase().contains("content-length: 0"));
  }

  #[test]
  fn 指定した_http本文と_content_lengthを送信する() {
    let (url, server) = start_http_server(
      b"HTTP/1.1 200 OK\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
    );
    let state = HttpTransportState::new().unwrap();
    let headers = HeaderMap::from_iter([(CONTENT_LENGTH, HeaderValue::from_static("3"))]);
    tauri::async_runtime::block_on(async {
      state
        .send_once(&url, &Method::POST, &headers, &HttpRequest {
          url: url.to_string(),
          method: Some("POST".into()),
          headers: None,
          body: Some("abc".into()),
          body_base64: Some("ignored".into()),
          timeout: None,
        })
        .await
        .unwrap();
    });
    let request = server.join().unwrap();
    assert!(request.to_ascii_lowercase().contains("content-length: 3"));
    assert!(request.ends_with("abc"));
  }

  #[test]
  fn http取得は_https失敗後に待機を経て_httpへ再試行する() {
    let (url, server) = start_https_first_http_server(
      b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\nok",
    );
    let state = HttpTransportState::new().unwrap();
    let host = url.host_str().unwrap();
    state.record_failure(host, Duration::from_millis(5));
    let response = tauri::async_runtime::block_on(state.request(HttpRequest {
      url: url.to_string(),
      method: None,
      headers: None,
      body: None,
      body_base64: None,
      timeout: Some(5_000),
    }))
    .unwrap();
    let request = server.join().unwrap();
    assert!(request.starts_with("GET /resource HTTP/1.1"));
    assert_eq!(response.status, 200);
    assert_eq!(response.body_base64, "b2s=");
    assert!(state.cooldown_remaining(host).is_none());
  }

  #[test]
  fn 認証ヘッダーを含む_http要求は_https失敗時に平文へ切り替えない() {
    let listener = TcpListener::bind("127.0.0.1:0").expect("test server binds");
    let url = Url::parse(&format!("http://{}/resource", listener.local_addr().unwrap()))
      .expect("test server URL parses");
    let server = std::thread::spawn(move || {
      let (mut stream, _) = listener.accept().expect("HTTPS-first request connects");
      let mut tls_hello = [0; 1024];
      let _ = stream.read(&mut tls_hello).expect("TLS hello is read");
    });
    let state = HttpTransportState::new().unwrap();
    let request = HttpRequest {
      url: url.to_string(),
      method: None,
      headers: Some(HashMap::from([("Cookie".into(), "session=secret".into())])),
      body: None,
      body_base64: None,
      timeout: Some(5_000),
    };
    assert!(tauri::async_runtime::block_on(state.request(request)).is_err());
    server.join().unwrap();
  }

  #[test]
  fn 通信失敗時はホストへ待機を設定して待機枠を戻す() {
    let listener = TcpListener::bind("127.0.0.1:0").expect("temporary port is reserved");
    let port = listener.local_addr().unwrap().port();
    drop(listener);
    let url = format!("http://127.0.0.1:{port}/resource");
    let state = HttpTransportState::new().unwrap();
    assert!(tauri::async_runtime::block_on(state.request(HttpRequest {
      url,
      method: None,
      headers: None,
      body: None,
      body_base64: None,
      timeout: Some(100),
    }))
    .is_err());
    assert_eq!(state.pending.load(Ordering::Relaxed), 0);
    assert!(state.cooldown_remaining("127.0.0.1").is_some());
  }

  #[test]
  fn 成功応答は失敗回数を消すが期限内の待機は維持する() {
    let state = HttpTransportState::new().unwrap();
    state.record_failure("example.com", Duration::from_secs(3));
    state.record_response("example.com", &test_response(204, HashMap::new()));
    assert!(!state.hosts.lock().unwrap().failures.contains_key("example.com"));
    assert!(state.cooldown_remaining("example.com").is_some());
  }

  #[test]
  fn 不正なメソッドと_base64本文を拒否する() {
    let state = HttpTransportState::new().unwrap();
    let request = HttpRequest {
      url: "https://example.com/".into(),
      method: Some("not a method".into()),
      headers: None,
      body: None,
      body_base64: None,
      timeout: None,
    };
    let url = Url::parse(&request.url).unwrap();
    assert!(tauri::async_runtime::block_on(state.send_request(&url, &request))
      .unwrap_err()
      .contains("HTTPメソッドが不正"));

    let request = HttpRequest {
      method: Some("PUT".into()),
      body_base64: Some("!invalid!".into()),
      ..request
    };
    let url = Url::parse(&request.url).unwrap();
    assert!(tauri::async_runtime::block_on(state.send_once(&url, &Method::PUT, &HeaderMap::new(), &request))
      .unwrap_err()
      .contains("Base64が不正"));
  }

  #[test]
  fn 不正な_urlや閉じた同時実行枠でも待機数を解放する() {
    let state = HttpTransportState::new().unwrap();
    let invalid = HttpRequest {
      url: "file:///secret".into(),
      method: None,
      headers: None,
      body: None,
      body_base64: None,
      timeout: None,
    };
    assert!(tauri::async_runtime::block_on(state.request(invalid)).is_err());
    assert_eq!(state.pending.load(Ordering::Relaxed), 0);

    state.active.close();
    let closed = HttpRequest {
      url: "https://example.com/".into(),
      method: None,
      headers: None,
      body: None,
      body_base64: None,
      timeout: None,
    };
    assert!(tauri::async_runtime::block_on(state.request(closed))
      .unwrap_err()
      .contains("要求枠を取得できません"));
    assert_eq!(state.pending.load(Ordering::Relaxed), 0);
  }
}
