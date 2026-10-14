import type { BBSMenuModelDeps } from "src/core/board/BBSMenuModel";
import { BBSMenuModel } from "src/core/board/BBSMenuModel";
import { parseOpenedBoardEntries } from "src/core/board/OpenedBoards";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { config } = vi.hoisted(() => ({ config: new Map<string, string>() }));
// 依存は登録済みのサービス（corePorts）に頼らず、テスト用の値をコンストラクタや関数へ直接渡す。
const deps = {
  config: { get: (key: string) => config.get(key) ?? null },
} as unknown as BBSMenuModelDeps;
vi.mock("src/core/board/BBSMenuFetcher", () => ({ BBSMenuFetcher: class {} }));
vi.mock("src/core/network/URL", () => ({ URL: class {} }));
vi.mock("src/core/history/History", () => ({}));
vi.mock("src/core/bookmark/ReadState.js", () => ({}));

describe("独自ホストの取得確認と板履歴の読み取り", () => {
  beforeEach(() => config.clear());

  it("確認済みの板はホームとその他の板一覧で読み込み、再構築後も名前と日時を保つ", async () => {
    const board = {
      url: "https://example.org/sample/",
      title: "独自の板名",
      lastVisited: Date.now(),
      subjectVerified: true,
    };
    const saved = JSON.stringify([board]);
    config.set("opened_board_entries", saved);
    for (let restart = 0; restart < 2; restart += 1) {
      expect(parseOpenedBoardEntries(saved)).toEqual([board]);
      const menus = await new BBSMenuModel(deps).fetchAll();
      expect(menus[0].categories[0].boards).toEqual([
        { url: board.url, name: board.title, subjectVerified: true },
      ]);
      expect(config.get("opened_board_entries")).toBe(saved);
    }
  });

  it.each([undefined, "true", false])(
    "未確認の外部サイトの旧記録を再び板へ混ぜない（確認=%s）",
    async (subjectVerified) => {
      const saved = JSON.stringify([
        { url: "https://example.org/sample/", title: "外部サイト", subjectVerified },
      ]);
      config.set("opened_board_entries", saved);
      expect(parseOpenedBoardEntries(saved)).toEqual([]);
      expect(await new BBSMenuModel(deps).fetchAll()).toEqual([]);
    },
  );
});
