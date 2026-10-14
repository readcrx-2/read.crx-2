use super::*;
use std::sync::atomic::{AtomicU64, Ordering};

static NEXT_FILE: AtomicU64 = AtomicU64::new(0);

struct TestFile(PathBuf);
impl TestFile {
  fn new() -> Self {
    Self(std::env::temp_dir().join(format!(
      "chlens-cookies-{}-{}-{}.json", std::process::id(),
      std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos(),
      NEXT_FILE.fetch_add(1, Ordering::Relaxed),
    )))
  }
  fn load(&self) -> Arc<WriteCookies> {
    Arc::new(WriteCookies::new(self.0.clone()))
  }
}
impl Drop for TestFile {
  fn drop(&mut self) {
    for path in [&self.0, &self.0.with_extension("tmp")] {
      if let Err(error) = fs::remove_file(path) {
        if error.kind() != std::io::ErrorKind::NotFound {
          eprintln!("テスト用Cookieファイルを削除できませんでした: {error}");
        }
      }
    }
  }
}

fn receive(store: &Arc<WriteCookies>, site: &str, cookie: &str) {
  let url = Url::parse(&format!("https://{site}/test/bbs.cgi")).unwrap();
  store
    .jar(site)
    .set_cookies(&mut [HeaderValue::from_str(cookie).unwrap()].iter(), &url);
}

#[test]
fn 壊れた_cookie保存ファイルから空の状態で起動する() {
  let file = TestFile::new();
  fs::write(&file.0, b"not json").unwrap();
  assert!(!file.load().has_cookies(None).unwrap());
}

#[test]
fn cookie保存先をファイルとして読めない場合も空の状態で起動する() {
  let file = TestFile::new();
  fs::create_dir(&file.0).unwrap();
  assert!(!file.load().has_cookies(None).unwrap());
  fs::remove_dir(&file.0).unwrap();
}

#[test]
fn 再起動後も期限付きの認証cookieを送信できる() {
  let file = TestFile::new();
  receive(
    &file.load(),
    "example.com",
    "auth=token; Max-Age=3600; Path=/; Secure; HttpOnly",
  );
  let restored = file.load();
  assert!(restored.has_cookies(Some("example.com")).unwrap());
  assert!(restored.has_cookies(None).unwrap());
  let jar = restored.jar("example.com");
  assert_eq!(
    jar
      .cookies(&Url::parse("https://example.com/test/bbs.cgi").unwrap())
      .unwrap(),
    "auth=token"
  );
  assert!(jar
    .cookies(&Url::parse("http://example.com/test/bbs.cgi").unwrap())
    .is_none());
  assert!(jar
    .cookies(&Url::parse("https://other.example.com/test/bbs.cgi").unwrap())
    .is_none());
}

#[test]
fn セッションcookieは起動中だけ保持する() {
  let file = TestFile::new();
  let store = file.load();
  receive(&store, "example.com", "session=token; Path=/");
  assert!(store.has_cookies(None).unwrap());
  assert!(!file.load().has_cookies(None).unwrap());
}

#[test]
fn 解釈できない受信_cookieヘッダーは保存処理を続ける() {
  let file = TestFile::new();
  let jar = file.load().jar("example.com");
  let url = Url::parse("https://example.com/").unwrap();
  let invalid = HeaderValue::from_bytes(&[0xff]).unwrap();
  jar.set_cookies(&mut [invalid].iter(), &url);
  assert!(!file.load().has_cookies(None).unwrap());
}

#[test]
fn サーバーによるcookie削除が保存状態にも反映される() {
  let file = TestFile::new();
  let store = file.load();
  receive(&store, "example.com", "auth=token; Max-Age=3600; Path=/");
  receive(&store, "example.com", "auth=; Max-Age=0; Path=/");
  assert!(!store.has_cookies(None).unwrap());
  assert!(!file.load().has_cookies(None).unwrap());
}

