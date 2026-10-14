import { BBSMenuHtmlParser, type ParsedBBSMenu } from "packages/chlib/src/index";
import Callbacks from "src/app/Callbacks";
import { createLogger } from "src/app/logger";
import { BBSMenuFetcher } from "src/core/board/BBSMenuFetcher";
import { normalizeBBSMenus } from "src/core/board/BoardUrlNormalizer";
import {
  OPENED_BOARDS_CONFIG_KEY,
  parseOpenedBoardEntries,
} from "src/core/board/opened-board-entries";
import { OtherBoardsCollector } from "src/core/board/OtherBoardsCollector";
import * as ReadState from "src/core/bookmark/ReadState.js";
import * as History from "src/core/history/History";
import type { IBBSMenuResult } from "src/core/ports/bbs-menu";
import type { CorePorts } from "src/core/ports/registry";
import { getTauriRepositories, isTauriRuntime } from "src/core/storage/TauriDrizzleBridge";

const logger = createLogger("BBSMenuModel");
const BBSMENU_CACHE_KEY = "bbsmenu";

// サービスコンテナ経由の利用側と同じ形を保つため、インターフェース側の型をそのまま使う。
export type BBSMenuData = IBBSMenuResult;

/**
 * BBSMenu のデータモデル（オーケストレーター）
 *
 * 板一覧の取得フローを調整する責務のみを持つ。
 * 形式解析・TLDフィルタリングは chlib の共有パーサー、
 * HTTP通信・キャッシュ管理は BBSMenuFetcher、
 * 未登録板の収集は OtherBoardsCollector が担当する。
 */
/** 板一覧の取得に必要なサービス。呼び出し側が渡す（C-2）。 */
export type BBSMenuModelDeps = Pick<CorePorts, "cache" | "config" | "toast">;

export class BBSMenuModel {
  private _bbsmenuOption: Set<string> | null = null;
  private _updatingPromise: Promise<BBSMenuData> | null = null;
  // セッション中のメモリキャッシュ。毎回DBルックアップ+パースを繰り返さないようにする
  private _cachedResult: BBSMenuData | null = null;
  // 購読側 (BoardTitleSolver 等) がペイロードの型を受け取れるよう型引数を明示する。
  public readonly onChange = new Callbacks<[BBSMenuData]>({ persistent: true });

  private _fetcher: BBSMenuFetcher;
  private _collector: OtherBoardsCollector;

  constructor(private readonly deps: BBSMenuModelDeps) {
    this._fetcher = new BBSMenuFetcher({
      getCache: (url) => this.deps.cache.getCache(url),
      getExcludeTslds: () => this._getExcludeTslds(),
    });

    this._collector = new OtherBoardsCollector({
      // 変更理由: ReadStateの*.5ch.ioや古い閲覧履歴は板一覧の正本ではなく、
      // 「一度開いた板」へ過去の板を再注入していたため、明示記録だけを採用する。
      includeLegacySources: false,
      getOpenedBoards: () =>
        // 外部サイトの旧記録は除き、スレ一覧の取得確認済みの板はホストを列挙せずに残す。
        // 板一覧はURLと板名だけを使うが、同じ保存レコードには閲覧日時なども含まれる。
        // 読み取り用の射影を書き戻すとF5後に日時が消えるため、ここでは永続データを変更しない。
        parseOpenedBoardEntries(this.deps.config.get(OPENED_BOARDS_CONFIG_KEY)).map(
          ({ url, title, subjectVerified }) => ({
            url,
            ...(title !== undefined ? { title } : {}),
            ...(subjectVerified ? { subjectVerified } : {}),
          }),
        ),
      getAllReadStates: () => ReadState.getAll(),
      getUniqueHistory: () => History.getUnique(),
      getCachedBoardTitles: () => {
        const str = this.deps.config.get("other_board_titles");
        return str ? (JSON.parse(str) as Record<string, string>) : {};
      },
    });
  }

  /**
   * configからNG除外TLDのSetを構築して返す。
   * 結果はキャッシュし、forceReload=trueで再構築する。
   */
  private _getExcludeTslds(forceReload = false): Set<string> {
    if (!this._bbsmenuOption || forceReload) {
      const optionStr = this.deps.config.get("bbsmenu_option") ?? "";
      this._bbsmenuOption = BBSMenuHtmlParser.parseExcludeOptions(optionStr);
    }
    return this._bbsmenuOption;
  }

  /**
   * 単一のURLから板一覧を取得する。
   * キャッシュが存在する場合はキャッシュを使用し、強制更新時のみHTTP通信を行う。
   */
  async fetchOne(url: string, force = false): Promise<ParsedBBSMenu> {
    return this._fetcher.fetch(url, force);
  }

