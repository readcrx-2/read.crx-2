use log::LevelFilter;

/// `debug_log` 設定に対応するRust側の出力レベルを返す。
///
/// 変更理由: フロントエンド（consola）と同じ運用にそろえ、通常は warn/error のみ、
/// 利用者が `debug_log` を有効にしたときだけ debug 以下も出す。
pub fn level_for(debug_enabled: bool) -> LevelFilter {
  if debug_enabled {
    LevelFilter::Debug
  } else {
    LevelFilter::Warn
  }
}

/// 設定画面の `debug_log` に合わせて、実行中にRust側のログレベルを切り替える。
#[tauri::command(rename_all = "camelCase")]
pub fn set_log_debug(enabled: bool) {
  log::set_max_level(level_for(enabled));
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn debug_logが無効ならwarn以上だけを出す() {
    assert_eq!(level_for(false), LevelFilter::Warn);
  }

  #[test]
  fn debug_logが有効ならdebug以下も出す() {
    assert_eq!(level_for(true), LevelFilter::Debug);
  }
}
