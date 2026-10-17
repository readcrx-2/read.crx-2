import { createLogger } from "src/app/logger";
import type { Page } from "src/view/browser/types";
import { parseInternalBrowserPageStrict } from "src/view/browser/utils/link-routing";
import browser from "webextension-polyfill";

const logger = createLogger("view/browser");

type ExtensionBrowserApi = Pick<typeof browser, "runtime" | "tabs">;

export interface OpenCompatibleThreadPage {
  page: Extract<Page, { type: "thread" }>;
  tabIds: number[];
}

function getExtensionBrowserApi(): ExtensionBrowserApi | null {
  const candidate = browser;

  // 変更理由: Tauri では互換シムが runtime.id を提供するものの tabs.query は使えないため、
  // モジュールとして解決したAPIの存在まで確認して拡張機能専用コマンドを確実に隠す。
  if (
    !candidate ||
    candidate.runtime?.id === "tauri" ||
    typeof candidate.runtime?.id !== "string" ||
    typeof candidate.tabs?.query !== "function" ||
    typeof candidate.tabs?.remove !== "function"
  ) {
    return null;
  }

  return candidate;
}

export function canQueryExtensionTabs(): boolean {
  return getExtensionBrowserApi() != null;
}

export async function getOpenCompatibleThreadPages(): Promise<OpenCompatibleThreadPage[]> {
  const browserApi = getExtensionBrowserApi();
  if (!browserApi) return [];

  const openTabs = await browserApi.tabs.query({});
  const pagesByUrl = new Map<string, OpenCompatibleThreadPage>();

  for (const tab of openTabs) {
    if (typeof tab.url !== "string") continue;

    const page = parseInternalBrowserPageStrict(tab.url);
    if (page?.type !== "thread") continue;

    // 変更理由: 取り込み後に元タブを閉じる契約を満たせないタブは、
    // IDを追跡できる通常のブラウザタブだけを取り込み対象にする。
    if (typeof tab.id !== "number" || tab.id < 0) {
      logger.warn("元ブラウザタブのIDを取得できないため取り込みをスキップしました", {
        tabId: tab.id,
        url: tab.url,
      });
      continue;
    }

    const existing = pagesByUrl.get(page.threadUrl);
    if (existing) {
      // 変更理由: URLが同じ元タブを残すと一括取り込み後も重複タブが残るため、
      // アプリ側は1件にまとめつつ、クローズ対象のIDはすべて保持する。
      existing.tabIds.push(tab.id);
      continue;
    }

    pagesByUrl.set(page.threadUrl, {
      page: {
        ...page,
        title: tab.title?.trim() || page.title,
      },
      tabIds: [tab.id],
    });
  }

  return [...pagesByUrl.values()];
}

export async function removeExtensionTabs(tabIds: readonly number[]): Promise<number[]> {
  if (tabIds.length === 0) return [];

  const browserApi = getExtensionBrowserApi();
  if (!browserApi) {
    logger.error("取り込み元ブラウザタブを閉じるAPIが利用できません", { tabIds });
    return [...tabIds];
  }

  const failedTabIds: number[] = [];
  // 変更理由: 一部の元タブが既に閉じられていても、残りの取り込み元を閉じ続けて
  // 取り込み処理全体を部分的なブラウザ状態で止めないよう、IDごとに独立して削除する。
  for (const tabId of tabIds) {
    try {
      await browserApi.tabs.remove(tabId);
    } catch (error: unknown) {
      failedTabIds.push(tabId);
      logger.error("取り込み元ブラウザタブを閉じられませんでした", {
        tabId,
        error,
      });
    }
  }

  return failedTabIds;
}
