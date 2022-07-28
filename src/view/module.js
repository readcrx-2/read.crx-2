(function() {
  if (frameElement) {
    const modules = [
      "BoardTitleSolver",
      "History",
      "WriteHistory",
      "Thread",
      "bookmark",
      "bookmarkEntryList",
      "config",
      "ContextMenus",
      "DOMData",
      "HTTP",
      "ImageReplaceDat",
      "module",
      "ReplaceStrTxt",
      "NG",
      "Notification",
      "ReadState",
      "URL",
      "util"
    ];

    for (let module of modules) {
      app[module] = parent.app[module];
    }

    window.on("unload", function() {
      document.body.removeChildren();
      const app = null;
    });
  }
})();

if (app.view == null) { app.view = {}; }

/**
@namespace app.view
@class View
@constructor
@param {Element} element
*/
app.view.View = class View {
  constructor($element) {
    this.$element = $element;
    this._setupTheme();
    this._setupOpenInRcrx();
  }

  /**
  @method _changeTheme
  @private
  @param {String} themeId
  */
  _changeTheme(themeId) {
    // テーマ適用
    this.$element.removeClass("theme_default", "theme_dark", "theme_none");
    this.$element.addClass(`theme_${themeId}`);
  }

  /**
  @method _setScrollbarDesign
  @private
  @param {String} val
  */
  _setScrollbarDesign(val) {
    if (val === "on") {
      this.$element.addClass("default_scrollbar");
    } else {
      this.$element.removeClass("default_scrollbar");
    }
  }

  /**
  @method _setupTheme
  @private
  */
  _setupTheme() {
    // テーマ適用
    this._changeTheme(app.config.get("theme_id"));
    this._setScrollbarDesign(app.config.get("default_scrollbar"));

    // テーマ更新反映
    app.message.on("config_updated", ({key, val}) => {
      switch (key) {
        case "theme_id": this._changeTheme(val); break;
        case "default_scrollbar": this._setScrollbarDesign(val); break;
      }
    });
  }

  /**
  @method _insertUserCSS
  @private
  */
  _insertUserCSS() {
    const style = $__("style");
    style.id = "user_css";
    style.textContent = app.config.get("user_css");
    document.head.addLast(style);
  }

  /**
  @method _setupOpenInRcrx
  @private
  */
  _setupOpenInRcrx() {
    // .open_in_rcrxリンクの処理
    this.$element.on("mousedown", function(e) {
      const target = e.target.closest(".open_in_rcrx");
      if (target == null) { return; }
      e.preventDefault();
      if (e.button === 2) { return; }
      const url = target.dataset.href || target.href;
      const title = target.dataset.title || target.textContent;
      const writtenResNum = target.getAttr("ignore-res-number") === "on" ? null : target.dataset.writtenResNum;
      const paramResFlg = (
        (app.config.isOn("enable_link_with_res_number") &&
         (target.getAttr("toggle-param-res-num") !== "on")) ||
        (!app.config.isOn("enable_link_with_res_number") &&
         (target.getAttr("toggle-param-res-num") === "on"))
      );
      const paramResNum = paramResFlg ? target.dataset.paramResNum : null;
      target.removeAttr("toggle-param-res-num");
      target.removeAttr("ignore-res-number");
      let {newTab, newWindow, background} = app.util.getHowToOpen(e);
      if (!newTab) { newTab = app.config.isOn("always_new_tab") || newWindow; }

      app.message.send("open", {
        url,
        new_tab: newTab,
        background,
        title,
        written_res_num: writtenResNum,
        param_res_num: paramResNum
      });
    });
    this.$element.on("click", function(e) {
      if (e.target.hasClass("open_in_rcrx")) { e.preventDefault(); }
    });
  }
};

