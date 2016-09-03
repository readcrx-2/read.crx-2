///<reference path="../app.ts" />
///<reference path="URL.ts" />
///<reference path="Bookmark.ts" />
///<reference path="Bookmark.ChromeBookmarkEntryList.ts" />

declare namespace app {
  var read_state: any;
}

namespace app.Bookmark {
  "use strict";

  export class CompatibilityLayer {
    private cbel: ChromeBookmarkEntryList;
    private firstScan = $.Deferred();
    promise_first_scan;

    constructor (cbel: ChromeBookmarkEntryList) {
      this.cbel = cbel;
      this.promise_first_scan = this.firstScan.promise();

      this.cbel.ready.add(() => {
        this.firstScan.resolve();

        this.cbel.onChanged.add((e) => {
          var legacyEntry: LegacyEntry = app.Bookmark.currentToLegacy(e.entry);

          switch (e.type) {
            case "ADD":
              app.message.send(
                "bookmark_updated",
                {type: "added", bookmark: legacyEntry, entry: e.entry}
              );
              break;
            case "TITLE":
              app.message.send(
                "bookmark_updated",
                {type: "title", bookmark: legacyEntry, entry: e.entry}
              );
              break;
            case "RES_COUNT":
              app.message.send(
                "bookmark_updated",
                {type: "res_count", bookmark: legacyEntry, entry: e.entry}
              );
              break;
            case "READ_STATE":
              app.message.send("read_state_updated", {
                "board_url": app.URL.threadToBoard(e.entry.url),
                "read_state": e.entry.readState
              });
              break;
            case "EXPIRED":
              app.message.send(
                "bookmark_updated",
                {type: "expired", bookmark: legacyEntry, entry: e.entry}
              );
              break;
            case "REMOVE":
              app.message.send(
                "bookmark_updated",
                {type: "removed", bookmark: legacyEntry, entry: e.entry}
              );
              break;
          }
        });
      });

      // 鯖移転検出時処理
      app.message.addListener("detected_ch_server_move", (message) => {
        this.cbel.serverMove(message.before, message.after);
      });
    }

    url_to_bookmark (url:string):LegacyEntry {
      return app.Bookmark.currentToLegacy(
        app.Bookmark.ChromeBookmarkEntryList.URLToEntry(url)
      );
    }

    bookmark_to_url (entry:LegacyEntry):string {
      return app.Bookmark.ChromeBookmarkEntryList.entryToURL(
        app.Bookmark.legacyToCurrent(entry)
      );
    }

    get (url:string):app.Bookmark.LegacyEntry {
      var entry = this.cbel.get(url);

      if (entry) {
        return app.Bookmark.currentToLegacy(entry);
      }
      else {
        return null;
      }
    }

    get_by_board (boardURL:string):LegacyEntry[] {
      return (
        this.cbel.getThreadsByBoardURL(boardURL)
          .map(function (entry:Entry):LegacyEntry {
            return app.Bookmark.currentToLegacy(entry);
          })
      );
    }

    get_all ():LegacyEntry[] {
      return (
        this.cbel.getAll()
          .map(function (entry:Entry):LegacyEntry {
            return app.Bookmark.currentToLegacy(entry);
          })
      );
    }

    add (url:string, title:string, resCount?:number) {
      var deferred = $.Deferred(),
        entry = app.Bookmark.ChromeBookmarkEntryList.URLToEntry(url);

      entry.title = title;

      app.read_state.get(entry.url).always((readState:ReadState) => {
        if (readState) {
          entry.readState = readState;
        }

        if (typeof resCount === "number") {
          entry.resCount = resCount;
        }
        else if (entry.readState) {
          entry.resCount = entry.readState.received;
        }

        this.cbel.add(entry, undefined, function (res) {
          deferred[res ? "resolve" : "reject"]();
        });
      });

      return deferred.promise();
    }

    remove (url:string) {
      var deferred = $.Deferred();

      this.cbel.remove(url, undefined, function (res) {
        deferred[res ? "resolve" : "reject"]();
      });

      return deferred.promise();
    }

    update_read_state (readState) {
      // TODO
      var deferred = $.Deferred(),
        entry = this.cbel.get(readState.url);

      if (entry) {
        entry.readState = readState;
        this.cbel.update(entry, undefined, function (res) {
          deferred[res ? "resolve" : "reject"]();
        });
      }
      else {
        deferred.reject();
      }

      return deferred.promise();
    }

    update_res_count (url:string, resCount:number) {
      var deferred = $.Deferred(),
        entry = this.cbel.get(url);

      if (entry) {
        entry.resCount = resCount;
        this.cbel.update(entry, undefined, function (res) {
          deferred[res ? "resolve" : "reject"]();
        });
      }

      return deferred.promise();
    }

    update_expired (url:string, expired:boolean) {
      var deferred = $.Deferred(),
        entry = this.cbel.get(url);

      if (entry) {
        entry.expired = expired;
        this.cbel.update(entry, undefined, function (res) {
          deferred[res ? "resolve" : "reject"]();
        });
      }

      return deferred.promise();
    }
  }
}
