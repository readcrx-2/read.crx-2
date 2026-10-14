import { getStore2String } from "src/app/Store2Storage";

// タブストアが参照する設定値の読み取り。ストレージ未初期化などで例外になっても既定値へ倒せるよう null を返す。
//
// 変更理由: 他の画面は src/view/browser/utils/config-setting.ts（サービスコンテナ経由）を使うが、
// タブストアは import 時に初期状態（新規タブの初期ページなど）を同期で組み立てる。その時点では
// container.config が未登録で、Config のキャッシュも非同期読み込み中のため、コンテナ経由だと
// 利用者の設定を無視して既定値で起動してしまう。そのため store2 を直接同期で読む。
const CONFIG_KEY_PREFIX = "config_";

export function readConfigValue(key: string): string | null {
  try {
    return getStore2String(`${CONFIG_KEY_PREFIX}${key}`);
  } catch (error) {
    // 読み取れない場合は未設定として既定値へ倒すが、原因調査のためログは残す。
    console.warn("[tab-store] 設定値を読み取れませんでした", { key, error });
    return null;
  }
}
