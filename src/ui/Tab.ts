///<reference path="../../node_modules/@types/jquery/index.d.ts" />
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

    constructor (private element: Element) {
      var tab = this;

      $(this.element)
        .addClass("tab")
        .append(
          $("<ul>", {class: "tab_tabbar"}),
          $("<div>", {class: "tab_container"})
        )
        .find(".tab_tabbar")
          .on("notchedmousewheel", (e) => {
            if (app.config.get("mousewheel_change_tab") === "on") {
              var tmp: string, next: Element;

              e.preventDefault();

              if ((<any>e.originalEvent).wheelDelta < 0) {
                tmp = "previousSibling";
              }
              else {
                tmp = "nextSibling";
              }

              next = (tab.element.querySelector("li.tab_selected") || {})[tmp];

              if (next) {
                tab.update(next.getAttribute("data-tabid"), {selected: true});
              }
            }
          })
          .on("mousedown", "li", function (e) {
            if (e.which === 3) {
              return;
            }
            if ((<HTMLElement>e.target).nodeName === "IMG") {
              return;
            }

            if (e.which === 2 && !this.classList.contains("tab_locked")) {
              tab.remove(this.getAttribute("data-tabid"));
            }
            else {
              tab.update(this.getAttribute("data-tabid"), {selected: true});
            }
          })
          .on("mousedown", "img", (e) => {
            e.preventDefault();
          })
          .on("click", "img", function () {
            tab.remove(this.parentNode.getAttribute("data-tabid"));
          });

      new UI.VirtualNotch(this.element.querySelector(".tab_tabbar"));

      window.addEventListener("message", (e) => {
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

        if (!(<HTMLElement>this.element).contains(<HTMLElement>e.source.frameElement)) {
          return;
        }

        tabId = e.source.frameElement.getAttribute("data-tabid");
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
      var li: HTMLLIElement, tmp, res = [];

      tmp = Array.from(this.element.querySelectorAll("li"));

      for (li of tmp) {
        res.push({
          tabId: li.getAttribute("data-tabid"),
          url: li.getAttribute("data-tabsrc"),
          title: li.title,
          selected: li.classList.contains("tab_selected"),
          locked: li.classList.contains("tab_locked")
        });
      }

      return res;
    }

    getSelected (): Object {
      var li: HTMLLIElement;

      if (li = <HTMLLIElement>this.element.querySelector("li.tab_selected")) {
        return {
          tabId: li.getAttribute("data-tabid"),
          url: li.getAttribute("data-tabsrc"),
          title: li.title,
          selected: true,
          locked: li.classList.contains("tab_locked")
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
      if (!this.element.querySelector(".tab_tabbar > li")) {
        param.selected = true;
      }

      $("<li>")
        .attr({"data-tabid": tabId, "data-tabsrc": url})
        .append(
          $("<span>"),
          $("<img>", {src: "/img/close_16x16.webp", title: "閉じる"})
        )
        .appendTo(this.element.querySelector(".tab_tabbar"));

      $("<iframe>", {
          src: param.lazy ? "/view/empty.html" : url,
          class: "tab_content",
          "data-tabid": tabId
        })
        .appendTo(this.element.querySelector(".tab_container"));

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
      var history, $iframe: JQuery, tmp;

      if (typeof param.url === "string") {
        if (!param._internal) {
          history = this.historyStore[tabId];
          history.stack.splice(history.current + 1);
          history.stack.push({url: param.url, title: param.url});
          history.current++;
        }

        $(this.element)
          .find(`li[data-tabid=\"${tabId}\"]`)
            .attr("data-tabsrc", param.url)
          .end()
          .find(`iframe[data-tabid=\"${tabId}\"]`)
            .trigger("tab_beforeurlupdate")
            .attr("src", param.url)
            .trigger("tab_urlupdated");
      }

      if (typeof param.title === "string") {
        tmp = this.historyStore[tabId];
        tmp.stack[tmp.current].title = param.title;

        $(this.element)
          .find(`li[data-tabid=\"${tabId}\"]`)
            .attr("title", param.title)
            .find("span")
              .text(param.title);
      }

      if (param.selected) {
        $iframe = (
          $(this.element)
            .find(".tab_selected")
              .removeClass("tab_selected")
            .end()
            .find(`[data-tabid=\"${tabId}\"]`)
              .addClass("tab_selected")
              .filter(".tab_content")
        );

        // 遅延ロード指定のタブをロードする
        // 連続でlazy指定のタブがaddされた時のために非同期処理
        app.defer(() => {
          var selectedTab, iframe: HTMLIFrameElement;

          if (selectedTab = this.getSelected()) {
            iframe = <HTMLIFrameElement>this.element.querySelector(`iframe[data-tabid=\"${selectedTab.tabId}\"]`);
            if (iframe.getAttribute("src") !== selectedTab.url) {
              iframe.src = selectedTab.url;
            }
          }
        });

        $iframe.trigger("tab_selected");
      }
      if (param.locked) {
        $(this.element)
          .find(`li[data-tabid=\"${tabId}\"]`)
            .addClass("tab_locked")
            .find("img")
              .addClass("hidden");
      } else if (!(param.locked === void 0 || param.locked === null)) {
        $(this.element)
          .find(`li[data-tabid=\"${tabId}\"].tab_locked`)
            .removeClass("tab_locked")
            .find("img")
              .removeClass("hidden");
      }
    }

    remove (tabId: string): void {
      var tab;

      tab = this;

      $(this.element)
        .find(`li[data-tabid=\"${tabId}\"]`)
          .each(function () {
            var tabsrc: string, tmp, key, next;

            tabsrc = this.getAttribute("data-tabsrc");

            for (tmp of tab.recentClosed) {
              if (tmp.url === tabsrc) {
                tab.recentClosed.splice(key, 1);
              }
            }

            tab.recentClosed.push({
              tabId: this.getAttribute("data-tabid"),
              url: tabsrc,
              title: this.title,
              locked: this.classList.contains("tab_locked")
            });

            if (tab.recentClosed.length > 50) {
              tmp = tab.recentClosed.shift();
              delete tab.historyStore[tmp.tabId];
            }

            if (this.classList.contains("tab_selected")) {
              if (next = this.nextElementSibling || this.previousElementSibling) {
                tab.update(next.getAttribute("data-tabid"), {selected: true});
              }
            }
          })
          .remove()
        .end()
        .find(`iframe[data-tabid=\"${tabId}\"]`)
          .trigger("tab_removed")
        .remove();
    }

    getRecentClosed (): any {
      return app.deepCopy(this.recentClosed);
    }

    restoreClosed (tabId: string): string {
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
      var tab = $(this.element).find(`li[data-tabid=\"${tabId}\"]`)
      return tab.length > 0 && tab[0].classList.contains("tab_locked");
    }
  }
}
