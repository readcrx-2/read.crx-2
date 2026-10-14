use std::sync::Arc;

/// 投稿Cookieの保存内容を暗号化・復号する。
/// テストでOSの資格情報やユーザープロファイルへ依存しないよう、実装を差し替えられるようにする。
pub trait CookieCipher: Send + Sync {
  fn seal(&self, plain: &[u8]) -> Result<Vec<u8>, String>;
  fn open(&self, sealed: &[u8]) -> Result<Vec<u8>, String>;
}

/// 実行中のOSで使える暗号化を返す。使えない環境では平文保存を避けるためNoneを返す。
pub fn platform_cipher() -> Option<Arc<dyn CookieCipher>> {
  #[cfg(windows)]
  {
    Some(Arc::new(dpapi::DpapiCipher))
  }
  #[cfg(not(windows))]
  {
    None
  }
}

#[cfg(windows)]
pub mod dpapi {
  use super::CookieCipher;
  use std::ptr::{null, null_mut};
  use windows_sys::Win32::Foundation::LocalFree;
  use windows_sys::Win32::Security::Cryptography::{
    CryptProtectData, CryptUnprotectData, CRYPTPROTECT_UI_FORBIDDEN, CRYPT_INTEGER_BLOB,
  };

  // DPAPIはログオンユーザーの鍵で暗号化するため、鍵の保管をアプリで持たずに済む。
  // 追加エントロピーを付け、同じユーザーで動く他アプリがエントロピーなしで復号するのを防ぐ。
  const ENTROPY: &[u8] = b"ChLens write cookies v1";

  pub struct DpapiCipher;

  fn input_blob(data: &[u8]) -> Result<CRYPT_INTEGER_BLOB, String> {
    let length = u32::try_from(data.len())
      .map_err(|_| format!("DPAPIで扱えない大きさのデータです: {} bytes", data.len()))?;
    // DPAPIは入力を書き換えないが、構造体の型が可変ポインタを要求する。
    Ok(CRYPT_INTEGER_BLOB {
      cbData: length,
      pbData: data.as_ptr().cast_mut(),
    })
  }

  fn take_output(output: CRYPT_INTEGER_BLOB) -> Vec<u8> {
    if output.pbData.is_null() {
      return Vec::new();
    }
    // SAFETY: 成功したDPAPI呼び出しが確保した領域で、cbDataはその長さを表す。
    let bytes =
      unsafe { std::slice::from_raw_parts(output.pbData, output.cbData as usize) }.to_vec();
    // SAFETY: DPAPIの出力はLocalAllocで確保されるため、LocalFreeで解放する。
    unsafe { LocalFree(output.pbData.cast()) };
    bytes
  }

  impl CookieCipher for DpapiCipher {
    fn seal(&self, plain: &[u8]) -> Result<Vec<u8>, String> {
      let input = input_blob(plain)?;
      let entropy = input_blob(ENTROPY)?;
      let mut output = CRYPT_INTEGER_BLOB {
        cbData: 0,
        pbData: null_mut(),
      };
      // SAFETY: 入力と出力のポインタは呼び出し中だけ有効なローカル変数を指す。
      let succeeded = unsafe {
        CryptProtectData(
          &input,
          null(),
          &entropy,
          null(),
          null(),
          CRYPTPROTECT_UI_FORBIDDEN,
          &mut output,
        )
      };
      if succeeded == 0 {
        return Err(format!(
          "DPAPIで投稿Cookieを暗号化できませんでした: {}",
          std::io::Error::last_os_error()
        ));
      }
      Ok(take_output(output))
    }

    fn open(&self, sealed: &[u8]) -> Result<Vec<u8>, String> {
      let input = input_blob(sealed)?;
      let entropy = input_blob(ENTROPY)?;
      let mut output = CRYPT_INTEGER_BLOB {
        cbData: 0,
        pbData: null_mut(),
      };
      // SAFETY: 入力と出力のポインタは呼び出し中だけ有効なローカル変数を指す。
      let succeeded = unsafe {
        CryptUnprotectData(
          &input,
          null_mut(),
          &entropy,
          null(),
          null(),
          CRYPTPROTECT_UI_FORBIDDEN,
          &mut output,
        )
      };
      if succeeded == 0 {
        return Err(format!(
          "DPAPIで投稿Cookieを復号できませんでした: {}",
          std::io::Error::last_os_error()
        ));
      }
      Ok(take_output(output))
    }
  }
}

#[cfg(test)]
#[path = "cookie_cipher_tests.rs"]
mod tests;
