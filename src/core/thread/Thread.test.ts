// @vitest-environment node
import type { ParsedThread } from "packages/chlib/src/index";
import { corePorts } from "src/core/ports/registry";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  getConfig: vi.fn(() => null),
  getCache: vi.fn(() => ({})),
  fetch: vi.fn(),
  updateResCount: vi.fn(),
  updateExpired: vi.fn(),
  getBookmark: vi.fn(() => null),
  messageSend: vi.fn(),
}));

vi.mock("src/app/platform", () => ({
  platform: { http: { fetch: mocks.fetch } },
}));

vi.mock("src/core/ports/registry", () => ({
  corePorts: {
    config: { get: mocks.getConfig },
    cache: { getCache: mocks.getCache },
    bookmark: {
      get: mocks.getBookmark,
      updateResCount: mocks.updateResCount,
      updateExpired: mocks.updateExpired,
    },
    message: { send: mocks.messageSend },
    util: { defer: vi.fn(() => Promise.resolve()) },
  },
}));

vi.mock("src/core/util/jsutil.js", () => ({
  chServerMoveDetect: vi.fn(),
}));

import { resetForcedSubjectCheckHistory } from "src/core/board/SubjectPresence";
import Thread from "src/core/thread/Thread.js";

interface ThreadInternals {
  _buildDomainErrorMessage: (options: unknown) => Promise<string>;
  _fetchCachedResCount: (forceUpdate: boolean) => Promise<{ status: string }>;
  _prepareCache: (
    cache: unknown,
    format2chnet: string | null | undefined,
    forceUpdate: boolean | undefined,
    progress: () => void,
  ) => Promise<{ hasCache: boolean; needFetch: boolean }>;
  _padAbobunIfNeeded: (
    thread: ParsedThread,
    result: { status: string; cachedInfo?: { resCount: number } },
  ) => ParsedThread;
}

