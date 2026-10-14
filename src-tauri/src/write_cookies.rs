use crate::cookie_cipher::{platform_cipher, CookieCipher};
use cookie_store::CookieStore;
use reqwest::cookie::CookieStore as ReqwestCookieStore;
use reqwest::header::HeaderValue;
use reqwest::Url;
use std::collections::HashMap;
use std::fs::{self, File};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, MutexGuard};

/// 暗号化した投稿Cookieの保存ファイル名。
const ENCRYPTED_FILE_NAME: &str = "write-cookies.dat";
/// 暗号化に対応する前の平文保存ファイル名。起動時に暗号化して移行し、削除する。
const LEGACY_PLAIN_FILE_NAME: &str = "write-cookies.json";

struct Persistence {
  path: PathBuf,
  cipher: Arc<dyn CookieCipher>,
}

pub struct WriteCookies {
  // 暗号化できない環境では認証Cookieを平文でディスクへ残さず、起動中のメモリだけで保持する。
  persistence: Option<Persistence>,
  stores: Mutex<HashMap<String, CookieStore>>,
}

impl WriteCookies {
  /// アプリのデータ領域にある保存Cookieを、実行環境の暗号化で復元する。
  pub fn open_app_data(data_dir: &Path) -> Self {
    let Some(cipher) = platform_cipher() else {
      log::warn!("この環境では投稿Cookieを暗号化できないため、再起動後へ引き継ぎません");
      return Self::memory_only();
    };
    let cookies = Self::new(data_dir.join(ENCRYPTED_FILE_NAME), cipher);
    cookies.migrate_plain_file(&data_dir.join(LEGACY_PLAIN_FILE_NAME));
    cookies
  }

  pub fn new(path: PathBuf, cipher: Arc<dyn CookieCipher>) -> Self {
    // 投稿専用ClientのCookieはWebViewに保存されないため、起動時にアプリのデータ領域から復元する。
    let stores = match fs::read(&path) {
      Ok(sealed) => Self::decode(cipher.as_ref(), &sealed).unwrap_or_else(|error| {
        log::error!("投稿Cookieの保存ファイルを読み込めませんでした: {error}");
        HashMap::new()
      }),
      Err(error) if error.kind() == std::io::ErrorKind::NotFound => HashMap::new(),
      Err(error) => {
        log::error!("投稿Cookieの保存ファイルを開けませんでした: {error}");
        HashMap::new()
      }
    };
    Self {
      persistence: Some(Persistence { path, cipher }),
      stores: Mutex::new(stores),
    }
  }

  pub fn memory_only() -> Self {
    Self {
      persistence: None,
      stores: Mutex::new(HashMap::new()),
    }
  }

  fn decode(
    cipher: &dyn CookieCipher,
    sealed: &[u8],
  ) -> Result<HashMap<String, CookieStore>, String> {
    let plain = cipher.open(sealed)?;
    serde_json::from_slice(&plain).map_err(|error| format!("JSONとして解釈できません: {error}"))
  }

  /// 平文で保存していた旧形式のCookieを暗号化して保存し直し、平文ファイルを削除する。
  pub fn migrate_plain_file(&self, legacy_path: &Path) {
    let Some(persistence) = &self.persistence else {
      return;
    };
    let plain = match fs::read(legacy_path) {
      Ok(plain) => plain,
      Err(error) if error.kind() == std::io::ErrorKind::NotFound => return,
      Err(error) => {
        log::error!("平文の投稿Cookie保存ファイルを開けませんでした: {error}");
        return;
      }
    };
    // 暗号化ファイルが既にあれば、そちらが移行後の新しい状態なので旧ファイルは取り込まない。
    if !persistence.path.exists() {
      let migrated = match serde_json::from_slice::<HashMap<String, CookieStore>>(&plain) {
        Ok(stores) => stores,
        Err(error) => {
          log::error!("平文の投稿Cookie保存ファイルを解釈できないため破棄します: {error}");
          HashMap::new()
        }
      };
      let Ok(mut stores) = self.lock() else {
        return;
      };
      *stores = migrated;
      // 暗号化保存に失敗した場合は、Cookieを失わないよう平文ファイルを残して次回起動で再試行する。
      if self.save(&stores).is_err() {
        return;
      }
    }
    match fs::remove_file(legacy_path) {
      Ok(()) => log::info!("平文の投稿Cookie保存ファイルを暗号化形式へ移行しました"),
      Err(error) => log::error!("平文の投稿Cookie保存ファイルを削除できませんでした: {error}"),
    }
  }

