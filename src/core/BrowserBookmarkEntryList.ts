import {Entry, SyncableEntryList, newerEntry} from "./BookmarkEntryList"
import {fix as fixUrl, buildQuery, guessType, parseHashQuery} from "./URL"

export default class BrowserBookmarkEntryList extends SyncableEntryList {
  rootNodeId: string;
  readonly nodeIdStore = new Map<string, string>();
  readonly ready = new app.Callbacks();
  readonly needReconfigureRootNodeId = new app.Callbacks({persistent: true});

  static entryToURL(entry: Entry): string {
    const url = fixUrl(entry.url);
    const param: Record<string, string> = {};

    if (entry.resCount !== null && Number.isFinite(entry.resCount)) {
      param.res_count = ""+entry.resCount;
    }

    if (entry.readState) {
      param.last = ""+entry.readState.last;
      param.read = ""+entry.readState.read;
      param.received = ""+entry.readState.received;
      if (entry.readState.offset) {
        param.offset = ""+entry.readState.offset;
      }
      if (entry.readState.date) {
        param.date = ""+entry.readState.date;
      }
    }

    if (entry.expired === true) {
      param.expired = "true";
    }

    const hash = buildQuery(param);

    return url + (hash ? `#${hash}` : "");
  }

  static URLToEntry(url: string): Entry|null {
    const fixedURL = fixUrl(url);
    const {type, bbsType} = guessType(fixedURL);

    if (type === "unknown") return null;

    const arg = parseHashQuery(url);
    const entry: Entry = {
      type,
      bbsType,
      url: fixedURL,
      title: fixedURL,
      resCount: null,
      readState: null,
      expired: false
    };
    const reg = /^\d+$/;

    if (reg.test(arg.get("res_count")!)) {
      entry.resCount = +arg.get("res_count")!;
    }

    if (
      reg.test(arg.get("received")!) &&
      reg.test(arg.get("read")!) &&
      reg.test(arg.get("last")!)
    ) {
      entry.readState = {
        url: fixedURL,
        received: +arg.get("received")!,
        read: +arg.get("read")!,
        last: +arg.get("last")!,
        offset: arg.get("offset") ? +arg.get("offset")! : null,
        date: arg.get("date") ? +arg.get("date")! : null
      };
    }

    if (arg.get("expired") === "true") {
      entry.expired = true;
    }

    return entry;
  }

  constructor(rootNodeId: string) {
    super();

    this.setRootNodeId(rootNodeId);
    this.setUpBrowserBookmarkWatcher();
  }

  private applyNodeAddToEntryList(node: browser.bookmarks.BookmarkTreeNode) {
    if (!node.url || !node.title) return;

    const entry = BrowserBookmarkEntryList.URLToEntry(node.url);
    if (entry === null) return;
    entry.title = node.title;

    // 既に同一URLのEntryが存在する場合、
    if (this.get(entry.url)) {
      // addによりcreateBrowserBookmarkが呼ばれた場合
      if (!this.nodeIdStore.has(entry.url)) {
        this.nodeIdStore.set(entry.url, node.id);
      } else if (newerEntry(entry, this.get(entry.url)) === entry) {
        // node側の方が新しいと判定された場合のみupdateを行う。

        // 重複ブックマークの削除(元のnodeが古いと判定されたため)
        browser.bookmarks.remove(this.nodeIdStore.get(entry.url)!);

        this.nodeIdStore.set(entry.url, node.id);
        this.update(entry, false);
      } else {
        // 重複ブックマークの削除(node側の方が古いと判定された場合)
        browser.bookmarks.remove(node.id);
      }
    } else {
      this.nodeIdStore.set(entry.url, node.id);
      this.add(entry, false);
    }
  }

  private applyNodeUpdateToEntryList(nodeId: string, changes) {
    const url = this.getURLFromNodeId(nodeId);

    if (!url) return;

    const entry = this.get(url);

    if (typeof changes.url === "string") {
      const newEntry = BrowserBookmarkEntryList.URLToEntry(changes.url)!;
      newEntry.title = (
        typeof changes.title === "string" ? changes.title : entry.title
      );

      if (entry.url === newEntry.url) {
        if (
          (
            BrowserBookmarkEntryList.entryToURL(entry) !==
            BrowserBookmarkEntryList.entryToURL(newEntry)
          ) ||
          (entry.title !== newEntry.title)
        ) {
          this.update(newEntry, false);
        }
      } else {
        // ノードのURLが他の板/スレを示す物に変更された時
        this.nodeIdStore.delete(url);
        this.nodeIdStore.set(newEntry.url, nodeId);

        this.remove(entry.url, false);
        this.add(newEntry, false);
      }
    } else if (typeof changes.title === "string") {
      if (entry.title !== changes.title) {
        entry.title = changes.title;
        this.update(entry, false);
      }
    }
  }

  private applyNodeRemoveToEntryList(nodeId: string) {
    const url = this.getURLFromNodeId(nodeId);

    if (url !== null) {
      this.nodeIdStore.delete(url);

      this.remove(url, false);
    }
  }

  private getURLFromNodeId(nodeId: string): string|null {
    for (const [url, id] of this.nodeIdStore) {
      if (id === nodeId) {
        return url;
      }
    }

    return null;
  }

