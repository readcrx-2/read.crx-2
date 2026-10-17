import { act, cleanup, render, renderHook, screen, waitFor } from "@testing-library/react";
import { type RefObject, useRef } from "react";
import { useThreadData } from "src/features/thread/browser/use-thread-data";
import { useThreadRefreshController } from "src/features/thread/browser/use-thread-refresh-controller";
import { container } from "src/service-container/index";
import type {
  IConfig,
  IMessage,
  INGService,
  IRes,
  IThreadDetail,
  IThreadService,
  IUtil,
} from "src/service-container/interfaces";
import { OperationStatusItem } from "src/view/browser/components/OperationStatusItem";
import { StatusBar, StatusBarProvider } from "src/view/browser/components/StatusBar";
import { getManualRefreshScopeKey, runManualRefresh } from "src/view/browser/utils/manual-refresh";
import { registerSikiLogThread } from "src/view/browser/utils/siki-log";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { dispatchMock, updateViewStateMock, viewStateMock, cacheGetMock, cachePutMock } = vi.hoisted(
  () => ({
    dispatchMock: vi.fn(),
    updateViewStateMock: vi.fn(),
    viewStateMock: {} as { filter?: "popular"; popularReplyThreshold?: number },
    cacheGetMock: vi.fn(),
    cachePutMock: vi.fn(),
  }),
);

const loggerMock = vi.hoisted(() => ({ error: vi.fn() }));

vi.mock("src/app/logger", () => ({
  createLogger: () => loggerMock,
}));

vi.mock("src/app", () => ({
  platform: {
    storage: {
      getStore: () => ({
        get: cacheGetMock,
        put: cachePutMock,
      }),
    },
  },
}));

const { toastInfoMock, toastErrorMock } = vi.hoisted(() => ({
  toastInfoMock: vi.fn(),
  toastErrorMock: vi.fn(),
}));
const toastMock = { info: toastInfoMock, error: toastErrorMock };
vi.mock("src/view/browser/hooks/use-toast", () => ({ useToast: () => toastMock }));

vi.mock("src/view/browser/state/tabs/use-tab-store", () => ({
  useTabDispatch: () => dispatchMock,
  useTabViewState: () => ({ state: viewStateMock, update: updateViewStateMock }),
}));

const THREAD_URL = "http://bbs.eddibb.cc/test/read.cgi/liveedge/1742132339/";

// 変更理由: ThreadPageをcontrollerと共有viewへ分割する前に、取得結果から5種filterと検索を
// 切り替えても対象レスが変わらない契約をfixtureで固定し、分割後の回帰を検出できるようにする。
const RESPONSES: IRes[] = [
  {
    num: 1,
    name: "root",
    mail: "",
    date: "2026/08/23(日) 12:00:00.000",
    id: "root-id",
    message: "root response",
  },
  {
    num: 2,
    name: "image-user",
    mail: "",
    date: "2026/08/23(日) 12:00:01.000",
    id: "image-id",
    message: "&gt;&gt;1 https://example.test/photo.jpg",
  },
  {
    num: 3,
    name: "video-user",
    mail: "",
    date: "2026/08/23(日) 12:00:02.000",
    id: "video-id",
    message: "&gt;&gt;1 https://example.test/movie.mp4",
  },
  {
    num: 4,
    name: "link-user",
    mail: "",
    date: "2026/08/23(日) 12:00:03.000",
    id: "link-id",
    message: "&gt;&gt;1 https://example.test/article",
  },
  {
    num: 5,
    name: "searchable-user",
    mail: "",
    date: "2026/08/23(日) 12:00:04.000",
    id: "search-id",
    message: "&gt;&gt;1 searchable body",
  },
];