/**
@namespace app.view
@class IframeView
@extends app.view.View
@constructor
@param {Element} element
*/
const Cls = (app.view.IframeView = class IframeView extends app.view.View {
  static initClass() {

    this.prototype._keyboardCommandMap = new Map([
      ["Escape", "clearSelect"],
      ["h", "left"],
      ["H", "focusLeftFrame"],
      ["l", "right"],
      ["L", "focusRightFrame"],
      ["k", "up"],
      ["K", "focusUpFrame"],
      ["j", "down"],
      ["J", "focusDownFrame"],
      ["R", "r"],
      ["W", "q"],
      ["?", "help"]
    ]);
  }
  constructor(element) {
    super(element);

    this._setupKeyboard();
    this._setupCommandBox();
    this._numericInput = "";
  }

  /**
  @method close
  */
  close() {
    parent.postMessage({type: "request_killme"}, location.origin);
  }

  _write(param) {
    let height, htmlname;
    if (param == null) { param = {}; }
    if (this.$element.hasClass("view_thread")) {
      htmlname = "submit_res";
      height = "300";
    } else if (this.$element.hasClass("view_board")) {
      htmlname = "submit_thread";
      height = "400";
    }
    param.title = document.title;
    param.url = this.$element.dataset.url;
    const windowX = app.config.get("write_window_x");
    const windowY = app.config.get("write_window_y");
    open(
      `/write/${htmlname}.html?${app.URL.buildQuery(param)}`,
      undefined,
      `width=600,height=${height},left=${windowX},top=${windowY}`
    );
  }

  /**
  @method execCommand
  @param {String} command
  @param {Number} [repeatCount]
  */
  execCommand(command, repeatCount) {
    // 数値コマンド
    let message;
    let $a;
    if (repeatCount == null) { repeatCount = 1; }
    if (/^\d+$/.test(command)) {
      __guard__(app.DOMData.get(this.$element, "selectableItemList"), x => x.select(+command));
    }

    if (this.$element.hasClass("view_thread")) {
      // 返信レス
      let m, num;
      if (m = /^w(\d+(?:-\d+)?(?:,\d+(?:-\d+)?)*)$/.exec(command)) {
        message = "";
        for (num of m[1].split(",")) {
          message += `>>${num}\n`;
        }
        this._write({message});
      } else if (m = /^w-(\d+(?:,\d+)*)$/.exec(command)) {
        message = "";
        for (num of m[1].split(",")) {
          message += `\
>>${num}
${this.$element.C("content")[0].child()[num-1].$(".message").textContent.replace(/^/gm, '>')}\n\
`;
        }
        this._write({message});
      }
    }
    if (this.$element.hasClass("view_thread") || this.$element.hasClass("view_board")) {
      if (command === "w") {
        this._write();
      }
    }

    switch (command) {
      case "up":
        __guard__(app.DOMData.get(this.$element, "selectableItemList"), x1 => x1.selectPrev(repeatCount));
        break;
      case "down":
        __guard__(app.DOMData.get(this.$element, "selectableItemList"), x2 => x2.selectNext(repeatCount));
        break;
      case "left":
        if (this.$element.hasClass("view_sidemenu")) {
          $a = this.$element.$("li > a.selected");
          if ($a != null) {
            app.DOMData.get(this.$element, "accordion").select($a.closest("ul").prev());
          }
        }
        break;
      case "right":
        if (this.$element.hasClass("view_sidemenu")) {
          $a = this.$element.$("h3.selected + ul a");
          if ($a != null) {
            app.DOMData.get(this.$element, "accordion").select($a);
          }
        }
        break;
      case "clearSelect":
        __guard__(app.DOMData.get(this.$element, "selectableItemList"), x3 => x3.clearSelect());
        break;
      case "focusUpFrame": case "focusDownFrame": case "focusLeftFrame": case "focusRightFrame":
        app.message.send("requestFocusMove", {command, repeatCount});
        break;
      case "r":
        this.$element.emit(new Event("request_reload"));
        break;
      case "q":
        this.close();
        break;
      case "openCommandBox":
        this._openCommandBox();
        break;
      case "enter":
        __guard__(this.$element.C("selected")[0], x4 => x4.emit(
          new Event("mousedown", {bubbles: true})
        ));
        __guard__(this.$element.C("selected")[0], x5 => x5.emit(
          new Event("mouseup", {bubbles: true})
        ));
        break;
      case "shift+enter":
        __guard__(this.$element.C("selected")[0], x6 => x6.emit(
          new MouseEvent("mousedown", {shiftKey: true, bubbles: true})
        ));
        __guard__(this.$element.C("selected")[0], x7 => x7.emit(
          new MouseEvent("mouseup", {shiftKey: true, bubbles: true})
        ));
        break;
      case "help":
        app.message.send("showKeyboardHelp");
        break;
    }
  }

  /**
  @method _setupCommandBox
  */
  _setupCommandBox() {
    const $input = $__("input").addClass("command", "hidden");
    $input.on("keydown", ({key, target}) => {
      switch (key) {
        case "Enter":
          this.execCommand(target.value.replace(/\s/g, ""));
          this._closeCommandBox();
          break;
        case "Escape":
          this._closeCommandBox();
          break;
      }
    });
    this.$element.addLast($input);
  }

  /**
  @method _openCommandBox
  */
  _openCommandBox() {
    const $command = this.$element.C("command")[0];
    app.DOMData.set($command, "lastActiveElement", document.activeElement);
    $command.removeClass("hidden");
    $command.focus();
  }

  /**
  @method _closeCommandBox
  */
  _closeCommandBox() {
    const $command = this.$element.C("command")[0];
    $command.value = "";
    $command.addClass("hidden");
    __guard__(app.DOMData.get($command, "lastActiveElement"), x => x.focus());
  }

  /**
  @method _setupKeyboard
  @private
  */
  _setupKeyboard() {
    this.$element.on("keydown", e => {
      let command;
      const {target, key, shiftKey, ctrlKey, metaKey} = e;
      // F5 or Ctrl+r or ⌘+r
      if ((key === "F5") || ( (ctrlKey || metaKey) && (key === "r"))) {
        e.preventDefault();
        command = "r";
      } else if (ctrlKey || metaKey) {
        return;
      }

      // Windows版ChromeでのBackSpace誤爆対策
      if ((key === "Backspace") && !(["INPUT", "TEXTAREA"].includes(target.tagName))) {
        e.preventDefault();

      // Esc (空白の入力欄に入力された場合)
      } else if (
        (key === "Escape") &&
        ["INPUT", "TEXTAREA"].includes(target.tagName) &&
        (target.value === "") &&
        !target.hasClass("command")
      ) {
        this.$element.C("content")[0].focus();

      // 入力欄内では発動しない系
      } else if (!(["INPUT", "TEXTAREA"].includes(target.tagName))) {
        if (this._keyboardCommandMap.has(key)) {
          command = this._keyboardCommandMap.get(key);
        } else if (key === "Enter") {
          if (shiftKey) {
            command = "shift+enter";
          } else {
            command = "enter";
          }
        } else if (key === ":") {
          e.preventDefault(); // コマンド入力欄に:が入力されるのを防ぐため
          command = "openCommandBox";
        } else if (key === "/") {
          e.preventDefault();
          this.$element.$(".searchbox, form.search > input[type=\"search\"]").focus();
        } else if (/^\d$/.test(key)) {
          // 数値
          this._numericInput += key;
        }
      }

      if (command != null) {
        this.execCommand(command, Math.max(1, +this._numericInput));
      }

      // 0-9かShift以外が押された場合は数値入力を終了
      if (!/^\d$/.test(key) && (key !== "Shift")) {
        this._numericInput = "";
      }
    });
  }
});
Cls.initClass();

