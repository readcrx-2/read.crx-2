// TODO: This file was created by bulk-decaffeinate.
// Sanity-check the conversion and remove this comment.
/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS103: Rewrite code to no longer use __guard__, or convert again using --optional-chaining
 * DS206: Consider reworking classes to avoid initClass
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
class SettingIO {
  static initClass() {
    this.prototype.importFile = "";
  }
  constructor({
    name,
    importFunc,
    exportFunc
  }) {
    this.name = name;
    this.importFunc = importFunc;
    this.exportFunc = exportFunc;
    this.$status = $$.I(`${this.name}_status`);
    if (this.importFunc != null) {
      this.$fileSelectButton = $$.C(`${this.name}_file_show`)[0];
      this.$fileSelectButtonHidden = $$.C(`${this.name}_file_hide`)[0];
      this.$importButton = $$.C(`${this.name}_import_button`)[0];
      this.setupFileSelectButton();
      this.setupImportButton();
    }
    if (this.exportFunc != null) {
      this.$exportButton = $$.C(`${this.name}_export_button`)[0];
      this.setupExportButton();
    }
  }
  setupFileSelectButton() {
    this.$fileSelectButton.on("click", () => {
      if (!_checkExcute(this.name, "file_select")) { return; }
      this.$status.setClass("");
      this.$fileSelectButtonHidden.click();
      _clearExcute();
    });
    this.$fileSelectButtonHidden.on("change", e => {
      const file = e.target.files;
      const reader = new FileReader();
      reader.readAsText(file[0]);
      reader.onload = () => {
        this.importFile = reader.result;
        this.$status.addClass("select");
        this.$status.textContent = "ファイル選択完了";
      };
    });
  }
  setupImportButton() {
    this.$importButton.on("click", async () => {
      if (!_checkExcute(this.name, "import")) { return; }
      if (this.importFile !== "") {
        this.$status.setClass("loading");
        this.$status.textContent = "更新中";
        try {
          await this.importFunc(this.importFile);
          this.$status.addClass("done");
          this.$status.textContent = "インポート完了";
        } catch (error) {
          this.$status.addClass("fail");
          this.$status.textContent = "インポート失敗";
        }
      } else {
        this.$status.addClass("fail");
        this.$status.textContent = "ファイルを選択してください";
      }
      _clearExcute();
    });
  }
  setupExportButton() {
    this.$exportButton.on("click", () => {
      if (!_checkExcute(this.name, "export")) { return; }
      const blob = new Blob([this.exportFunc()], {type: "text/plain"});
      const $a = $__("a").addClass("hidden");
      const url = URL.createObjectURL(blob);
      $a.href = url;
      $a.download = `read.crx-2_${this.name}.json`;
      this.$exportButton.addAfter($a);
      $a.click();
      $a.remove();
      URL.revokeObjectURL(url);
      _clearExcute();
    });
  }
}
SettingIO.initClass();

