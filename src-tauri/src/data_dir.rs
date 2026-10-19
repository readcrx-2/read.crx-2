use std::ffi::OsString;
use std::path::{Path, PathBuf};

/// E2Eテストが保存先を差し替えるための環境変数。
pub const OVERRIDE_ENV: &str = "CHLENS_DATA_DIR";

/// WebView2のユーザーデータ（localStorage・IndexedDB・Cookie）を置く子ディレクトリ名。
const WEBVIEW_DIR_NAME: &str = "webview2";
/// ログを置く子ディレクトリ名。
const LOG_DIR_NAME: &str = "logs";

/// E2E用に差し替えた保存先。差し替えていなければ `None`。
///
/// 変更理由: 識別子が同じままでは、E2Eが普段使いの `%APPDATA%\com.chlens.app` などを
/// 読み書きしてしまう。Windowsの既知フォルダーは `APPDATA` 環境変数では変わらないため、
/// アプリ側で保存先を差し替える。配布版で環境変数ひとつから保存先を変えられないよう、
/// Cargo feature `e2e` を有効にしたビルドだけで読む。
pub fn override_dir() -> Option<PathBuf> {
  resolve(cfg!(feature = "e2e"), std::env::var_os(OVERRIDE_ENV))
}

fn resolve(enabled: bool, value: Option<OsString>) -> Option<PathBuf> {
  if !enabled {
    return None;
  }
  value.filter(|value| !value.is_empty()).map(PathBuf::from)
}

pub fn log_dir(root: &Path) -> PathBuf {
  root.join(LOG_DIR_NAME)
}

/// 差し替え先があれば作成し、WebViewが生成される前にWebView2の保存先も切り替える。
///
/// 窓ごとに `data_directory` を指定すると、設定から自動生成される窓と食い違い、
/// WebView2の環境を共有できず窓の生成に失敗する。プロセス全体へ効く環境変数で揃える。
pub fn prepare_override() -> std::io::Result<Option<PathBuf>> {
  let Some(root) = override_dir() else {
    return Ok(None);
  };
  std::fs::create_dir_all(&root)?;
  std::env::set_var("WEBVIEW2_USER_DATA_FOLDER", root.join(WEBVIEW_DIR_NAME));
  Ok(Some(root))
}

/// フロントエンドがSQLiteを差し替え先で開けるよう、保存先の絶対パスを返す。
#[tauri::command]
pub fn data_dir_override() -> Option<String> {
  override_dir().map(|path| path.to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn featureが無効なら環境変数があっても差し替えない() {
    assert_eq!(resolve(false, Some(OsString::from("C:\\tmp\\e2e"))), None);
  }

  #[test]
  fn featureが有効なら環境変数の保存先を使う() {
    assert_eq!(
      resolve(true, Some(OsString::from("C:\\tmp\\e2e"))),
      Some(PathBuf::from("C:\\tmp\\e2e"))
    );
  }

  #[test]
  fn 空の環境変数は未設定として扱う() {
    assert_eq!(resolve(true, Some(OsString::new())), None);
    assert_eq!(resolve(true, None), None);
  }
}
