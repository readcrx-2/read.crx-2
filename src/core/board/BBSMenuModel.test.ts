import { getStore2String, setStore2String } from "src/app/Store2Storage";
import type { BBSMenuModelDeps } from "src/core/board/BBSMenuModel";
import { BBSMenuModel } from "src/core/board/BBSMenuModel";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { configSet, cachedMenuMock, fetchMenuMock, askMock } = vi.hoisted(() => ({
  configSet: vi.fn(),
  cachedMenuMock: vi.fn(),
  fetchMenuMock: vi.fn(),
  askMock: vi.fn(),
}));
// 依存は登録済みのサービス（corePorts）に頼らず、テスト用の値をコンストラクタや関数へ直接渡す。
const deps = {
  config: { get: (key: string) => getStore2String(`config_${key}`), set: configSet },
} as unknown as BBSMenuModelDeps;
vi.mock("src/core/board/BoardTitleSolver.js", () => ({ ask: askMock }));
vi.mock("src/core/history/History", () => ({ getUnique: vi.fn() }));
vi.mock("src/core/bookmark/ReadState.js", () => ({ getAll: vi.fn() }));
vi.mock("src/core/network/URL", () => ({ URL: class {} }));
vi.mock("src/core/board/BBSMenuFetcher", () => ({
  BBSMenuFetcher: class {
    getCached = cachedMenuMock;
    fetch = fetchMenuMock;
  },
}));
vi.mock("src/core/board/BoardUrlNormalizer", async (importOriginal) => {
  const actual = await importOriginal<typeof import("src/core/board/BoardUrlNormalizer")>();
  // 架空の掲示板ホストを使い、再起動時のデータ読み取りを実在の板へ依存させない。
  return {
    ...actual,
    normalizeBoardUrl: (url: string) => actual.normalizeBoardUrl(url),
    getBoardUrlKey: (url: string) => actual.getBoardUrlKey(url),
    normalizeBBSMenus: <T>(menus: T[]) => menus,
  };
});

describe("板一覧の読み取りと開いた板の永続データ", () => {
  beforeEach(() => {
    const values = new Map<string, string>();
    const storage: Storage = {
      get length() {
        return values.size;
      },
      clear: () => values.clear(),
      key: (index) => [...values.keys()][index] ?? null,
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => {
        values.set(key, value);
      },
      removeItem: (key) => {
        values.delete(key);
      },
    };
    vi.stubGlobal("localStorage", storage);
    Object.defineProperty(window, "localStorage", { configurable: true, value: storage });
    configSet
      .mockReset()
      .mockImplementation((key: string, value: string) => setStore2String(`config_${key}`, value));
    cachedMenuMock.mockReset().mockResolvedValue(null);
    fetchMenuMock.mockReset().mockResolvedValue({ name: "保存済み板一覧", categories: [] });
    askMock.mockReset().mockResolvedValue("取得した板名");
  });

  afterEach(() => vi.unstubAllGlobals());

  it("保存後に板一覧を再構築しても閲覧日時を削らず、次の起動でも保持する", async () => {
    const raw = JSON.stringify([
      { url: "https://example.com/sample/", title: "サンプル板", lastVisited: 123 },
    ]);
    await setStore2String("config_opened_board_entries", raw);
    for (let restart = 0; restart < 2; restart += 1) {
      const menus = await new BBSMenuModel(deps).fetchAll();
      expect(menus[0].categories[0].boards).toEqual([
        { url: "https://example.com/sample/", name: "サンプル板" },
      ]);
      expect(getStore2String("config_opened_board_entries")).toBe(raw);
    }
    expect(configSet).not.toHaveBeenCalled();
  });

  it("キャッシュ参照では未登録板を収集せず、通常取得や設定保存にも進まない", async () => {
    await setStore2String("config_bbsmenu", "https://example.com/bbsmenu.html");
    await setStore2String(
      "config_opened_board_entries",
      JSON.stringify([{ url: "https://example.com/unknown/" }]),
    );
    const menu = {
      name: "保存済み板一覧",
      categories: [
        { name: "カテゴリ", boards: [{ url: "https://example.com/sample/", name: "サンプル板" }] },
      ],
    };
    cachedMenuMock.mockResolvedValue(menu);
    expect(await new BBSMenuModel(deps).getCached()).toEqual({
      status: "success",
      menu: [menu],
    });
    expect(cachedMenuMock).toHaveBeenCalledWith("https://example.com/bbsmenu.html");
    expect(fetchMenuMock).not.toHaveBeenCalled();
    expect(configSet).not.toHaveBeenCalled();
  });

  it("板一覧の取得に失敗したら、その URL を core の出来事として知らせる", async () => {
    const bbsmenuUrl = "https://example.com/bbsmenu.html";
    fetchMenuMock.mockRejectedValue(new Error("通信に失敗しました"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    // 登録済みのサービスに頼らず、必要な依存だけをコンストラクタへ渡す。
    const notice = { ngRuleRegexInvalid: vi.fn(), bbsMenuFetchFailed: vi.fn() };
    const model = new BBSMenuModel({
      cache: { getCache: vi.fn() },
      config: { get: (key: string) => (key === "bbsmenu" ? bbsmenuUrl : null), set: configSet },
      notice,
    } as unknown as ConstructorParameters<typeof BBSMenuModel>[0]);

    await model.fetchAll();

    expect(notice.bbsMenuFetchFailed).toHaveBeenCalledWith(bbsmenuUrl);
  });

  it("キャッシュ欠落を通常取得の結果に固定せず、後から板一覧を取得できる", async () => {
    await setStore2String("config_bbsmenu", "https://example.com/bbsmenu.html");
    const model = new BBSMenuModel(deps);
    expect(await model.getCached()).toEqual({ status: "success", menu: [] });
    expect((await model.get()).menu?.[0].name).toBe("保存済み板一覧");
    expect(fetchMenuMock).toHaveBeenCalledTimes(1);
  });

  it("通常の板一覧を組み立てても多数の未解決板の名前をまとめて取得しない", async () => {
    const entries = Array.from({ length: 100 }, (_, index) => ({
      url: `https://example.com/board${index}/`,
    }));
    await setStore2String("config_opened_board_entries", JSON.stringify(entries));
    const result = await new BBSMenuModel(deps).get();
    expect(result.menu?.[0].categories[0].boards).toHaveLength(100);
    expect(askMock).not.toHaveBeenCalled();
    expect(configSet).not.toHaveBeenCalled();
  });
});
