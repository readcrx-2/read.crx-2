import { platform } from "src/app";
import { createLogger } from "src/app/logger";
import type { IRes } from "src/service-container/interfaces";
import { stripTrailingSyntheticAbobunResponses } from "src/view/browser/utils/thread-response-cache";

const logger = createLogger("view/browser");

export const THREAD_UI_CACHE_STORE = "UICache";

interface ThreadResponseCacheEntry {
  url: string;
  data: IRes[];
}

function threadResponseCacheKey(threadUrl: string): string {
  return `thread:${threadUrl}`;
}

/**
 * スレッド本文の表示用キャッシュを読む。
 *
 * 変更理由: UIキャッシュは通信サービスの責務ではなく、表示中断を避けるための
 * 画面側の補助データなので、取得フックから分離して保存時の「あぼーん」除去を一箇所へ固定する。
 */
export async function getThreadResponseCache(threadUrl: string): Promise<IRes[] | null> {
  try {
    const store = platform.storage.getStore(THREAD_UI_CACHE_STORE);
    const entry = (await store.get(threadResponseCacheKey(threadUrl))) as
      | Partial<ThreadResponseCacheEntry>
      | undefined;
    if (!entry || !Array.isArray(entry.data) || entry.data.length === 0) {
      return null;
    }
    return stripTrailingSyntheticAbobunResponses(entry.data);
  } catch (error) {
    logger.error("スレッド表示キャッシュの読み込みに失敗しました", error);
    return null;
  }
}

export async function setThreadResponseCache(
  threadUrl: string,
  responses: readonly IRes[],
): Promise<void> {
  try {
    const store = platform.storage.getStore(THREAD_UI_CACHE_STORE);
    await store.put({
      url: threadResponseCacheKey(threadUrl),
      // 変更理由: subject.txtのレス数で一時補填した末尾レスは、次回の先行表示に混ぜると
      // 実レス到着時に「あぼーん」が点滅するため、永続化前に必ず取り除く。
      data: stripTrailingSyntheticAbobunResponses(responses),
    });
  } catch (error) {
    logger.error("スレッド表示キャッシュの保存に失敗しました", error);
  }
}
