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
  /// HTTPで指定されたGETをHTTPSへ切り替える方針。設定を読めるWebView側から要求ごとに渡す。
  pub https_mode: Option<String>,
}

/// HTTPで指定されたGETを、HTTPSへ切り替えるかどうかの方針。
/// 値は packages/chlib の HttpsMode と同じで、未指定・不正な値は従来どおりHTTPS優先にする。
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum HttpsMode {
  /// HTTPSだけで接続し、HTTPへは戻さない。
  HttpsOnly,
  /// HTTPSを先に試し、接続に失敗した場合だけ元のHTTPへ戻す。
  HttpsFirst,
  /// URLのとおりに接続し、HTTPSへ切り替えない。
  Auto,
}

impl HttpsMode {
  fn from_request(value: Option<&str>) -> Self {
    match value {
      Some("https_only") => Self::HttpsOnly,
      Some("auto") => Self::Auto,
      _ => Self::HttpsFirst,
    }
  }
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

    let https_mode = HttpsMode::from_request(request.https_mode.as_deref());
    let upgrades_to_https =
      method == Method::GET && url.scheme() == "http" && https_mode != HttpsMode::Auto;
    let response = if upgrades_to_https {
      let mut secure_url = url.clone();
      secure_url
        .set_scheme("https")
        .map_err(|_| "HTTPS URLへ変換できませんでした".to_string())?;
      match self
        .send_once(&secure_url, &method, &headers, request)
        .await
      {
        Ok(response) => response,
        Err(error) => {
          // HTTPSだけを使う設定では、平文での再試行をしない。
          if https_mode == HttpsMode::HttpsOnly || has_sensitive_headers(&headers) {
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
    let mut builder = self
      .client
      .request(method.clone(), url.clone())
      .headers(headers.clone());
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
    let value =
      HeaderValue::from_str(value).map_err(|error| format!("HTTPヘッダー値が不正です: {error}"))?;
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
#[path = "http_transport_tests.rs"]
mod tests;
