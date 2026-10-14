import { ChURL } from "packages/chlib/src/url/ChURL";
import { Anchor } from "src/core/thread/anchor";
import { stringToDate } from "src/core/util/date-convert";
import { normalize } from "src/core/util/string-normalize";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const requestState = vi.hoisted(() => ({ urls: [] as string[] }));

vi.mock("src/core/network/HTTP.ts", () => {
  class Request {
    constructor(_method: string, url: string) {
      requestState.urls.push(url);
    }

    async send(): Promise<never> {
      throw new Error("stop-test-request");
    }
  }

  return { Request };
});

describe("jsutil責務別ヘルパー", () => {
  it("アンカーの全角数字と逆順範囲を解析する", () => {
    expect(Anchor.parseAnchor("＞＞５-３、８")).toEqual({
      targetCount: 4,
      segments: [
        [3, 5],
        [8, 8],
      ],
    });
  });

  it("旧対象範囲内の半角カタカナだけを検索表記へ変換する", () => {
    // 旧正規表現はFF9DまでをNFKC変換し、FF9Eの濁点はそのまま残す。
    expect(normalize("ｶﾞＡＢＣ　 テスト")).toBe("かﾞabcてすと");
  });

  it("日時書式を解析し、不正な日時は拒否する", () => {
    const parsed = stringToDate("2024/2/3(土) 04:05");
    expect(parsed?.getFullYear()).toBe(2024);
    expect(parsed?.getMonth()).toBe(1);
    expect(parsed?.getDate()).toBe(3);
    expect(parsed?.getHours()).toBe(4);
    expect(parsed?.getMinutes()).toBe(5);
    expect(stringToDate("2024/13/3 04:05")).toBeNull();
  });
});

describe("chServerMoveDetect互換ファサード", () => {
  afterEach(() => vi.unstubAllGlobals());

  beforeEach(() => {
    requestState.urls = [];
    vi.stubGlobal("browser", {
      storage: {
        local: {
          get: async () => ({}),
          set: async () => {},
          remove: async () => {},
          clear: async () => {},
        },
        onChanged: { addListener: () => {} },
      },
      runtime: {
        id: "dummy",
        sendMessage: async () => {},
        onMessage: { addListener: () => {} },
      },
      tabs: { getCurrent: async () => ({ id: 1 }) },
      declarativeNetRequest: {
        getSessionRules: (callback: (rules: never[]) => void) => callback([]),
        updateSessionRules: async () => {},
      },
    });
    vi.stubGlobal("chrome", { runtime: { id: "dummy" } });
    vi.stubGlobal("indexedDB", {
      open: () => {
        const req: { onsuccess?: (event: unknown) => void } = {};
        queueMicrotask(() => {
          req.onsuccess?.({
            target: {
              result: { createObjectStore: () => ({ createIndex: () => {} }) },
            },
          });
        });
        return req;
      },
    });
    vi.stubGlobal(
      "BroadcastChannel",
      class {
        addEventListener() {}
        on() {}
        postMessage() {}
        close() {}
      },
    );
  });

  it("従来のjsutil.js importからChURLのhrefを使って通信する", async () => {
    const { chServerMoveDetect } = await import("src/core/util/jsutil.js");
    const threadUrl = new ChURL("https://example.com/test/read.cgi/bbynamazu/1000000007/");
    const boardUrl = threadUrl.toBoard();

    const deps = { bbsMenu: { get: vi.fn() }, message: { send: vi.fn() } } as unknown as Parameters<
      typeof chServerMoveDetect
    >[1];
    await expect(chServerMoveDetect(boardUrl, deps)).rejects.toThrow("stop-test-request");
    expect(requestState.urls[0]).toBe("http://example.com/bbynamazu/");
    expect(requestState.urls[0]).not.toBeUndefined();
  }, 15_000);
});
