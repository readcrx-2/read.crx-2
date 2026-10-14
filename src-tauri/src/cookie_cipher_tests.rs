#[cfg(windows)]
mod dpapi {
  use crate::cookie_cipher::dpapi::DpapiCipher;
  use crate::cookie_cipher::CookieCipher;

  #[test]
  fn dpapiで暗号化した内容を復号できる() {
    let plain = br#"{"example.com":[{"name":"auth","value":"token"}]}"#;
    let sealed = DpapiCipher.seal(plain).unwrap();
    assert!(!sealed.windows(b"token".len()).any(|part| part == b"token"));
    assert_eq!(DpapiCipher.open(&sealed).unwrap(), plain);
  }

  #[test]
  fn dpapiで改ざんされた内容は復号しない() {
    let mut sealed = DpapiCipher.seal(b"auth=token").unwrap();
    let last = sealed.len() - 1;
    sealed[last] ^= 0xff;
    assert!(DpapiCipher.open(&sealed).is_err());
  }

  #[test]
  fn dpapiで空の内容も往復できる() {
    let sealed = DpapiCipher.seal(b"").unwrap();
    assert_eq!(DpapiCipher.open(&sealed).unwrap(), b"");
  }
}

#[test]
fn 実行環境に応じた暗号化の有無を返す() {
  assert_eq!(super::platform_cipher().is_some(), cfg!(windows));
}
