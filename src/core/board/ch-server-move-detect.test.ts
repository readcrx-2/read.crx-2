import { ChURL } from "packages/chlib/src/url/ChURL";
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

describe("chServerMoveDetect", () => {
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

  it("ChURLのhrefを使って板の移転先を問い合わせる", async () => {
    const { chServerMoveDetect } = await import("src/core/board/ch-server-move-detect");
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
