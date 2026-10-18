// @vitest-environment node
import type { ThreadServiceDeps } from "src/core/thread/ThreadService";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  isNGThread: vi.fn(),
  threadGet: vi.fn(),
  replaceStrTxt: vi.fn(),
  config: new Map<string, string>(),
}));

// 依存は登録済みのサービスに頼らず、テスト用の値を直接渡す。
// 置換器は、設定キャッシュの状態に依存せず処理順を検証するため差し替える。
const deps = {
  util: {
    guessType: () => ({ bbsType: "2ch", protocol: "https:" }),
  },
  ng: {
    isNGThread: mocks.isNGThread,
  },
  config: {
    get: (key: string) => mocks.config.get(key) ?? null,
  },
  replaceStr: { replace: mocks.replaceStrTxt },
} as unknown as ThreadServiceDeps;

vi.mock("src/core/thread/Thread", () => ({
  default: class Thread {
    title = "テストスレッド";
    res = [];
    expired = false;
    missingFromSubject = false;
    url: { url: { href: string } };

    constructor(url: string) {
      this.url = { url: { href: url } };
    }

    get(
      forceUpdate: boolean,
      progress: () => void,
      options?: { throttleSubjectCheck?: boolean },
    ): Promise<void> {
      return mocks.threadGet(forceUpdate, progress, options);
    }
  },
}));

interface FormattedResponse {
  ng?: unknown;
  id?: string;
  date?: string;
}

interface ThreadServiceLike {
  _formatResult(thread: unknown): { title: string | null; res: FormattedResponse[] };
  getThread(
    url: string,
    options?: {
      forceUpdate?: boolean;
      throttleSubjectCheck?: boolean;
      onCache?: (thread: unknown) => void;
    },
  ): Promise<unknown>;
}

async function createService() {
  const { createThreadService } = await import("src/core/thread/ThreadService");
  return createThreadService(deps);
}

