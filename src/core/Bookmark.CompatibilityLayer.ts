///<reference path="../app.ts" />
///<reference path="URL.ts" />
///<reference path="Bookmark.ts" />
///<reference path="Bookmark.ChromeBookmarkEntryList.ts" />

declare namespace app {
  var ReadState: any;
}

namespace app.Bookmark {
  "use strict";

  export class CompatibilityLayer {
    private cbel: ChromeBookmarkEntryList;
    promiseFirstScan;

    constructor (cbel: ChromeBookmarkEntryList) {
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
                "board_url": app.URL.threadToBoard(bookmark.url),
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

      if (entry) {
        return entry;
      }
      else {
        return null;
      }
    }

    getByBoard (boardURL:string):Entry[] {
      return this.cbel.getThreadsByBoardURL(boardURL);
    }

    getAll ():Entry[] {
      return this.cbel.getAll();
    }

    add (url:string, title:string, resCount?:number) {
      return new Promise( (resolve, reject) => {
        var entry = app.Bookmark.ChromeBookmarkEntryList.URLToEntry(url)!;

        entry.title = title;

        app.ReadState.get(entry.url).then( (readState:ReadState) => {
          if (readState) {
            entry.readState = readState;
          }

          if (typeof resCount === "number") {
            entry.resCount = resCount;
          }
          else if (entry.readState) {
            entry.resCount = entry.readState.received;
          }

          this.cbel.add(entry, undefined, (res) => {
            res ? resolve() : reject();
          });
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

        if (entry) {
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
}
