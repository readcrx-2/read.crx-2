use super::*;
use std::io::{Read, Write};
use std::net::TcpListener;
use std::path::PathBuf;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::time::Duration;

static NEXT_TEST_FILE: AtomicUsize = AtomicUsize::new(0);

fn test_cookie_path() -> PathBuf {
  std::env::temp_dir().join(format!(
    "chlens-write-transport-{}-{}.json",
    std::process::id(),
    NEXT_TEST_FILE.fetch_add(1, Ordering::Relaxed)
  ))
}

fn receive_request(stream: &mut std::net::TcpStream) -> String {
  stream
    .set_read_timeout(Some(Duration::from_secs(5)))
    .unwrap();
  let mut request = Vec::new();
  let mut buffer = [0; 1024];
  loop {
    let count = stream.read(&mut buffer).unwrap();
    assert!(count > 0);
    request.extend_from_slice(&buffer[..count]);
    let Some(header_end) = request.windows(4).position(|part| part == b"\r\n\r\n") else {
      continue;
    };
    let headers = String::from_utf8_lossy(&request[..header_end]);
    let body_length = headers
      .lines()
      .find_map(|line| {
        let (name, value) = line.split_once(':')?;
        name
          .eq_ignore_ascii_case("content-length")
          .then(|| value.trim().parse::<usize>().ok())
          .flatten()
      })
      .unwrap_or_default();
    if request.len() >= header_end + 4 + body_length {
      return String::from_utf8(request).unwrap();
    }
  }
}

#[test]
fn 指定した認証cookieだけを投稿ヘッダーから除外する() {
  let mut headers = HeaderMap::new();
  apply_cookie_exclusions(
    &mut headers,
    Some(HeaderValue::from_static("edge-token=old; other=keep=value")),
    &["edge-token".into()],
  )
  .unwrap();
  assert_eq!(headers[COOKIE], "other=keep=value");

  apply_cookie_exclusions(
    &mut headers,
    Some(HeaderValue::from_static("edge-token=old")),
    &["edge-token".into()],
  )
  .unwrap();
  assert_eq!(headers[COOKIE], "");
}

#[test]
fn 除外指定がない投稿ではjarのcookie自動付与を維持する() {
  let mut headers = HeaderMap::new();
  apply_cookie_exclusions(
    &mut headers,
    Some(HeaderValue::from_static("edge-token=old")),
    &[],
  )
  .unwrap();
  assert!(!headers.contains_key(COOKIE));
}

#[test]
fn 除外したcookieを自動付与せず応答で発行されたcookieを保存する() {
  use std::io::{Read, Write};
  use std::net::TcpListener;

  let listener = TcpListener::bind("127.0.0.1:0").unwrap();
  let action = Url::parse(&format!(
    "http://{}/test/bbs.cgi",
    listener.local_addr().unwrap()
  ))
  .unwrap();
  let server = std::thread::spawn(move || {
    let (mut stream, _) = listener.accept().unwrap();
    stream
      .set_read_timeout(Some(Duration::from_secs(5)))
      .unwrap();
    let mut request = Vec::new();
    let mut buffer = [0; 1024];
    while !request.windows(4).any(|bytes| bytes == b"\r\n\r\n") {
      let count = stream.read(&mut buffer).unwrap();
      assert!(count > 0);
      request.extend_from_slice(&buffer[..count]);
    }
    stream.write_all(b"HTTP/1.1 200 OK\r\nSet-Cookie: edge-token=new; Path=/\r\nContent-Length: 0\r\nConnection: close\r\n\r\n").unwrap();
    String::from_utf8(request).unwrap()
  });
  let jar = Arc::new(reqwest::cookie::Jar::default());
  jar.add_cookie_str("edge-token=old; Path=/", &action);
  let client = Client::builder()
    .cookie_provider(Arc::clone(&jar))
    .build()
    .unwrap();
  let mut headers = HeaderMap::new();
  apply_cookie_exclusions(&mut headers, jar.cookies(&action), &["edge-token".into()]).unwrap();
  tauri::async_runtime::block_on(async {
    client
      .post(action.clone())
      .headers(headers)
      .send()
      .await
      .unwrap();
  });
  let request = server.join().unwrap();
  assert!(!request.contains("edge-token=old"));
  assert_eq!(jar.cookies(&action).unwrap(), "edge-token=new");
}

#[test]
fn cookie削除用のサイト識別子をホスト名へ正規化する() {
  assert_eq!(
    parse_site_host("HTTPS://Example.COM/").expect("サイトを正規化できるはずです"),
    "example.com"
  );
}

