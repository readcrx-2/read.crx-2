/// 選択画面の静止画だけを返し、画面内容をファイルやログへ保存しない。
#[tauri::command]
pub async fn capture_comment_overlay_monitor_preview(
  app: tauri::AppHandle,
  x: i32,
  y: i32,
  width: u32,
  height: u32,
) -> Result<Option<String>, String> {
  let result = async {
    let monitors = app
      .available_monitors()
      .map_err(|error| error.to_string())?;
    // フロントエンドの座標を任意領域の撮影へ流用せず、現在の実ディスプレイと照合する。
    if !monitors.iter().any(|monitor| {
      let position = monitor.position();
      let size = monitor.size();
      monitor_matches_bounds(
        position.x,
        position.y,
        size.width,
        size.height,
        x,
        y,
        width,
        height,
      )
    }) {
      return Err("撮影対象のディスプレイが見つかりません。パネルを開き直してください。".into());
    }
    // GDIとPNG圧縮をUIスレッドから外し、1回分の縮小画像だけをIPCへ渡す。
    tauri::async_runtime::spawn_blocking(move || capture(x, y, width, height))
      .await
      .map_err(|error| error.to_string())?
  }
  .await;
  if let Err(error) = &result {
    log::error!("ディスプレイのプレビュー取得に失敗しました: {error}");
  }
  result
}

#[cfg(not(windows))]
fn capture(_x: i32, _y: i32, _width: u32, _height: u32) -> Result<Option<String>, String> {
  Ok(None)
}

#[cfg(windows)]
fn capture(x: i32, y: i32, width: u32, height: u32) -> Result<Option<String>, String> {
  use crate::preview_image::{bgrx_to_rgb, preview_dimensions, to_png_data_url};
  use std::{ffi::c_void, mem::size_of, ptr::null_mut};
  use windows_sys::Win32::Graphics::Gdi::*;

  struct CaptureResources {
    screen: HDC,
    memory: HDC,
    bitmap: HBITMAP,
    previous: HGDIOBJ,
  }
  impl Drop for CaptureResources {
    fn drop(&mut self) {
      // エラーによる早期returnでも選択を戻してGDIリソースを解放し、更新の繰り返しで枯渇させない。
      unsafe {
        if !self.previous.is_null() {
          SelectObject(self.memory, self.previous);
        }
        if !self.bitmap.is_null() && DeleteObject(self.bitmap) == 0 {
          log::error!("プレビュー用bitmapの解放に失敗しました");
        }
        if !self.memory.is_null() && DeleteDC(self.memory) == 0 {
          log::error!("プレビュー用メモリDCの解放に失敗しました");
        }
        if !self.screen.is_null() && ReleaseDC(null_mut(), self.screen) == 0 {
          log::error!("プレビュー用画面DCの解放に失敗しました");
        }
      }
    }
  }

  let (preview_width, preview_height) = preview_dimensions(width, height)?;
  // 長辺640pxの静止画へ直接縮小し、4K画面のフルサイズ画像を保持・転送しない。
  let rgb = unsafe {
    let mut resources = CaptureResources {
      screen: GetDC(null_mut()),
      memory: null_mut(),
      bitmap: null_mut(),
      previous: null_mut(),
    };
    if resources.screen.is_null() {
      return Err(format!(
        "画面DCの取得に失敗しました: {}",
        std::io::Error::last_os_error()
      ));
    }
    resources.memory = CreateCompatibleDC(resources.screen);
    if resources.memory.is_null() {
      return Err(format!(
        "メモリDCの作成に失敗しました: {}",
        std::io::Error::last_os_error()
      ));
    }
    let info = BITMAPINFO {
      bmiHeader: BITMAPINFOHEADER {
        biSize: size_of::<BITMAPINFOHEADER>() as u32,
        biWidth: preview_width as i32,
        biHeight: -(preview_height as i32),
        biPlanes: 1,
        biBitCount: 32,
        biCompression: BI_RGB,
        ..Default::default()
      },
      ..Default::default()
    };
    let mut pixels: *mut c_void = null_mut();
    resources.bitmap = CreateDIBSection(
      resources.screen,
      &info,
      DIB_RGB_COLORS,
      &mut pixels,
      null_mut(),
      0,
    );
    if resources.bitmap.is_null() || pixels.is_null() {
      return Err(format!(
        "撮影用bitmapの作成に失敗しました: {}",
        std::io::Error::last_os_error()
      ));
    }
    let previous = SelectObject(resources.memory, resources.bitmap);
    if previous.is_null() || previous as isize == -1 {
      return Err("撮影用bitmapの選択に失敗しました".into());
    }
    resources.previous = previous;
    if SetStretchBltMode(resources.memory, HALFTONE) == 0 {
      return Err("画面縮小モードの設定に失敗しました".into());
    }
    if SetBrushOrgEx(resources.memory, 0, 0, null_mut()) == 0 {
      return Err("画面縮小の原点設定に失敗しました".into());
    }
    if StretchBlt(
      resources.memory,
      0,
      0,
      preview_width as i32,
      preview_height as i32,
      resources.screen,
      x,
      y,
      width as i32,
      height as i32,
      SRCCOPY | CAPTUREBLT,
    ) == 0
    {
      return Err(format!(
        "画面の撮影に失敗しました: {}",
        std::io::Error::last_os_error()
      ));
    }
    if GdiFlush() == 0 {
      return Err("画面の撮影結果の同期に失敗しました".into());
    }
    // DIBのBGR成分をPNGのRGBへ変換する。未定義のalphaを使うと透明な画像になる。
    bgrx_to_rgb(std::slice::from_raw_parts(
      pixels.cast::<u8>(),
      (preview_width * preview_height * 4) as usize,
    ))?
  };
  Ok(Some(to_png_data_url(preview_width, preview_height, &rgb)?))
}

fn monitor_matches_bounds(
  monitor_x: i32,
  monitor_y: i32,
  monitor_width: u32,
  monitor_height: u32,
  requested_x: i32,
  requested_y: i32,
  requested_width: u32,
  requested_height: u32,
) -> bool {
  monitor_x == requested_x
    && monitor_y == requested_y
    && monitor_width == requested_width
    && monitor_height == requested_height
}

#[cfg(test)]
#[path = "monitor_preview_tests.rs"]
mod tests;