class HistoryIO extends SettingIO {
  constructor({
    name,
    countFunc,
    importFunc,
    exportFunc,
    clearFunc,
    clearRangeFunc,
    afterChangedFunc
  }) {
    super({
      name,
      importFunc,
      exportFunc
    });
    this.name = name;
    this.countFunc = countFunc;
    this.importFunc = importFunc;
    this.exportFunc = exportFunc;
    this.clearFunc = clearFunc;
    this.clearRangeFunc = clearRangeFunc;
    this.afterChangedFunc = afterChangedFunc;

    this.$count = $$.I(`${this.name}_count`);
    this.$progress = $$.I(`${this.name}_progress`);

    this.$clearButton = $$.C(`${this.name}_clear`)[0];
    this.$clearRangeButton = $$.C(`${this.name}_range_clear`)[0];

    this.showCount();
    this.setupClearButton();
    this.setupClearRangeButton();
  }
  async showCount() {
    const count = await this.countFunc();
    this.$count.textContent = `${count}件`;
  }
  setupClearButton() {
    this.$clearButton.on("click", async () => {
      if (!_checkExcute(this.name, "clear")) { return; }
      const result = await UI.Dialog("confirm",
        {message: "本当に削除しますか？"}
      );
      if (!result) {
        _clearExcute();
        return;
      }
      this.$status.textContent = ":削除中";

      try {
        await this.clearFunc();
        this.$status.textContent = ":削除完了";
        __guard__(parent.$$.$(`iframe[src=\"/view/${this.name}.html\"]`), x => x.contentDocument.C("view")[0].emit(new Event("request_reload")));
      } catch (error) {
        this.$status.textContent = ":削除失敗";
      }

      this.showCount();
      this.afterChangedFunc();
      _clearExcute();
    });
  }
  setupClearRangeButton() {
    this.$clearRangeButton.on("click", async () => {
      if (!_checkExcute(this.name, "clear_range")) { return; }
      const result = await UI.Dialog("confirm",
        {message: "本当に削除しますか？"}
      );
      if (!result) {
        _clearExcute();
        return;
      }
      this.$status.textContent = ":範囲指定削除中";

      try {
        await this.clearRangeFunc(parseInt($$.C(`${this.name}_date_range`)[0].value));
        this.$status.textContent = ":範囲指定削除完了";
        __guard__(parent.$$.$(`iframe[src=\"/view/${this.name}.html\"]`), x => x.contentDocument.C("view")[0].emit(new Event("request_reload")));
      } catch (error) {
        this.$status.textContent = ":範囲指定削除失敗";
      }

      this.showCount();
      this.afterChangedFunc();
      _clearExcute();
    });
  }
  setupImportButton() {
    this.$importButton.on("click", async () => {
      if (!_checkExcute(this.name, "import")) { return; }
      if (this.importFile !== "") {
        this.$status.setClass("loading");
        this.$status.textContent = ":更新中";
        try {
          await this.importFunc(JSON.parse(this.importFile), this.$progress);
          const count = await this.countFunc();
          this.$status.setClass("done");
          this.$status.textContent = ":インポート完了";
        } catch (error) {
          this.$status.setClass("fail");
          this.$status.textContent = ":インポート失敗";
        }
        this.showCount();
        this.afterChangedFunc();
      } else {
        this.$status.addClass("fail");
        this.$status.textContent = ":ファイルを選択してください";
      }
      this.$progress.textContent = "";
      _clearExcute();
    });
  }
  setupExportButton() {
    this.$exportButton.on("click", async () => {
      if (!_checkExcute(this.name, "export")) { return; }
      const data = await this.exportFunc();
      const exportText = JSON.stringify(data);
      const blob = new Blob([exportText], {type: "text/plain"});
      const $a = $__("a").addClass("hidden");
      const url = URL.createObjectURL(blob);
      $a.href = url;
      $a.download = `read.crx-2_${this.name}.json`;
      this.$exportButton.addAfter($a);
      $a.click();
      $a.remove();
      URL.revokeObjectURL(url);
      _clearExcute();
    });
  }
}

