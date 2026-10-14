use crate::write_cookies::WriteCookies;
use reqwest::cookie::CookieStore;
use reqwest::header::{HeaderMap, HeaderValue, CONTENT_TYPE, COOKIE, ORIGIN, REFERER, USER_AGENT};
use reqwest::{Client, Url};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::State;

const DEFAULT_USER_AGENT: &str = "Monazilla/1.00 ChLens/4.0";
const REQUEST_TIMEOUT: Duration = Duration::from_secs(30);

pub struct WriteTransportState {
  // 変更理由: 確認POSTの成功後も掲示板が発行した認証Cookieを次回投稿へ渡すため、
  // 書き込み1回ごとにClientを破棄せず、同じサイトの書き込みだけでCookie Jarを共有する。
  clients: Mutex<HashMap<String, Client>>,
  cookies: Arc<WriteCookies>,
}

impl WriteTransportState {
  pub fn new(cookie_path: PathBuf) -> Self {
    Self {
      clients: Mutex::new(HashMap::new()),
      cookies: Arc::new(WriteCookies::new(cookie_path)),
    }
  }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WriteRequest {
  pub action: String,
  pub bootstrap_url: Option<String>,
  pub referer: String,
  pub user_agent: Option<String>,
  #[serde(default)]
  pub excluded_cookies: Vec<String>,
  pub body: Vec<u8>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WriteResponse {
  pub status: u16,
  pub url: String,
  pub content_type: Option<String>,
  pub body: Vec<u8>,
}

fn parse_http_url(raw_url: &str, label: &str) -> Result<Url, String> {
  let url =
    Url::parse(raw_url).map_err(|error| format!("{label}を解釈できませんでした: {error}"))?;
  if !matches!(url.scheme(), "http" | "https") {
    return Err(format!("{label}はHTTPまたはHTTPSである必要があります"));
  }
  Ok(url)
}

fn site_key(url: &Url, label: &str) -> Result<String, String> {
  url
    .host_str()
    .map(str::to_ascii_lowercase)
    .ok_or_else(|| format!("{label}にホスト名がありません"))
}

fn parse_site_host(raw_site: &str) -> Result<String, String> {
  let trimmed = raw_site.trim();
  if trimmed.is_empty() {
    return Err("Cookieを削除するサイトが指定されていません".to_string());
  }

  let raw_url = if trimmed.contains("://") {
    trimmed.to_string()
  } else {
    format!("https://{trimmed}/")
  };
  let url = parse_http_url(&raw_url, "Cookieを削除するサイト")?;
  if url.username() != ""
    || url.password().is_some()
    || url.port().is_some()
    || (url.path() != "" && url.path() != "/")
    || url.query().is_some()
    || url.fragment().is_some()
  {
    return Err("Cookieを削除するサイトの指定が不正です".to_string());
  }
  site_key(&url, "Cookieを削除するサイト")
}

fn create_client(state: &WriteTransportState, site: &str) -> Result<Client, String> {
  Client::builder()
    // 標準のメモリ専用Jarを保存可能なJarへ置き換え、再起動後の最初のPOSTにも認証を引き継ぐ。
    .cookie_provider(state.cookies.jar(site))
    .timeout(REQUEST_TIMEOUT)
    .build()
    .map_err(|error| format!("Tauri版の書き込みHTTPクライアントを初期化できませんでした: {error}"))
}

fn add_header(headers: &mut HeaderMap, name: reqwest::header::HeaderName, value: &str) {
  if let Ok(header_value) = HeaderValue::from_str(value) {
    headers.insert(name, header_value);
  }
}

fn build_headers(action: &Url, referer: &str, user_agent: Option<&str>) -> HeaderMap {
  let mut headers = HeaderMap::new();
  headers.insert(
    CONTENT_TYPE,
    HeaderValue::from_static("application/x-www-form-urlencoded"),
  );

  // 変更理由: JavaScriptのHeadersは日本語UAやRefererを渡す段階で例外にするため、
  // Tauri版はRust側でHTTPヘッダーを検証し、壊れた任意設定だけを標準値へ戻す。
  let user_agent_header = user_agent
    .filter(|value| !value.trim().is_empty())
    .and_then(|value| HeaderValue::from_str(value).ok())
    .unwrap_or_else(|| HeaderValue::from_static(DEFAULT_USER_AGENT));
  headers.insert(USER_AGENT, user_agent_header);

  let action_origin = action.origin().ascii_serialization();
  add_header(&mut headers, ORIGIN, &action_origin);

  let fallback_referer = action.as_str();
  let referer = if referer.trim().is_empty() {
    fallback_referer
  } else {
    referer
  };
  if HeaderValue::from_str(referer).is_ok() {
    headers.insert(
      REFERER,
      HeaderValue::from_str(referer).expect("Refererを検証済みです"),
    );
  } else {
    headers.insert(
      REFERER,
      HeaderValue::from_str(fallback_referer).expect("URL由来のRefererは有効です"),
    );
    log::warn!("書き込み用RefererにHTTPヘッダーとして使えない文字が含まれていました");
  }

  headers
}

fn get_or_create_client(state: &WriteTransportState, site: &str) -> Result<Client, String> {
  let mut clients = state
    .clients
    .lock()
    .map_err(|_| "Tauri版の書き込みClientをロックできませんでした".to_string())?;

  if let Some(client) = clients.get(site) {
    return Ok(client.clone());
  }

  let new_client = create_client(state, site)?;
  clients.insert(site.to_string(), new_client.clone());
  Ok(new_client)
}

fn apply_cookie_exclusions(
  headers: &mut HeaderMap,
  cookies: Option<HeaderValue>,
  excluded: &[String],
) -> Result<(), String> {
  if excluded.is_empty() {
    return Ok(());
  }
  let cookies = cookies
    .as_ref()
    .map(HeaderValue::to_str)
    .transpose()
    .map_err(|error| format!("投稿Cookieのヘッダーを解釈できませんでした: {error}"))?
    .unwrap_or("");
  let filtered = cookies
    .split(';')
    .map(str::trim)
    .filter(|cookie| {
      !cookie.is_empty()
        && !cookie
          .split_once('=')
          .is_some_and(|(name, _)| excluded.iter().any(|excluded| excluded == name))
    })
    .collect::<Vec<_>>()
    .join("; ");
  // 空でもCookieヘッダーを明示し、reqwestがJarの除外済みCookieを再び自動付与するのを防ぐ。
  headers.insert(
    COOKIE,
    HeaderValue::from_str(&filtered)
      .map_err(|error| format!("投稿Cookieの送信ヘッダーを作成できませんでした: {error}"))?,
  );
  Ok(())
}

#[tauri::command]
pub fn has_write_cookies(
  state: State<'_, WriteTransportState>,
  site: String,
) -> Result<bool, String> {
  has_write_cookies_inner(&state.cookies, &site)
}

fn has_write_cookies_inner(cookies: &WriteCookies, site: &str) -> Result<bool, String> {
  let site = parse_site_host(site)?;
  cookies.has_cookies(Some(&site))
}

#[tauri::command]
pub fn has_any_write_cookies(state: State<'_, WriteTransportState>) -> Result<bool, String> {
  has_any_write_cookies_inner(&state.cookies)
}

fn has_any_write_cookies_inner(cookies: &WriteCookies) -> Result<bool, String> {
  cookies.has_cookies(None)
}

#[tauri::command]
pub fn clear_write_cookies(
  state: State<'_, WriteTransportState>,
  site: String,
) -> Result<(), String> {
  clear_write_cookies_inner(&state.cookies, &site)
}

fn clear_write_cookies_inner(cookies: &WriteCookies, site: &str) -> Result<(), String> {
  let site = parse_site_host(site)?;
  // Clientが参照する保存ストア自体を消し、既存Clientでも削除済みCookieを再利用しない。
  cookies.clear(Some(&site))?;
  log::info!("サイトの書き込みCookieを削除しました: {site}");
  Ok(())
}

#[tauri::command]
pub fn clear_all_write_cookies(state: State<'_, WriteTransportState>) -> Result<(), String> {
  clear_all_write_cookies_inner(&state.cookies)
}

fn clear_all_write_cookies_inner(cookies: &WriteCookies) -> Result<(), String> {
  cookies.clear(None)?;
  log::info!("すべての書き込みCookieを削除しました");
  Ok(())
}

async fn write_request_inner(
  state: &WriteTransportState,
  request: WriteRequest,
) -> Result<WriteResponse, String> {
  let action = parse_http_url(&request.action, "書き込み先URL")?;
  let site = site_key(&action, "書き込み先URL")?;
  let client = get_or_create_client(&state, &site)?;

  if let Some(bootstrap_url) = request.bootstrap_url.as_deref() {
    match parse_http_url(bootstrap_url, "書き込み前のCookie取得URL") {
      Ok(bootstrap) => {
        let headers = build_headers(&bootstrap, "", request.user_agent.as_deref());
        // 変更理由: 5ch互換サーバーはスレッド閲覧時に確認用Cookieを発行するため、
        // 初回POSTの前に同じRust ClientでGETして共有Cookie Jarへ保存する。
        match client.get(bootstrap).headers(headers).send().await {
          Ok(_) => {}
          Err(error) => {
            // Cookie取得に失敗してもPOST本体は試し、サーバー側の詳細エラーを表示する。
            log::warn!("書き込み前のCookie取得に失敗しました: {error}");
          }
        }
      }
      Err(error) => log::warn!("{error}"),
    }
  }

  let mut headers = build_headers(&action, &request.referer, request.user_agent.as_deref());
  apply_cookie_exclusions(
    &mut headers,
    state.cookies.jar(&site).cookies(&action),
    &request.excluded_cookies,
  )?;
  let response = client
    .post(action)
    .headers(headers)
    .body(request.body)
    .send()
    .await
    .map_err(|error| format!("Tauri版の書き込み通信に失敗しました: {error}"))?;

  let status = response.status().as_u16();
  let url = response.url().to_string();
  let content_type = response
    .headers()
    .get(reqwest::header::CONTENT_TYPE)
    .and_then(|value| value.to_str().ok())
    .map(str::to_string);
  let body = response
    .bytes()
    .await
    .map_err(|error| format!("Tauri版の書き込み応答を読み込めませんでした: {error}"))?
    .to_vec();

  Ok(WriteResponse {
    status,
    url,
    content_type,
    body,
  })
}

#[tauri::command]
pub async fn write_request(
  state: State<'_, WriteTransportState>,
  request: WriteRequest,
) -> Result<WriteResponse, String> {
  write_request_inner(&state, request).await
}

#[cfg(test)]
#[path = "write_transport_tests.rs"]
mod tests;
