import { ChURL, replaceBoardUrlServer } from "packages/chlib/src/index";
import Callbacks from "src/app/Callbacks";
import { createLogger } from "src/app/logger";
import { deepCopy } from "src/app/Util";
import { isNewerReadState } from "src/core/bookmark/read-state-compare";
import { fix as fixUrl } from "src/core/network/URL";

const logger = createLogger("core/bookmark");

export interface ReadState {
  url: string;
  received: number;
  read: number;
  last: number;
  // ReadState の永続化レイヤ (IReadState / ReadStateRecord) では省略可能なフィールドのため、
  // 代入互換になるよう optional にする (値が無いことを null でも undefined でも表せる)。
  offset?: number | null;
  date?: number | null;
}

export interface Entry {
  url: string;
  title: string;
  type: string;
  bbsType: string;
  resCount: number | null;
  readState: ReadState | null;
  expired: boolean;
}

export function newerEntry(a: Entry, b: Entry): Entry | null {
  if (a.resCount !== null && b.resCount !== null && a.resCount !== b.resCount) {
    return a.resCount > b.resCount ? a : b;
  }

  return isNewerReadState(a.readState, b.readState) ? b : a;
}

export class EntryList {
  private readonly cache = new Map<string, Entry>();
  private readonly boardURLIndex = new Map<string, Set<string>>();

  async add(entry: Entry): Promise<boolean> {
    if (this.get(entry.url)) return false;

    entry = deepCopy(entry);

    this.cache.set(entry.url, entry);

    if (entry.type === "thread") {
      const boardURL = new ChURL(entry.url).toBoard().href;
      if (!this.boardURLIndex.has(boardURL)) {
        this.boardURLIndex.set(boardURL, new Set());
      }
      this.boardURLIndex.get(boardURL)!.add(entry.url);
    }
    return true;
  }

  async update(entry: Entry): Promise<boolean> {
    if (!this.get(entry.url)) return false;

    this.cache.set(entry.url, deepCopy(entry));
    return true;
  }

  async remove(urlStr: string): Promise<boolean> {
    const url = new ChURL(urlStr);
    url.hash = "";
    urlStr = url.href;

    if (!this.cache.has(urlStr)) return false;

    if (this.cache.get(urlStr).type === "thread") {
      const boardURL = url.toBoard().href;
      if (this.boardURLIndex.has(boardURL)) {
        const threadList = this.boardURLIndex.get(boardURL);
        if (threadList.has(urlStr)) {
          threadList.delete(urlStr);
        }
      }
    }

    this.cache.delete(urlStr);
    return true;
  }

  import(target: EntryList): void {
    for (const b of target.getAll()) {
      const a = this.get(b.url);
      if (a) {
        if (a.type === "thread" && b.type === "thread") {
          if (newerEntry(a, b) === b) {
            void this.update(b);
          }
        }
      } else {
        void this.add(b);
      }
    }
  }

  serverMove(from: string, to: string): void {
    // 板ブックマーク移行
    const boardEntry = this.get(from);
    if (boardEntry) {
      void this.remove(boardEntry.url);
      boardEntry.url = to;
      void this.add(boardEntry);
    }

    // スレブックマーク移行
    for (const entry of this.getThreadsByBoardURL(from)) {
      // 変更理由: originの文字列置換でURL末尾のslashやpathを壊さず、移転先への生成をchlibへ委譲する。
      const movedUrl = replaceBoardUrlServer(entry.url, to);
      if (movedUrl === null) {
        logger.error("スレッドのお気に入りを移転できませんでした", { from, to, url: entry.url });
        continue;
      }
      void this.remove(entry.url);

      entry.url = movedUrl;
      if (entry.readState) {
        entry.readState.url = entry.url;
      }

      void this.add(entry);
    }
  }

  // 実装は従来から null を返し得るため、戻り値型を実態に合わせる。
  get(url: string): Entry | null {
    url = fixUrl(url);

    return this.cache.has(url) ? deepCopy(this.cache.get(url)) : null;
  }

  getAll(): Entry[] {
    return Array.from(this.cache.values());
  }

  getAllThreads(): Entry[] {
    return this.getAll().filter(({ type }) => type === "thread");
  }

