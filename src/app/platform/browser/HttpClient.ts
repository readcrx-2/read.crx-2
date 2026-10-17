import { createLogger } from "src/app/logger";
import {
  serializeSharedHttpRequest,
  type SharedHttpResponseMessage,
} from "src/app/platform/browser/shared-http-protocol";
import { HttpClient, HttpRequestOptions, HttpResponse } from "src/app/platform/types";
import browser from "webextension-polyfill";

const logger = createLogger("platform");

type DnrRule = browser.DeclarativeNetRequest.Rule;
type DnrApi = NonNullable<(typeof browser)["declarativeNetRequest"]>;

async function getSessionRules(dnr: DnrApi): Promise<DnrRule[]> {
  const getSessionRulesFn = dnr.getSessionRules;

  if (getSessionRulesFn.length === 0) {
    return await (getSessionRulesFn as () => Promise<DnrRule[]>).call(dnr);
  }

  return await new Promise((resolve) => {
    (getSessionRulesFn as (callback: (rules: DnrRule[]) => void) => void).call(dnr, (rules) =>
      resolve(rules),
    );
  });
}

function getNextRuleId(rules: DnrRule[]): number {
  const usedIds = new Set(rules.map((rule) => rule.id));
  let nextId = 1;
  while (usedIds.has(nextId)) {
    nextId += 1;
  }
  return nextId;
}

function isSameWriteRule(rule: DnrRule, formAction: string, tabId: number): boolean {
  return rule.condition.urlFilter === formAction && rule.condition.tabIds?.includes(tabId) === true;
}

async function setupWriteHeaders(formAction: string): Promise<void> {
  // フォーク元と同様、認証Cookieはブラウザに任せ、メール欄の値から作成・上書きしない。
  const api = browser;

  if (
    !api?.declarativeNetRequest?.updateSessionRules ||
    !api.declarativeNetRequest.getSessionRules
  ) {
    logger.warn("declarativeNetRequest is not available");
    return;
  }

  try {
    const tab = await api.tabs.getCurrent();
    if (!tab?.id) return;

    const dnr = api.declarativeNetRequest;
    const existing = await getSessionRules(dnr);
    const oldRule = existing.find((rule) => isSameWriteRule(rule, formAction, tab.id!));
    const actionOrigin = new URL(formAction).origin;

    // ルール削除でIDが欠番化しても衝突しないよう、未使用IDを探索して再利用する
    const ruleId = oldRule?.id ?? getNextRuleId(existing);

    const rule: browser.DeclarativeNetRequest.Rule = {
      id: ruleId,
      priority: 1,
      action: {
        type: "modifyHeaders",
        requestHeaders: [
          { header: "Origin", operation: "set", value: actionOrigin },
          { header: "Referer", operation: "set", value: formAction },
        ],
      },
      condition: {
        tabIds: [tab.id],
        urlFilter: formAction,
        requestMethods: ["post"],
        resourceTypes: ["sub_frame"],
      },
    };

    await dnr.updateSessionRules({
      addRules: [rule],
      removeRuleIds: oldRule ? [oldRule.id] : [],
    });
  } catch (e) {
    logger.error("setupWriteHeaders failed:", e);
  }
}

/** 通信本体はバックグラウンドで共有し、書き込みヘッダー設定だけは各タブで行う。 */
export const BrowserHttpClient: HttpClient = {
  async fetch(url: string, options: HttpRequestOptions = {}): Promise<HttpResponse> {
    const result = (await browser.runtime.sendMessage(
      serializeSharedHttpRequest(url, options),
    )) as SharedHttpResponseMessage;
    if (!result || !result.ok) {
      throw new Error(result?.error ?? "共有HTTPクライアントから応答がありません");
    }
    return result.response;
  },

  setupWriteHeaders,
};
