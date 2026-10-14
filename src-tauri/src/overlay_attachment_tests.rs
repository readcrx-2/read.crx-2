use super::{client_bounds, is_attachable_window, parse_window_identity};

#[test]
fn ウィンドウ識別子からhandleとprocessを読み取る() {
  assert_eq!(parse_window_identity("42:7").unwrap(), (42, 7));
  assert!(parse_window_identity("42").is_err());
  assert!(parse_window_identity("bad:7").is_err());
  assert!(parse_window_identity("42:bad").is_err());
}

#[test]
fn 表示中で別プロセスのタイトル付き通常ウィンドウだけを候補にする() {
  assert!(is_attachable_window(true, 7, 8, false, 1));
  assert!(!is_attachable_window(false, 7, 8, false, 1));
  assert!(!is_attachable_window(true, 8, 8, false, 1));
  assert!(!is_attachable_window(true, 7, 8, true, 1));
  assert!(!is_attachable_window(true, 7, 8, false, 0));
}

#[test]
fn クライアント領域の正の寸法だけを追従先として返す() {
  let bounds = client_bounds(-40, 15, 800, 600).unwrap();
  assert_eq!(
    (bounds.x, bounds.y, bounds.width, bounds.height),
    (-40, 15, 800, 600)
  );
  assert!(client_bounds(0, 0, 0, 600).is_none());
  assert!(client_bounds(0, 0, 800, -1).is_none());
}

#[cfg(not(windows))]
#[test]
fn 非Windowsでは追従先を一覧できず読み取れない() {
  assert!(super::list_comment_overlay_windows().unwrap().is_empty());
  assert!(super::read_comment_overlay_target("1:2".into()).is_err());
}