describe("スレッドサービス", () => {
  beforeEach(() => {
    mocks.isNGThread.mockReset();
    mocks.threadGet.mockReset();
    mocks.config.clear();
    mocks.replaceStrTxt.mockReset();
    mocks.replaceStrTxt.mockImplementation((_url: string, _title: string, res: unknown) => res);
  });

  it("同じタイミングの同一URL取得を強制更新1本へ集約する", async () => {
    let resolveFetch: (() => void) | undefined;
    let progress: (() => void) | undefined;
    mocks.threadGet.mockImplementationOnce((forceUpdate: boolean, onProgress: () => void) => {
      expect(forceUpdate).toBe(true);
      progress = onProgress;
      return new Promise<void>((resolve) => {
        resolveFetch = resolve;
      });
    });
    const firstCache = vi.fn();
    const secondCache = vi.fn();
    const threadService = await createService();
    const service = threadService as unknown as ThreadServiceLike;
    const url = "https://example.com/test/read.cgi/board/1000000000/";

    // 変更理由: 本文と勢いのeffect順が変わっても、同じmicrotask内のforceUpdateを
    // 強い条件へ統合し、通常取得が先行しただけで二重通信にならないことを固定する。
    const first = service.getThread(url, { forceUpdate: false, onCache: firstCache });
    const second = service.getThread(url, { forceUpdate: true, onCache: secondCache });
    await vi.waitFor(() => expect(mocks.threadGet).toHaveBeenCalledOnce());

    progress?.();
    expect(firstCache).toHaveBeenCalledOnce();
    expect(secondCache).toHaveBeenCalledOnce();
    resolveFetch?.();

    await expect(Promise.all([first, second])).resolves.toHaveLength(2);

    mocks.threadGet.mockResolvedValueOnce(undefined);
    await service.getThread(url);
    expect(mocks.threadGet).toHaveBeenCalledTimes(2);
  });

  it("自動更新の取得だけsubject.txt確認を間引き、手動更新が合流したら間引かない", async () => {
    mocks.threadGet.mockResolvedValue(undefined);
    const threadService = await createService();
    const service = threadService as unknown as ThreadServiceLike;
    const url = "https://example.com/test/read.cgi/board/1000000000/";

    await service.getThread(url, { forceUpdate: true, throttleSubjectCheck: true });
    expect(mocks.threadGet).toHaveBeenLastCalledWith(true, expect.any(Function), {
      throttleSubjectCheck: true,
    });

    await Promise.all([
      service.getThread(url, { forceUpdate: true, throttleSubjectCheck: true }),
      service.getThread(url, { forceUpdate: true }),
    ]);
    expect(mocks.threadGet).toHaveBeenCalledTimes(2);
    expect(mocks.threadGet).toHaveBeenLastCalledWith(true, expect.any(Function), {
      throttleSubjectCheck: false,
    });
  });

  it("開始済みの自動更新へ手動更新を合流させず、subject.txtを確認する取得を別に行う", async () => {
    let resolveAuto: (() => void) | undefined;
    mocks.threadGet.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveAuto = resolve;
        }),
    );
    mocks.threadGet.mockResolvedValueOnce(undefined);
    const threadService = await createService();
    const service = threadService as unknown as ThreadServiceLike;
    const url = "https://example.com/test/read.cgi/board/2000000000/";

    const auto = service.getThread(url, { forceUpdate: true, throttleSubjectCheck: true });
    await vi.waitFor(() => expect(mocks.threadGet).toHaveBeenCalledOnce());
    await service.getThread(url, { forceUpdate: true });
    resolveAuto?.();
    await auto;

    expect(mocks.threadGet).toHaveBeenCalledTimes(2);
    expect(mocks.threadGet).toHaveBeenLastCalledWith(true, expect.any(Function), {
      throttleSubjectCheck: false,
    });
  });

  it("レスNGの適用前に全返信の索引を作る", async () => {
    mocks.isNGThread.mockImplementation((res: { replyCount?: number }) =>
      res.replyCount != null && res.replyCount >= 2 ? { type: "ReplyCount" } : null,
    );

    const threadService = await createService();
    const service = threadService as unknown as ThreadServiceLike;
    const result = service._formatResult({
      title: "title",
      url: { url: { href: "https://example.com/test/read.cgi/board/1/" } },
      res: [
        { name: "", mail: "", message: "本文", other: "" },
        { name: "", mail: "", message: "&gt;&gt;1", other: "" },
        { name: "", mail: "", message: "&gt;&gt;1", other: "" },
      ],
    });

    expect(result.res[0]?.ng).toEqual({ type: "ReplyCount" });
    expect(result.res[1]?.ng).toBeUndefined();
    expect(result.res[2]?.ng).toBeUndefined();
    expect(mocks.isNGThread).toHaveBeenCalledTimes(3);
    expect(mocks.isNGThread).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ replyCount: 0, anchorCount: 1 }),
      "title",
      "https://example.com/test/read.cgi/board/1/",
    );
  });

  it("メタ情報と異なるHTMLレス内のIDを保持する", async () => {
    const threadService = await createService();
    const service = threadService as unknown as ThreadServiceLike;
    const result = service._formatResult({
      title: "title",
      url: { url: { href: "https://example.com/test/read.cgi/board/1/" } },
      res: [
        {
          name: "",
          mail: "",
          message: "本文",
          other: "2026/08/27(木) 12:00:00.00 ID:from-metadata",
          id: "from-attribute",
        },
      ],
    });

    expect(result.res[0]?.id).toBe("from-attribute");
  });

  it("datの曜日表記が複数文字でも日時を抽出する", async () => {
    const now = new Date();
    const weekday = new Intl.DateTimeFormat("en-US", {
      timeZone: "UTC",
      weekday: "short",
    }).format(now);
    const timestamp = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${String(now.getUTCDate()).padStart(2, "0")}(${weekday}) ${String(now.getUTCHours()).padStart(2, "0")}:${String(now.getUTCMinutes()).padStart(2, "0")}:${String(now.getUTCSeconds()).padStart(2, "0")}.${String(now.getUTCMilliseconds()).padStart(3, "0")}`;

    const threadService = await createService();
    const service = threadService as unknown as ThreadServiceLike;
    const result = service._formatResult({
      title: "title",
      url: { url: { href: "https://example.com/test/read.cgi/board/1/" } },
      res: [{ name: "", mail: "", message: "", other: timestamp }],
    });

    expect(result.res[0]?.date).toBe(timestamp);
  });

  it("置換ルールをID・Slip抽出より前にレスへ適用する", async () => {
    mocks.replaceStrTxt.mockImplementation(
      (_url: string, _title: string, res: { other: string; message: string }) => ({
        ...res,
        other: res.other.replace("IDX:", "ID:"),
        message: res.message.replace("置換前", "置換後"),
      }),
    );
    const threadService = await createService();
    const service = threadService as unknown as ThreadServiceLike;
    const result = service._formatResult({
      title: "title",
      url: { url: { href: "https://example.com/test/read.cgi/board/1/" } },
      res: [{ name: "", mail: "", message: "置換前", other: "2026/08/27(木) 12:00:00.00 IDX:abc" }],
    });

    expect(result.res[0]?.id).toBe("abc");
    expect((result.res[0] as { message?: string }).message).toBe("置換後");
  });

  it("置換DSLの結果からID・アンカーを解析し、その後にNG判定する", async () => {
    const { createReplacementEngine, parseReplacementDsl } = await import("@chlen/chlib");
    const parsed = parseReplacementDsl(
      'replace date:\n  from "IDX:"\n  to "ID:"\nreplace body:\n  from "返信先"\n  to "&gt;&gt;1"\n  when title equals "title"',
    );
    expect(parsed.diagnostics).toEqual([]);
    const engine = createReplacementEngine(parsed.rules);
    mocks.replaceStrTxt.mockImplementation(engine.apply);
    mocks.isNGThread.mockImplementation((res: { anchorCount?: number }) =>
      res.anchorCount === 1 ? { type: "置換後NG" } : null,
    );
    const threadService = await createService();
    const service = threadService as unknown as ThreadServiceLike;
    const result = service._formatResult({
      title: "title",
      url: { url: { href: "https://example.com/test/read.cgi/board/1/" } },
      res: [
        { name: "", mail: "", message: "本文", other: "" },
        { name: "", mail: "", message: "返信先", other: "2026/08/27(木) 12:00:00.00 IDX:abc" },
      ],
    });
    expect(result.res[1]?.id).toBe("abc");
    expect(result.res[1]?.ng).toEqual({ type: "置換後NG" });
    expect(mocks.isNGThread).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ id: "abc", anchorCount: 1, message: "&gt;&gt;1" }),
      "title",
      "https://example.com/test/read.cgi/board/1/",
    );
  });

  it("設定で有効な自動NGを現行の取得結果へ反映する", async () => {
    mocks.config.set("nothing_id_ng", "on");
    mocks.config.set("how_to_judgment_id", "first_res");
    const threadService = await createService();
    const service = threadService as unknown as ThreadServiceLike;
    const result = service._formatResult({
      title: "title",
      url: { url: { href: "https://example.com/test/read.cgi/board/1/" } },
      res: [
        { name: "", mail: "", message: "1", other: "2026/08/27(木) 12:00:00.00 ID:abc" },
        { name: "", mail: "", message: "2", other: "2026/08/27(木) 12:00:01.00" },
      ],
    });

    expect(result.res[0]?.ng).toBeUndefined();
    expect(result.res[1]?.ng).toEqual({ type: "NothingID" });
  });

  it("取得結果がない場合も旧契約どおりタイトルのnullを保持する", async () => {
    const threadService = await createService();
    const service = threadService as unknown as ThreadServiceLike;
    const result = service._formatResult({
      title: null,
      url: { url: { href: "https://example.com/test/read.cgi/board/1/" } },
      res: null,
    });

    expect(result.title).toBeNull();
  });
});