class BookmarkIO extends SettingIO {
  constructor({
    name,
    countFunc,
    importFunc,
    exportFunc,
    clearFunc,
    clearExpiredFunc,
    afterChangedFunc
  }) {
    super({
      name,
      importFunc,
      exportFunc
    });
    this.name = name;
    this.countFunc = countFunc;
    this.importFunc = importFunc;
    this.exportFunc = exportFunc;
    this.clearFunc = clearFunc;
    this.clearExpiredFunc = clearExpiredFunc;
    this.afterChangedFunc = afterChangedFunc;

    this.$count = $$.I(`${this.name}_count`);
    this.$progress = $$.I(`${this.name}_progress`);

    this.$clearButton = $$.C(`${this.name}_clear`)[0];
    this.$clearExpiredButton = $$.C(`${this.name}_expired_clear`)[0];

    this.showCount();
    this.setupClearButton();
    this.setupClearExpiredButton();
  }
  async showCount() {
    const count = await this.countFunc();
    this.$count.textContent = `${count}件`;
  }
  setupClearButton() {
    this.$clearButton.on("click", async () => {
      if (!_checkExcute(this.name, "clear")) { return; }
      const result = await UI.Dialog("confirm",
        {message: "本当に削除しますか？"}
      );
      if (!result) {
        _clearExcute();
        return;
      }
      this.$status.textContent = ":削除中";

      try {
        await this.clearFunc();
        this.$status.textContent = ":削除完了";
      } catch (error) {
        this.$status.textContent = ":削除失敗";
      }

      this.showCount();
      this.afterChangedFunc();
      _clearExcute();
    });
  }
  setupClearExpiredButton() {
    this.$clearExpiredButton.on("click", async () => {
      if (!_checkExcute(this.name, "clear_expired")) { return; }
      const result = await UI.Dialog("confirm",
        {message: "本当に削除しますか？"}
      );
      if (!result) {
        _clearExcute();
        return;
      }
      this.$status.textContent = ":dat落ち削除中";

      try {
        await this.clearExpiredFunc();
        this.$status.textContent = ":dat落ち削除完了";
      } catch (error) {
        this.$status.textContent = ":dat落ち削除失敗";
      }

      this.showCount();
      this.afterChangedFunc();
      _clearExcute();
    });
  }
  setupImportButton() {
    this.$importButton.on("click", async () => {
      if (!_checkExcute(this.name, "import")) { return; }
      if (this.importFile !== "") {
        this.$status.setClass("loading");
        this.$status.textContent = ":更新中";
        try {
          await this.importFunc(JSON.parse(this.importFile), this.$progress);
          const count = await this.countFunc();
          this.$status.setClass("done");
          this.$status.textContent = ":インポート完了";
        } catch (error) {
          this.$status.setClass("fail");
          this.$status.textContent = ":インポート失敗";
        }
        this.showCount();
        this.afterChangedFunc();
      } else {
        this.$status.addClass("fail");
        this.$status.textContent = ":ファイルを選択してください";
      }
      this.$progress.textContent = "";
      _clearExcute();
    });
  }
  setupExportButton() {
    this.$exportButton.on("click", async () => {
      if (!_checkExcute(this.name, "export")) { return; }
      const data = await this.exportFunc();
      const exportText = JSON.stringify(data);
      const blob = new Blob([exportText], {type: "text/plain"});
      const $a = $__("a").addClass("hidden");
      const url = URL.createObjectURL(blob);
      $a.href = url;
      $a.download = `read.crx-2_${this.name}.json`;
      this.$exportButton.addAfter($a);
      $a.click();
      $a.remove();
      URL.revokeObjectURL(url);
      _clearExcute();
    });
  }
}

// 処理の排他制御用
let _excuteProcess = null;
let _excuteFunction = null;

const _procName = {
  "history":      "閲覧履歴",
  "writehistory": "書込履歴",
  "bookmark":     "ブックマーク",
  "cache":        "キャッシュ",
  "config":       "設定"
};
const _funcName = {
  "import":       "インポート",
  "export":       "エクスポート",
  "clear":        "削除",
  "clear_range":  "範囲指定削除",
  "clear_expired":"dat落ち削除",
  "file_select":  "ファイル読み込み"
};

var _checkExcute = function(procId, funcId) {
  if (!_excuteProcess) {
    _excuteProcess = procId;
    _excuteFunction = funcId;
    return true;
  }

  let message = null;
  if (_excuteProcess === procId) {
    if (_excuteFunction === funcId) {
      message = "既に実行中です。";
    } else {
      message = `${_funcName[_excuteFunction]}の実行中です。`;
    }
  } else {
    message = `${_procName[_excuteProcess]}の処理中です。`;
  }

  if (message) {
    new app.Notification("現在この機能は使用できません", message, "", "invalid");
  }

  return false;
};

var _clearExcute = function() {
  _excuteProcess = null;
  _excuteFunction = null;
};

