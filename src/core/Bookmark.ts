import {Entry} from "./BookmarkEntryList"
import BrowserBookmarkEntryList from "./BrowserBookmarkEntryList"
import {threadToBoard} from "./URL"
// @ts-ignore
import {get as getReadState} from "./ReadState.coffee"

export default class Bookmark {
  readonly bel: BrowserBookmarkEntryList;
  readonly promiseFirstScan;

  constructor(rootIdNode: string) {
    this.bel = new BrowserBookmarkEntryList(rootIdNode);
    this.promiseFirstScan = new Promise( (resolve, reject) => {
      this.bel.ready.add( () => {
        resolve();

        this.bel.onChanged.add( ({type: typeName, entry: bookmark}) => {
          let type = "";
          switch (typeName) {
            case "ADD":       type = "added";     break;
            case "TITLE":     type = "title";     break;
            case "RES_COUNT": type = "res_count"; break;
            case "EXPIRED":   type = "expired";   break;
            case "REMOVE":    type = "removed";   break;
          }
          if (type !== "") {
            app.message.send("bookmark_updated", {type, bookmark});
            return;
          }
          if (typeName === "READ_STATE") {
            app.message.send("read_state_updated", {
              "board_url": threadToBoard(bookmark.url),
              "read_state": bookmark.readState
            });
          }
        });
      });
    });

    // 鯖移転検出時処理
    app.message.on("detected_ch_server_move", ({before, after}) => {
      this.bel.serverMove(before, after);
    });
  }

  get(url: string): Entry|null {
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

    if (
      typeof resCount === "number" &&
      (!entry.resCount || entry.resCount < resCount)
    ) {
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

    for (const {url} of this.bel.getAll()) {
      bookmarkData.push(this.bel.remove(url));
    }

    return (await Promise.all(bookmarkData)).every(v => v);
  }

  async removeAllExpired(): Promise<boolean> {
    const bookmarkData: Promise<boolean>[] = [];

    for (const {url, expired} of this.bel.getAll()) {
      if (expired) {
        bookmarkData.push(this.bel.remove(url));
      }
    }

    return (await Promise.all(bookmarkData)).every(v => v);
  }

  async updateReadState(readState): Promise<boolean> {
    // TODO
    const entry = this.bel.get(readState.url);

    if (entry && app.util.isNewerReadState(entry.readState, readState)) {
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
      entry = this.bel.get(newEntry.url)
    }

    if (newEntry.readState && app.util.isNewerReadState(entry.readState, newEntry.readState)) {
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
