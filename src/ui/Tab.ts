///<reference path="../global.d.ts" />
import VirtualNotch from "./VirtualNotch"

export default class Tab {
  private static idSeed = 0;
  private static tabA: Tab|null = null;
  private static tabB: Tab|null = null;
  private recentClosed = [];
  private historyStore = {};

  private static genId (): string {
    return "tabId" + ++Tab.idSeed;
  }

  public static saveTabs (): void {
    var data: any[] = [];
    for (var {formatedUrl, title, selected, locked} of this.tabA!.getAll().concat(this.tabB!.getAll())) {
      data.push({
        url: formatedUrl,
        title,
        selected,
        locked
      });
    }
    localStorage.tab_state = JSON.stringify(data);
  }

  constructor (private $element: Element) {
    var tab = this;

    var $ele = this.$element.addClass("tab");
    var $ul = $__("ul").addClass("tab_tabbar");
    $ul.on("notchedmousewheel", (e) => {
      if (app.config.isOn("mousewheel_change_tab")) {
        var tmp: string, next: HTMLElement;

        e.preventDefault();

        if (e.wheelDelta < 0) {
          tmp = "prev";
        }
        else {
          tmp = "next";
        }

        next = (tab.$element.$("li.tab_selected") || {})[tmp]();

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
      var target = e.target.closest("li")
      if (target === null) return;
      if (e.button === 2) return;

      if (e.button === 1 && !target.hasClass("tab_locked")) {
        tab.remove(target.dataset.tabid!);
      }
      else {
        tab.update(target.dataset.tabid!, {selected: true});
      }
    });
    $ul.on("click", ({target}) => {
      if (target.tagName === "IMG") {
        tab.remove(target.parent().dataset.tabid);
      }
    });
    new VirtualNotch($ul);
    var $div = $__("div").addClass("tab_container");
    $ele.addLast($ul, $div);

    window.on("message", ({ origin, data: message, source }) => {
      var message, tabId: string, history;

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

      tabId = source.frameElement.dataset.tabid!;
      history = this.historyStore[tabId];

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

  getAll (): any {
    var li: HTMLLIElement, res:Object[] = [];

    for (li of this.$element.$$("li")) {
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

  getSelected (): Object|null {
    var li: HTMLLIElement;

    if (li = this.$element.$("li.tab_selected")) {
      return {
        tabId: li.dataset.tabid,
        url: li.dataset.tabsrc,
        title: li.title,
        selected: true,
        locked: li.hasClass("tab_locked")
      };
    }
    else {
      return null;
    }
  }

  add (
    url: string,
    {
      title = null,
      selected = true,
      locked = false,
      lazy = false,
      restore = false
    }: Partial<{
      title: string|null,
      selected: boolean,
      locked: boolean,
      lazy: boolean,
      restore: boolean
    }> = {}
  ): string {
    var tabId: string;

    title = title === null ? url : title;

    tabId = Tab.genId();

    this.historyStore[tabId] = {
      current: 0,
      stack: [{url: url, title: url}]
    };

    // 既存のタブが一つも無い場合、強制的にselectedオン
    if (!this.$element.$(".tab_tabbar > li")) {
      selected = true;
    }

    var $li = $__("li");
    $li.dataset.tabid = tabId;
    $li.dataset.tabsrc = url;
    var $img = $__("img");
    $img.src = "/img/close_16x16.&[IMG_EXT]";
    $img.title = "閉じる";
    $li.addLast($__("span"), $img);
    this.$element.$(".tab_tabbar").addLast($li);

    var $iframe = $__("iframe").addClass("tab_content");
    $iframe.src = lazy ? "/view/empty.html" : url;
    $iframe.dataset.tabid = tabId;
    this.$element.$(".tab_container").addLast($iframe);

    this.update(tabId, {title, selected, locked, restore});

    return tabId;
  }

  async update (
    tabId: string,
    param: Partial<{
      url: string,
      title: string,
      selected: boolean,
      locked: boolean,
      restore: boolean,
      _internal: boolean
    }>
  ): Promise<void> {
    var history, $tmptab, $iframe, tmp;

    if (typeof param.url === "string") {
      if (!param._internal) {
        history = this.historyStore[tabId];
        history.stack.splice(history.current + 1);
        history.stack.push({url: param.url, title: param.url});
        history.current++;
      }

      this.$element.$(`li[data-tabid="${tabId}"]`).dataset.tabsrc = param.url;
      $tmptab = this.$element.$(`iframe[data-tabid="${tabId}"]`);
      $tmptab.emit(new Event("tab_beforeurlupdate", {"bubbles": true}));
      $tmptab.src = param.url;
      $tmptab.emit(new Event("tab_urlupdated", {"bubbles": true}));
    }

    if (typeof param.title === "string") {
      tmp = this.historyStore[tabId];
      tmp.stack[tmp.current].title = param.title;

      $tmptab = this.$element.$(`li[data-tabid="${tabId}"]`);
      $tmptab.setAttr("title", param.title);
      $tmptab.T("span")[0].textContent = param.title;
    }

    if (param.selected) {
      var $selected = this.$element.C("tab_selected");
      for (var i = $selected.length-1; i >= 0; i--) {
        $selected[i].removeClass("tab_selected");
      }
      for (var dom of this.$element.$$(`[data-tabid="${tabId}"]`)) {
        dom.addClass("tab_selected");
        if (dom.hasClass("tab_content")) {
          $iframe = dom;
        }
      }

      $iframe.emit(new Event("tab_selected", {"bubbles": true}));

      // 遅延ロード指定のタブをロードする
      // 連続でlazy指定のタブがaddされた時のために非同期処理
      await app.defer();
      var selectedTab, iframe: HTMLIFrameElement;

      if (selectedTab = this.getSelected()) {
        iframe = this.$element.$(`iframe[data-tabid="${selectedTab.tabId}"]`);
        if (iframe.getAttr("src") !== selectedTab.url) {
          iframe.src = selectedTab.url;
        }
      }
    }
    if (param.locked) {
      $tmptab = this.$element.$(`li[data-tabid="${tabId}"]`);
      $tmptab.addClass("tab_locked");
    } else if (!(param.locked === void 0 || param.locked === null)) {
      $tmptab = this.$element.$(`li[data-tabid="${tabId}"].tab_locked`);
      if ($tmptab !== null) {
        $tmptab.removeClass("tab_locked");
      }
    }

    if (!param.restore) {
      Tab.saveTabs()
    }
  }

  remove (tabId: string): void {
    var tab, $tmptab, $tmptabcon, tabsrc: string, tmp, key, next;

    tab = this;

    $tmptab = this.$element.$(`li[data-tabid="${tabId}"]`);
    tabsrc = $tmptab.dataset.tabsrc;

    for (tmp of tab.recentClosed) {
      if (tmp.url === tabsrc) {
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
      tmp = tab.recentClosed.shift();
      delete tab.historyStore[tmp.tabId];
    }

    if ($tmptab.hasClass("tab_selected")) {
      if (next = $tmptab.next() || $tmptab.prev()) {
        tab.update(next.dataset.tabid, {selected: true});
      }
    }
    $tmptab.remove();

    $tmptabcon = this.$element.$(`iframe[data-tabid="${tabId}"]`);
    $tmptabcon.emit(new Event("tab_removed", {"bubbles": true}));
    $tmptabcon.remove();

    Tab.saveTabs()
  }

  getRecentClosed (): any {
    return app.deepCopy(this.recentClosed);
  }

  restoreClosed (tabId: string): string|null {
    var tab, key;

    for (tab of this.recentClosed) {
      if (tab.tabId === tabId) {
        this.recentClosed.splice(key, 1);
        return this.add(tab.url, {title: tab.title});
      }
    }

    return null;
  }

  isLocked (tabId: string): boolean {
    var tab = this.$element.$(`li[data-tabid="${tabId}"]`);
    return (tab !== null && tab.hasClass("tab_locked"));
  }
}