#[test]
fn cookie削除用のサイト識別子にパスや認証情報を許可しない() {
  assert!(parse_site_host("https://example.com/board/").is_err());
  assert!(parse_site_host("https://user:password@example.com/").is_err());
}

#[test]
fn cookie状態の確認と削除をサイト単位および全体で行う() {
  let cookies = WriteCookies::new(test_cookie_path());
  assert!(!has_write_cookies_inner(&cookies, "example.com").unwrap());
  assert!(has_write_cookies_inner(&cookies, "https://example.com/path").is_err());
  assert!(!has_any_write_cookies_inner(&cookies).unwrap());
  clear_write_cookies_inner(&cookies, "example.com").unwrap();
  clear_all_write_cookies_inner(&cookies).unwrap();
}

#[test]
fn 書き込み_urlを検証してサイト名を正規化する() {
  assert_eq!(
    parse_http_url("https://Example.COM/post", "投稿URL")
      .unwrap()
      .host_str(),
    Some("example.com")
  );
  assert!(parse_http_url("file:///post", "投稿URL").is_err());
  assert!(parse_http_url("not a URL", "投稿URL").is_err());
  assert_eq!(
    site_key(&Url::parse("https://Example.COM/post").unwrap(), "投稿URL").unwrap(),
    "example.com"
  );
  assert!(site_key(&Url::parse("file:///post").unwrap(), "投稿URL").is_err());
  assert!(parse_site_host("  ").is_err());
  assert!(parse_site_host("example.com:444").is_err());
  assert!(parse_site_host("example.com?query=1").is_err());
}

#[test]
fn 投稿ヘッダーの既定値と不正値を安全な値へ戻す() {
  let action = Url::parse("https://example.com/board/post").unwrap();
  let defaults = build_headers(&action, "", None);
  assert_eq!(defaults[CONTENT_TYPE], "application/x-www-form-urlencoded");
  assert_eq!(defaults[USER_AGENT], DEFAULT_USER_AGENT);
  assert_eq!(defaults[ORIGIN], "https://example.com");
  assert_eq!(defaults[REFERER], action.as_str());

  let custom = build_headers(
    &action,
    "https://example.com/thread",
    Some("Custom-Agent/1.0"),
  );
  assert_eq!(custom[USER_AGENT], "Custom-Agent/1.0");
  assert_eq!(custom[REFERER], "https://example.com/thread");

  let invalid = build_headers(&action, "bad\nreferer", Some("bad\nagent"));
  assert_eq!(invalid[USER_AGENT], DEFAULT_USER_AGENT);
  assert_eq!(invalid[REFERER], action.as_str());
}

#[test]
fn 不正な任意ヘッダーは追加せず有効な値だけを設定する() {
  let mut headers = HeaderMap::new();
  add_header(&mut headers, ORIGIN, "https://example.com");
  add_header(&mut headers, REFERER, "bad\nvalue");
  assert_eq!(headers[ORIGIN], "https://example.com");
  assert!(!headers.contains_key(REFERER));
}

#[test]
fn 書き込みclientをサイトごとに再利用する() {
  let state = WriteTransportState::new(test_cookie_path());
  get_or_create_client(&state, "example.com").unwrap();
  get_or_create_client(&state, "example.com").unwrap();
  get_or_create_client(&state, "other.example").unwrap();
  assert_eq!(state.clients.lock().unwrap().len(), 2);
}

#[test]
fn cookieヘッダーがない場合は空として扱い不正な値はエラーにする() {
  let mut headers = HeaderMap::new();
  apply_cookie_exclusions(&mut headers, None, &["edge-token".into()]).unwrap();
  assert_eq!(headers[COOKIE], "");

  let invalid = HeaderValue::from_bytes(&[0xff]).unwrap();
  assert!(apply_cookie_exclusions(&mut headers, Some(invalid), &["edge-token".into()]).is_err());
}

