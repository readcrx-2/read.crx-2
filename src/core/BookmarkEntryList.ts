import {threadToBoard, fix as fixUrl} from "./URL"

export interface ReadState {
  url: string;
  received: number;
  read: number;
  last: number;
  offset: number|null;
  date: number|null;
}

export interface Entry {
  url: string;
  title: string;
  type: string;
  bbsType: string;
  resCount: number|null;
  readState: ReadState|null;
  expired: boolean;
}

export function newerEntry(a:Entry, b:Entry): Entry|null {
  if (a.resCount !== null && b.resCount !== null && a.resCount !== b.resCount) {
    return a.resCount > b.resCount ? a : b;
  }

  return app.util.isNewerReadState(a.readState, b.readState) ? b : a;
}

export class EntryList {
  private cache = new Map<string, Entry>();
  private boardURLIndex = new Map<string, Set<string>>();

  async add(entry: Entry): Promise<boolean> {
    if (this.get(entry.url)) return false;

    entry = app.deepCopy(entry);

    this.cache.set(entry.url, entry);

    if (entry.type === "thread") {
      const boardURL = threadToBoard(entry.url);
      if (!this.boardURLIndex.has(boardURL)) {
        this.boardURLIndex.set(boardURL, new Set());
      }
      this.boardURLIndex.get(boardURL)!.add(entry.url);
    }
    return true;
  }

  async update(entry: Entry): Promise<boolean> {
    if (!this.get(entry.url)) return false;

    this.cache.set(entry.url, app.deepCopy(entry));
    return true;
  }

  async remove(url: string): Promise<boolean> {
    url = fixUrl(url);

    if (!this.cache.has(url)) return false;

    if (this.cache.get(url)!.type === "thread") {
      const boardURL = threadToBoard(url);
      if (this.boardURLIndex.has(boardURL)) {
        const threadList = this.boardURLIndex.get(boardURL)!;
        if (threadList.has(url)) {
          threadList.delete(url);
        }
      }
    }

    this.cache.delete(url);
    return true;
  }

  import(target: EntryList): void {
    for(const b of target.getAll()) {
      const a = this.get(b.url);
      if (a) {
        if (a.type === "thread" && b.type === "thread") {
          if (newerEntry(a, b) === b) {
            this.update(b);
          }
        }
      } else {
        this.add(b);
      }
    }
  }

  serverMove(from:string, to:string): void {
    // 板ブックマーク移行
    const boardEntry = this.get(from)
    if (boardEntry) {
      this.remove(boardEntry.url);
      boardEntry.url = to;
      this.add(boardEntry);
    }

    const reg = /^https?:\/\/[\w\.]+\//;
    const tmp = reg.exec(to)![0];
    // スレブックマーク移行
    for(const entry of this.getThreadsByBoardURL(from)) {
      this.remove(entry.url);

      entry.url = entry.url.replace(reg, tmp);
      if (entry.readState) {
        entry.readState.url = entry.url;
      }

      this.add(entry);
    }
  }

  get(url: string): Entry {
    url = fixUrl(url);

    return this.cache.has(url) ? app.deepCopy(this.cache.get(url)) : null;
  }

  getAll(): Entry[] {
    return Array.from(this.cache.values());
  }

  getAllThreads(): Entry[] {
    return this.getAll().filter( ({type}) => type === "thread");
  }

  getAllBoards(): Entry[] {
    return this.getAll().filter( ({type}) => type === "board");
  }

  getThreadsByBoardURL(url: string): Entry[] {
    const res: Entry[] = [];
    url = fixUrl(url);

    if (this.boardURLIndex.has(url)) {
      for (const threadURL of this.boardURLIndex.get(url)!) {
        res.push(this.get(threadURL));
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
  onChanged = new app.Callbacks({persistent: true});
  private observerForSync: Function;

  constructor () {
    super();

    this.observerForSync = (e: BookmarkUpdateEvent) => {
      this.manipulateByBookmarkUpdateEvent(e);
    };
  }

  async add(entry: Entry): Promise<boolean> {
    if (!super.add(entry)) return false;

    this.onChanged.call({
      type: "ADD",
      entry: app.deepCopy(entry)
    });
    return true;
  }

  async update(entry: Entry): Promise<boolean> {
    const before = this.get(entry.url);

    if (!super.update(entry)) return false;

    if (before.title !== entry.title) {
      this.onChanged.call({
        type: "TITLE",
        entry: app.deepCopy(entry)
      });
    }

    if (before.resCount !== entry.resCount) {
      this.onChanged.call({
        type: "RES_COUNT",
        entry: app.deepCopy(entry)
      });
    }

    if (
      (!before.readState && entry.readState) ||
      (
        (before.readState && entry.readState) && (
          before.readState.received !== entry.readState.received ||
          before.readState.read !== entry.readState.read ||
          before.readState.last !== entry.readState.last ||
          before.readState.offset !== entry.readState.offset ||
          before.readState.date !== entry.readState.date
        )
      )
    ) {
      this.onChanged.call({
        type: "READ_STATE",
        entry: app.deepCopy(entry)
      });
    }

    if (before.expired !== entry.expired) {
      this.onChanged.call({
        type: "EXPIRED",
        entry: app.deepCopy(entry)
      });
    }
    return true;
  }

  async remove(url: string): Promise<boolean> {
    const entry = this.get(url);

    if (!super.remove(url)) return false;

    this.onChanged.call({
      type: "REMOVE",
      entry: entry
    });
    return true;
  }

  private manipulateByBookmarkUpdateEvent({type, entry}: BookmarkUpdateEvent) {
    switch (type) {
      case "ADD":
        this.add(entry);
        break;
      case "TITLE":
      case "RES_COUNT":
      case "READ_STATE":
      case "EXPIRED":
        this.update(entry);
        break;
      case "REMOVE":
        this.remove(entry.url);
        break;
    }
  }

  private followDeletion(b: EntryList) {
    const aList = this.getAll().map( ({url}) => url);
    const bList = b.getAll().map( ({url}) => url);

    const rmList = aList.filter( url => !bList.includes(url));

    for(const url of rmList) {
      this.remove(url);
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
