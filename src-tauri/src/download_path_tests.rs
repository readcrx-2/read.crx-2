use super::{is_reserved_windows_name, next_available_path, sanitize_file_name};
use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicUsize, Ordering};

static NEXT_TEST_DIRECTORY: AtomicUsize = AtomicUsize::new(0);

fn test_directory() -> PathBuf {
  std::env::temp_dir().join(format!(
    "chlens-download-path-test-{}-{}",
    std::process::id(),
    NEXT_TEST_DIRECTORY.fetch_add(1, Ordering::Relaxed)
  ))
}

#[test]
fn ファイル名からパス区切り文字と危険な文字を除去する() {
  assert_eq!(sanitize_file_name(r#"..\secret/画像?.png"#), "画像_.png");
}

#[test]
fn 空のファイル名と予約名を安全な名前へ置き換える() {
  assert_eq!(sanitize_file_name("..."), "image");
  assert_eq!(sanitize_file_name("CON.txt"), "_CON.txt");
  assert!(is_reserved_windows_name("LPT1.jpg"));
  assert!(!is_reserved_windows_name("report.txt"));
}

#[test]
fn 拡張子の有無に応じて重複しない保存先を選ぶ() {
  let directory = test_directory();
  fs::create_dir_all(&directory).unwrap();
  assert_eq!(
    next_available_path(&directory, "image.png")
      .file_name()
      .unwrap(),
    "image.png"
  );
  fs::write(directory.join("image.png"), b"one").unwrap();
  assert_eq!(
    next_available_path(&directory, "image.png")
      .file_name()
      .unwrap(),
    "image (1).png"
  );
  fs::write(directory.join("image (1).png"), b"two").unwrap();
  assert_eq!(
    next_available_path(&directory, "image.png")
      .file_name()
      .unwrap(),
    "image (2).png"
  );
  assert_eq!(
    next_available_path(&directory, "image")
      .file_name()
      .unwrap(),
    "image"
  );
  fs::remove_dir_all(directory).unwrap();
}

#[test]
fn 空のstemや拡張子なしファイル名を安全に扱う() {
  let directory = test_directory();
  fs::create_dir_all(&directory).unwrap();
  fs::write(directory.join("image"), b"one").unwrap();
  assert_eq!(
    next_available_path(&directory, "image")
      .file_name()
      .unwrap(),
    "image (1)"
  );
  assert_eq!(
    next_available_path(&directory, ".png").file_name().unwrap(),
    ".png"
  );
  fs::remove_dir_all(directory).unwrap();
}
