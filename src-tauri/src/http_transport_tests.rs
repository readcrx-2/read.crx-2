use super::*;
use std::io::{Read, Write};
use std::net::TcpListener;
use std::thread::JoinHandle;

fn start_http_server(response: &'static [u8]) -> (Url, JoinHandle<String>) {
  let listener = TcpListener::bind("127.0.0.1:0").expect("test server binds");
  let url = Url::parse(&format!(
    "http://{}/resource",
    listener.local_addr().unwrap()
  ))
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
      assert!(
        count > 0,
        "request should include its complete headers and body"
      );
      request.extend_from_slice(&buffer[..count]);
      let Some(header_end) = request.windows(4).position(|part| part == b"\r\n\r\n") else {
        continue;
      };
      let headers = String::from_utf8_lossy(&request[..header_end]);
      let content_length = headers
        .lines()
        .find_map(|line| {
          let (name, value) = line.split_once(':')?;
          name
            .eq_ignore_ascii_case("content-length")
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
  let url = Url::parse(&format!(
    "http://{}/resource",
    listener.local_addr().unwrap()
  ))
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
      assert!(
        count > 0,
        "request should include its complete headers and body"
      );
      request.extend_from_slice(&buffer[..count]);
      let Some(header_end) = request.windows(4).position(|part| part == b"\r\n\r\n") else {
        continue;
      };
      let headers = String::from_utf8_lossy(&request[..header_end]);
      let content_length = headers
        .lines()
        .find_map(|line| {
          let (name, value) = line.split_once(':')?;
          name
            .eq_ignore_ascii_case("content-length")
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
    .map(|_| {
      state
        .active
        .clone()
        .try_acquire_owned()
        .expect("permit is available")
    })
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
  assert_eq!(
    parse_http_url("http://example.com").unwrap().scheme(),
    "http"
  );
  assert_eq!(
    parse_http_url("https://example.com").unwrap().scheme(),
    "https"
  );
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
  assert_eq!(
    parse_retry_after("Sun, 06 Nov 1994 08:49:37 GMT"),
    Some(Duration::ZERO)
  );
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
  assert_eq!(
    state.next_failure_delay("example.com"),
    Duration::from_secs(2)
  );

  state.record_response(
    "example.com",
    &test_response(429, HashMap::from([("retry-after".into(), "4".into())])),
  );
  assert!(state.cooldown_remaining("example.com").unwrap() >= Duration::from_secs(3));
  assert_eq!(state.hosts.lock().unwrap().failures["example.com"], 3);

  state.record_response("example.com", &test_response(404, HashMap::new()));
  assert!(!state
    .hosts
    .lock()
    .unwrap()
    .failures
    .contains_key("example.com"));
  assert_eq!(
    state.next_failure_delay("example.com"),
    FAILURE_BACKOFF_BASE
  );
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
    hosts.cooldown_until.insert(
      "example.com".into(),
      Instant::now() - Duration::from_secs(1),
    );
  }
  state.record_response("example.com", &test_response(200, HashMap::new()));
  let hosts = state.hosts.lock().unwrap();
  assert!(!hosts.failures.contains_key("example.com"));
  assert!(!hosts.cooldown_until.contains_key("example.com"));
}

#[test]
fn バックオフを最大30秒に制限する() {
  let state = HttpTransportState::new().unwrap();
  state
    .hosts
    .lock()
    .unwrap()
    .failures
    .insert("example.com".into(), 100);
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
      .send_once(
        &url,
        &Method::GET,
        &HeaderMap::new(),
        &HttpRequest {
          url: url.to_string(),
          method: None,
          headers: None,
          body: None,
          body_base64: None,
          timeout: Some(5_000),
          https_mode: None,
        },
      )
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
  let (url, server) =
    start_http_server(b"HTTP/1.1 200 OK\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
  let state = HttpTransportState::new().unwrap();
  let method = Method::PUT;
  let headers = build_headers(Some(&HashMap::from([("x-token".into(), "value".into())]))).unwrap();
  tauri::async_runtime::block_on(async {
    state
      .send_once(
        &url,
        &method,
        &headers,
        &HttpRequest {
          url: url.to_string(),
          method: Some("PUT".into()),
          headers: None,
          body: None,
          body_base64: Some("aGVsbG8=".into()),
          timeout: None,
          https_mode: None,
        },
      )
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
  let (url, server) =
    start_http_server(b"HTTP/1.1 200 OK\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
  let state = HttpTransportState::new().unwrap();
  tauri::async_runtime::block_on(async {
    state
      .send_once(
        &url,
        &Method::POST,
        &HeaderMap::new(),
        &HttpRequest {
          url: url.to_string(),
          method: Some("POST".into()),
          headers: None,
          body: None,
          body_base64: None,
          timeout: None,
          https_mode: None,
        },
      )
      .await
      .unwrap();
  });
  assert!(server
    .join()
    .unwrap()
    .to_ascii_lowercase()
    .contains("content-length: 0"));
}

#[test]
fn 指定した_http本文と_content_lengthを送信する() {
  let (url, server) =
    start_http_server(b"HTTP/1.1 200 OK\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
  let state = HttpTransportState::new().unwrap();
  let headers = HeaderMap::from_iter([(CONTENT_LENGTH, HeaderValue::from_static("3"))]);
  tauri::async_runtime::block_on(async {
    state
      .send_once(
        &url,
        &Method::POST,
        &headers,
        &HttpRequest {
          url: url.to_string(),
          method: Some("POST".into()),
          headers: None,
          body: Some("abc".into()),
          body_base64: Some("ignored".into()),
          timeout: None,
          https_mode: None,
        },
      )
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
    https_mode: None,
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
  let url = Url::parse(&format!(
    "http://{}/resource",
    listener.local_addr().unwrap()
  ))
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
    https_mode: None,
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
    https_mode: None,
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
  assert!(!state
    .hosts
    .lock()
    .unwrap()
    .failures
    .contains_key("example.com"));
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
    https_mode: None,
  };
  let url = Url::parse(&request.url).unwrap();
  assert!(
    tauri::async_runtime::block_on(state.send_request(&url, &request))
      .unwrap_err()
      .contains("HTTPメソッドが不正")
  );

  let request = HttpRequest {
    method: Some("PUT".into()),
    body_base64: Some("!invalid!".into()),
    ..request
  };
  let url = Url::parse(&request.url).unwrap();
  assert!(tauri::async_runtime::block_on(state.send_once(
    &url,
    &Method::PUT,
    &HeaderMap::new(),
    &request
  ))
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
    https_mode: None,
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
    https_mode: None,
  };
  assert!(tauri::async_runtime::block_on(state.request(closed))
    .unwrap_err()
    .contains("要求枠を取得できません"));
  assert_eq!(state.pending.load(Ordering::Relaxed), 0);
}

#[test]
fn https_onlyでは_https失敗後に_httpへ再試行しない() {
  let listener = TcpListener::bind("127.0.0.1:0").expect("test server binds");
  let url = Url::parse(&format!(
    "http://{}/resource",
    listener.local_addr().unwrap()
  ))
  .expect("test server URL parses");
  let server = std::thread::spawn(move || {
    let (mut tls_stream, _) = listener.accept().expect("HTTPS request connects");
    tls_stream
      .set_read_timeout(Some(Duration::from_secs(5)))
      .expect("TLS read timeout is set");
    let mut tls_hello = [0; 1024];
    let _ = tls_stream.read(&mut tls_hello).expect("TLS hello is read");
    drop(tls_stream);
    listener
      .set_nonblocking(true)
      .expect("listener becomes nonblocking");
    std::thread::sleep(Duration::from_millis(300));
    // HTTPへ再試行していれば、ここで2本目の接続が来ている。
    listener.accept().is_ok()
  });
  let state = HttpTransportState::new().unwrap();
  let result = tauri::async_runtime::block_on(state.send_request(
    &url,
    &HttpRequest {
      url: url.to_string(),
      method: None,
      headers: None,
      body: None,
      body_base64: None,
      timeout: Some(5_000),
      https_mode: Some("https_only".to_string()),
    },
  ));
  assert!(result.is_err());
  assert!(!server.join().unwrap(), "HTTPへ再試行してはいけない");
}

#[test]
fn 自動では_httpのurlを_httpsへ切り替えずに取得する() {
  let (url, server) =
    start_http_server(b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\nok");
  let state = HttpTransportState::new().unwrap();
  let response = tauri::async_runtime::block_on(state.send_request(
    &url,
    &HttpRequest {
      url: url.to_string(),
      method: None,
      headers: None,
      body: None,
      body_base64: None,
      timeout: Some(5_000),
      https_mode: Some("auto".to_string()),
    },
  ))
  .unwrap();
  let request = server.join().unwrap();
  assert!(request.starts_with("GET /resource HTTP/1.1"));
  assert_eq!(response.status, 200);
}
