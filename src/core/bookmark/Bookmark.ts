import { ChURL } from "packages/chlib/src/index";
import message from "src/app/Message";
import { isTauriRuntime } from "src/app/platform/runtime";
import { Entry, ReadState, SyncableEntryList } from "src/core/bookmark/BookmarkEntryList";
import BrowserBookmarkEntryList from "src/core/bookmark/BrowserBookmarkEntryList";
import IDBBookmarkEntryList from "src/core/bookmark/IDBBookmarkEntryList";
import { isNewerReadState } from "src/core/bookmark/read-state-compare";
import { get as getReadState } from "src/core/bookmark/ReadState.js";

export default class Bookmark {
  readonly bel: SyncableEntryList & {
    ready: {
      add: (cb: () => void) => void;
      wasCalled: boolean;
      call: () => void;
    };
    needReconfigureRootNodeId?: {
      add: (cb: () => void) => void;
      call: () => void;
    };
  };
  readonly promiseFirstScan: Promise<boolean>;

  constructor(rootIdNode: string) {
    if (isTauriRuntime()) {
      this.bel = new IDBBookmarkEntryList();
    } else {
      this.bel = new BrowserBookmarkEntryList(rootIdNode);
    }
    this.promiseFirstScan = new Promise((resolve, _reject) => {
      this.bel.ready.add(() => {
        resolve(true);

        this.bel.onChanged.add(
          ({ type: typeName, entry: bookmark }: { type: string; entry: Entry }) => {
            let type = "";
            switch (typeName) {
              case "ADD":
                type = "added";
                break;
              case "TITLE":
                type = "title";
                break;
              case "RES_COUNT":
                type = "res_count";
                break;
              case "EXPIRED":
                type = "expired";
                break;
              case "REMOVE":
                type = "removed";
                break;
            }
            if (type !== "") {
              message.send("bookmark_updated", { type, bookmark });
              return;
            }
            if (typeName === "READ_STATE") {
              message.send("read_state_updated", {
                board_url: new ChURL(bookmark.url).toBoard().href,
                read_state: bookmark.readState,
              });
            }
          },
        );
      });
    });

    // 鯖移転検出時処理
    message.on(
      "detected_ch_server_move",
      ({ before, after }: { before: string; after: string }) => {
        this.bel.serverMove(before, after);
      },
    );
  }

  get(url: string): Entry | null {
    const entry = this.bel.get(url);

    return entry ? entry : null;
  }

  getByBoard(boardURL: string): Entry[] {
    return this.bel.getThreadsByBoardURL(boardURL);
  }

  getAll(): Entry[] {
    return this.bel.getAll();
  }

  getAllThreads(): Entry[] {
    return this.bel.getAllThreads();
  }

  getAllBoards(): Entry[] {
    return this.bel.getAllBoards();
  }

  async add(url: string, title: string, resCount?: number): Promise<boolean> {
    const entry = BrowserBookmarkEntryList.URLToEntry(url)!;

    entry.title = title;

    const readState = await getReadState(entry.url);
    if (readState) {
      entry.readState = readState;
    }

    if (typeof resCount === "number" && (!entry.resCount || entry.resCount < resCount)) {
      entry.resCount = resCount;
    } else if (entry.readState) {
      entry.resCount = entry.readState.received;
    }

    return this.bel.add(entry);
  }

  async remove(url: string): Promise<boolean> {
    return this.bel.remove(url);
  }

  async removeAll(): Promise<boolean> {
    const bookmarkData: Promise<boolean>[] = [];

    for (const { url } of this.bel.getAll()) {
      bookmarkData.push(this.bel.remove(url));
    }

    return (await Promise.all(bookmarkData)).every((v) => v);
  }

  async removeAllExpired(): Promise<boolean> {
    const bookmarkData: Promise<boolean>[] = [];

    for (const { url, expired } of this.bel.getAll()) {
      if (expired) {
        bookmarkData.push(this.bel.remove(url));
      }
    }

    return (await Promise.all(bookmarkData)).every((v) => v);
  }

  // entry.readState へそのまま代入するため、ReadState (received/read/last 必須) で受ける。
  async updateReadState(readState: ReadState): Promise<boolean> {
    // TODO
    const entry = this.bel.get(readState.url);

    if (entry && isNewerReadState(entry.readState, readState)) {
      entry.readState = readState;
      return this.bel.update(entry);
    }
    return true;
  }

  async updateResCount(url: string, resCount: number): Promise<boolean> {
    const entry = this.bel.get(url);

    if (entry && (!entry.resCount || entry.resCount < resCount)) {
      entry.resCount = resCount;
      return this.bel.update(entry);
    }
    return true;
  }

  async updateExpired(url: string, expired: boolean): Promise<boolean> {
    const entry = this.bel.get(url);

    if (entry) {
      entry.expired = expired;
      return this.bel.update(entry);
    }
    return true;
  }

  async import(newEntry: Entry): Promise<boolean> {
    let entry = this.bel.get(newEntry.url);
    let updateEntry = false;

    if (!entry) {
      await this.add(newEntry.url, newEntry.title);
      entry = this.bel.get(newEntry.url);
    }

    // add 直後に取得できないのは異常系。従来は null のまま参照して実行時エラーになっていた。
    if (!entry) {
      return false;
    }

    if (entry.title !== newEntry.title) {
      // 既存URLへ復元する場合も、バックアップ時点の表示名を反映する。
      entry.title = newEntry.title;
      updateEntry = true;
    }

    if (newEntry.readState && isNewerReadState(entry.readState, newEntry.readState)) {
      entry.readState = newEntry.readState;
      updateEntry = true;
    }

    if (newEntry.resCount && (!entry.resCount || entry.resCount < newEntry.resCount)) {
      entry.resCount = newEntry.resCount;
      updateEntry = true;
    }

    if (entry.expired !== newEntry.expired) {
      entry.expired = newEntry.expired;
      updateEntry = true;
    }

    if (updateEntry) {
      await this.bel.update(entry);
    }
    return true;
  }
}
