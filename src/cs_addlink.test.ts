// vmForksプールのjsdomでは window.location を再定義できないため、vi.stubGlobal ではなく
// 環境オプションで書き込み結果ページのURLを与える。
// @vitest-environment-options {"url": "https://example.com/test/bbs.cgi"}
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const { runtimeGetUrlMock, sendMessageMock } = vi.hoisted(() => ({
  runtimeGetUrlMock: vi.fn((path: string) => {
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    return `chrome-extension://test-extension${normalizedPath}`;
  }),
  sendMessageMock: vi.fn(),
}));

vi.mock("webextension-polyfill", () => ({
  default: {
    runtime: {
      getURL: runtimeGetUrlMock,
      sendMessage: sendMessageMock,
    },
  },
}));

describe("cs_addlink", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.title = "";
    document.head.querySelector('meta[name="error_code"]')?.remove();
    document.body.innerHTML = "";
  });

  it("認証エラーの種別とコードを親ウィンドウへ通知する", async () => {
    const { notifyWriteResult } = await import("src/cs_addlink");
    const postMessage = vi.fn();
    vi.stubGlobal("parent", { postMessage });
    document.title = "ＥＲＲＯＲ";
    const meta = document.createElement("meta");
    meta.name = "error_code";
    meta.content = "E-Unauthenticated";
    document.head.appendChild(meta);
    document.body.textContent = "認証コード'123456'を用いてください https://example.com/auth-code";

    notifyWriteResult();

    expect(postMessage).toHaveBeenCalledExactlyOnceWith(
      { type: "auth-code", code: "123456", url: "https://example.com/auth-code" },
      "*",
    );
  });

  it("左クリック経路と補助クリック経路で同じ正規化済みURLを共有する", async () => {
    const { createViewerTargets } = await import("src/cs_addlink");

    expect(createViewerTargets("https://bbs.eddibb.cc/liveedge/1000000006/")).toEqual({
      // 元のURLの通信方式を維持する仕様（1ed9a91）に合わせ、HTTPSのまま開く。
      targetUrl: "https://bbs.eddibb.cc/test/read.cgi/liveedge/1000000006/",
      viewerUrl:
        "chrome-extension://test-extension/view/index.html?q=https%3A%2F%2Fbbs.eddibb.cc%2Ftest%2Fread.cgi%2Fliveedge%2F1000000006%2F",
    });
  });
});
