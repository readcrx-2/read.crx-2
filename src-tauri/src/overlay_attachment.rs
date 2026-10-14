use serde::Serialize;

fn parse_window_identity(id: &str) -> Result<(usize, u32), String> {
  let (handle, process) = id
    .split_once(':')
    .ok_or_else(|| "追従先の識別子が不正です。".to_string())?;
  let handle = handle
    .parse::<usize>()
    .map_err(|_| "追従先の識別子が不正です。".to_string())?;
  let process = process
    .parse::<u32>()
    .map_err(|_| "追従先の識別子が不正です。".to_string())?;
  Ok((handle, process))
}

fn is_attachable_window(
  visible: bool,
  pid: u32,
  own_pid: u32,
  tool_window: bool,
  title_length: i32,
) -> bool {
  visible && pid != own_pid && !tool_window && title_length > 0
}

fn client_bounds(x: i32, y: i32, right: i32, bottom: i32) -> Option<TargetBounds> {
  (right > 0 && bottom > 0).then_some(TargetBounds {
    x,
    y,
    width: right,
    height: bottom,
  })
}

#[derive(Serialize)]
pub struct AttachmentWindow {
  id: String,
  title: String,
}

#[derive(Serialize)]
pub struct TargetBounds {
  x: i32,
  y: i32,
  width: i32,
  height: i32,
}

#[tauri::command]
pub fn list_comment_overlay_windows() -> Result<Vec<AttachmentWindow>, String> {
  let result = list_windows();
  if let Err(error) = &result {
    log::error!("追従先ウィンドウ一覧の取得に失敗しました: {error}");
  }
  result
}

#[tauri::command]
pub fn read_comment_overlay_target(id: String) -> Result<Option<TargetBounds>, String> {
  let result = read_target(&id);
  if let Err(error) = &result {
    log::error!("追従先ウィンドウの取得に失敗しました: {error}");
  }
  result
}

#[cfg(not(windows))]
fn list_windows() -> Result<Vec<AttachmentWindow>, String> {
  Ok(Vec::new())
}

#[cfg(not(windows))]
fn read_target(_id: &str) -> Result<Option<TargetBounds>, String> {
  Err("ウィンドウ追従はWindowsで利用できます。".into())
}

#[cfg(windows)]
fn list_windows() -> Result<Vec<AttachmentWindow>, String> {
  use windows_sys::Win32::{Foundation::*, UI::WindowsAndMessaging::*};
  unsafe extern "system" fn collect(hwnd: HWND, data: LPARAM) -> i32 {
    let mut pid = 0;
    GetWindowThreadProcessId(hwnd, &mut pid);
    let visible = IsWindowVisible(hwnd) != 0;
    let tool_window = GetWindowLongPtrW(hwnd, GWL_EXSTYLE) & WS_EX_TOOLWINDOW as isize != 0;
    let length = GetWindowTextLengthW(hwnd);
    // 自分自身やツール窓へ追従すると操作パネルと表示領域が干渉するため除外する。
    if !is_attachable_window(visible, pid, std::process::id(), tool_window, length) {
      return 1;
    }
    let mut title = vec![0u16; length as usize + 1];
    let copied = GetWindowTextW(hwnd, title.as_mut_ptr(), title.len() as i32);
    if copied > 0 {
      let windows = &mut *(data as *mut Vec<AttachmentWindow>);
      windows.push(AttachmentWindow {
        id: format!("{}:{pid}", hwnd as usize),
        title: String::from_utf16_lossy(&title[..copied as usize]),
      });
    }
    1
  }
  let mut windows: Vec<AttachmentWindow> = Vec::new();
  if unsafe { EnumWindows(Some(collect), &mut windows as *mut _ as isize) } == 0 {
    return Err(std::io::Error::last_os_error().to_string());
  }
  windows.sort_by(|a, b| a.title.cmp(&b.title));
  Ok(windows)
}

#[cfg(windows)]
fn read_target(id: &str) -> Result<Option<TargetBounds>, String> {
  use windows_sys::Win32::{
    Foundation::*, Graphics::Gdi::ClientToScreen, UI::WindowsAndMessaging::*,
  };
  let (handle, process) = parse_window_identity(id)?;
  let hwnd = handle as HWND;
  unsafe {
    let mut pid = 0;
    GetWindowThreadProcessId(hwnd, &mut pid);
    // HWNDが別プロセスへ再利用されても、閉じた対象から勝手に追従先を切り替えない。
    if IsWindow(hwnd) == 0 || pid != process || pid == std::process::id() {
      return Err("追従先が閉じられました。ウィンドウを選び直してください。".into());
    }
    if IsIconic(hwnd) != 0 || IsWindowVisible(hwnd) == 0 {
      return Ok(None);
    }
    let mut rect = RECT::default();
    let mut origin = POINT::default();
    if GetClientRect(hwnd, &mut rect) == 0 || ClientToScreen(hwnd, &mut origin) == 0 {
      return Err(std::io::Error::last_os_error().to_string());
    }
    // タイトルバーと枠を含めず、DPIが異なる画面間でも物理座標のまま受け渡す。
    Ok(client_bounds(origin.x, origin.y, rect.right, rect.bottom))
  }
}

#[cfg(test)]
#[path = "overlay_attachment_tests.rs"]
mod tests;
