///<reference path="../app.ts" />
///<reference path="URL.ts" />

namespace app {
  "use strict";

  export namespace Bookmark {
    export interface ReadState {
      url: string;
      received: number;
      read: number;
      last: number;
      offset: number|null;
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

    export interface LegacyEntry {
      url: string;
      title: string;
      type: string;
      bbs_type: string;
      res_count: number|null;
      read_state: ReadState|null;
      expired: boolean;
    }

    export function legacyToCurrent (legacy:LegacyEntry):Entry {
      var entry:Entry, readState:ReadState;

      entry = {
        url: app.URL.fix(legacy.url),
        title: legacy.title,
        type: legacy.type,
        bbsType: legacy.bbs_type,
        resCount: null,
        readState: null,
        expired: legacy.expired === true
      };

      if (legacy.res_count !== null && Number.isFinite(legacy.res_count)) {
        entry.resCount = legacy.res_count;
      }

      if (legacy.read_state) {
        readState = legacy.read_state;
        if (
          readState.url === entry.url &&
          Number.isFinite(readState.received) &&
          Number.isFinite(readState.last) &&
          Number.isFinite(readState.read) &&
          (readState.offset === null || Number.isFinite(readState.offset))
        ) {
          entry.readState = readState;
        }
      }

      return entry;
    }

    export function currentToLegacy (entry:Entry):LegacyEntry {
      var legacy:LegacyEntry, readState:ReadState;

      legacy = {
        url: app.URL.fix(entry.url),
        title: entry.title,
        type: entry.type,
        bbs_type: entry.bbsType,
        res_count: null,
        read_state: null,
        expired: entry.expired === true
      };

      if (entry.resCount !== null && Number.isFinite(entry.resCount)) {
        legacy.res_count = entry.resCount;
      }

      if (entry.readState) {
        readState = entry.readState;
        if (
          readState.url === entry.url &&
          Number.isFinite(readState.received) &&
          Number.isFinite(readState.last) &&
          Number.isFinite(readState.read) &&
          (readState.offset === null || Number.isFinite(readState.offset))
        ) {
          legacy.read_state = readState;
        }
      }

      return legacy;
    }

    export function newerEntry (a:Entry, b:Entry):Entry|null {
      if (a.resCount !== null && b.resCount !== null && a.resCount !== b.resCount) {
        return a.resCount > b.resCount ? a : b;
      }

      if (Boolean(a.readState) !== Boolean(b.readState)) {
        return a.readState ? a : b;
      }

      if (a.readState && b.readState) {
        if (a.readState.read !== b.readState.read) {
          return a.readState.read > b.readState.read ? a : b;
        }

        if (a.readState.received !== b.readState.received) {
          return a.readState.received > b.readState.received ? a : b;
        }
      }

      return null;
    }

    export class EntryList {
      private cache = new Map<string, Entry>();
      private boardURLIndex = new Map<string, string[]>();

      add (entry:Entry):boolean {
        var boardURL:string;

        if (!this.get(entry.url)) {
          entry = app.deepCopy(entry);

          this.cache.set(entry.url, entry);

          if (entry.type === "thread") {
            boardURL = app.URL.threadToBoard(entry.url);
            if (!this.boardURLIndex.has(boardURL)) {
              this.boardURLIndex.set(boardURL, []);
            }
            this.boardURLIndex.get(boardURL)!.push(entry.url);
          }
          return true;
        }
        else {
          return false;
        }
      }

      update (entry:Entry):boolean {
        if (this.get(entry.url)) {
          this.cache.set(entry.url, app.deepCopy(entry));
          return true;
        }
        else {
          return false;
        }
      }

      remove (url:string):boolean {
        var tmp:number, boardURL:string;

        url = app.URL.fix(url);

        if (this.cache.has(url)) {
          if (this.cache.get(url)!.type === "thread") {
            boardURL = app.URL.threadToBoard(url);
            if (this.boardURLIndex.has(boardURL)) {
              tmp = this.boardURLIndex.get(boardURL)!.indexOf(url);
              if (tmp !== -1) {
                this.boardURLIndex.get(boardURL)!.splice(tmp, 1);
              }
            }
          }

          this.cache.delete(url);
          return true;
        }
        else {
          return false;
        }
      }

      import (target:EntryList):void {
        for(var b of target.getAll()) {
          var a:Entry;

          if (a = this.get(b.url)) {
            if (a.type === "thread" && b.type === "thread") {
              if (newerEntry(a, b) === b) {
                this.update(b);
              }
            }
          }
          else {
            this.add(b);
          }
        }
      }