#[test]
fn 書き込み前に取得した_cookieを除外指定に従って投稿し応答を返す() {
  let listener = TcpListener::bind("127.0.0.1:0").unwrap();
  let address = listener.local_addr().unwrap();
  let action = Url::parse(&format!("http://{address}/test/bbs.cgi")).unwrap();
  let bootstrap = format!("http://{address}/test/read.cgi/board/123/");
  let server = std::thread::spawn(move || {
    let (mut bootstrap_stream, _) = listener.accept().unwrap();
    let bootstrap_request = receive_request(&mut bootstrap_stream);
    bootstrap_stream
      .write_all(b"HTTP/1.1 200 OK\r\nSet-Cookie: edge-token=secret; Path=/; Max-Age=3600\r\nSet-Cookie: other=keep; Path=/; Max-Age=3600\r\nContent-Length: 0\r\nConnection: close\r\n\r\n")
      .unwrap();
    drop(bootstrap_stream);

    let (mut post_stream, _) = listener.accept().unwrap();
    let post_request = receive_request(&mut post_stream);
    post_stream
      .write_all(b"HTTP/1.1 201 Created\r\nContent-Type: text/plain\r\nContent-Length: 8\r\nConnection: close\r\n\r\naccepted")
      .unwrap();
    (bootstrap_request, post_request)
  });
  let cookie_path = test_cookie_path();
  let state = WriteTransportState::new(cookie_path.clone());
  let response = tauri::async_runtime::block_on(write_request_inner(
    &state,
    WriteRequest {
      action: action.to_string(),
      bootstrap_url: Some(bootstrap),
      referer: "https://example.com/thread".into(),
      user_agent: Some("Test-Agent/1.0".into()),
      excluded_cookies: vec!["edge-token".into()],
      body: b"message=test".to_vec(),
    },
  ))
  .unwrap();
  let (bootstrap_request, post_request) = server.join().unwrap();
  assert!(bootstrap_request.starts_with("GET /test/read.cgi/board/123/ HTTP/1.1"));
  assert!(post_request.starts_with("POST /test/bbs.cgi HTTP/1.1"));
  assert!(post_request
    .to_ascii_lowercase()
    .contains("cookie: other=keep"));
  assert!(!post_request.contains("edge-token=secret"));
  assert!(post_request
    .to_ascii_lowercase()
    .contains("origin: http://127.0.0.1:"));
  assert_eq!(response.status, 201);
  assert_eq!(response.content_type.as_deref(), Some("text/plain"));
  assert_eq!(response.body, b"accepted");
  let _ = std::fs::remove_file(&cookie_path);
}

#[test]
fn bootstrapが不正でも投稿本体を試す() {
  let listener = TcpListener::bind("127.0.0.1:0").unwrap();
  let address = listener.local_addr().unwrap();
  let action = Url::parse(&format!("http://{address}/post")).unwrap();
  let server = std::thread::spawn(move || {
    let (mut stream, _) = listener.accept().unwrap();
    let request = receive_request(&mut stream);
    stream
      .write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 0\r\nConnection: close\r\n\r\n")
      .unwrap();
    request
  });
  let state = WriteTransportState::new(test_cookie_path());
  let response = tauri::async_runtime::block_on(write_request_inner(
    &state,
    WriteRequest {
      action: action.to_string(),
      bootstrap_url: Some("file:///invalid".into()),
      referer: String::new(),
      user_agent: None,
      excluded_cookies: Vec::new(),
      body: Vec::new(),
    },
  ))
  .unwrap();
  assert!(server.join().unwrap().starts_with("POST /post HTTP/1.1"));
  assert_eq!(response.status, 200);
}

#[test]
fn bootstrap通信に失敗しても投稿本体を試す() {
  let listener = TcpListener::bind("127.0.0.1:0").unwrap();
  let address = listener.local_addr().unwrap();
  let action = Url::parse(&format!("http://{address}/post")).unwrap();
  let unavailable = TcpListener::bind("127.0.0.1:0").unwrap();
  let bootstrap_address = unavailable.local_addr().unwrap();
  drop(unavailable);
  let server = std::thread::spawn(move || {
    let (mut stream, _) = listener.accept().unwrap();
    let request = receive_request(&mut stream);
    stream
      .write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 0\r\nConnection: close\r\n\r\n")
      .unwrap();
    request
  });
  let state = WriteTransportState::new(test_cookie_path());
  let response = tauri::async_runtime::block_on(write_request_inner(
    &state,
    WriteRequest {
      action: action.to_string(),
      bootstrap_url: Some(format!("http://{bootstrap_address}/bootstrap")),
      referer: String::new(),
      user_agent: None,
      excluded_cookies: Vec::new(),
      body: Vec::new(),
    },
  ))
  .unwrap();
  assert!(server.join().unwrap().starts_with("POST /post HTTP/1.1"));
  assert_eq!(response.status, 200);
}

#[test]
fn 書き込み通信に失敗した場合は通信エラーを返す() {
  let unavailable = TcpListener::bind("127.0.0.1:0").unwrap();
  let address = unavailable.local_addr().unwrap();
  drop(unavailable);
  let state = WriteTransportState::new(test_cookie_path());
  let error = tauri::async_runtime::block_on(write_request_inner(
    &state,
    WriteRequest {
      action: format!("http://{address}/post"),
      bootstrap_url: None,
      referer: String::new(),
      user_agent: None,
      excluded_cookies: Vec::new(),
      body: Vec::new(),
    },
  ))
  .unwrap_err();
  assert!(error.contains("書き込み通信に失敗しました"));
}
