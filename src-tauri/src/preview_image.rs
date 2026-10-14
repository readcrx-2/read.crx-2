use base64::engine::general_purpose::STANDARD;
use base64::Engine;
pub(super) fn preview_dimensions(width: u32, height: u32) -> Result<(u32, u32), String> {
  if width == 0 || height == 0 || width > i32::MAX as u32 || height > i32::MAX as u32 {
    return Err("ディスプレイのサイズが不正です".into());
  }
  let scale = (640.0 / f64::from(width.max(height))).min(1.0);
  let preview_width = (f64::from(width) * scale).round().max(1.0) as u32;
  let preview_height = (f64::from(height) * scale).round().max(1.0) as u32;
  Ok((preview_width, preview_height))
}

pub(super) fn bgrx_to_rgb(pixels: &[u8]) -> Result<Vec<u8>, String> {
  if pixels.len() % 4 != 0 {
    return Err("画面のピクセルデータが不正です".into());
  }
  Ok(
    pixels
      .chunks_exact(4)
      .flat_map(|pixel| [pixel[2], pixel[1], pixel[0]])
      .collect(),
  )
}

pub(super) fn to_png_data_url(width: u32, height: u32, rgb: &[u8]) -> Result<String, String> {
  let mut bytes = Vec::new();
  {
    let mut encoder = png::Encoder::new(&mut bytes, width, height);
    encoder.set_color(png::ColorType::Rgb);
    encoder.set_depth(png::BitDepth::Eight);
    encoder.set_compression(png::Compression::Fast);
    let mut writer = encoder.write_header().map_err(|error| error.to_string())?;
    writer
      .write_image_data(rgb)
      .map_err(|error| error.to_string())?;
  }
  Ok(format!("data:image/png;base64,{}", STANDARD.encode(bytes)))
}

#[cfg(test)]
#[path = "preview_image_tests.rs"]
mod tests;