function createPage() {
  return {
    type: "thread" as const,
    title: "Fixture thread",
    threadUrl: THREAD_URL,
  };
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe("useThreadData Phase 0 contracts", () => {
  beforeEach(() => {
    toastInfoMock.mockReset();
    toastErrorMock.mockReset();
    cacheGetMock.mockReset();
    cacheGetMock.mockResolvedValue(undefined);
    cachePutMock.mockReset();
    dispatchMock.mockReset();
    updateViewStateMock.mockReset();
    delete viewStateMock.filter;
    delete viewStateMock.popularReplyThreshold;

    container.thread = {
      getThread: vi.fn(async () => ({
        url: THREAD_URL,
        title: "Fixture thread",
        res: RESPONSES,
      })),
    } as IThreadService;
    container.message = {
      send: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
    } as IMessage;
    const ngService: INGService = {
      isNGBoard: (_title, _url, _resCount) => null,
      isNGThread: (_res, _title, _url) => null,
      add: async (_ruleDsl) => undefined,
      invalidateCache: () => undefined,
      execExpire: () => undefined,
    };
    container.ng = ngService;
    // 自動NGの判定が掲示板種別と設定値を参照するため、未登録のままにせず最小限の実装を用意する。
    container.util = {
      guessType: () => ({ bbsType: "2ch", protocol: "https:" }),
    } as unknown as IUtil;
    container.config = { get: () => null } as unknown as IConfig;
  });

  afterEach(() => {
    cleanup();
  });

  it.each([false, true])(
    "キャッシュ確認が遅れても初回読み込みを示す（通信完了: %s）",
    async (completeRequest) => {
      const page = { ...createPage(), threadUrl: "https://example.com/test/read.cgi/board/130/" };
      const cache = createDeferred<undefined>();
      const request = createDeferred<IThreadDetail>();
      cacheGetMock.mockReturnValue(cache.promise);
      container.thread = { getThread: vi.fn(() => request.promise) } as IThreadService;
      const rootRef = { current: null } as RefObject<HTMLDivElement | null>;
      const { result } = renderHook(() => {
        const controller = useThreadRefreshController(0);
        return useThreadData("initial-loading", page, rootRef, controller);
      });

      expect(result.current.isCacheResolved).toBe(false);
      expect(result.current.isInitialLoading).toBe(true);
      if (completeRequest) {
        await act(async () => request.resolve({ url: page.threadUrl, title: page.title, res: [] }));
        expect(result.current.loading).toBe(false);
        expect(result.current.isInitialLoading).toBe(true);
      }
      await act(async () => cache.resolve(undefined));
      expect(result.current.isCacheResolved).toBe(true);
      expect(result.current.isInitialLoading).toBe(!completeRequest);
      if (!completeRequest) {
        await act(async () =>
          request.resolve({ url: page.threadUrl, title: page.title, res: RESPONSES }),
        );
        expect(result.current.isInitialLoading).toBe(false);
      }
    },
  );

  it("キャッシュ本文の復元後は通信中でも初回読み込みを表示しない", async () => {
    const page = { ...createPage(), threadUrl: "https://example.com/test/read.cgi/board/131/" };
    const cache = createDeferred<{ data: IRes[] }>();
    const request = createDeferred<IThreadDetail>();
    cacheGetMock.mockReturnValue(cache.promise);
    container.thread = { getThread: vi.fn(() => request.promise) } as IThreadService;
    const rootRef = { current: null } as RefObject<HTMLDivElement | null>;
    const { result } = renderHook(() => {
      const controller = useThreadRefreshController(0);
      return useThreadData("cached-loading", page, rootRef, controller);
    });

    expect(result.current.isInitialLoading).toBe(true);
    await act(async () => cache.resolve({ data: RESPONSES }));
    expect(result.current.loading).toBe(true);
    expect(result.current.responses).toEqual(RESPONSES);
    expect(result.current.isInitialLoading).toBe(false);
    await act(async () =>
      request.resolve({ url: page.threadUrl, title: page.title, res: RESPONSES }),
    );
  });

  it("本文を残した再取得でも毎回ステータスを表示し、古い通信の完了では消さない", async () => {
    const page = { ...createPage(), threadUrl: "https://example.com/test/read.cgi/board/132/" };
    const detail = { url: page.threadUrl, title: page.title, res: RESPONSES };
    const firstRefresh = createDeferred<IThreadDetail>();
    const previousRefresh = createDeferred<IThreadDetail>();
    const latestRefresh = createDeferred<IThreadDetail>();
    container.thread = {
      getThread: vi
        .fn()
        .mockResolvedValueOnce(detail)
        .mockReturnValueOnce(firstRefresh.promise)
        .mockReturnValueOnce(previousRefresh.promise)
        .mockReturnValueOnce(latestRefresh.promise),
    } as IThreadService;

    function FetchHarness({ refreshKey }: { refreshKey: number }) {
      const rootRef = useRef<HTMLDivElement>(null);
      const controller = useThreadRefreshController(refreshKey);
      const data = useThreadData("fetch-status", page, rootRef, controller);
      return (
        <>
          <OperationStatusItem
            id="thread-fetch-status-fetch-status"

            message={data.loading ? "スレッドを読み込み中..." : null}
            busy={data.loading}
          />
          <output>{data.responses.length}件の本文</output>
          <StatusBar />
        </>
      );
    }
    const content = (refreshKey: number) => (
      <StatusBarProvider>
        <FetchHarness refreshKey={refreshKey} />
      </StatusBarProvider>
    );
    const { rerender } = render(content(0));
    await waitFor(() => expect(screen.queryByText("スレッドを読み込み中...")).toBeNull());
    expect(screen.getByText(`${RESPONSES.length}件の本文`)).toBeTruthy();

    rerender(content(1));
    expect(screen.getByText("スレッドを読み込み中...")).toBeTruthy();
    expect(screen.getByText(`${RESPONSES.length}件の本文`)).toBeTruthy();
    await act(async () => firstRefresh.resolve(detail));
    expect(screen.queryByText("スレッドを読み込み中...")).toBeNull();

    // 取得中に次の更新が重なっても、表示するのは最新の通信状態だけにする。
    rerender(content(2));
    rerender(content(3));
    await act(async () => previousRefresh.resolve(detail));
    expect(screen.getByText("スレッドを読み込み中...")).toBeTruthy();
    await act(async () => latestRefresh.resolve(detail));
    expect(screen.queryByText("スレッドを読み込み中...")).toBeNull();
  });

  it.each([0, 1])("自動取得中の手動更新は新規レス%d件でも完了を一度通知する", async (added) => {
    const page = { ...createPage(), threadUrl: "https://example.com/test/read.cgi/board/123/" };
    const detail = { url: page.threadUrl, title: page.title, res: RESPONSES };
    const automatic = createDeferred<IThreadDetail>();
    const manual = createDeferred<IThreadDetail>();
    container.thread = {
      getThread: vi
        .fn()
        .mockResolvedValueOnce(detail)
        .mockReturnValueOnce(automatic.promise)
        .mockReturnValueOnce(manual.promise),
    } as IThreadService;
    const tabId = `manual-overlap-${added}`;
    const rootRef = { current: null } as RefObject<HTMLDivElement | null>;
    const { result, rerender } = renderHook(
      ({ refreshKey }) => {
        const controller = useThreadRefreshController(refreshKey);
        return useThreadData(tabId, page, rootRef, controller);
      },
      { initialProps: { refreshKey: 0 } },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    rerender({ refreshKey: 1 });
    expect(result.current.loading).toBe(true);
    await act(async () =>
      runManualRefresh(getManualRefreshScopeKey(tabId, page), () => rerender({ refreshKey: 2 })),
    );
    await act(async () => automatic.resolve(detail));
    expect(toastInfoMock).not.toHaveBeenCalled();
    await act(async () =>
      manual.resolve({
        ...detail,
        res: added ? [...RESPONSES, { ...RESPONSES[0], num: 6 }] : RESPONSES,
      }),
    );
    expect(toastInfoMock).toHaveBeenCalledExactlyOnceWith(`新規レス${added}件`);
  });

  it("即時に取得が完了する手動更新でも通知し、自動更新だけでは通知しない", async () => {
    const page = { ...createPage(), threadUrl: "https://example.com/test/read.cgi/board/124/" };
    const rootRef = { current: null } as RefObject<HTMLDivElement | null>;
    const tabId = "manual-immediate";
    const { result, rerender } = renderHook(
      ({ refreshKey }) => {
        const controller = useThreadRefreshController(refreshKey);
        return useThreadData(tabId, page, rootRef, controller);
      },
      { initialProps: { refreshKey: 0 } },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    rerender({ refreshKey: 1 });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(toastInfoMock).not.toHaveBeenCalled();
    await act(async () =>
      runManualRefresh(getManualRefreshScopeKey(tabId, page), () => rerender({ refreshKey: 2 })),
    );
    expect(toastInfoMock).toHaveBeenCalledExactlyOnceWith("新規レス0件");
  });

  it.each([false, true])(
    "手動取得が後続の取得に置き換わっても通知を一度に保ち、終了済みタブでは通知しない（終了: %s）",
    async (closeTab) => {
      const page = { ...createPage(), threadUrl: "https://example.com/test/read.cgi/board/125/" };
      const detail = { url: page.threadUrl, title: page.title, res: RESPONSES };
      const manual = createDeferred<IThreadDetail>();
      const next = createDeferred<IThreadDetail>();
      container.thread = {
        getThread: vi
          .fn()
          .mockResolvedValueOnce(detail)
          .mockReturnValueOnce(manual.promise)
          .mockReturnValueOnce(next.promise),
      } as IThreadService;
      const tabId = `manual-superseded-${closeTab}`;
      const rootRef = { current: null } as RefObject<HTMLDivElement | null>;
      const { result, rerender, unmount } = renderHook(
        ({ refreshKey }) => {
          const controller = useThreadRefreshController(refreshKey);
          return useThreadData(tabId, page, rootRef, controller);
        },
        { initialProps: { refreshKey: 0 } },
      );
      await waitFor(() => expect(result.current.loading).toBe(false));
      await act(async () =>
        runManualRefresh(getManualRefreshScopeKey(tabId, page), () => rerender({ refreshKey: 1 })),
      );
      rerender({ refreshKey: 2 });
      if (closeTab) unmount();
      await act(async () => next.resolve(detail));
      await act(async () => manual.resolve(detail));
      if (closeTab) expect(toastInfoMock).not.toHaveBeenCalled();
      else expect(toastInfoMock).toHaveBeenCalledExactlyOnceWith("新規レス0件");
    },
  );

  it("手動更新が失敗した場合は新着通知ではなくエラーを一度知らせる", async () => {
    const page = { ...createPage(), threadUrl: "https://example.com/test/read.cgi/board/126/" };
    container.thread = {
      getThread: vi
        .fn()
        .mockResolvedValueOnce({ url: page.threadUrl, title: page.title, res: RESPONSES })
        .mockRejectedValueOnce(new Error("通信エラー")),
    } as IThreadService;
    loggerMock.error.mockClear();
    const rootRef = { current: null } as RefObject<HTMLDivElement | null>;
    const { result, rerender } = renderHook(
      ({ refreshKey }) => {
        const controller = useThreadRefreshController(refreshKey);
        return useThreadData("manual-error", page, rootRef, controller);
      },
      { initialProps: { refreshKey: 0 } },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () =>
      runManualRefresh(getManualRefreshScopeKey("manual-error", page), () =>
        rerender({ refreshKey: 1 }),
      ),
    );
    expect(toastInfoMock).not.toHaveBeenCalled();
    expect(toastErrorMock).toHaveBeenCalledExactlyOnceWith("通信エラー");
    expect(loggerMock.error).toHaveBeenCalled();
  });

  it("登録済みSikiログは通信せず通常のレス表示へ渡す", async () => {
    const getThreadMock = vi.fn();
    container.thread = { getThread: getThreadMock } as IThreadService;
    const page = registerSikiLogThread({
      title: "Siki過去ログ",
      threadUrl: "https://example.com/test/read.cgi/board/123/",
      responses: [
        {
          num: 1,
          name: "名前",
          mail: "",
          date: "2026/08/23(日) 12:00:00.000",
          message: "過去ログ本文",
        },
      ],
    });
    const rootRef = { current: null } as RefObject<HTMLDivElement | null>;

    const { result } = renderHook(() => {
      const refreshController = useThreadRefreshController(0);
      return useThreadData("tab-1", page, rootRef, refreshController);
    });

    await waitFor(() => expect(result.current.responses).toHaveLength(1));

    expect(result.current.responses[0]?.message).toBe("過去ログ本文");
    expect(result.current.loading).toBe(false);
    expect(getThreadMock).not.toHaveBeenCalled();
  });

  it("全て／多レス／画像／動画／リンクの5種filterが同じ取得結果から切り替わる", async () => {
    const { result } = renderHook(() => {
      const refreshController = useThreadRefreshController(0);
      return useThreadData(
        "tab-1",
        createPage(),
        { current: null } as RefObject<HTMLDivElement | null>,
        refreshController,
      );
    });

    await waitFor(() => expect(result.current.responses).toHaveLength(RESPONSES.length));

    expect(result.current.filteredResponses.map((res) => res.num)).toEqual([1, 2, 3, 4, 5]);

    act(() => result.current.setFilter("popular"));
    expect(result.current.filteredResponses.map((res) => res.num)).toEqual([1]);

    act(() => result.current.setFilter("image"));
    expect(result.current.filteredResponses.map((res) => res.num)).toEqual([2]);

    act(() => result.current.setFilter("video"));
    expect(result.current.filteredResponses.map((res) => res.num)).toEqual([3]);

    act(() => result.current.setFilter("link"));
    expect(result.current.filteredResponses.map((res) => res.num)).toEqual([2, 3, 4]);
  });

  it("人気レス閾値をviewStateから読み込み、指定件数以上だけを残す", async () => {
    viewStateMock.filter = "popular";
    viewStateMock.popularReplyThreshold = 5;

    const { result } = renderHook(() => {
      const refreshController = useThreadRefreshController(0);
      return useThreadData(
        "tab-1",
        createPage(),
        { current: null } as RefObject<HTMLDivElement | null>,
        refreshController,
      );
    });

    await waitFor(() => expect(result.current.responses).toHaveLength(RESPONSES.length));

    expect(result.current.filteredResponses).toHaveLength(0);
  });

  it("本文・名前・ID検索をfilterと組み合わせても対象レスを失わない", async () => {
    const { result } = renderHook(() => {
      const refreshController = useThreadRefreshController(0);
      return useThreadData(
        "tab-1",
        createPage(),
        { current: null } as RefObject<HTMLDivElement | null>,
        refreshController,
      );
    });

    await waitFor(() => expect(result.current.responses).toHaveLength(RESPONSES.length));

    act(() => {
      result.current.setFilter("image");
      // 既定は本文検索なので、名前・IDを含む組み合わせの検証では検索対象を明示する。
      result.current.setSearchTarget("all");
      result.current.setSearchQuery("image-user");
    });
    expect(result.current.filteredResponses.map((res) => res.num)).toEqual([2]);

    act(() => result.current.setFilter("all"));
    act(() => result.current.setSearchQuery("searchable"));
    expect(result.current.filteredResponses.map((res) => res.num)).toEqual([5]);

    act(() => result.current.setSearchQuery("search-id"));
    expect(result.current.filteredResponses.map((res) => res.num)).toEqual([5]);
  });

  it("重なった取得では古い結果の完了で最新レスとloading状態を巻き戻さない", async () => {
    const firstRequest = createDeferred<{
      url: string;
      title: string;
      res: IRes[];
    }>();
    const secondRequest = createDeferred<{
      url: string;
      title: string;
      res: IRes[];
    }>();
    const thirdRequest = createDeferred<{
      url: string;
      title: string;
      res: IRes[];
    }>();
    const getThreadMock = vi
      .fn()
      .mockReturnValueOnce(firstRequest.promise)
      .mockReturnValueOnce(secondRequest.promise)
      .mockReturnValueOnce(thirdRequest.promise);
    container.thread = { getThread: getThreadMock } as IThreadService;
    const page = createPage();
    const rootRef = { current: null } as RefObject<HTMLDivElement | null>;

    const { result, rerender } = renderHook(
      ({ refreshKey }: { refreshKey: number }) => {
        const refreshController = useThreadRefreshController(refreshKey);
        return useThreadData("tab-1", page, rootRef, refreshController);
      },
      { initialProps: { refreshKey: 0 } },
    );

    await waitFor(() => expect(getThreadMock).toHaveBeenCalledOnce());
    act(() => {
      firstRequest.resolve({
        url: THREAD_URL,
        title: "Fixture thread",
        res: RESPONSES.slice(0, 1),
      });
    });
    await waitFor(() => expect(result.current.responses).toHaveLength(1));

    rerender({ refreshKey: 1 });
    await waitFor(() => expect(getThreadMock).toHaveBeenCalledTimes(2));
    rerender({ refreshKey: 2 });
    await waitFor(() => expect(getThreadMock).toHaveBeenCalledTimes(3));

    // 変更理由: RELOADはThreadPageを再マウントせずrefreshKeyだけを進めるため、
    // 更新世代のeffectがsubject.txt再確認を明示的に指定する契約を固定する。
    expect(getThreadMock.mock.calls[0][1]).toMatchObject({ forceUpdate: false });
    expect(getThreadMock.mock.calls[1][1]).toMatchObject({ forceUpdate: true });
    expect(getThreadMock.mock.calls[2][1]).toMatchObject({ forceUpdate: true });

    act(() => {
      secondRequest.resolve({ url: THREAD_URL, title: "Fixture thread", res: RESPONSES });
    });
    await waitFor(() => expect(result.current.loading).toBe(true));
    expect(result.current.responses).toHaveLength(1);

    act(() => {
      thirdRequest.resolve({
        url: THREAD_URL,
        title: "Fixture thread",
        res: [...RESPONSES, { ...RESPONSES[0], num: 6 }],
      });
    });
    await waitFor(() => expect(result.current.responses.at(-1)?.num).toBe(6));
    expect(result.current.loading).toBe(false);
  });

  it("更新中は表示中のレスを古いキャッシュで巻き戻さない", async () => {
    const refreshedResult = createDeferred<{
      url: string;
      title: string;
      res: IRes[];
    }>();
    const getThreadMock = vi
      .fn()
      .mockResolvedValueOnce({
        url: THREAD_URL,
        title: "Fixture thread",
        res: RESPONSES,
      })
      .mockImplementationOnce(async (_url, options) => {
        options?.onCache?.({
          url: THREAD_URL,
          title: "Fixture thread",
          res: RESPONSES.slice(0, 1),
        });
        return refreshedResult.promise;
      });
    container.thread = { getThread: getThreadMock } as IThreadService;
    const page = createPage();
    const rootRef = { current: null } as RefObject<HTMLDivElement | null>;

    const { result, rerender } = renderHook(
      ({ refreshKey }: { refreshKey: number }) => {
        const refreshController = useThreadRefreshController(refreshKey);
        return useThreadData("tab-1", page, rootRef, refreshController);
      },
      { initialProps: { refreshKey: 0 } },
    );

    await waitFor(() => expect(result.current.responses).toHaveLength(RESPONSES.length));

    rerender({ refreshKey: 1 });

    await waitFor(() => expect(getThreadMock).toHaveBeenCalledTimes(2));
    expect(result.current.responses).toHaveLength(RESPONSES.length);

    act(() => {
      refreshedResult.resolve({
        url: THREAD_URL,
        title: "Fixture thread",
        res: [...RESPONSES, { ...RESPONSES[0], num: 6 }],
      });
    });
    await waitFor(() => expect(result.current.responses.at(-1)?.num).toBe(6));
    expect(result.current.responses).toHaveLength(RESPONSES.length + 1);
  });

  it("forceUpdateの最終結果が一時的に短くても表示中のsnapshotを巻き戻さない", async () => {
    const refreshedResult = createDeferred<IThreadDetail>();
    const getThreadMock = vi
      .fn()
      .mockResolvedValueOnce({
        url: THREAD_URL,
        title: "Fixture thread",
        res: RESPONSES,
      })
      .mockReturnValueOnce(refreshedResult.promise);
    container.thread = { getThread: getThreadMock } as IThreadService;
    const page = createPage();
    const rootRef = { current: null } as RefObject<HTMLDivElement | null>;

    const { result, rerender } = renderHook(
      ({ refreshKey }: { refreshKey: number }) => {
        const refreshController = useThreadRefreshController(refreshKey);
        return useThreadData("tab-1", page, rootRef, refreshController);
      },
      { initialProps: { refreshKey: 0 } },
    );

    await waitFor(() => expect(result.current.responses).toHaveLength(RESPONSES.length));
    rerender({ refreshKey: 1 });
    await waitFor(() => expect(getThreadMock).toHaveBeenCalledTimes(2));

    act(() => {
      refreshedResult.resolve({
        url: THREAD_URL,
        title: "Fixture thread",
        res: RESPONSES.slice(0, 1),
      });
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.responses).toHaveLength(RESPONSES.length);
    expect(result.current.responses.at(-1)?.num).toBe(RESPONSES.at(-1)?.num);
  });

  it("同じスレの更新中は通知状態を保持し、取得完了時に最新状態へ置き換える", async () => {
    const refreshedResult = createDeferred<IThreadDetail>();
    const getThreadMock = vi
      .fn()
      .mockResolvedValueOnce({
        url: THREAD_URL,
        title: "Fixture thread",
        res: RESPONSES,
        expired: true,
        missingFromSubject: true,
        message: "更新前の通知",
      })
      .mockReturnValueOnce(refreshedResult.promise);
    container.thread = { getThread: getThreadMock } as IThreadService;
    const page = createPage();
    const rootRef = { current: null } as RefObject<HTMLDivElement | null>;

    const { result, rerender } = renderHook(
      ({ refreshKey }: { refreshKey: number }) => {
        const refreshController = useThreadRefreshController(refreshKey);
        return useThreadData("tab-1", page, rootRef, refreshController);
      },
      { initialProps: { refreshKey: 0 } },
    );

    await waitFor(() => expect(result.current.error).toBe("更新前の通知"));
    expect(result.current.expired).toBe(true);
    expect(result.current.missingFromSubject).toBe(true);

    rerender({ refreshKey: 1 });
    await waitFor(() => expect(getThreadMock).toHaveBeenCalledTimes(2));
    expect(result.current.error).toBe("更新前の通知");
    expect(result.current.expired).toBe(true);
    expect(result.current.missingFromSubject).toBe(true);

    act(() => {
      refreshedResult.resolve({
        url: THREAD_URL,
        title: "Fixture thread",
        res: RESPONSES,
        expired: false,
        missingFromSubject: false,
      });
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeNull();
    expect(result.current.expired).toBe(false);
    expect(result.current.missingFromSubject).toBe(false);
  });
});
