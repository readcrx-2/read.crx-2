use super::{bgrx_to_rgba_frame, preview_dimensions};

#[test]
fn 小さい画面を拡大せず大きい画面を長辺512pxに縮小する() {
  assert_eq!(preview_dimensions(320, 200).unwrap(), (320, 200));
  assert_eq!(preview_dimensions(1920, 1080).unwrap(), (512, 288));
  assert_eq!(preview_dimensions(10_000, 1).unwrap(), (512, 1));
}

#[test]
fn 無効な画面サイズを拒否する() {
  assert!(preview_dimensions(0, 1).is_err());
  assert!(preview_dimensions(1, 0).is_err());
  assert!(preview_dimensions(i32::MAX as u32 + 1, 1).is_err());
}

#[test]
fn bgrx画素を幅高さ付きの不透明なrgbaへ変換する() {
  assert_eq!(
    bgrx_to_rgba_frame(2, 1, &[3, 2, 1, 0, 30, 20, 10, 7]).unwrap(),
    [2, 0, 0, 0, 1, 0, 0, 0, 1, 2, 3, 255, 10, 20, 30, 255]
  );
}

#[test]
fn 画素数が幅高さと合わないデータを拒否する() {
  assert!(bgrx_to_rgba_frame(2, 1, &[1, 2, 3, 4]).is_err());
  assert!(bgrx_to_rgba_frame(1, 1, &[1, 2, 3]).is_err());
}
