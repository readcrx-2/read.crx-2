///<reference path="../global.d.ts" />
import {Entry} from "./Bookmark"
import BrowserBookmarkEntryList from "./BrowserBookmarkEntryList"
import {threadToBoard} from "./URL"
// @ts-ignore
import {get as getReadState} from "./ReadState.coffee"

export default class BookmarkCompatibilityLayer {
  private cbel: BrowserBookmarkEntryList;
  promiseFirstScan;

  constructor (cbel: BrowserBookmarkEntryList) {
    this.cbel = cbel;
    this.promiseFirstScan = new Promise( (resolve, reject) => {
      this.cbel.ready.add(() => {
        resolve();

        this.cbel.onChanged.add(({type: typeName, entry: bookmark}) => {
          var type = "";
          switch (typeName) {
            case "ADD": type = "added"; break;
            case "TITLE": type = "title"; break;
            case "RES_COUNT": type = "res_count"; break;
            case "EXPIRED": type = "expired"; break;
            case "REMOVE": type = "removed"; break;
          }
          if (type !== "") {
            app.message.send("bookmark_updated", {type, bookmark});
            return
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
      this.cbel.serverMove(before, after);
    });
  }

  get (url:string):Entry|null {
    var entry = this.cbel.get(url);

    return entry ? entry : null;
  }

  getByBoard (boardURL:string):Entry[] {
    return this.cbel.getThreadsByBoardURL(boardURL);
  }

  getAll ():Entry[] {
    return this.cbel.getAll();
  }

  add (url:string, title:string, resCount?:number) {
    return new Promise( async (resolve, reject) => {
      var entry = BrowserBookmarkEntryList.URLToEntry(url)!;

      entry.title = title;

      var readState = await getReadState(entry.url)
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

      this.cbel.add(entry, undefined, (res) => {
        res ? resolve() : reject();
      });
    });
  }

  remove (url:string) {
    return new Promise( (resolve, reject) => {
      this.cbel.remove(url, undefined, (res) => {
        res ? resolve() : reject();
      });
    });
  }

  updateReadState (readState) {
    // TODO
    return new Promise( (resolve, reject) => {
      var entry = this.cbel.get(readState.url);

      if (entry) {
        entry.readState = readState;
        this.cbel.update(entry, undefined, (res) => {
          res ? resolve() : reject();
        });
      } else {
        resolve();
      }
    });
  }

  updateResCount (url:string, resCount:number) {
    return new Promise( (resolve, reject) => {
      var entry = this.cbel.get(url);

      if (entry && (!entry.resCount || entry.resCount < resCount)) {
        entry.resCount = resCount;
        this.cbel.update(entry, undefined, (res) => {
          res ? resolve() : reject();
        });
      }
    });
  }

  updateExpired (url:string, expired:boolean) {
    return new Promise( (resolve, reject) => {
      var entry = this.cbel.get(url);

      if (entry) {
        entry.expired = expired;
        this.cbel.update(entry, undefined, (res) => {
          res ? resolve() : reject();
        });
      }
    });
  }
}
