use cookie_store::CookieStore;
use reqwest::cookie::CookieStore as ReqwestCookieStore;
use reqwest::header::HeaderValue;
use reqwest::Url;
use std::collections::HashMap;
use std::fs::{self, File};
use std::io::Write;
use std::path::PathBuf;
use std::sync::{Arc, Mutex, MutexGuard};

pub struct WriteCookies {
  path: PathBuf,
  stores: Mutex<HashMap<String, CookieStore>>,
}

impl WriteCookies {
  pub fn new(path: PathBuf) -> Self {
    // 投稿専用ClientのCookieはWebViewに保存されないため、起動時にアプリのデータ領域から復元する。
    let stores = match fs::read(&path) {
      Ok(bytes) => serde_json::from_slice(&bytes).unwrap_or_else(|error| {
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
      path,
      stores: Mutex::new(stores),
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
    let result = (|| -> Result<(), Box<dyn std::error::Error>> {
      if let Some(parent) = self.path.parent() {
        fs::create_dir_all(parent)?;
      }
      // CookieStoreのSerializeは期限付きかつ未失効のCookieだけを保存し、セッションCookieは再起動で破棄する。
      // ロック中に一時ファイルを置換し、同時POSTや書き込み途中の終了で保存内容が混ざるのを防ぐ。
      let temporary_path = self.path.with_extension("tmp");
      let mut file = File::create(&temporary_path)?;
      serde_json::to_writer(&mut file, stores)?;
      file.flush()?;
      file.sync_all()?;
      drop(file);
      fs::rename(temporary_path, &self.path)?;
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
