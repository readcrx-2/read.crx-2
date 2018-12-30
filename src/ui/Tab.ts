import VirtualNotch from "./VirtualNotch"

// T型のK以外のプロパティを持つ型
type Omit<T, K> = Pick<T, Exclude<keyof T, K>>

interface TabInfo {
  tabId: string;
  url: string;
  title: string;
  selected: boolean;
  locked: boolean;
}

interface FormatedUrlTabInfo extends TabInfo {
  formatedUrl: string;
}

type ClosedTabInfo = Omit<TabInfo, "selected">
type SavedTabInfo = Omit<TabInfo,  "tabId">

interface AddTabInfo {
  title: string|null;
  selected: boolean;
  locked: boolean;
  lazy: boolean;
  restore: boolean;
}

interface UpdateTabInfo extends SavedTabInfo {
  restore: boolean;
  _internal: boolean;
}

interface TabHistory {
  current: number;
  stack: {url: string, title: string}[];
}

export default class Tab {
  private static idSeed = 0;
  private static tabA: Tab|null = null;
  private static tabB: Tab|null = null;
  private recentClosed: ClosedTabInfo[] = [];
  private historyStore: Map<string, TabHistory>  = new Map();

  private static genId(): string {
    return "tabId" + ++Tab.idSeed;
  }

  public static saveTabs() {
    const data: SavedTabInfo[] = [];
    for (const {formatedUrl, title, selected, locked} of this.tabA!.getAll().concat(this.tabB!.getAll())) {
      data.push({
        url: formatedUrl,
        title,
        selected,
        locked
      });
    }
    localStorage.tab_state = JSON.stringify(data);
  }

  constructor(private $element: Element) {
    const tab: Tab = this;

    const $ele = this.$element.addClass("tab");
    const $ul = $__("ul").addClass("tab_tabbar");
    $ul.on("notchedmousewheel", (e) => {
      if (app.config.isOn("mousewheel_change_tab")) {
        e.preventDefault();

        const tmp = (e.wheelDelta < 0) ? "prev" : "next";
        const next = (tab.$element.$("li.tab_selected") || {})[tmp]();

        if (next) {
          tab.update(next.dataset.tabid!, {selected: true});
        }
      }
    });
    $ul.on("mousedown", (e) => {
      if (e.target.tagName === "IMG") {
        e.preventDefault();
        return;
      }
      const target = e.target.closest("li")
      if (target === null) return;
      if (e.button === 2) return;

      if (e.button === 1 && !target.hasClass("tab_locked")) {
        tab.remove(target.dataset.tabid!);
      } else {
        tab.update(target.dataset.tabid!, {selected: true});
      }
    });
    $ul.on("click", ({target}) => {
      if (target.tagName === "IMG") {
        tab.remove(target.parent().dataset.tabid);
      }
    });
    new VirtualNotch($ul);
    const $div = $__("div").addClass("tab_container");
    $ele.addLast($ul, $div);

    window.on("message", ({ origin, data: message, source }) => {
      if (origin !== location.origin) return;
      if (![
          "requestTabHistory",
          "requestTabBack",
          "requestTabForward"
        ].includes(message.type)) {
        return;
      }
      if (!this.$element.contains(source.frameElement)) {
        return;
      }

      const tabId = source.frameElement.dataset.tabid!;
      const history = this.historyStore.get(tabId)!;

      switch (message.type) {
        case "requestTabHistory":
          source.postMessage({
            type: "responseTabHistory",
            history
          }, origin);
          break;
        case "requestTabBack":
          if (history.current > 0) {
            if (message.newTab) {
              this.add(history.stack[history.current-1].url, {
                title: history.stack[history.current-1].title,
                selected: !message.background,
                lazy: message.background
              })
            } else {
              history.current--;
              this.update(tabId, {
                title: history.stack[history.current].title,
                url: history.stack[history.current].url,
                _internal: true
              })
            }
          }
          break;
        case "requestTabForward":
          if (history.current < history.stack.length - 1) {
            if (message.newTab) {
              this.add(history.stack[history.current+1].url, {
                title: history.stack[history.current+1].title,
                selected: !message.background,
                lazy: message.background
              })
            } else {
              history.current++;
              this.update(tabId, {
                title: history.stack[history.current].title,
                url: history.stack[history.current].url,
                _internal: true
              })
            }
          }
          break;
      }
    });
  }

  getAll(): FormatedUrlTabInfo[] {
    const res: FormatedUrlTabInfo[] = [];

    for (const li of this.$element.$$("li")) {
      res.push({
        tabId: li.dataset.tabid!,
        url: li.dataset.tabsrc!,
        formatedUrl: this.$element.$(`iframe[data-tabid=${li.dataset.tabid!}]`).dataset.url,
        title: li.title,
        selected: li.hasClass("tab_selected"),
        locked: li.hasClass("tab_locked")
      });
    }

    return res;
  }

  getSelected(): TabInfo|null {
    const li = this.$element.$("li.tab_selected");

    if (!li) return null;

    return {
      tabId: li.dataset.tabid,
      url: li.dataset.tabsrc,
      title: li.title,
      selected: true,
      locked: li.hasClass("tab_locked")
    };
  }