  getAllBoards(): Entry[] {
    return this.getAll().filter(({ type }) => type === "board");
  }

  getThreadsByBoardURL(url: string): Entry[] {
    const res: Entry[] = [];
    url = fixUrl(url);

    if (this.boardURLIndex.has(url)) {
      for (const threadURL of this.boardURLIndex.get(url)) {
        // index に載っている URL は cache にも存在するはずだが、
        // get の戻り値が null 許容のため型の整合として null を除外する。
        const entry = this.get(threadURL);
        if (entry != null) {
          res.push(entry);
        }
      }
    }

    return res;
  }
}

export interface BookmarkUpdateEvent {
  type: string; //ADD, TITLE, RES_COUNT, READ_STATE, EXPIRED, REMOVE
  entry: Entry;
}

export class SyncableEntryList extends EntryList {
  readonly onChanged = new Callbacks<[BookmarkUpdateEvent]>({
    persistent: true,
  });
  private readonly observerForSync: (e: BookmarkUpdateEvent) => void;

  constructor() {
    super();

    this.observerForSync = (e: BookmarkUpdateEvent) => {
      this.manipulateByBookmarkUpdateEvent(e);
    };
  }

  async add(entry: Entry): Promise<boolean> {
    if (!super.add(entry)) return false;

    this.onChanged.call({
      type: "ADD",
      entry: deepCopy(entry),
    });
    return true;
  }

  async update(entry: Entry): Promise<boolean> {
    const before = this.get(entry.url);

    // 存在しないエントリの更新は失敗として扱う。
    // (従来は before が null のまま下の比較へ進み実行時エラーになっていた)
    if (before == null) return false;

    if (!super.update(entry)) return false;

    if (before.title !== entry.title) {
      this.onChanged.call({
        type: "TITLE",
        entry: deepCopy(entry),
      });
    }

    if (before.resCount !== entry.resCount) {
      this.onChanged.call({
        type: "RES_COUNT",
        entry: deepCopy(entry),
      });
    }

    if (
      (!before.readState && entry.readState) ||
      (before.readState &&
        entry.readState &&
        (before.readState.received !== entry.readState.received ||
          before.readState.read !== entry.readState.read ||
          before.readState.last !== entry.readState.last ||
          before.readState.offset !== entry.readState.offset ||
          before.readState.date !== entry.readState.date))
    ) {
      this.onChanged.call({
        type: "READ_STATE",
        entry: deepCopy(entry),
      });
    }

    if (before.expired !== entry.expired) {
      this.onChanged.call({
        type: "EXPIRED",
        entry: deepCopy(entry),
      });
    }
    return true;
  }

  async remove(url: string): Promise<boolean> {
    const entry = this.get(url);

    // 存在しないエントリの削除は失敗として扱う。
    // (従来は entry: null のイベントが購読側へ流れ実行時エラーの原因になっていた)
    if (entry == null) return false;

    if (!super.remove(url)) return false;

    this.onChanged.call({
      type: "REMOVE",
      entry: entry,
    });
    return true;
  }

  private manipulateByBookmarkUpdateEvent({ type, entry }: BookmarkUpdateEvent) {
    switch (type) {
      case "ADD":
        void this.add(entry);
        break;
      case "TITLE":
      case "RES_COUNT":
      case "READ_STATE":
      case "EXPIRED":
        void this.update(entry);
        break;
      case "REMOVE":
        void this.remove(entry.url);
        break;
    }
  }

  private followDeletion(b: EntryList) {
    const aEntries = this.getAll();
    const bList = new Set(b.getAll().map(({ url }) => url));

    for (const { url } of aEntries) {
      if (!bList.has(url)) {
        void this.remove(url);
      }
    }
  }

  syncStart(b: SyncableEntryList) {
    b.import(this);

    this.syncResume(b);
  }

  syncResume(b: SyncableEntryList) {
    this.import(b);
    this.followDeletion(b);

    this.onChanged.add(b.observerForSync);
    b.onChanged.add(this.observerForSync);
  }

  syncStop(b: SyncableEntryList) {
    this.onChanged.remove(b.observerForSync);
    b.onChanged.remove(this.observerForSync);
  }
}
