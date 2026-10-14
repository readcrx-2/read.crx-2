use super::save_download_file_inner;
use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicUsize, Ordering};

static NEXT_TEST_DIRECTORY: AtomicUsize = AtomicUsize::new(0);

fn test_directory() -> PathBuf {
  std::env::temp_dir().join(format!(
    "chlens-download-test-{}-{}",
    std::process::id(),
    NEXT_TEST_DIRECTORY.fetch_add(1, Ordering::Relaxed)
  ))
}

#[test]
fn 保存時にファイル名を無害化して内容を書き込む() {
  let directory = test_directory();
  let path = save_download_file_inner(&directory, r#"..secret/画像?.png"#, b"image bytes")
    .expect("download file is saved");
  let path = PathBuf::from(path);
  assert_eq!(path.file_name().unwrap(), "画像_.png");
  assert_eq!(fs::read(&path).unwrap(), b"image bytes");
  fs::remove_dir_all(directory).unwrap();
}

#[test]
fn 同じ名前のファイルを上書きせず連番を付ける() {
  let directory = test_directory();
  let first = save_download_file_inner(&directory, "image.png", b"first").unwrap();
  let second = save_download_file_inner(&directory, "image.png", b"second").unwrap();
  assert_eq!(PathBuf::from(&first).file_name().unwrap(), "image.png");
  assert_eq!(PathBuf::from(&second).file_name().unwrap(), "image (1).png");
  assert_eq!(fs::read(PathBuf::from(&first)).unwrap(), b"first");
  assert_eq!(fs::read(PathBuf::from(&second)).unwrap(), b"second");
  fs::remove_dir_all(directory).unwrap();
}

#[test]
fn 保存先にファイルがある場合はフォルダー作成エラーを返す() {
  let directory = test_directory();
  fs::write(&directory, b"not a directory").unwrap();
  let error = save_download_file_inner(&directory, "image.png", b"image").unwrap_err();
  assert!(error.contains("フォルダーを作成できませんでした"));
  fs::remove_file(directory).unwrap();
}