  async getCached(): Promise<BBSMenuData> {
    if (this._cachedResult) return this._cachedResult;
    if (isTauriRuntime()) {
      const cached = await this._loadFromSQLite();
      if (cached) return cached;
    }
    const urls = (this.deps.config.get("bbsmenu") ?? "")
      .split("\n")
      .map((url) => url.trim())
      .filter((url) => url !== "" && !url.startsWith("//"));
    const cachedMenus = await Promise.all(
      urls.map(async (url) => {
        try {
          return await this._fetcher.getCached(url);
        } catch (error) {
          console.error("保存済み板一覧の読み込みに失敗しました", { url, error });
          return null;
        }
      }),
    );
    // ホームは板名だけを参照するため、履歴由来の「その他」を再構築しない。
    // 空の結果も通常取得のキャッシュへ入れず、板一覧を開いたときの取得は妨げない。
    return {
      status: "success",
      menu: normalizeBBSMenus(cachedMenus.filter((menu) => menu !== null)),
    };
  }

  /**
   * 複数のURLから板一覧を取得し、未登録板を「その他」として追加して返す。
   */
  async fetchAll(forceReload = false): Promise<ParsedBBSMenu[]> {
    // 強制更新時はオプションキャッシュをクリア
    if (forceReload) {
      this._getExcludeTslds(true);
    }

    const menus: ParsedBBSMenu[] = [];
    // 設定未保存時 (null) は URL なしとして扱う。
    const bbsmenuUrls = (this.deps.config.get("bbsmenu") ?? "").split("\n");

    for (const url of bbsmenuUrls) {
      if (url === "" || url.startsWith("//")) continue;
      try {
        const menu = await this.fetchOne(url, forceReload);
        menus.push(menu);
      } catch (error) {
        console.error(error);
        this.deps.toast.notify(
          `板一覧の取得に失敗しました。(<a href="${url}" target="_blank">${url}</a>)`,
          { html: true, backgroundColor: "red" },
        );
      }
    }

    await this._collector.collect(menus);

    return normalizeBBSMenus(menus);
  }

  /**
   * 板一覧を取得する（重複リクエスト防止付き）。
   * 既に取得中の場合は同じPromiseを返す。
   */
  async get(forceReload = false): Promise<BBSMenuData> {
    // L1: セッション中のメモリキャッシュ
    if (!forceReload && this._cachedResult != null) {
      return this._cachedResult;
    }

    // L2: SQLite キャッシュ（Tauri のみ）
    const tauri = isTauriRuntime();
    logger.debug("isTauriRuntime", { tauri });
    if (!forceReload && tauri) {
      const cached = await this._loadFromSQLite();
      if (cached != null) {
        this._cachedResult = cached;
        return cached;
      }
    }

    if (this._updatingPromise == null) {
      this._updatingPromise = this._update(forceReload);
    }

    try {
      const result = await this._updatingPromise;
      this._cachedResult = result;
      if (tauri && result.status === "success") {
        // Why: SQLite保存は非同期エラーを内部で記録するため、ここでは呼び出すだけでOK
        await this._saveToSQLite(result);
      }
      if (forceReload) {
        this.onChange.call(result);
      }
      return result;
    } catch {
      const errorResult: BBSMenuData = {
        status: "error",
        message: "板一覧の取得に失敗しました",
      };
      if (forceReload) {
        this.onChange.call(errorResult);
      }
      return errorResult;
    }
  }

  private async _loadFromSQLite(): Promise<BBSMenuData | null> {
    try {
      const { tauriBBSMenuCacheRepository } = await getTauriRepositories();
      const record = await tauriBBSMenuCacheRepository.get(BBSMENU_CACHE_KEY);
      logger.debug("SQLiteキャッシュ読み込み", {
        found: record != null,
        lastUpdated: record?.lastUpdated,
      });
      if (record == null) return null;

      // Why: bbsmenu_update_interval 設定を廃止したため、
      // SQLiteキャッシュは forceReload されるまで常に利用する。

      const menu = JSON.parse(record.data) as ParsedBBSMenu[];
      return { status: "success", menu: normalizeBBSMenus(menu) };
    } catch (e) {
      // Why: Tauri SQLiteの初期化に失敗してもアプリがクラッシュしないよう、
      // エラーを記録するのみでnullを返す。呼び出し元はHTTP fetchにフォールバックする
      logger.warn("SQLiteキャッシュ読み込みエラー（Tauri初期化失敗の可能性）", {
        name: e instanceof Error ? e.name : "unknown",
        message: e instanceof Error ? e.message : String(e),
      });
      return null;
    }
  }

  private async _saveToSQLite(result: BBSMenuData): Promise<void> {
    if (result.menu == null) return;
    try {
      logger.debug("SQLiteキャッシュ保存開始");
      const { tauriBBSMenuCacheRepository } = await getTauriRepositories();
      await tauriBBSMenuCacheRepository.put({
        key: BBSMENU_CACHE_KEY,
        data: JSON.stringify(result.menu),
        lastUpdated: Date.now(),
      });
      logger.debug("SQLiteキャッシュ保存完了");
    } catch (e) {
      // Why: Tauri SQLiteの初期化に失敗してもアプリがクラッシュしないよう、
      // エラーを記録するのみ。メモリキャッシュ(_cachedResult)で対応する
      logger.warn("SQLiteキャッシュ保存失敗（Tauri初期化失敗の可能性）", {
        name: e instanceof Error ? e.name : "unknown",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  private async _update(forceReload: boolean): Promise<BBSMenuData> {
    try {
      const menu = await this.fetchAll(forceReload);
      return { status: "success", menu };
    } finally {
      this._updatingPromise = null;
    }
  }
}