app.boot("/view/config.html", ["Cache", "BBSMenu"], function(Cache, BBSMenu) {
  let dom, updateIndexedDBUsage;
  const $view = document.documentElement;

  new app.view.IframeView($view);

  // タブ
  const $tabbar = $view.C("tabbar")[0];
  const $tabs = $view.C("container")[0];
  $tabbar.on("click", function({target}) {
    if (target.tagName !== "LI") {
      target = target.closest("li");
    }
    if (target == null) { return; }
    if (target.hasClass("selected")) { return; }

    $tabbar.C("selected")[0].removeClass("selected");
    target.addClass("selected");

    $tabs.C("selected")[0].removeClass("selected");
    $tabs.$(`[name=\"${target.dataset.name}\"]`).addClass("selected");
  });

  const whenClose = function() {
    //NG設定
    let dom = $view.$("textarea[name=\"ngwords\"]");
    if (dom.getAttr("changed") != null) {
      dom.removeAttr("changed");
      app.NG.set(dom.value);
    }
    //ImageReplaceDat設定
    dom = $view.$("textarea[name=\"image_replace_dat\"]");
    if (dom.getAttr("changed") != null) {
      dom.removeAttr("changed");
      app.ImageReplaceDat.set(dom.value);
    }
    //ReplaceStrTxt設定
    dom = $view.$("textarea[name=\"replace_str_txt\"]");
    if (dom.getAttr("changed") != null) {
      dom.removeAttr("changed");
      app.ReplaceStrTxt.set(dom.value);
    }
    //bbsmenu設定
    let changeFlag = false;
    dom = $view.$("textarea[name=\"bbsmenu\"]");
    if (dom.getAttr("changed") != null) {
      dom.removeAttr("changed");
      app.config.set("bbsmenu", dom.value);
      changeFlag = true;
    }
    dom = $view.$("textarea[name=\"bbsmenu_option\"]");
    if (dom.getAttr("changed") != null) {
      dom.removeAttr("changed");
      app.config.set("bbsmenu_option", dom.value);
      changeFlag = true;
    }
    if (changeFlag) {
      $view.C("bbsmenu_reload")[0].click();
    }
  };

  //閉じるボタン
  $view.C("button_close")[0].on("click", function() {
    if (frameElement) {
      parent.postMessage({type: "request_killme"}, location.origin);
    }
    whenClose();
  });

  window.on("beforeunload", function() {
    whenClose();
  });

  //掲示板を開いたときに閉じる
  for (dom of $view.C("open_in_rcrx")) {
    dom.on("click", function() {
      $view.C("button_close")[0].click();
    });
  }

  //汎用設定項目
  for (dom of $view.$$("input.direct[type=\"text\"], textarea.direct")) {
    dom.value = app.config.get(dom.name) || "";
    dom.on("input", function() {
      app.config.set(this.name, this.value);
      this.setAttr("changed", "true");
    });
  }

  for (dom of $view.$$("input.direct[type=\"number\"]")) {
    dom.value = app.config.get(dom.name) || "0";
    dom.on("input", function() {
      app.config.set(this.name, Number.isNaN(this.valueAsNumber) ? "0" : this.value);
    });
  }

  for (dom of $view.$$("input.direct[type=\"checkbox\"]")) {
    dom.checked = app.config.get(dom.name) === "on";
    dom.on("change", function() {
      app.config.set(this.name, this.checked ? "on" : "off");
    });
  }

  for (dom of $view.$$("input.direct[type=\"radio\"]")) {
    if (dom.value === app.config.get(dom.name)) {
      dom.checked = true;
    }
    dom.on("change", function() {
      const val = $view.$(`input[name="${this.name}"]:checked`).value;
      app.config.set(this.name, val);
    });
  }

  for (dom of $view.$$("input.direct[type=\"range\"]")) {
    dom.value = app.config.get(dom.name) || "0";
    $$.I(`${dom.name}_text`).textContent = dom.value;
    dom.on("input", function() {
      $$.I(`${this.name}_text`).textContent = this.value;
      app.config.set(this.name, this.value);
    });
  }

  for (dom of $view.$$("select.direct")) {
    dom.value = app.config.get(dom.name) || "";
    dom.on("change", function() {
      app.config.set(this.name, this.value);
    });
  }

  //バージョン情報表示
  (async function() {
    const {name, version} = await app.manifest;
    $view.C("version_text")[0].textContent = `${name} v${version} + ${navigator.userAgent}`;
  })();

  $view.C("version_copy")[0].on("click", function() {
    app.clipboardWrite($$.C("version_text")[0].textContent);
  });

  $view.C("keyboard_help")[0].on("click", function(e) {
    e.preventDefault();

    app.message.send("showKeyboardHelp");
  });

  //板覧更新ボタン
  $view.C("bbsmenu_reload")[0].on("click", async function({currentTarget: $button}) {
    const $status = $$.I("bbsmenu_reload_status");

    $button.disabled = true;
    $status.setClass("loading");
    $status.textContent = "更新中";
    dom = $view.$("textarea[name=\"bbsmenu\"]");
    dom.removeAttr("changed");
    app.config.set("bbsmenu", dom.value);
    dom = $view.$("textarea[name=\"bbsmenu_option\"]");
    dom.removeAttr("changed");
    app.config.set("bbsmenu_option", dom.value);

    try {
      await BBSMenu.get(true);
      $status.setClass("done");
      $status.textContent = "更新完了";
    } catch (error) {
      $status.setClass("fail");
      $status.textContent = "更新失敗";
    }
    $button.disabled = false;
  });

  //履歴
  new HistoryIO({
    name: "history",
    countFunc() {
      return app.History.count();
    },
    async importFunc({history, read_state: readState, historyVersion = 1, readstateVersion = 1}, $progress) {
      const total = history.length + readState.length;
      let count = 0;
      for (let hs of history) {
        if (historyVersion === 1) { hs.boardTitle = ""; }
        await app.History.add(hs.url, hs.title, hs.date, hs.boardTitle);
        $progress.textContent = `:${Math.floor((count++ / total) * 100)}%`;
      }
      for (let rs of readState) {
        if (readstateVersion === 1) { rs.date = null; }
        const _rs = await app.ReadState.get(rs.url);
        if (app.util.isNewerReadState(_rs, rs)) {
          await app.ReadState.set(rs);
        }
        $progress.textContent = `:${Math.floor((count++ / total) * 100)}%`;
      }
    },
    async exportFunc() {
      const [readState, history] = await Promise.all([
        app.ReadState.getAll(),
        app.History.getAll()
      ]);
      return {"read_state": readState, "history": history, "historyVersion": app.History.DB_VERSION, "readstateVersion": app.ReadState.DB_VERSION};
    },
    clearFunc() {
      return Promise.all([app.History.clear(), app.ReadState.clear()]);
    },
    clearRangeFunc(day) {
      return app.History.clearRange(day);
    },
    afterChangedFunc() {
      updateIndexedDBUsage();
    }
  });

  new HistoryIO({
    name: "writehistory",
    countFunc() {
      return app.WriteHistory.count();
    },
    async importFunc({writehistory = null, dbVersion = 1}, $progress) {
      if (!writehistory) { return Promise.resolve(); }
      const total = writehistory.length;
      let count = 0;

      const unixTime201710 = 1506783600; // 2017/10/01 0:00:00
      for (let whis of writehistory) {
        whis.inputName = whis.input_name;
        whis.inputMail = whis.input_mail;
        if (dbVersion < 2) {
          if ((+whis.date <= unixTime201710) && (whis.res > 1)) {
            const date = new Date(+whis.date);
            date.setMonth(date.getMonth()-1);
            whis.date = date.valueOf();
          }
        }
        await app.WriteHistory.add(whis);
        $progress.textContent = `:${Math.floor((count++ / total) * 100)}%`;
      }
    },
    async exportFunc() {
      return {"writehistory": await app.WriteHistory.getAll(), "dbVersion": app.WriteHistory.DB_VERSION};
    },
    clearFunc() {
      return app.WriteHistory.clear();
    },
    clearRangeFunc(day) {
      return app.WriteHistory.clearRange(day);
    },
    afterChangedFunc() {
      updateIndexedDBUsage();
    }
  });

  // ブックマーク
  new BookmarkIO({
    name: "bookmark",
    countFunc() {
      return app.bookmark.getAll().length;
    },
    async importFunc({bookmark, readState, readstateVersion = 1}, $progress) {
      const total = bookmark.length + readState.length;
      let count = 0;
      for (let bm of bookmark) {
        await app.bookmark.import(bm);
        $progress.textContent = `:${Math.floor((count++ / total) * 100)}%`;
      }
      for (let rs of readState) {
        if (readstateVersion === 1) { rs.date = null; }
        const _rs = await app.ReadState.get(rs.url);
        if (app.util.isNewerReadState(_rs, rs)) {
          await app.ReadState.set(rs);
        }
        $progress.textContent = `:${Math.floor((count++ / total) * 100)}%`;
      }
    },
    async exportFunc() {
      const [bookmark, readState] = await Promise.all([
        app.bookmark.getAll(),
        app.ReadState.getAll()
      ]);
      return {"bookmark": bookmark, "readState": readState, "readstateVersion": app.ReadState.DB_VERSION};
    },
    clearFunc() {
      return app.bookmark.removeAll();
    },
    clearExpiredFunc() {
      return app.bookmark.removeAllExpired();
    },
    afterChangedFunc() {
      updateIndexedDBUsage();
    }
  });

  (function() {
    //キャッシュ削除ボタン
    let setCount;
    const $clearButton = $view.C("cache_clear")[0];
    const $status = $$.I("cache_status");
    const $count = $$.I("cache_count");

    (setCount = async function() {
      const count = await Cache.count();
      $count.textContent = `${count}件`;
    })();

    $clearButton.on("click", async function() {
      if (!_checkExcute("cache", "clear")) { return; }
      const result = await UI.Dialog("confirm",
        {message: "本当に削除しますか？"}
      );
      if (!result) {
        _clearExcute();
        return;
      }
      $status.textContent = ":削除中";

      try {
        await Cache.delete();
        $status.textContent = ":削除完了";
      } catch (error) {
        $status.textContent = ":削除失敗";
      }

      setCount();
      updateIndexedDBUsage();
      _clearExcute();
    });
    //キャッシュ範囲削除ボタン
    const $clearRangeButton = $view.C("cache_range_clear")[0];
    $clearRangeButton.on("click", async function() {
      if (!_checkExcute("cache", "clear_range")) { return; }
      const result = await UI.Dialog("confirm",
        {message: "本当に削除しますか？"}
      );
      if (!result) {
        _clearExcute();
        return;
      }
      $status.textContent = ":範囲指定削除中";

      try {
        await Cache.clearRange(parseInt($view.C("cache_date_range")[0].value));
        $status.textContent = ":削除完了";
      } catch (error) {
        $status.textContent = ":削除失敗";
      }

      setCount();
      updateIndexedDBUsage();
      _clearExcute();
    });
  })();

  (function() {
    //ブックマークフォルダ変更ボタン
    let updateName;
    $view.C("bookmark_source_change")[0].on("click", function() {
      app.message.send("open", {url: "bookmark_source_selector"});
    });

    //ブックマークフォルダ表示
    (updateName = async function() {
      const [folder] = await parent.browser.bookmarks.get(app.config.get("bookmark_id"));
      $$.I("bookmark_source_name").textContent = folder.title;
    })();
    app.message.on("config_updated", function({key}) {
      if (key === "bookmark_id") { updateName(); }
    });
  })();

  //「テーマなし」設定
  if (app.config.get("theme_id") === "none") {
    $view.C("theme_none")[0].checked = true;
  }

  app.message.on("config_updated", function({key, val}) {
    if (key === "theme_id") {
      $view.C("theme_none")[0].checked = (val === "none");
    }
  });

  $view.C("theme_none")[0].on("click", function() {
    app.config.set("theme_id", this.checked ? "none" : "default");
  });

  //bbsmenu設定
  const resetBBSMenu = async function() {
    await app.config.del("bbsmenu");
    $view.$("textarea[name=\"bbsmenu\"]").value = app.config.get("bbsmenu");
    $$.C("bbsmenu_reload")[0].click();
  };

  if ($view.$("textarea[name=\"bbsmenu\"]").value === "") {
    resetBBSMenu();
  }

  $view.C("bbsmenu_reset")[0].on("click", async function() {
    const result = await UI.Dialog("confirm",
      {message: "設定内容をリセットします。よろしいですか？"}
    );
    if (!result) { return; }
    resetBBSMenu();
  });

  for (let $dom of $view.$$("input[type=\"radio\"]")) {
    if (["ng_id_expire", "ng_slip_expire"].includes($dom.name)) {
      $dom.on("change", function() {
        if (this.checked) { $$.I(this.name).dataset.value = this.value; }
      });
      $dom.emit(new Event("change"));
    }
  }

  // ImageReplaceDatのリセット
  $view.C("dat_file_reset")[0].on("click", async function() {
    const result = await UI.Dialog("confirm",
      {message: "設定内容をリセットします。よろしいですか？"}
    );
    if (!result) { return; }
    await app.config.del("image_replace_dat");
    const resetData = app.config.get("image_replace_dat");
    $view.$("textarea[name=\"image_replace_dat\"]").value = resetData;
    app.ImageReplaceDat.set(resetData);
  });

  // ぼかし判定用正規表現のリセット
  $view.C("image_blur_reset")[0].on("click", async function() {
    const result = await UI.Dialog("confirm",
      {message: "設定内容をリセットします。よろしいですか？"}
    );
    if (!result) { return; }
    await app.config.del("image_blur_word");
    const resetData = app.config.get("image_blur_word");
    $view.$("input[name=\"image_blur_word\"]").value = resetData;
  });

  // NG設定のリセット
  $view.C("ngwords_reset")[0].on("click", async function() {
    const result = await UI.Dialog("confirm",
      {message: "設定内容をリセットします。よろしいですか？"}
    );
    if (!result) { return; }
    await app.config.del("ngwords");
    const resetData = app.config.get("ngwords");
    $view.$("textarea[name=\"ngwords\"]").value = resetData;
    app.NG.set(resetData);
  });

  // 設定をインポート/エクスポート
  new SettingIO({
    name: "config",
    importFunc(file) {
      const json = JSON.parse(file);
      for (let key in json) {
        const value = json[key];
        key = key.slice(7);
        if (key !== "theme_id") {
          const $key = $view.$(`input[name=\"${key}\"]`);
          if ($key != null) {
            switch ($key.getAttr("type")) {
              case "text": case "range": case "number":
                $key.value = value;
                $key.emit(new Event("input"));
                break;
              case "checkbox":
                $key.checked = (value === "on");
                $key.emit(new Event("change"));
                break;
              case "radio":
                for (dom of $view.$$(`input.direct[name=\"${key}\"]`)) {
                  if (dom.value === value) {
                    dom.checked = true;
                  }
                }
                $key.emit(new Event("change"));
                break;
            }
          } else {
            const $keyTextArea = $view.$(`textarea[name=\"${key}\"]`);
            if ($keyTextArea != null) {
              $keyTextArea.value = value;
              $keyTextArea.emit(new Event("input"));
            }
            const $keySelect = $view.$(`select[name=\"${key}\"]`);
            if ($keySelect != null) {
              $keySelect.value = value;
              $keySelect.emit(new Event("change"));
            }
          }
         //config_theme_idは「テーマなし」の場合があるので特例化
         } else {
           if (value === "none") {
             const $themeNone = $view.C("theme_none")[0];
             if (!$themeNone.checked) { $themeNone.click(); }
           } else {
             $view.$("input[name=\"theme_id\"]").value = value;
             $view.$("input[name=\"theme_id\"]").emit(new Event("change"));
           }
         }
      }
    },
    exportFunc() {
      const content = app.config.getAll();
      delete content.config_last_board_sort_config;
      delete content.config_last_version;
      return JSON.stringify(content);
    }
  });

  // ImageReplaceDatをインポート
  new SettingIO({
    name: "dat",
    importFunc(file) {
      const datDom = $view.$("textarea[name=\"image_replace_dat\"]");
      datDom.value = file;
      datDom.emit(new Event("input"));
    }
  });

  // ReplaceStrTxtをインポート
  new SettingIO({
    name: "replacestr",
    importFunc(file) {
      const replacestrDom = $view.$("textarea[name=\"replace_str_txt\"]");
      replacestrDom.value = file;
      replacestrDom.emit(new Event("input"));
    }
  });

  const formatBytes = function(bytes) {
    if (bytes < 1048576) {
      return (bytes/1024).toFixed(2) + "KB";
    }
    if (bytes < 1073741824) {
      return (bytes/1048576).toFixed(2) + "MB";
    }
    return (bytes/1073741824).toFixed(2) + "GB";
  };

  // indexeddbの使用状況
  (updateIndexedDBUsage = async function() {
    const {quota, usage} = await navigator.storage.estimate();
    $view.C("indexeddb_max")[0].textContent = formatBytes(quota);
    $view.C("indexeddb_using")[0].textContent = formatBytes(usage);
    const $meter = $view.C("indexeddb_meter")[0];
    $meter.max = quota;
    $meter.high = quota*0.9;
    $meter.low = quota*0.8;
    $meter.value = usage;
  })();

  // localstorageの使用状況
  return (async function() {
    let $meter;
    if (parent.browser.storage.local.getBytesInUse != null) {
      // 無制限なのでindexeddbの最大と一致する
      const {quota} = await navigator.storage.estimate();
      $view.C("localstorage_max")[0].textContent = formatBytes(quota);
      $meter = $view.C("localstorage_meter")[0];
      $meter.max = quota;
      $meter.high = quota*0.9;
      $meter.low = quota*0.8;
      const usage = await parent.browser.storage.local.getBytesInUse();
      $view.C("localstorage_using")[0].textContent = formatBytes(usage);
      $meter.value = usage;
    } else {
      $meter = $view.C("localstorage_meter")[0].remove();
      $view.C("localstorage_max")[0].textContent = "";
      $view.C("localstorage_using")[0].textContent = "このブラウザでは取得できません";
    }
  })();
});

function __guard__(value, transform) {
  return (typeof value !== 'undefined' && value !== null) ? transform(value) : undefined;
}