/**
@namespace app.view
@class PaneContentView
@extends app.view.IframeView
@constructor
@param {Element} element
*/
app.view.PaneContentView = class PaneContentView extends app.view.IframeView {
  constructor($element) {
    super($element);

    this._setupEventConverter();
    this._insertUserCSS();
  }

  /**
  @method _setupEventConverter
  @private
  */
  _setupEventConverter() {
    window.on("message", ({origin, data: message}) => {
      if (origin !== location.origin) { return; }

      // request_reload(postMessage) -> request_reload(event) 翻訳処理
      if (message.type === "request_reload") {
        this.$element.emit(new CustomEvent(
          "request_reload", {
          detail: {
            force_update: message.force_update === true,
            kind: message.kind != null ? message.kind : null,
            mes: message.mes != null ? message.mes : null,
            name: message.name != null ? message.name : null,
            mail: message.mail != null ? message.mail : null,
            title: message.title != null ? message.title : null,
            thread_url: message.thread_url != null ? message.thread_url : null,
            written_res_num: message.written_res_num != null ? message.written_res_num : null,
            param_res_num: message.param_res_num != null ? message.param_res_num : null
          }
        }
        ));

      // tab_selected(postMessage) -> tab_selected(event) 翻訳処理
      } else if (message.type === "tab_selected") {
        this.$element.emit(new Event("tab_selected", {bubbles: true}));
      }
    });

    // request_focus送出処理
    this.$element.on("mousedown", function({target}) {
      parent.postMessage({
        type: "request_focus",
        focus: !(["INPUT", "TEXTAREA"].includes(target.tagName))
      }, location.origin);
    });

    // view_loaded翻訳処理
    this.$element.on("view_loaded", function() {
      parent.postMessage({type: "view_loaded"}, location.origin);
    });
  }
};

