use std::path::{Path, PathBuf};

pub(super) fn sanitize_file_name(file_name: &str) -> String {
  let base_name = file_name.rsplit(['\\', '/']).next().unwrap_or(file_name);
  let sanitized: String = base_name
    .chars()
    .map(|character| {
      if character.is_control() || r#"<>:\"/|?*"#.contains(character) {
        '_'
      } else {
        character
      }
    })
    .collect();
  let trimmed = sanitized.trim_matches([' ', '.']);

  if trimmed.is_empty() || trimmed == "." || trimmed == ".." {
    return "image".to_string();
  }

  if is_reserved_windows_name(trimmed) {
    return format!("_{trimmed}");
  }

  trimmed.to_string()
}

fn is_reserved_windows_name(file_name: &str) -> bool {
  let stem = file_name.split('.').next().unwrap_or(file_name);
  matches!(
    stem.to_ascii_uppercase().as_str(),
    "CON"
      | "PRN"
      | "AUX"
      | "NUL"
      | "COM1"
      | "COM2"
      | "COM3"
      | "COM4"
      | "COM5"
      | "COM6"
      | "COM7"
      | "COM8"
      | "COM9"
      | "LPT1"
      | "LPT2"
      | "LPT3"
      | "LPT4"
      | "LPT5"
      | "LPT6"
      | "LPT7"
      | "LPT8"
      | "LPT9"
  )
}

pub(super) fn next_available_path(directory: &Path, file_name: &str) -> PathBuf {
  let original = Path::new(file_name);
  let stem = original
    .file_stem()
    .and_then(|value| value.to_str())
    .filter(|value| !value.is_empty())
    .unwrap_or("image");
  let extension = original.extension().and_then(|value| value.to_str());

  let make_path = |suffix: Option<u32>| {
    let name = match (suffix, extension) {
      (None, Some(extension)) => format!("{stem}.{extension}"),
      (None, None) => stem.to_string(),
      (Some(index), Some(extension)) => format!("{stem} ({index}).{extension}"),
      (Some(index), None) => format!("{stem} ({index})"),
    };
    directory.join(name)
  };

  let first = make_path(None);
  if !first.exists() {
    return first;
  }

  for index in 1..=u32::MAX {
    let candidate = make_path(Some(index));
    if !candidate.exists() {
      return candidate;
    }
  }

  // 現実的には到達しないが、候補を無限に探索して固まらないようにする。
  directory.join(format!("{stem}-download"))
}

#[cfg(test)]
#[path = "download_path_tests.rs"]
mod tests;
