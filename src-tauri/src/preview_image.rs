/// プレビューの長辺の上限。リアルタイム更新でIPCに載せる生ピクセル量を抑えるため小さくする。
const PREVIEW_MAX_EDGE: f64 = 512.0;

pub(super) fn preview_dimensions(width: u32, height: u32) -> Result<(u32, u32), String> {
  if width == 0 || height == 0 || width > i32::MAX as u32 || height > i32::MAX as u32 {
    return Err("ディスプレイのサイズが不正です".into());
  }
  let scale = (PREVIEW_MAX_EDGE / f64::from(width.max(height))).min(1.0);
  let preview_width = (f64::from(width) * scale).round().max(1.0) as u32;
  let preview_height = (f64::from(height) * scale).round().max(1.0) as u32;
  Ok((preview_width, preview_height))
}

/// DIBのBGRX画素を、先頭に幅・高さ（u32リトルエンディアン）を付けたRGBAへ変換する。
///
/// 変更理由: PNG圧縮とbase64化がリアルタイム更新のCPU負荷の大半だったため、圧縮せず
/// 生ピクセルのままバイナリIPCで渡す。DIBの未定義alphaは使わず、常に不透明にする。
pub(super) fn bgrx_to_rgba_frame(
  width: u32,
  height: u32,
  pixels: &[u8],
) -> Result<Vec<u8>, String> {
  if pixels.len() != width as usize * height as usize * 4 {
    return Err("画面のピクセルデータが不正です".into());
  }
  let mut frame = Vec::with_capacity(8 + pixels.len());
  frame.extend_from_slice(&width.to_le_bytes());
  frame.extend_from_slice(&height.to_le_bytes());
  for pixel in pixels.chunks_exact(4) {
    frame.extend_from_slice(&[pixel[2], pixel[1], pixel[0], 255]);
  }
  Ok(frame)
}

#[cfg(test)]
#[path = "preview_image_tests.rs"]
mod tests;
