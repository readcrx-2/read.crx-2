// TODO: This file was created by bulk-decaffeinate.
// Sanity-check the conversion and remove this comment.
/*
 * decaffeinate suggestions:
 * DS103: Rewrite code to no longer use __guard__, or convert again using --optional-chaining
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
app.boot("/view/sidemenu.html", ["BBSMenu"], function(BBSMenu) {
  const $view = document.documentElement;

  new app.view.PaneContentView($view);

  const accordion = new UI.SelectableAccordion(document.body);
  app.DOMData.set($view, "accordion", accordion);
  app.DOMData.set($view, "selectableItemList", accordion);

  const boardToLi = function(board) {
    const $li = $__("li");
    const $a = $__("a");
    $a.setClass("open_in_rcrx");
    $a.title = board.title;
    $a.textContent = board.title;
    $a.href = app.safeHref(board.url);
    if (app.URL.isHttps(board.url)) { $a.addClass("https"); }
    $li.addLast($a);
    return $li;
  };

  const entryToLi = function(entry) {
    const $li = boardToLi(entry);
    $li.addClass("bookmark");
    return $li;
  };

  //スレタイ検索ボックス
  $view.C("search")[0].on("keydown", function({key}) {
    if (key === "Escape") {
      this.q.value = "";
    }
  });
  $view.C("search")[0].on("submit", function(e) {
    e.preventDefault();
    app.message.send("open", {url: `search:${this.q.value}`, new_tab: true});
    this.q.value = "";
  });

  //ブックマーク関連
  (function() {
    //初回ブックマーク表示構築
    app.bookmarkEntryList.ready.add( function() {
      const frag = $_F();

      for (let entry of app.bookmark.getAllBoards()) {
        frag.addLast(entryToLi(entry));
      }

      $view.$("ul:first-of-type").addLast(frag);
      accordion.update();
    });

    //ブックマーク更新時処理
    app.message.on("bookmark_updated", function({type, bookmark}) {
      if (bookmark.type !== "board") { return; }

      const $a = $view.$(`li.bookmark > a[href=\"${bookmark.url}\"]`);

      switch (type) {
        case "added":
          if ($a == null) {
            $view.$("ul:first-of-type").addLast(entryToLi(bookmark));
          }
          break;
        case "removed":
          $a.parent().remove();
          break;
        case "title":
          $a.textContent = bookmark.title;
          break;
      }
    });

    $view.on("contextmenu", async e => {
      let fn;
      const target = e.target.closest("a");
      if (!target) { return; }

      const url = target.href;
      const {
        title
      } = target;
      if (url == null) { return; }
      e.preventDefault();

      await app.defer();
      const $menu = $$.I("template_contextmenu").content.$(".contextmenu").cloneNode(true);
      $view.addLast($menu);

      if (app.bookmark.get(url)) {
        __guard__($menu.C("add_bookmark")[0], x => x.remove());
      } else {
        __guard__($menu.C("del_bookmark")[0], x1 => x1.remove());
      }

      $menu.on("click", (fn = function({target}) {
        if (target.tagName !== "LI") { return; }
        $menu.off("click", fn);

        if (target.hasClass("add_bookmark")) {
          app.bookmark.add(url, title);
        } else if (target.hasClass("del_bookmark")) {
          app.bookmark.remove(url);
        }
        this.remove();
      })
      );
      UI.ContextMenu($menu, e.clientX, e.clientY);
    });
  })();

  //板覧関連
  (function() {
    const setupDOM = function({status, menu, message}) {
      for (let dom of $view.$$("h3:not(:first-of-type), ul:not(:first-of-type)")) {
        dom.remove();
      }
      if (status === "error") {
        app.message.send("notify", {
          message,
          background_color: "red"
        }
        );
      }
      if (menu != null) {
        const frag = $_F();
        for (let category of menu) {
          const $h3 = $__("h3");
          $h3.textContent = category.title;
          frag.addLast($h3);

          const $ul = $__("ul");
          for (let board of category.board) {
            $ul.addLast(boardToLi(board));
          }
          frag.addLast($ul);
        }
        document.body.addLast(frag);
      }
      accordion.update();
      $view.removeClass("loading");
    };

    const load = async function() {
      $view.addClass("loading");
      // 表示用板一覧の取得
      const obj = await BBSMenu.get();
      setupDOM(obj);
      BBSMenu.target.on("change", function({detail: obj}) {
        setupDOM(obj);
      });
    };

    $view.on("request_reload", function() {
      load();
    });

    load();
  })();
});

function __guard__(value, transform) {
  return (typeof value !== 'undefined' && value !== null) ? transform(value) : undefined;
}