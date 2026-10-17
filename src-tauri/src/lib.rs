mod cookie_cipher;
mod download;
mod download_path;
mod http_transport;
mod log_level;
mod monitor_preview;
mod overlay_attachment;
mod preview_image;
mod write_cookies;
mod write_transport;

use std::sync::{
  atomic::{AtomicU64, Ordering},
  Arc,
};

use tauri::{
  webview::{NewWindowFeatures, NewWindowResponse, WebviewWindowBuilder},
  AppHandle, Manager, Runtime, Url, WebviewUrl, WindowEvent,
};

/// `window.open` で要求された子窓を、既存の WindowProxy から操作できる Tauri 窓として作る。
///
/// ブラウザ版と同じく空のドキュメントを先に返し、フロントエンド側がそのドキュメントへ
/// ポータルを移植する。URL を直接読み込む方式にすると WindowProxy とポータルの接続が
/// 切れてしまうため、空窓の生成と外部 URL の許可をここで分けている。
fn create_requested_window<R: Runtime>(
  app: &AppHandle<R>,
  next_label: &Arc<AtomicU64>,
  url: Url,
  features: NewWindowFeatures,
) -> NewWindowResponse<R> {
  // `window.open("", ...)` は about:blank を要求する。その他の URL は外部リンクなので、
  // WebView2 の既定処理へ渡し、既定のポップアップとして開けるようにする。
  if url.as_str() != "about:blank" {
    return NewWindowResponse::Allow;
  }

  // 別窓側からさらに書き込み窓やタブ窓を開けるよう、子窓にも同じハンドラを登録する。
  let child_app = app.clone();
  let child_next_label = Arc::clone(next_label);
  let label = format!(
    "chlens-popup-{}",
    next_label.fetch_add(1, Ordering::Relaxed)
  );

  let builder = WebviewWindowBuilder::new(
    app,
    label.clone(),
    WebviewUrl::External("about:blank".parse().expect("about:blank is a valid URL")),
  )
  // DOMのWindowProxyから同じOS窓を復元・フォーカスできるよう、生成時のラベルを渡す。
  .initialization_script(format!("window.__chlensPopupLabel = {label:?};"))
  .window_features(features)
  .on_new_window(move |url, features| {
    create_requested_window(&child_app, &child_next_label, url, features)
  })
  .on_document_title_changed(|window, title| {
    if let Err(error) = window.set_title(&title) {
      log::error!("別窓のタイトル更新に失敗しました: {error}");
    }
  })
  .title("chlens");

  match builder.build() {
    Ok(window) => NewWindowResponse::Create { window },
    Err(error) => {
      log::error!("Tauriの別窓作成に失敗しました: {error}");
      NewWindowResponse::Deny
    }
  }
}

fn new_window_handler<R: Runtime>(
  app: AppHandle<R>,
  next_label: Arc<AtomicU64>,
) -> impl Fn(Url, NewWindowFeatures) -> NewWindowResponse<R> + Send + 'static {
  move |url, features| create_requested_window(&app, &next_label, url, features)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  // Overlayは起動直後から背後のMain操作を受け取れるよう、native側で常時クリック透過にする。
  tauri::Builder::default()
    .plugin(tauri_plugin_sql::Builder::default().build())
    .invoke_handler(tauri::generate_handler![
      download::save_download_file,
      http_transport::shared_http_request,
      log_level::set_log_debug,
      monitor_preview::capture_comment_overlay_monitor_preview,
      monitor_preview::set_comment_overlay_capture_excluded,
      overlay_attachment::list_comment_overlay_windows,
      overlay_attachment::raise_comment_overlay_above_target,
      overlay_attachment::read_comment_overlay_target,
      write_transport::clear_all_write_cookies,
      write_transport::clear_write_cookies,
      write_transport::has_any_write_cookies,
      write_transport::has_write_cookies,
      write_transport::write_request
    ])
    .on_window_event(|window, event| {
      if window.label() != "main" || !matches!(event, WindowEvent::CloseRequested { .. }) {
        return;
      }

      // 変更理由: Overlayや過去実況再生ウィンドウはMainを閉じても残る構成のため、
      // Main終了をアプリ全体の終了とみなし、裏で残るWebViewやRustプロセスを確実に解放する。
      window.app_handle().exit(0);
    })
    .setup(|app| {
      // 変更理由: 以前はdebugビルドだけ・Info固定だったため、配布版の不具合をRust側から追えなかった。
      // 常に登録し、既定は warn/error のみにする。`debug_log` 設定はフロントエンドから
      // `set_log_debug` で実行中に切り替える（プラグインは上限をDebugにして絞りだけ動的に変える）。
      app.handle().plugin(
        tauri_plugin_log::Builder::default()
          .level(log::LevelFilter::Debug)
          .build(),
      )?;
      log::set_max_level(log_level::level_for(false));

      // 投稿認証はWebViewと別のRust Clientが扱うため、データディレクトリ確定後に保存Cookieを復元する。
      app.manage(write_transport::WriteTransportState::new(
        write_cookies::WriteCookies::open_app_data(&app.path().app_data_dir()?),
      ));
      app.manage(http_transport::HttpTransportState::new()?);

      // Tauriの自動生成では新規ウィンドウのハンドラを登録できないため、Mainだけは
      // 設定の `create` を無効にし、同じ設定からハンドラ付きで生成する。
      let main_config = app
        .config()
        .app
        .windows
        .iter()
        .find(|config| config.label == "main")
        .ok_or_else(|| tauri::Error::WindowNotFound)?;
      let next_label = Arc::new(AtomicU64::new(0));
      WebviewWindowBuilder::from_config(app.handle(), main_config)?
        .on_new_window(new_window_handler(app.handle().clone(), next_label))
        .build()?;

      if let Some(overlay) = tauri::Manager::get_webview_window(app, "comment-overlay") {
        overlay.set_ignore_cursor_events(true)?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
