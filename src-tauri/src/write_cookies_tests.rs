use super::*;
use std::sync::atomic::{AtomicU64, Ordering};

static NEXT_FILE: AtomicU64 = AtomicU64::new(0);

/// OSの資格情報へ依存せずに、暗号化を通した保存・復元経路を検証するための可逆変換。
struct TestCipher;
const TEST_PREFIX: &[u8] = b"TEST";
impl CookieCipher for TestCipher {
  fn seal(&self, plain: &[u8]) -> Result<Vec<u8>, String> {
    Ok(TEST_PREFIX.iter().copied().chain(plain.iter().map(|byte| byte ^ 0x5a)).collect())
  }
  fn open(&self, sealed: &[u8]) -> Result<Vec<u8>, String> {
    let body = sealed
      .strip_prefix(TEST_PREFIX)
      .ok_or_else(|| "テスト用の暗号化形式ではありません".to_string())?;
    Ok(body.iter().map(|byte| byte ^ 0x5a).collect())
  }
}

fn contains(haystack: &[u8], needle: &[u8]) -> bool {
  haystack.windows(needle.len()).any(|part| part == needle)
}

struct TestFile(PathBuf);
impl TestFile {
  fn new() -> Self {
    Self(std::env::temp_dir().join(format!(
      "chlens-cookies-{}-{}-{}.json", std::process::id(),
      std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos(),
      NEXT_FILE.fetch_add(1, Ordering::Relaxed),
    )))
  }
  fn legacy(&self) -> PathBuf {
    self.0.with_extension("legacy.json")
  }
  fn load(&self) -> Arc<WriteCookies> {
    Arc::new(WriteCookies::new(self.0.clone(), Arc::new(TestCipher)))
  }
  fn read_plain(&self) -> Vec<u8> {
    TestCipher.open(&fs::read(&self.0).unwrap()).unwrap()
  }
}
impl Drop for TestFile {
  fn drop(&mut self) {
    for path in [&self.0, &self.0.with_extension("tmp"), &self.legacy()] {
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
  let mut saved: serde_json::Value = serde_json::from_slice(&file.read_plain()).unwrap();
  saved["example.com"][0]["expires"]["AtUtc"] = "2000-01-01T00:00:00Z".into();
  fs::write(&file.0, TestCipher.seal(&serde_json::to_vec(&saved).unwrap()).unwrap()).unwrap();
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
  let store = WriteCookies::new(file.0.join("cookies.json"), Arc::new(TestCipher));
  assert!(store.clear(None).is_err());
}

#[test]
fn cookieの値を平文で保存ファイルへ書かない() {
  let file = TestFile::new();
  receive(&file.load(), "example.com", "auth=secret-value; Max-Age=3600; Path=/");
  let sealed = fs::read(&file.0).unwrap();
  assert!(!contains(&sealed, b"secret-value"));
  assert!(contains(&file.read_plain(), b"secret-value"));
  assert!(!file.0.with_extension("tmp").exists());
}

#[test]
fn 復号できない保存ファイルから空の状態で起動する() {
  let file = TestFile::new();
  fs::write(&file.0, TestCipher.seal(b"not json").unwrap()).unwrap();
  assert!(!file.load().has_cookies(None).unwrap());
}

/// 暗号化に対応する前の形式で、期限付きCookieを平文ファイルへ書き出す。
fn write_legacy_plain(file: &TestFile) {
  let source = TestFile::new();
  receive(&source.load(), "example.com", "auth=legacy; Max-Age=3600; Path=/");
  fs::write(file.legacy(), source.read_plain()).unwrap();
}

#[test]
fn 平文の旧保存ファイルを暗号化して移行し削除する() {
  let file = TestFile::new();
  write_legacy_plain(&file);
  file.load().migrate_plain_file(&file.legacy());
  assert!(!file.legacy().exists());
  assert!(!contains(&fs::read(&file.0).unwrap(), b"legacy"));
  let restored = file.load();
  assert_eq!(
    restored
      .jar("example.com")
      .cookies(&Url::parse("https://example.com/").unwrap())
      .unwrap(),
    "auth=legacy"
  );
}

#[test]
fn 暗号化保存ファイルがあれば旧保存ファイルを取り込まず削除する() {
  let file = TestFile::new();
  receive(&file.load(), "example.org", "auth=current; Max-Age=3600; Path=/");
  write_legacy_plain(&file);
  let store = file.load();
  store.migrate_plain_file(&file.legacy());
  assert!(!file.legacy().exists());
  assert!(store.has_cookies(Some("example.org")).unwrap());
  assert!(!store.has_cookies(Some("example.com")).unwrap());
}

#[test]
fn 解釈できない旧保存ファイルは破棄して空の状態で起動する() {
  let file = TestFile::new();
  fs::write(file.legacy(), b"not json").unwrap();
  let store = file.load();
  store.migrate_plain_file(&file.legacy());
  assert!(!file.legacy().exists());
  assert!(!store.has_cookies(None).unwrap());
}

#[test]
fn 暗号化保存に失敗した場合は旧保存ファイルを残す() {
  let file = TestFile::new();
  write_legacy_plain(&file);
  fs::write(&file.0, b"").unwrap();
  // 保存先の親をファイルにして書き込みを失敗させる。
  let store = WriteCookies::new(file.0.join("cookies.dat"), Arc::new(TestCipher));
  store.migrate_plain_file(&file.legacy());
  assert!(file.legacy().exists());
}

#[test]
fn 暗号化できない環境ではcookieを起動中だけ保持する() {
  let file = TestFile::new();
  write_legacy_plain(&file);
  let store = Arc::new(WriteCookies::memory_only());
  store.migrate_plain_file(&file.legacy());
  assert!(file.legacy().exists());
  assert!(!store.has_cookies(None).unwrap());
  receive(&store, "example.com", "auth=token; Max-Age=3600; Path=/");
  assert!(store.has_cookies(None).unwrap());
  store.clear(None).unwrap();
  assert!(!store.has_cookies(None).unwrap());
}
