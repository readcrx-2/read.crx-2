import { bootView } from "src/app/boot";
import { createLogger } from "src/app/logger";
import * as platformInternal from "src/app/platform";

const logger = createLogger("app");

// 変更理由: 以前はここで window.app（旧互換の入口）を組み立て、core のモジュール約 30 個も再エクスポートしていた。
// legacy-window-app-plan の Phase 4 で、リポジトリの中にも外にも利用者がいないことを確かめたため、
// window.app をなくし、画面が import している boot と platform だけを残した。
// 拡張機能のページは別のオリジンで動き、ユーザースクリプトやコンテンツスクリプトからは window に触れられない。

// runtime.ts 側で必要な内部値は吸収済みなので、new-ui は常にローカル platform を使う。
export const platform = new Proxy({} as typeof platformInternal.platform, {
  get(_target, prop) {
    const actualPlatform = platformInternal.platform;
    if (!actualPlatform) {
      logger.error("platform is not initialized");
      return undefined;
    }
    return actualPlatform[prop as keyof typeof platformInternal.platform];
  },
});

/** 設定の読み込みとサービスコンテナの準備を待ってから onReady を呼ぶ。 */
export async function boot(path: string, onReady: () => void): Promise<void> {
  await bootView(path, onReady);
}
