import { ChURL, type ParsedBBSMenu } from "packages/chlib/src/index";
import { createLogger } from "src/app/logger";
import { getBoardUrlKey, normalizeBoardUrl } from "src/core/board/BoardUrlNormalizer";

const logger = createLogger("core/board");

export interface ReadStateEntry {
  url: string;
  board_url?: string;
}

export interface HistoryEntry {
  url: string;
  boardTitle?: string;
}

export interface OpenedBoardEntry {
  url: string;
  title?: string;
  subjectVerified?: true;
}

interface CollectedBoard {
  name: string;
  url: string;
  subjectVerified?: true;
}

/**
 * ReadState・履歴から未登録板を収集する責務を担うインターフェース。
 * テスト時にモックに差し替えられる。
 */
export interface IOtherBoardsDeps {
  getOpenedBoards(): Promise<OpenedBoardEntry[]> | OpenedBoardEntry[];
  getAllReadStates(): Promise<ReadStateEntry[]>;
  getUniqueHistory(): Promise<HistoryEntry[]>;
  /** 旧データ互換のReadState・履歴収集を有効にする。既定値はtrue。 */
  includeLegacySources?: boolean;
  getCachedBoardTitles(): Record<string, string>;
}

/**
 * BBSMenuに登録されていない板を「その他」カテゴリとして収集するクラス。
 * ReadState・履歴を参照し、未登録の板URLを収集する。
 * 板名は保存済みの情報だけを使い、一覧の収集から通信を起こさない。
 */
export class OtherBoardsCollector {
  constructor(private readonly deps: IOtherBoardsDeps) {}

  /**
   * menusに登録されていない板を収集し、「その他」メニューとして追加する。
   * 未解決の板名は、その板を実際に開くときに取得する。
   */
  async collect(menus: ParsedBBSMenu[]): Promise<void> {
    const registeredUrls = this._buildRegisteredUrlSet(menus);
    const otherBoards = await this._collectUnregisteredBoards(registeredUrls);

    if (otherBoards.length === 0) return;

    this._applyBoardTitles(otherBoards);
    // 板を1件開く際にもこの収集が呼ばれるため、全候補のSETTING.TXT取得へ進めない。
    this._appendToMenus(menus, otherBoards);
  }

  /**
   * 既存メニューに登録済みのURL一覧をSetで返す。
   */
  private _buildRegisteredUrlSet(menus: ParsedBBSMenu[]): Set<string> {
    const registered = new Set<string>();
    for (const menu of menus) {
      for (const cat of menu.categories) {
        for (const board of cat.boards) {
          const boardKey = getBoardUrlKey(board.url);
          if (boardKey !== null) {
            registered.add(boardKey);
          }
        }
      }
    }
    return registered;
  }

  /**
   * ReadStateと履歴から未登録の板URLを収集して返す。
   */
  private async _collectUnregisteredBoards(registeredUrls: Set<string>): Promise<CollectedBoard[]> {
    const otherBoards: CollectedBoard[] = [];
    const seenUrls = new Set<string>();

    const addIfNew = (url: string, name: string, subjectVerified = false) => {
      const normalizedUrl = normalizeBoardUrl(url, {
        requireCompatibleHost: true,
        subjectVerified,
      });
      const boardKey = normalizedUrl === null ? null : getBoardUrlKey(normalizedUrl);
      if (normalizedUrl === null || boardKey === null) {
        // 外部サイトや板として解釈できないURLは「一度開いた板」へ混ぜない。
        return;
      }
      if (!registeredUrls.has(boardKey) && !seenUrls.has(boardKey)) {
        // 取得確認は板ごとの記録で渡し、メニュー正規化でも独自ホストを除外させない。
        otherBoards.push({
          name,
          url: normalizedUrl,
          ...(subjectVerified ? { subjectVerified: true as const } : {}),
        });
        seenUrls.add(boardKey);
      }
    };

    // 明示的に「板を開いた」操作は readState/history より先に取り込み、
    // 未登録板でも「一度開いた板」に必ず残るようにする。
    try {
      const openedBoards = await this.deps.getOpenedBoards();
      for (const opened of openedBoards) {
        if (!opened || typeof opened.url !== "string") {
          continue;
        }

        const trimmedUrl = opened.url.trim();
        if (trimmedUrl === "") {
          continue;
        }

        const title =
          typeof opened.title === "string" && opened.title.trim() !== ""
            ? opened.title
            : trimmedUrl;
        addIfNew(trimmedUrl, title, opened.subjectVerified === true);
      }
    } catch (e) {
      logger.error("Failed to fetch opened boards for Other category", e);
    }

    // 既存版との互換用にReadState・履歴からも収集できるが、
    // 通常の板一覧では明示的に開いた板の記録だけを正本として使う。
    if (this.deps.includeLegacySources !== false) {
      // ReadStateから収集
      try {
        const readStates = await this.deps.getAllReadStates();
        for (const rs of readStates) {
          try {
            let boardUrl = rs.board_url;
            if (!boardUrl) {
              const u = new ChURL(rs.url);
              if (u.guessType().type !== "thread") continue;
              boardUrl = u.toBoard().href;
            }
            addIfNew(boardUrl, boardUrl);
          } catch {
            // 不正なURLは無視
          }
        }
      } catch (e) {
        logger.error("Failed to fetch read states for Other category", e);
      }

      // 履歴から収集
      try {
        const historyEntries = await this.deps.getUniqueHistory();
        for (const entry of historyEntries) {
          try {
            const u = new ChURL(entry.url);
            if (u.guessType().type !== "thread") continue;
            const boardUrl = u.toBoard().href;
            addIfNew(boardUrl, entry.boardTitle || boardUrl);
          } catch {
            // 不正なURLは無視
          }
        }
      } catch (e) {
        logger.error("Failed to fetch history for Other category", e);
      }
    }

    return otherBoards;
  }

  /**
   * キャッシュ済みの板名を即座に適用する（ブロッキングなし）。
   */
  private _applyBoardTitles(boards: { name: string; url: string }[]): void {
    const cached = this.deps.getCachedBoardTitles();
    for (const board of boards) {
      if (board.name === board.url && cached[board.url]) {
        board.name = cached[board.url];
      }
    }
  }

  /**
   * 収集した板を「その他」メニューとしてmenusに追加する。
   */
  private _appendToMenus(menus: ParsedBBSMenu[], boards: { name: string; url: string }[]): void {
    let otherMenu = menus.find((m) => m.name === "その他" || m.name === "Other");
    if (!otherMenu) {
      otherMenu = { name: "その他", categories: [] };
      menus.push(otherMenu);
    }
    otherMenu.categories.push({
      name: "一度開いた板",
      boards,
    });
  }
}
