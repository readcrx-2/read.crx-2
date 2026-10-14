use std::fs;
use std::path::Path;

use crate::download_path::{next_available_path, sanitize_file_name};
use tauri::{AppHandle, Manager};

fn save_download_file_inner(
  download_dir: &Path,
  file_name: &str,
  body: &[u8],
) -> Result<String, String> {
  fs::create_dir_all(download_dir)
    .map_err(|error| format!("ダウンロードフォルダーを作成できませんでした: {error}"))?;

  let safe_name = sanitize_file_name(file_name);
  let path = next_available_path(download_dir, &safe_name);
  fs::write(&path, body).map_err(|error| format!("画像を保存できませんでした: {error}"))?;

  Ok(path.to_string_lossy().into_owned())
}

#[tauri::command(rename_all = "camelCase")]
pub async fn save_download_file(
  app: AppHandle,
  file_name: String,
  body: Vec<u8>,
) -> Result<String, String> {
  let download_dir = app
    .path()
    .download_dir()
    .map_err(|error| format!("ダウンロードフォルダーを特定できませんでした: {error}"))?;

  // 変更理由: 保存ダイアログを出さず、利用者が通常使うDownloadsへ自動保存するため、
  // ファイル名の無害化と重複回避をRust側で行ってから書き込む。
  tauri::async_runtime::spawn_blocking(move || {
    save_download_file_inner(&download_dir, &file_name, &body)
  })
  .await
  .map_err(|error| format!("画像保存処理を完了できませんでした: {error}"))?
}

#[cfg(test)]
#[path = "download_tests.rs"]
mod tests;