  private setUpBrowserBookmarkWatcher() {
    let watching = true;

    // Firefoxではbookmarks.onImportBegan/Endedは実装されていない
    if (browser.bookmarks.onImportBegan !== void 0) {
      browser.bookmarks.onImportBegan.addListener( () => {
        watching = false;
      });

      browser.bookmarks.onImportEnded.addListener( () => {
        watching = true;
        this.loadFromBrowserBookmark();
      });
    }

    browser.bookmarks.onCreated.addListener( (nodeId, node) => {
      if (!watching) return;

      if (node.parentId === this.rootNodeId && typeof node.url === "string") {
        this.applyNodeAddToEntryList(node);
      }
    });

    browser.bookmarks.onRemoved.addListener( (nodeId) => {
      if (!watching) return;

      this.applyNodeRemoveToEntryList(nodeId);
    });

    browser.bookmarks.onChanged.addListener( (nodeId, changes) => {
      if (!watching) return;

      this.applyNodeUpdateToEntryList(nodeId, changes);
    });

    browser.bookmarks.onMoved.addListener( async (nodeId, {parentId, oldParentId}) => {
      if (!watching) return;

      if (parentId === this.rootNodeId) {
        const res = await browser.bookmarks.get(nodeId);
        if (res.length === 1 && typeof res[0].url === "string") {
          this.applyNodeAddToEntryList(res[0]);
        }
      } else if (oldParentId === this.rootNodeId) {
        this.applyNodeRemoveToEntryList(nodeId);
      }
    });
  }

  setRootNodeId(rootNodeId: string): Promise<boolean> {
    this.rootNodeId = rootNodeId;
    return this.loadFromBrowserBookmark();
  }

  private async validateRootNodeSettings(): Promise<void> {
    try {
      await browser.bookmarks.getChildren(this.rootNodeId)
    } catch {
      this.needReconfigureRootNodeId.call();
    }
  }

  private async loadFromBrowserBookmark(): Promise<boolean> {
    // EntryListクリア
    for(const entry of this.getAll()) {
      this.remove(entry.url, false);
    }

    // ロード
    try {
      const res = await browser.bookmarks.getChildren(this.rootNodeId);

      for(const node of res) {
        this.applyNodeAddToEntryList(node);
      }

      if (!this.ready.wasCalled) {
        this.ready.call();
      }

      return true;
    } catch {
      app.log("warn", "ブラウザのブックマークからの読み込みに失敗しました。");
      this.validateRootNodeSettings();

      return false;
    }
  }

  private async createBrowserBookmark(entry: Entry): Promise<boolean> {
    const res = await browser.bookmarks.create({
      parentId: this.rootNodeId,
      url: BrowserBookmarkEntryList.entryToURL(entry),
      title: entry.title
    });
    if (!res) {
      app.log("error", "ブラウザのブックマークへの追加に失敗しました");
      this.validateRootNodeSettings();
    }

    return !!res;
  }

  private async updateBrowserBookmark(newEntry: Entry): Promise<boolean> {
    if (!this.nodeIdStore.has(newEntry.url)) return false;

    const id = this.nodeIdStore.get(newEntry.url)!;
    const res = await browser.bookmarks.get(id);

    const changes: Partial<{title: string, url: string}> = {};
    const node = res[0];
    const newURL = BrowserBookmarkEntryList.entryToURL(newEntry);
    // const currentEntry = BrowserBookmarkEntryList.URLToEntry(node.url); //used in future

    if (node.title !== newEntry.title) {
      changes.title = newEntry.title;
    }

    if (node.url !== newURL) {
      changes.url = newURL;
    }

    if (Object.keys(changes).length === 0) return true;

    const res2 = await browser.bookmarks.update(id, <any>changes);
    if (res2) return true;

    app.log("error", "ブラウザのブックマーク更新に失敗しました");
    this.validateRootNodeSettings();
    return false;
  }

  private async removeBrowserBookmark(url: string): Promise<boolean> {
    if (this.nodeIdStore.has(url)) {
      this.nodeIdStore.delete(url);
    }

    const res = await browser.bookmarks.getChildren(this.rootNodeId);
    const removeIdList: string[] = [];

    if (res) {
      for(const node of res) {
        if (node.url && node.title) {
          const entry = BrowserBookmarkEntryList.URLToEntry(node.url);

          if (entry && entry.url === url) {
            removeIdList.push(node.id);
          }
        }
      }
    }

    if (removeIdList.length === 0) return false;

    await Promise.all(removeIdList.map( (id) => {
      return browser.bookmarks.remove(id).catch(e => {return});
    }));
    return true;
  }

  async add(entry: Entry, createBrowserBookmark = true): Promise<boolean> {
    entry = app.deepCopy(entry);

    if (!super.add(entry)) return false;

    if (createBrowserBookmark) {
      return this.createBrowserBookmark(entry);
    }
    return true;
  }

  async update(entry: Entry, updateBrowserBookmark = true): Promise<boolean> {
    entry = app.deepCopy(entry);

    if (!super.update(entry)) return false;

    if (updateBrowserBookmark) {
      return this.updateBrowserBookmark(entry);
    }
    return true;
  }

  async remove(url: string, removeBrowserBookmark = true): Promise<boolean> {
    if (!super.remove(url)) return false;

    if (removeBrowserBookmark) {
      return this.removeBrowserBookmark(url);
    }
    return true;
  }
}
