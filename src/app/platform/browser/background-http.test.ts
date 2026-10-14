// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { handleSharedHttpRequest } from "./background-http";

describe("拡張機能全ウィンドウ共有HTTPキュー", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("別ウィンドウからの要求も同じ同時実行数と待ち行列上限を使う", async () => {
    let activeCount = 0;
    let maximumActiveCount = 0;
    const fetchMock = vi.fn(async (url: string) => {
      activeCount += 1;
      maximumActiveCount = Math.max(maximumActiveCount, activeCount);
      await Promise.resolve();
      activeCount -= 1;
      return {
        status: 200,
        headers: new Headers({ "content-type": "text/plain", etag: "test-etag" }),
        arrayBuffer: async () => new TextEncoder().encode(url).buffer,
        url,
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    const requests = Array.from({ length: 100 }, (_, index) =>
      handleSharedHttpRequest({
        type: "shared-http-request",
        url: "https://example.com/" + index,
        sourceWindow: index % 2,
      }),
    );
    const results = await Promise.all(requests);

    expect(maximumActiveCount).toBeLessThanOrEqual(3);
    expect(fetchMock).toHaveBeenCalledTimes(13);
    expect(results.filter((result) => result?.ok)).toHaveLength(13);
    expect(results.filter((result) => result?.ok === false)).toHaveLength(87);
    expect(results[0]).toMatchObject({
      ok: true,
      response: { headers: { ETag: "test-etag" } },
    });
  });

  it("共有対象外のメッセージは処理しない", async () => {
    await expect(
      handleSharedHttpRequest({ type: "open-new-ui", url: "about:blank" }),
    ).resolves.toBe(undefined);
  });
});