  fn lock(&self) -> Result<MutexGuard<'_, HashMap<String, CookieStore>>, String> {
    self.stores.lock().map_err(|error| {
      let message = format!("Tauri版の投稿Cookieをロックできませんでした: {error}");
      log::error!("{message}");
      message
    })
  }

  fn save(&self, stores: &HashMap<String, CookieStore>) -> Result<(), String> {
    let Some(persistence) = &self.persistence else {
      return Ok(());
    };
    let result = (|| -> Result<(), Box<dyn std::error::Error>> {
      if let Some(parent) = persistence.path.parent() {
        fs::create_dir_all(parent)?;
      }
      // CookieStoreのSerializeは期限付きかつ未失効のCookieだけを保存し、セッションCookieは再起動で破棄する。
      // 平文を一時ファイルにも残さないよう、メモリ上で暗号化してから書き込む。
      let sealed = persistence.cipher.seal(&serde_json::to_vec(stores)?)?;
      // ロック中に一時ファイルを置換し、同時POSTや書き込み途中の終了で保存内容が混ざるのを防ぐ。
      let temporary_path = persistence.path.with_extension("tmp");
      let mut file = File::create(&temporary_path)?;
      file.write_all(&sealed)?;
      file.flush()?;
      file.sync_all()?;
      drop(file);
      fs::rename(temporary_path, &persistence.path)?;
      Ok(())
    })();
    result.map_err(|error| {
      let message = format!("Tauri版の投稿Cookieを保存できませんでした: {error}");
      log::error!("{message}");
      message
    })
  }

  pub fn has_cookies(&self, site: Option<&str>) -> Result<bool, String> {
    let stores = self.lock()?;
    // Set-Cookieの受信履歴では削除・失効を判定できないため、復元後も実際の未失効Cookieを調べる。
    Ok(stores.iter().any(|(host, store)| {
      site.map_or(true, |site| site == host) && store.iter_unexpired().next().is_some()
    }))
  }

  pub fn clear(&self, site: Option<&str>) -> Result<(), String> {
    let mut stores = self.lock()?;
    match site {
      Some(site) => {
        stores.remove(site);
      }
      None => stores.clear(),
    }
    // 設定画面からの削除も直ちに保存し、アプリ再起動で認証Cookieが復活しないようにする。
    self.save(&stores)
  }

  pub fn jar(self: &Arc<Self>, site: &str) -> Arc<SiteCookieJar> {
    Arc::new(SiteCookieJar {
      cookies: Arc::clone(self),
      site: site.to_string(),
    })
  }
}

pub struct SiteCookieJar {
  cookies: Arc<WriteCookies>,
  site: String,
}

impl ReqwestCookieStore for SiteCookieJar {
  fn set_cookies(&self, headers: &mut dyn Iterator<Item = &HeaderValue>, url: &Url) {
    let Ok(mut stores) = self.cookies.lock() else {
      return;
    };
    let store = stores.entry(self.site.clone()).or_default();
    for header in headers {
      match header.to_str() {
        Ok(value) => {
          if let Err(error) = store.parse(value, url) {
            log::warn!("投稿Cookieを登録できませんでした: {error}");
          }
        }
        Err(error) => log::warn!("投稿Cookieのヘッダーを解釈できませんでした: {error}"),
      }
    }
    // reqwestの受信コールバックで保存することで、リダイレクト途中の認証Cookieも取りこぼさない。
    // traitはエラーを返せないため、保存失敗の詳細はsave内でログへ記録する。
    let _ = self.cookies.save(&stores);
  }

  fn cookies(&self, url: &Url) -> Option<HeaderValue> {
    let stores = self.cookies.lock().ok()?;
    let value = stores
      .get(&self.site)?
      .get_request_values(url)
      .map(|(name, value)| format!("{name}={value}"))
      .collect::<Vec<_>>()
      .join("; ");
    if value.is_empty() {
      return None;
    }
    match HeaderValue::from_str(&value) {
      Ok(header) => Some(header),
      Err(error) => {
        log::error!("投稿Cookieの送信ヘッダーを作成できませんでした: {error}");
        None
      }
    }
  }
}

#[cfg(test)]
#[path = "write_cookies_tests.rs"]
mod tests;