      serverMove (from:string, to:string):void {
        var entry:Entry, tmp, reg;

        // 板ブックマーク移行
        if (entry = this.get(from)) {
          this.remove(entry.url);
          entry.url = to;
          this.add(entry);
        }

        reg = /^https?:\/\/[\w\.]+\//
        tmp = reg.exec(to)[0];
        // スレブックマーク移行
        for(var entry of this.getThreadsByBoardURL(from)) {
          this.remove(entry.url);

          entry.url = entry.url.replace(reg, tmp);
          if (entry.readState) {
            entry.readState.url = entry.url;
          }

          this.add(entry);
        }
      }

      get (url:string):Entry {
        url = app.URL.fix(url);

        return this.cache.has(url) ? app.deepCopy(this.cache.get(url)) : null;
      }

      getAll ():Entry[] {
        var res:Entry[] = [];

        for (var val of this.cache.values()) {
          res.push(val);
        }

        return app.deepCopy(res);
      }

      getAllThreads ():Entry[] {
        var res:Entry[] = [];

        for (var val of this.cache.values()) {
          if (val.type === "thread") {
            res.push(val);
          }
        }

        return app.deepCopy(res);
      }

      getAllBoards ():Entry[] {
        var res:Entry[] = [];

        for (var val of this.cache.values()) {
          if (val.type === "board") {
            res.push(val);
          }
        }

        return app.deepCopy(res);
      }

      getThreadsByBoardURL (url:string):Entry[] {
        var res:Entry[] = [], threadURL:string;

        url = app.URL.fix(url);

        if (this.boardURLIndex.has(url)) {
          for (threadURL of this.boardURLIndex.get(url)!) {
            res.push(this.get(threadURL));
          }
        }

        return app.deepCopy(res);
      }
    }

    export interface BookmarkUpdateEvent {
      type: string; //ADD, TITLE, RES_COUNT, READ_STATE, EXPIRED, REMOVE
      entry: Entry;
    }

    export class SyncableEntryList extends EntryList{
      onChanged = new app.Callbacks({persistent: true});
      private observerForSync:Function;

      constructor () {
        super();

        this.observerForSync = (e:BookmarkUpdateEvent) => {
          this.manipulateByBookmarkUpdateEvent(e);
        };
      }

      add (entry:Entry):boolean {
        if (super.add(entry)) {
          this.onChanged.call({
            type: "ADD",
            entry: app.deepCopy(entry)
          });
          return true;
        }
        else {
          return false;
        }
      }

      update (entry:Entry):boolean {
        var before = this.get(entry.url);

        if (super.update(entry)) {
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
                before.readState.offset !== entry.readState.offset
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
        else {
          return false;
        }
      }

      remove (url:string):boolean {
        var entry:Entry = this.get(url);

        if (super.remove(url)) {
          this.onChanged.call({
            type: "REMOVE",
            entry: entry
          });
          return true;
        }
        else {
          return false;
        }
      }

      private manipulateByBookmarkUpdateEvent (e:BookmarkUpdateEvent) {
        switch (e.type) {
          case "ADD":
            this.add(e.entry);
            break;
          case "TITLE":
          case "RES_COUNT":
          case "READ_STATE":
          case "EXPIRED":
            this.update(e.entry);
            break;
          case "REMOVE":
            this.remove(e.entry.url);
            break;
        }
      }

      private followDeletion (b:EntryList):void {
        var aList:string[], bList:string[], rmList:string[];

        aList = this.getAll().map( (entry:Entry) => {
          return entry.url;
        });
        bList = b.getAll().map( (entry:Entry) => {
          return entry.url;
        });

        rmList = aList.filter( (url:string) => {
          return !bList.includes(url);
        });

        for(var url of rmList) {
          this.remove(url);
        }
      }

      syncStart (b:SyncableEntryList):void {
        b.import(this);

        this.syncResume(b);
      }

      syncResume (b:SyncableEntryList):void {
        this.import(b);
        this.followDeletion(b);

        this.onChanged.add(b.observerForSync);
        b.onChanged.add(this.observerForSync);
      }

      syncStop (b:SyncableEntryList):void {
        this.onChanged.remove(b.observerForSync);
        b.onChanged.remove(this.observerForSync);
      }
    }
  }
}