#[test]
fn サイト別削除と全削除は再起動後も維持される() {
  let file = TestFile::new();
  let store = file.load();
  receive(&store, "example.com", "auth=one; Max-Age=3600; Path=/");
  receive(&store, "example.org", "auth=two; Max-Age=3600; Path=/");
  let existing_jar = store.jar("example.com");
  store.clear(Some("example.com")).unwrap();
  assert!(existing_jar
    .cookies(&Url::parse("https://example.com/").unwrap())
    .is_none());
  let restored = file.load();
  assert!(!restored.has_cookies(Some("example.com")).unwrap());
  assert!(restored.has_cookies(Some("example.org")).unwrap());
  restored.clear(None).unwrap();
  assert!(!file.load().has_cookies(None).unwrap());
}

#[test]
fn 別サイトや別パスへcookieを送信しない() {
  let file = TestFile::new();
  receive(
    &file.load(),
    "example.com",
    "auth=token; Max-Age=3600; Path=/test",
  );
  let restored = file.load();
  assert!(restored
    .jar("example.org")
    .cookies(&Url::parse("https://example.com/test/bbs.cgi").unwrap())
    .is_none());
  assert!(restored
    .jar("example.com")
    .cookies(&Url::parse("https://example.com/other/").unwrap())
    .is_none());
}

#[test]
fn 保存中に期限切れになったcookieは復元しない() {
  let file = TestFile::new();
  receive(
    &file.load(),
    "example.com",
    "auth=token; Max-Age=3600; Path=/",
  );
  let mut saved: serde_json::Value = serde_json::from_slice(&fs::read(&file.0).unwrap()).unwrap();
  saved["example.com"][0]["expires"]["AtUtc"] = "2000-01-01T00:00:00Z".into();
  fs::write(&file.0, serde_json::to_vec(&saved).unwrap()).unwrap();
  assert!(!file.load().has_cookies(None).unwrap());
}

#[test]
fn リダイレクトで受信したcookieを保存し新しいclientの投稿へ引き継ぐ() {
  use std::io::Read;
  use std::net::TcpListener;
  use std::time::Duration;

  let file = TestFile::new();
  let listener = TcpListener::bind("127.0.0.1:0").unwrap();
  let address = listener.local_addr().unwrap();
  // 実在の掲示板へ投稿せず、ローカルHTTP応答でreqwestの受信・再送信経路を検証する。
  let server = std::thread::spawn(move || {
    for index in 0..3 {
      let (mut stream, _) = listener.accept().unwrap();
      stream
        .set_read_timeout(Some(Duration::from_secs(5)))
        .unwrap();
      let mut request = Vec::new();
      while !request.ends_with(b"\r\n\r\n") {
        let mut byte = [0];
        stream.read_exact(&mut byte).unwrap();
        request.push(byte[0]);
      }
      let request = String::from_utf8(request).unwrap().to_ascii_lowercase();
      if index > 0 {
        assert!(request.contains("\r\ncookie: auth=token\r\n"));
      }
      if index == 2 {
        assert!(request.starts_with("post /write "));
      }
      let response = if index == 0 {
        "HTTP/1.1 302 Found\r\nLocation: /finish\r\nSet-Cookie: auth=token; Max-Age=3600; Path=/\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
      } else {
        "HTTP/1.1 200 OK\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
      };
      stream.write_all(response.as_bytes()).unwrap();
    }
  });
  tauri::async_runtime::block_on(async {
    let client = reqwest::Client::builder()
      .cookie_provider(file.load().jar("127.0.0.1"))
      .timeout(Duration::from_secs(5))
      .build()
      .unwrap();
    client
      .get(format!("http://{address}/redirect"))
      .send()
      .await
      .unwrap();
    drop(client);
    let restored_client = reqwest::Client::builder()
      .cookie_provider(file.load().jar("127.0.0.1"))
      .timeout(Duration::from_secs(5))
      .build()
      .unwrap();
    assert_eq!(
      restored_client
        .post(format!("http://{address}/write"))
        .send()
        .await
        .unwrap()
        .status(),
      200
    );
  });
  server.join().unwrap();
}

#[test]
fn 保存失敗を削除操作の呼び出し元へ返す() {
  let file = TestFile::new();
  fs::write(&file.0, b"[]").unwrap();
  let store = WriteCookies::new(file.0.join("cookies.json"));
  assert!(store.clear(None).is_err());
}
