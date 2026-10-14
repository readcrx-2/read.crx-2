use super::{bgrx_to_rgb, preview_dimensions, to_png_data_url};
use base64::engine::general_purpose::STANDARD;
use base64::Engine;

#[test]
fn 小さい画面を拡大せず大きい画面を長辺640pxに縮小する() {
  assert_eq!(preview_dimensions(320, 200).unwrap(), (320, 200));
  assert_eq!(preview_dimensions(1920, 1080).unwrap(), (640, 360));
  assert_eq!(preview_dimensions(10_000, 1).unwrap(), (640, 1));
}

#[test]
fn 無効な画面サイズを拒否する() {
  assert!(preview_dimensions(0, 1).is_err());
  assert!(preview_dimensions(1, 0).is_err());
  assert!(preview_dimensions(i32::MAX as u32 + 1, 1).is_err());
}

#[test]
fn bgrx画素を_rgbへ変換して未定義alphaを捨てる() {
  assert_eq!(
    bgrx_to_rgb(&[3, 2, 1, 255, 30, 20, 10, 0]).unwrap(),
    [1, 2, 3, 10, 20, 30]
  );
  assert!(bgrx_to_rgb(&[1, 2, 3]).is_err());
}

#[test]
fn rgbデータを_pngのdata_urlへ変換する() {
  let data_url = to_png_data_url(1, 1, &[1, 2, 3]).unwrap();
  let encoded = data_url.strip_prefix("data:image/png;base64,").unwrap();
  let bytes = STANDARD.decode(encoded).unwrap();
  assert_eq!(&bytes[..8], b"\x89PNG\r\n\x1a\n");
  assert!(to_png_data_url(1, 1, &[1, 2]).is_err());
}