describe("Thread", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetForcedSubjectCheckHistory();
  });

  it("自動更新で新着レスを取得できた回はsubject.txtを強制取得しない", async () => {
    const cache = {
      data: null,
      parsed: null,
      lastUpdated: null,
      expired: false,
      get: vi.fn().mockResolvedValue(undefined),
      put: vi.fn().mockResolvedValue(undefined),
    };
    mocks.getCache.mockReturnValue(cache);
    mocks.fetch.mockResolvedValue({
      status: 200,
      body: "名無し<>sage<>2026/09/30<>本文<>テストスレ\n",
      headers: {},
      url: "https://example.com/test/read.cgi/board/1000000000/",
    });
    const thread = new Thread("https://example.com/test/read.cgi/board/1000000000/", corePorts);
    const testableThread = thread as unknown as ThreadInternals;
    vi.spyOn(testableThread, "_prepareCache").mockResolvedValue({
      hasCache: false,
      needFetch: true,
    });
    const subjectLookup = vi
      .spyOn(testableThread, "_fetchCachedResCount")
      .mockResolvedValue({ status: "none" });

    await thread.get(true, undefined, { throttleSubjectCheck: true });

    // 新着が届くスレは生存しているため、板一覧はキャッシュ照合だけで済ませる。
    expect(subjectLookup).toHaveBeenCalledWith(false);
  });

  it("新着なしの自動更新ではsubject.txtを間隔をあけて強制取得する", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(1_000_000);
    mocks.getCache.mockReturnValue({ data: "本文キャッシュ", put: vi.fn() });
    mocks.fetch.mockRejectedValue(new Error("通信に失敗しました"));
    const lookups: boolean[] = [];
    const refresh = async (throttleSubjectCheck = true) => {
      const thread = new Thread("https://example.com/test/read.cgi/board/1000000000/", corePorts);
      const testableThread = thread as unknown as ThreadInternals;
      vi.spyOn(testableThread, "_prepareCache").mockResolvedValue({
        hasCache: true,
        needFetch: true,
      });
      vi.spyOn(testableThread, "_fetchCachedResCount").mockImplementation(async (force) => {
        lookups.push(force);
        return { status: "none" };
      });
      vi.spyOn(testableThread, "_buildDomainErrorMessage").mockResolvedValue("取得に失敗しました");
      await expect(thread.get(true, undefined, { throttleSubjectCheck })).rejects.toBeUndefined();
    };

    await refresh();
    now.mockReturnValue(1_000_000 + 30 * 1000);
    await refresh();
    // 手動更新は利用者の操作なので、自動更新の間隔内でも毎回確認する。
    await refresh(false);
    now.mockReturnValue(1_000_000 + 30 * 1000 + 60 * 1000);
    await refresh();
    now.mockRestore();

    // 自動更新のたびに板一覧全体を取得しないよう、間隔内の確認はキャッシュ照合へ落とす。
    expect(lookups).toEqual([true, false, true, true]);
  });

  it("本文取得が失敗しても板一覧から消えていればsubject不在を返す", async () => {
    const thread = new Thread("https://example.com/test/read.cgi/board/1000000000/", corePorts);
    const testableThread = thread as unknown as ThreadInternals;

    vi.spyOn(testableThread, "_prepareCache").mockResolvedValue({
      hasCache: true,
      needFetch: true,
    });
    vi.spyOn(testableThread, "_fetchCachedResCount").mockResolvedValue({ status: "not_found" });
    mocks.fetch.mockRejectedValue(new Error("通信に失敗しました"));
    vi.spyOn(testableThread, "_buildDomainErrorMessage").mockResolvedValue("取得に失敗しました");

    // 変更理由: dat落ちのHTTPステータスはサーバーごとに異なるため、
    // 203以外の失敗でもsubject.txtの確認結果を停止判定へ残すことを回帰テストする。
    await expect(thread.get(true)).rejects.toBeUndefined();

    expect(thread.missingFromSubject).toBe(true);
  });

  it("HTTP 203でdat落ちが確定したらsubjectを照会せずキャッシュへ記録する", async () => {
    const cache = {
      data: "本文キャッシュ",
      lastUpdated: Date.now(),
      expired: false,
      put: vi.fn().mockResolvedValue(undefined),
    };
    mocks.getCache.mockReturnValue(cache);
    mocks.fetch.mockResolvedValue({
      status: 203,
      body: "",
      headers: {},
      url: "https://example.com/test/read.cgi/board/1000000000/",
    });

    const thread = new Thread("https://example.com/test/read.cgi/board/1000000000/", corePorts);
    const testableThread = thread as unknown as ThreadInternals;
    vi.spyOn(testableThread, "_prepareCache").mockResolvedValue({
      hasCache: true,
      needFetch: true,
    });
    const subjectLookup = vi.spyOn(testableThread, "_fetchCachedResCount");
    vi.spyOn(testableThread, "_buildDomainErrorMessage").mockResolvedValue("dat落ちです");

    await expect(thread.get(true)).rejects.toBeUndefined();

    expect(subjectLookup).not.toHaveBeenCalled();
    expect(thread.expired).toBe(true);
    expect(cache.expired).toBe(true);
    expect(cache.put).toHaveBeenCalledOnce();
  });

  it("本文キャッシュがない初回203も状態専用レコードへ保存する", async () => {
    const cache = {
      data: null,
      parsed: null,
      lastUpdated: null,
      expired: false,
      kind: null,
      get: vi.fn().mockResolvedValue(undefined),
      put: vi.fn().mockResolvedValue(undefined),
    };
    mocks.getCache.mockReturnValue(cache);
    mocks.fetch.mockResolvedValue({
      status: 203,
      body: "",
      headers: {},
      url: "https://example.com/test/read.cgi/board/1000000000/",
    });

    const thread = new Thread("https://example.com/test/read.cgi/board/1000000000/", corePorts);
    const testableThread = thread as unknown as ThreadInternals;
    vi.spyOn(testableThread, "_prepareCache").mockResolvedValue({
      hasCache: false,
      needFetch: true,
    });
    const subjectLookup = vi.spyOn(testableThread, "_fetchCachedResCount");
    vi.spyOn(testableThread, "_buildDomainErrorMessage").mockResolvedValue("dat落ちです");

    await expect(thread.get(true)).rejects.toBeUndefined();

    expect(subjectLookup).not.toHaveBeenCalled();
    expect(cache.expired).toBe(true);
    expect(cache.kind).toBe("thread_state");
    expect(cache.lastUpdated).toEqual(expect.any(Number));
    expect(cache.put).toHaveBeenCalledOnce();

    const reopenedThread = new Thread(
      "https://example.com/test/read.cgi/board/1000000000/",
      corePorts,
    );
    const reopenedInternals = reopenedThread as unknown as ThreadInternals;
    const reopenedSubjectLookup = vi.spyOn(reopenedInternals, "_fetchCachedResCount");
    await expect(reopenedThread.get()).rejects.toBeUndefined();
    expect(reopenedThread.expired).toBe(true);
    expect(reopenedSubjectLookup).not.toHaveBeenCalled();
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    expect(cache.put).toHaveBeenCalledTimes(2);
  });

  it("本文とsubjectの通信失敗だけではexpired状態を保存しない", async () => {
    const cache = {
      data: "本文キャッシュ",
      expired: false,
      lastUpdated: Date.now(),
      put: vi.fn().mockResolvedValue(undefined),
    };
    mocks.getCache.mockReturnValue(cache);
    mocks.fetch.mockRejectedValue(new Error("通信に失敗しました"));

    const thread = new Thread("https://example.com/test/read.cgi/board/1000000000/", corePorts);
    const testableThread = thread as unknown as ThreadInternals;
    vi.spyOn(testableThread, "_prepareCache").mockResolvedValue({
      hasCache: true,
      needFetch: true,
    });
    vi.spyOn(testableThread, "_fetchCachedResCount").mockResolvedValue({ status: "none" });
    vi.spyOn(testableThread, "_buildDomainErrorMessage").mockResolvedValue("取得に失敗しました");

    await expect(thread.get(true)).rejects.toBeUndefined();

    expect(thread.expired).toBe(false);
    expect(cache.expired).toBe(false);
    expect(cache.put).not.toHaveBeenCalled();
  });

  it("キャッシュ済みのdat落ち状態をsubject通信より前に復元する", async () => {
    const thread = new Thread("https://example.com/test/read.cgi/board/1000000000/", corePorts);
    const testableThread = thread as unknown as ThreadInternals;
    const cache = {
      expired: true,
      lastUpdated: Date.now(),
      get: vi.fn().mockResolvedValue(undefined),
    };

    const result = await testableThread._prepareCache(cache, null, false, vi.fn());

    expect(result).toEqual({ hasCache: false, needFetch: true });
    expect(thread.expired).toBe(true);
  });

  it("subject不在を確認した後の本文200でもexpiredを保持してsubjectを再照会しない", async () => {
    const body = "名無し<>sage<>2026/09/30<>本文<>テストスレ\n";
    const cache = {
      data: null as string | null,
      parsed: null,
      lastUpdated: null as number | null,
      lastModified: null,
      etag: null,
      resLength: null,
      readcgiVer: null,
      expired: false,
      get: vi.fn().mockResolvedValue(undefined),
      put: vi.fn().mockResolvedValue(undefined),
    };
    mocks.getCache.mockReturnValue(cache);
    mocks.fetch.mockResolvedValue({
      status: 200,
      body,
      headers: {},
      url: "https://example.com/test/read.cgi/board/1000000000/",
    });

    const firstThread = new Thread(
      "https://example.com/test/read.cgi/board/1000000000/",
      corePorts,
    );
    const firstInternals = firstThread as unknown as ThreadInternals;
    vi.spyOn(firstInternals, "_prepareCache").mockResolvedValue({
      hasCache: false,
      needFetch: true,
    });
    vi.spyOn(firstInternals, "_fetchCachedResCount").mockResolvedValue({ status: "not_found" });
    await firstThread.get(true);
    expect(firstThread.expired).toBe(true);
    expect(cache.expired).toBe(true);

    const forceRefresh200 = new Thread(
      "https://example.com/test/read.cgi/board/1000000000/",
      corePorts,
    );
    const forceRefresh200Internals = forceRefresh200 as unknown as ThreadInternals;
    const subjectLookupAfter200 = vi.spyOn(forceRefresh200Internals, "_fetchCachedResCount");
    await forceRefresh200.get(true);
    expect(forceRefresh200.expired).toBe(true);
    expect(subjectLookupAfter200).not.toHaveBeenCalled();

    mocks.fetch.mockResolvedValueOnce({
      status: 304,
      body: "",
      headers: {},
      url: "https://example.com/test/read.cgi/board/1000000000/",
    });
    const forceRefresh304 = new Thread(
      "https://example.com/test/read.cgi/board/1000000000/",
      corePorts,
    );
    const forceRefresh304Internals = forceRefresh304 as unknown as ThreadInternals;
    const subjectLookupAfter304 = vi.spyOn(forceRefresh304Internals, "_fetchCachedResCount");
    await forceRefresh304.get(true);
    expect(forceRefresh304.expired).toBe(true);
    expect(subjectLookupAfter304).not.toHaveBeenCalled();

    const reopenedThread = new Thread(
      "https://example.com/test/read.cgi/board/1000000000/",
      corePorts,
    );
    const reopenedInternals = reopenedThread as unknown as ThreadInternals;
    const subjectLookupAfterReopen = vi.spyOn(reopenedInternals, "_fetchCachedResCount");
    await reopenedThread.get();

    expect(reopenedThread.expired).toBe(true);
    expect(subjectLookupAfterReopen).not.toHaveBeenCalled();
    expect(mocks.fetch).toHaveBeenCalledTimes(3);
  });

  it("subjectの件数補填を表示用コピーへ限定し、実データを変更しない", () => {
    const thread = new Thread("https://example.com/test/read.cgi/board/1000000000/", corePorts);
    // 実在の板URLをテストへ固定しないため、予約済みドメイン上でBBS種別だけを差し替える。
    Object.defineProperty(thread.url, "bbsType", { configurable: true, value: "jbbs" });
    const testableThread = thread as unknown as ThreadInternals;
    const parsedThread: ParsedThread = {
      title: "テストスレッド",
      res: [
        {
          name: "名無し",
          mail: "",
          message: "本文",
          other: "日時",
        },
      ],
    };

    const displayThread = testableThread._padAbobunIfNeeded(parsedThread, {
      status: "success",
      cachedInfo: { resCount: 3 },
    });

    expect(parsedThread.res).toHaveLength(1);
    expect(displayThread.res).toHaveLength(3);
    expect(displayThread.res.slice(1)).toEqual([
      {
        name: "あぼーん",
        mail: "あぼーん",
        message: "あぼーん",
        other: "あぼーん",
      },
      {
        name: "あぼーん",
        mail: "あぼーん",
        message: "あぼーん",
        other: "あぼーん",
      },
    ]);
  });

  it("2ch系ではsubjectの先行更新を「あぼーん」補填に使わない", () => {
    const thread = new Thread("https://example.com/test/read.cgi/board/1000000000/", corePorts);
    const testableThread = thread as unknown as ThreadInternals;
    const parsedThread: ParsedThread = {
      title: "テストスレッド",
      res: [
        {
          name: "名無し",
          mail: "",
          message: "本文",
          other: "日時",
        },
      ],
    };

    const displayThread = testableThread._padAbobunIfNeeded(parsedThread, {
      status: "success",
      cachedInfo: { resCount: 3 },
    });

    expect(displayThread).toBe(parsedThread);
    expect(displayThread.res).toHaveLength(1);
  });
});