/**
@namespace app.view
@class TabContentView
@extends app.view.PaneContentView
@constructor
@param {Element} element
*/
app.view.TabContentView = class TabContentView extends app.view.PaneContentView {
  constructor(element) {
    super(element);

    this._setupTitleReporter();
    this._setupReloadButton();
    this._setupNavButton();
    this._setupBookmarkButton();
    this._setupSortItemSelector();
    this._setupSchemeButton();
    this._setupAutoReload();
    this._setupRegExpButton();
    this._setupToolMenu();
  }

  /**
  @method _setupTitleReporter
  @private
  */
  _setupTitleReporter() {
    const sendTitleUpdated = () => {
      parent.postMessage({
          type: "title_updated",
          title: this.$element.T("title")[0].textContent
        },
        location.origin
      );
    };

    if (this.$element.T("title")[0].textContent) {
      sendTitleUpdated();
    }

    new MutationObserver( function(recs) {
      sendTitleUpdated();
    }).observe(this.$element.T("title")[0], {childList: true});
  }

  /**
  @method _setupReloadButton
  @private
  */
  _setupReloadButton() {
    // View内リロードボタン
    __guard__(this.$element.C("button_reload")[0], x => x.on("click", ({currentTarget}) => {
      if (!currentTarget.hasClass("disabled")) {
        this.$element.emit(new Event("request_reload"));
      }
    }));
  }

  /**
  @method _setupNavButton
  @private
  */
  _setupNavButton() {
    // 戻る/進むボタン管理
    parent.postMessage({type: "requestTabHistory"}, location.origin);

    window.on("message", ({ origin, data: {type, history: {current, stack} = {}} }) => {
      if ((origin !== location.origin) || (type !== "responseTabHistory")) { return; }
      if (current > 0) {
        this.$element.C("button_back")[0].removeClass("disabled");
      }

      if (current < (stack.length - 1)) {
        this.$element.C("button_forward")[0].removeClass("disabled");
      }

      if ((stack.length === 1) && app.config.isOn("always_new_tab")) {
        this.$element.C("button_back")[0].remove();
        this.$element.C("button_forward")[0].remove();
      }
    });

    for (let dom of this.$element.$$(".button_back, .button_forward")) {
      dom.on("mousedown", function(e) {
        if (e.button !== 2) {
          let {newTab, newWindow, background} = app.util.getHowToOpen(e);
          if (!newTab) { newTab = newWindow; }

          if (this.hasClass("disabled")) { return; }
          const tmp = this.hasClass("button_back") ? "Back" : "Forward";
          parent.postMessage(
            {type: `requestTab${tmp}`, newTab, background},
            location.origin
          );
        }
      });
    }
  }

  /**
  @method _setupBookmarkButton
  @private
  */
  _setupBookmarkButton() {
    const $button = this.$element.C("button_bookmark")[0];

    if (!$button) { return; }
    const {url} = this.$element.dataset;

    if (new RegExp(`^https?://\\w`).test(url)) {
      if (app.bookmark.get(url)) {
        $button.addClass("bookmarked");
      } else {
        $button.removeClass("bookmarked");
      }

      app.message.on("bookmark_updated", function({type, bookmark}) {
        if (bookmark.url === url) {
          if (type === "added") {
            $button.addClass("bookmarked");
          } else if (type === "removed") {
            $button.removeClass("bookmarked");
          }
        }
      });

      $button.on("click", () => {
        if (app.bookmark.get(url)) {
          app.bookmark.remove(url);
        } else {
          let resCount;
          const title = document.title || url;

          if (this.$element.hasClass("view_thread")) {
            resCount = this.$element.C("content")[0].child().length;
          }

          if ((resCount != null) && (resCount > 0)) {
            app.bookmark.add(url, title, resCount);
          } else {
            app.bookmark.add(url, title);
          }
        }
      });
    } else {
      $button.remove();
    }
  }

  /**
  @method _setupSortItemSelector
  @private
  */
  _setupSortItemSelector() {
    const $table = this.$element.C("table_sort")[0];
    const $selector = this.$element.C("sort_item_selector")[0];

    if ($table != null) {
      $table.on("table_sort_updated", function({detail}) {
      for (let dom of $selector.T("option")) {
        dom.selected = false;
        if (String(detail.sort_attribute || detail.sort_index) === dom.dataset.sortIndex) {
          dom.selected = true;
        }
      }
    });
    }

    if ($selector != null) {
      $selector.on("change", function() {
      const $selected = this.child()[this.selectedIndex];
      const config = {};

      config.sortOrder = $selected.dataset.sortOrder || "desc";

      const val = $selected.dataset.sortIndex;
      if (/^\d+$/.test(val)) {
        config.sortIndex = +val;
      } else {
        config.sortAttribute = val;
      }

      app.DOMData.get($table, "tableSorter").update(config);
    });
    }
  }

  /**
  @method _setupSchemeButton
  @private
  */
  _setupSchemeButton() {
    let protocol, urlObj;
    const $button = this.$element.C("button_scheme")[0];

    if (!$button) { return; }
    const {url} = this.$element.dataset;

    if (!url.startsWith("search:") && !/^https?:/.test(url)) {
      $button.remove();
      return;
    }

    const isViewSearch = (url.startsWith("search:"));

    if (isViewSearch) {
      let left;
      protocol = (left = this.$element.getAttr("scheme")+":") != null ? left : "http:";
    } else {
      urlObj = new app.URL.URL(url);
      ({protocol} = urlObj);
    }

    if (protocol === "https:") {
      $button.addClass("https");
    } else {
      $button.removeClass("https");
    }

    $button.on("click", function() {
      const obj =
        {new_tab: app.config.isOn("button_change_scheme_newtab")};
      if (isViewSearch) {
        obj.url = url;
        obj.scheme = protocol === "http:" ? "https" : "http";
      } else {
        obj.url = urlObj.createProtocolToggled().href;
      }
      app.message.send("open", obj);
    });
  }

  /**
  @method _setupAutoReloadPauseButton
  @private
  */
  _setupAutoReload() {
    let cfgName, minSeconds;
    const $button = this.$element.C("button_pause")[0];

    if (
      !this.$element.hasClass("view_thread") &&
      !this.$element.hasClass("view_board") &&
      !this.$element.hasClass("view_bookmark")
    ) {
      if ($button) { $button.remove(); }
      return;
    }

    switch (false) {
      case !this.$element.hasClass("view_thread"):
        cfgName = "";
        minSeconds = 5000;
        break;
      case !this.$element.hasClass("view_board"):
        cfgName = "_board";
        minSeconds = 20000;
        break;
      case !this.$element.hasClass("view_bookmark"):
        cfgName = "_bookmark";
        minSeconds = 20000;
        break;
    }

    const autoLoad = () => {
      const second = parseInt(app.config.get(`auto_load_second${cfgName}`));
      if (second >= minSeconds) {
        this.$element.addClass("autoload");
        $button.removeClass("hidden");
        if (this.$element.hasClass("view_bookmark")) {
          return setInterval( () => {
            this.$element.emit(new CustomEvent("request_reload", {detail: true}));
          }
          , second);
        } else {
          return setInterval( () => {
            const {url} = this.$element.dataset;
            if (
              app.config.isOn("auto_load_all") ||
              parent.$$.$(`.tab_container > iframe[data-url=\"${url}\"]`).hasClass("tab_selected")
            ) {
              this.$element.emit(new Event("request_reload"));
            }
          }
          , second);
        }
      } else {
        this.$element.removeClass("autoload");
        $button.addClass("hidden");
      }
    };

    let autoLoadInterval = autoLoad();

    app.message.on("config_updated", function({key}) {
      if (key === `auto_load_second${cfgName}`) {
        clearInterval(autoLoadInterval);
        autoLoadInterval = autoLoad();
      }
    });

    $button.on("click", () => {
      this.$element.toggleClass("autoload_pause");
      $button.toggleClass("pause");
      if ($button.hasClass("pause")) {
        clearInterval(autoLoadInterval);
      } else {
        autoLoadInterval = autoLoad();
      }
    });

    window.on("view_unload", function() {
      clearInterval(autoLoadInterval);
    });
  }

  /**
  @method _setupRegExpButton
  @private
  */
  _setupRegExpButton() {
    const $button = this.$element.C("button_regexp")[0];

    if (!$button) { return; }
    if (!this.$element.hasClass("view_thread")) {
      if ($button) { $button.remove(); }
      return;
    }

    if (this.$element.hasClass("search_regexp")) {
      $button.addClass("regexp");
    } else {
      $button.removeClass("regexp");
    }

    $button.on("click", () => {
      $button.toggleClass("regexp");
      this.$element.emit(new Event("change_search_regexp"));
    });
  }

  /**
  @method _setupToolMenu
  @private
  */
  _setupToolMenu() {
    //メニューの表示/非表示制御
    __guard__(this.$element.C("button_tool")[0], x => x.on("click", async ({currentTarget}) => {
      const $ul = currentTarget.T("ul")[0];
      $ul.toggleClass("hidden");
      if (!$ul.hasClass("hidden")) { return; }
      await app.defer();
      this.$element.on("click", ({target}) => {
        if (!target.hasClass("button_tool")) {
          this.$element.$(".button_tool > ul").addClass("hidden");
        }
      }
      , {once: true});
      this.$element.on("contextmenu", ({target}) => {
        if (!target.hasClass("button_tool")) {
          this.$element.$(".button_tool > ul").addClass("hidden");
        }
      }
      , {once: true});
    }));

    window.on("blur", () => {
      __guard__(this.$element.$(".button_tool > ul"), x1 => x1.addClass("hidden"));
    });

    // ブラウザで直接開く
    (() => {
      let {url} = this.$element.dataset;

      if (url === "bookmark") {
        if ("&[BROWSER]" === "chrome") {
          url = `chrome://bookmarks/?id=${app.config.get("bookmark_id")}`;
        } else {
          __guard__(this.$element.$(".button_link > a"), x1 => x1.remove());
        }
      } else if (url != null ? url.startsWith("search:") : undefined) {
        return;
      } else {
        url = app.safeHref(url);
      }

      __guard__(this.$element.$(".button_link > a"), x2 => x2.on("click", function(e) {
        e.preventDefault();

        parent.browser.tabs.create({url});
      }));
    })();

    // dat落ちを表示/非表示
    __guard__(this.$element.C("button_toggle_dat")[0], x1 => x1.on("click", () => {
      for (let dom of this.$element.C("expired")) {
        dom.toggleClass("hidden");
      }
    }));

    // 未読スレッドを全て開く
    __guard__(this.$element.C("button_open_updated")[0], x2 => x2.on("click", () => {
      for (let dom of this.$element.C("updated")) {
        let {href: url, title} = dom.dataset;
        title = app.util.decodeCharReference(title);
        const lazy = app.config.isOn("open_all_unread_lazy");

        app.message.send("open", {url, title, new_tab: true, lazy});
      }
    }));

    // タイトルをコピー
    __guard__(this.$element.C("button_copy_title")[0], x3 => x3.on("click", () => {
      app.clipboardWrite(document.title);
    }));

    // URLをコピー
    __guard__(this.$element.C("button_copy_url")[0], x4 => x4.on("click", () => {
      app.clipboardWrite(this.$element.dataset.url);
    }));

    // タイトルとURLをコピー
    __guard__(this.$element.C("button_copy_title_and_url")[0], x5 => x5.on("click", () => {
      app.clipboardWrite(document.title + " " + this.$element.dataset.url);
    }));

    return (() => {
      let needle;
      const urlStr = this.$element.dataset.url;
      if (!/^https?:/.test(urlStr)) { return; }
      const url = new app.URL.URL(urlStr);

      // 2ch.net/2ch.scに切り替え
      if ((needle = url.getTsld(), ["5ch.net", "2ch.sc"].includes(needle))) {
        __guard__(this.$element.C("button_change_netsc")[0], x6 => x6.on("click", async () => {
          try {
            app.message.send("open", {
              url: (await url.createNetScConverted()).href,
              new_tab: app.config.isOn("button_change_netsc_newtab")
            }
            );
          } catch (error) {
            const msg = `\
スレッド/板のURLが古いか新しいため、板一覧に5ch.netと2ch.scのペアが存在しません。
板一覧が更新されるのを待つか、板一覧を更新してみてください。\
`;
            new app.Notification("現在この機能は使用できません", msg, "", "invalid");
          }
        }));
      } else {
        __guard__(this.$element.C("button_change_netsc")[0], x7 => x7.remove());
      }

      //2ch.scでscの投稿だけ表示(スレ&レス)
      if (url.getTsld() === "2ch.sc") {
        __guard__(this.$element.C("button_only_sc")[0], x8 => x8.on("click", () => {
          for (let dom of this.$element.C("net")) {
            dom.toggleClass("hidden");
          }
        }));
      } else {
        __guard__(this.$element.C("button_only_sc")[0], x9 => x9.remove());
      }
    })();
  }
};

function __guard__(value, transform) {
  return (typeof value !== 'undefined' && value !== null) ? transform(value) : undefined;
}