  add (
    url: string,
    {
      title = null,
      selected = true,
      locked = false,
      lazy = false,
      restore = false
    }: Partial<AddTabInfo> = {}
  ): string {
    title = title === null ? url : title;

    const tabId = Tab.genId();

    this.historyStore.set(tabId, {
      current: 0,
      stack: [{url: url, title: url}]
    });

    // 既存のタブが一つも無い場合、強制的にselectedオン
    if (!this.$element.$(".tab_tabbar > li")) {
      selected = true;
    }

    const $li = $__("li");
    $li.dataset.tabid = tabId;
    $li.dataset.tabsrc = url;
    const $img = $__("img");
    $img.src = "/img/close_16x16.&[IMG_EXT]";
    $img.title = "閉じる";
    $li.addLast($__("span"), $img);
    this.$element.$(".tab_tabbar").addLast($li);

    const $iframe = $__("iframe").addClass("tab_content");
    $iframe.src = lazy ? "/view/empty.html" : url;
    $iframe.dataset.tabid = tabId;
    this.$element.$(".tab_container").addLast($iframe);

    this.update(tabId, {title, selected, locked, restore});

    return tabId;
  }

  async update (
    tabId: string,
    param: Partial<UpdateTabInfo>
  ) {
    if (typeof param.url === "string") {
      if (!param._internal) {
        const history = this.historyStore.get(tabId)!;
        history.stack.splice(history.current + 1);
        history.stack.push({url: param.url, title: param.url});
        history.current++;
      }

      this.$element.$(`li[data-tabid="${tabId}"]`).dataset.tabsrc = param.url;
      const $tmptab = this.$element.$(`iframe[data-tabid="${tabId}"]`);
      $tmptab.emit(new Event("tab_beforeurlupdate", {"bubbles": true}));
      $tmptab.src = param.url;
      $tmptab.emit(new Event("tab_urlupdated", {"bubbles": true}));
    }

    if (typeof param.title === "string") {
      const history = this.historyStore.get(tabId)!;
      history.stack[history.current].title = param.title;

      const $tmptab = this.$element.$(`li[data-tabid="${tabId}"]`);
      $tmptab.setAttr("title", param.title);
      $tmptab.T("span")[0].textContent = param.title;
    }

    if (param.selected) {
      let $iframe;
      const $selected = this.$element.C("tab_selected");
      for (let i = $selected.length-1; i >= 0; i--) {
        $selected[i].removeClass("tab_selected");
      }
      for (const dom of this.$element.$$(`[data-tabid="${tabId}"]`)) {
        dom.addClass("tab_selected");
        if (dom.hasClass("tab_content")) {
          $iframe = dom;
        }
      }

      $iframe.emit(new Event("tab_selected", {"bubbles": true}));

      // 遅延ロード指定のタブをロードする
      // 連続でlazy指定のタブがaddされた時のために非同期処理
      await app.defer();

      const selectedTab = this.getSelected();
      if (selectedTab) {
        const iframe = this.$element.$(`iframe[data-tabid="${selectedTab.tabId}"]`);
        if (iframe.getAttr("src") !== selectedTab.url) {
          iframe.src = selectedTab.url;
        }
      }
    }
    if (param.locked) {
      const $tmptab = this.$element.$(`li[data-tabid="${tabId}"]`);
      $tmptab.addClass("tab_locked");
    } else if (!(param.locked === void 0 || param.locked === null)) {
      const $tmptab = this.$element.$(`li[data-tabid="${tabId}"].tab_locked`);
      if ($tmptab !== null) {
        $tmptab.removeClass("tab_locked");
      }
    }

    if (!param.restore) {
      Tab.saveTabs()
    }
  }

  remove(tabId: string): void {
    const tab: Tab = this;
    const $tmptab = this.$element.$(`li[data-tabid="${tabId}"]`);
    const tabsrc = $tmptab.dataset.tabsrc;

    for (const [key, {url}] of tab.recentClosed.entries()) {
      if (url === tabsrc) {
        tab.recentClosed.splice(key, 1);
      }
    }

    tab.recentClosed.push({
      tabId: $tmptab.dataset.tabid,
      url: tabsrc,
      title: $tmptab.title,
      locked: $tmptab.hasClass("tab_locked")
    });

    if (tab.recentClosed.length > 50) {
      const tmp = tab.recentClosed.shift()!;
      tab.historyStore.delete(tmp.tabId);
    }

    if ($tmptab.hasClass("tab_selected")) {
      const next = $tmptab.next() || $tmptab.prev();
      if (next) {
        tab.update(next.dataset.tabid, {selected: true});
      }
    }
    $tmptab.remove();

    const $tmptabcon = this.$element.$(`iframe[data-tabid="${tabId}"]`);
    $tmptabcon.emit(new Event("tab_removed", {"bubbles": true}));
    $tmptabcon.remove();

    Tab.saveTabs()
  }

  getRecentClosed(): ClosedTabInfo[] {
    return app.deepCopy(this.recentClosed);
  }

  restoreClosed(tabId: string): string|null {
    for (const [key, tab] of this.recentClosed.entries()) {
      if (tab.tabId === tabId) {
        this.recentClosed.splice(key, 1);
        return this.add(tab.url, {title: tab.title});
      }
    }
    return null;
  }

  isLocked(tabId: string): boolean {
    const tab = this.$element.$(`li[data-tabid="${tabId}"]`);
    return (tab !== null && tab.hasClass("tab_locked"));
  }
}
