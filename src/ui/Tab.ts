///<reference path="../app.ts" />
///<reference path="VirtualNotch.ts" />

namespace UI {
  "use strict";

  export class Tab {
    private static idSeed = 0;
    private recentClosed = [];
    private historyStore = {};

    private static genId (): string {
      return "tabId" + ++Tab.idSeed;
    }

    constructor (private $element: Element) {
      var tab = this;

      var $ele = this.$element;
      $ele.addClass("tab");
      var $ul = $__("ul");
      $ul.addClass("tab_tabbar");
      $ul.on("notchedmousewheel", (e) => {
        if (app.config.get("mousewheel_change_tab") === "on") {
          var tmp: string, next: HTMLElement;

          e.preventDefault();

          if ((<any>e).wheelDelta < 0) {
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
      $ul.on("mousedown", function (e) {
        if ((<HTMLElement>e.target).tagName === "IMG") {
          e.preventDefault();
          return;
        }
        var target = (<HTMLElement>(<HTMLElement>e.target).closest("li"))
        if (target === null) {
          return;
        }
        if (e.which === 3) {
          return;
        }

        if (e.which === 2 && !target.hasClass("tab_locked")) {
          tab.remove(target.dataset.tabid!);
        }
        else {
          tab.update(target.dataset.tabid!, {selected: true});
         }
      });
      $ul.on("click", function (e) {
        var target = <HTMLElement>e.target;
        if (target.tagName === "IMG") {
          tab.remove(<string>target.parent().dataset.tabid);
        }
      });
      new UI.VirtualNotch($ul);
      $ele.addLast($ul);
      var $div = $__("div");
      $div.addClass("tab_container");
      $ele.addLast($div);

      window.on("message", (e) => {
        var message, tabId: string, history;

        if (e.origin !== location.origin || typeof e.data !== "string") {
          return
        }

        message = JSON.parse(e.data);

        if (![
            "requestTabHistory",
            "requestTabBack",
            "requestTabForward"
          ].includes(message.type)) {
          return;
        }

        if (!(<HTMLElement>this.$element).contains(<HTMLElement>e.source.frameElement)) {
          return;
        }

        tabId = (<HTMLElement>e.source.frameElement).dataset.tabid!;
        history = this.historyStore[tabId];

        if (message.type === "requestTabHistory") {
          message = JSON.stringify({
            type: "responseTabHistory",
            history: history
          });
          e.source.postMessage(message, e.origin);
        }
        else if (message.type === "requestTabBack") {
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
        }
        else if (message.type === "requestTabForward") {
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
        }
      });
    }

    getAll (): any {
      var li: HTMLLIElement, res:Object[] = [];

      for (li of this.$element.$$("li")) {
        res.push({
          tabId: li.dataset.tabid!,
          url: li.dataset.tabsrc!,
          title: li.title,
          selected: li.hasClass("tab_selected"),
          locked: li.hasClass("tab_locked")
        });
      }

      return res;
    }

    getSelected (): Object|null {
      var li: HTMLLIElement;

      if (li = <HTMLLIElement>this.$element.$("li.tab_selected")) {
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
      param: {title?: string; selected?: boolean; locked?: boolean; lazy?: boolean} =
        {title: undefined, selected: undefined, locked: undefined, lazy: undefined}
    ): string {
      var tabId: string;

      param.title = param.title === undefined ? url : param.title;
      param.selected = param.selected === undefined ? true : param.selected;
      param.locked = param.locked === undefined ? false : param.locked;
      param.lazy = param.lazy === undefined ? false : param.lazy;

      tabId = Tab.genId();

      this.historyStore[tabId] = {
        current: 0,
        stack: [{url: url, title: url}]
      };

      // 既存のタブが一つも無い場合、強制的にselectedオン
      if (!this.$element.$(".tab_tabbar > li")) {
        param.selected = true;
      }

      var $li = $__("li");
      $li.dataset.tabid = tabId;
      $li.dataset.tabsrc = url;
      $li.addLast($__("span"));
      var $img = $__("img");
      $img.src = "/img/close_16x16.webp";
      $img.title = "閉じる";
      $li.addLast($img);
      this.$element.$(".tab_tabbar").addLast($li);

      var $iframe = $__("iframe");
      $iframe.src = param.lazy ? "/view/empty.html" : url;
      $iframe.addClass("tab_content");
      $iframe.dataset.tabid = tabId;
      this.$element.$(".tab_container").addLast($iframe);

      this.update(tabId, {title: param.title, selected: param.selected, locked: param.locked});

      return tabId;
    }

    update (
      tabId: string,
      param: {
        url?: string;
        title?: string;
        selected?: boolean;
        locked?: boolean;
        _internal?: boolean;
      }
    ): void {
      var history, $tmptab, $iframe, tmp;

      if (typeof param.url === "string") {
        if (!param._internal) {
          history = this.historyStore[tabId];
          history.stack.splice(history.current + 1);
          history.stack.push({url: param.url, title: param.url});
          history.current++;
        }

        this.$element.$(`li[data-tabid=\"${tabId}\"]`).dataset.tabsrc = param.url;
        $tmptab = this.$element.$(`iframe[data-tabid=\"${tabId}\"]`);
        $tmptab.dispatchEvent(new Event("tab_beforeurlupdate", {"bubbles": true}));
        $tmptab.src = param.url;
        $tmptab.dispatchEvent(new Event("tab_urlupdated", {"bubbles": true}));
      }

      if (typeof param.title === "string") {
        tmp = this.historyStore[tabId];
        tmp.stack[tmp.current].title = param.title;

        $tmptab = this.$element.$(`li[data-tabid=\"${tabId}\"]`);
        $tmptab.setAttr("title", param.title);
        $tmptab.T("span")[0].textContent = param.title;
      }

      if (param.selected) {
        var $selected = this.$element.C("tab_selected");
        for (var i = $selected.length-1; i >= 0; i--) {
          $selected[i].removeClass("tab_selected");
        }
        for (var dom of this.$element.$$(`[data-tabid=\"${tabId}\"]`)) {
          dom.addClass("tab_selected");
          if (dom.hasClass("tab_content")) {
            $iframe = dom;
          }
        }

        // 遅延ロード指定のタブをロードする
        // 連続でlazy指定のタブがaddされた時のために非同期処理
        app.defer(() => {
          var selectedTab, iframe: HTMLIFrameElement;

          if (selectedTab = this.getSelected()) {
            iframe = <HTMLIFrameElement>this.$element.$(`iframe[data-tabid=\"${selectedTab.tabId}\"]`);
            if (iframe.getAttr("src") !== selectedTab.url) {
              iframe.src = selectedTab.url;
            }
          }
        });

        $iframe.dispatchEvent(new Event("tab_selected", {"bubbles": true}));
      }
      if (param.locked) {
        $tmptab = this.$element.$(`li[data-tabid=\"${tabId}\"]`);
        $tmptab.addClass("tab_locked");
      } else if (!(param.locked === void 0 || param.locked === null)) {
        $tmptab = this.$element.$(`li[data-tabid=\"${tabId}\"].tab_locked`);
        if ($tmptab !== null) {
          $tmptab.removeClass("tab_locked");
        }
      }
    }

    remove (tabId: string): void {
      var tab, $tmptab, $tmptabcon, tabsrc: string, tmp, key, next;

      tab = this;

      $tmptab = this.$element.$(`li[data-tabid=\"${tabId}\"]`);
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

      $tmptabcon = this.$element.$(`iframe[data-tabid=\"${tabId}\"]`);
      $tmptabcon.dispatchEvent(new Event("tab_removed", {"bubbles": true}));
      $tmptabcon.remove();
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
      var tab = this.$element.$$(`li[data-tabid=\"${tabId}\"]`)
      return tab.length > 0 && tab[0].hasClass("tab_locked");
    }
  }
}
