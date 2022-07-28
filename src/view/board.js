/*
 * decaffeinate suggestions:
 * DS103: Rewrite code to no longer use __guard__, or convert again using --optional-chaining
 * DS104: Avoid inline assignments
 * DS204: Change includes calls to have a more natural evaluation order
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
app.boot("/view/board.html", ["Board"], function(Board) {
  let needle, url;
  try {
    url = app.URL.parseQuery(location.search).get("q");
  } catch (error) {
    alert("不正な引数です");
    return;
  }
  url = new app.URL.URL(url);
  const urlStr = url.href;
  const openedAt = Date.now();

  const $view = document.documentElement;
  $view.dataset.url = urlStr;

  const $table = $__("table");
  const threadList = new UI.ThreadList($table, {
    th: ["bookmark", "title", "res", "unread", "heat", "createdDate"],
    searchbox: $view.C("searchbox")[0]
  }
  );
  app.DOMData.set($view, "threadList", threadList);
  app.DOMData.set($view, "selectableItemList", threadList);
  const tableSorter = new UI.TableSorter($table);
  app.DOMData.set($table, "tableSorter", tableSorter);
  $$.C("content")[0].addLast($table);

  const write = function(param) {
    if (param == null) { param = {}; }
    param.title = document.title;
    param.url = urlStr;
    const windowX = app.config.get("write_window_x");
    const windowY = app.config.get("write_window_y");
    const openUrl = `/write/submit_thread.html?${app.URL.buildQuery(param)}`;
    if (("&[BROWSER]" === "firefox") || navigator.userAgent.includes("Vivaldi")) {
      open(
        openUrl,
        undefined,
        `width=600,height=300,left=${windowX},top=${windowY}`
      );
    } else if ("&[BROWSER]" === "chrome") {
      parent.browser.windows.create({
        type: "popup",
        url: openUrl,
        width: 600,
        height: 300,
        left: parseInt(windowX),
        top: parseInt(windowY)
      });
    }
  };

  const $writeButton = $view.C("button_write")[0];
  if ((needle = url.getTsld(), ["5ch.net", "shitaraba.net", "bbspink.com", "2ch.sc", "open2ch.net"].includes(needle))) {
    $writeButton.on("click", function() {
      write();
    });
  } else {
    $writeButton.remove();
  }

  // ソート関連
  (function() {
    const lastBoardSort = app.config.get("last_board_sort_config");
    if (lastBoardSort != null) { tableSorter.updateSnake(JSON.parse(lastBoardSort)); }

    $table.on("table_sort_updated", function({detail}) {
      app.config.set("last_board_sort_config", JSON.stringify(detail));
    });
    //.sort_item_selectorが非表示の時、各種項目のソート切り替えを
    //降順ソート→昇順ソート→標準ソートとする
    $table.on("click", function({target}) {
      if ((target.tagName !== "TH") || !target.hasClass("table_sort_asc")) { return; }
      if ($view.C("sort_item_selector")[0].offsetWidth !== 0) { return; }
      $table.on("table_sort_before_update", function(e) {
        e.preventDefault();
        tableSorter.update({
          sortAttribute: "data-thread-number",
          sortOrder: "asc"
        });
      }
      , {once: true});
    });
  })();

  new app.view.TabContentView($view);

  (async function() {
    const title = await app.BoardTitleSolver.ask(url);
    if (title) { document.title = title; }
    if (!app.config.isOn("no_history")) {
      app.History.add(urlStr, title || urlStr, openedAt, title || urlStr);
    }
  })();

  const load = async function(ex) {
    $view.addClass("loading");
    app.message.send("request_update_read_state", {board_url: urlStr});

    const getReadStatePromise = (async function() {
      // request_update_read_stateを待つ
      await app.wait(150);
      return await app.ReadState.getByBoard(urlStr);
    })();
    const getBoardPromise = (async function() {
      const {status, message, data} = await Board.get(url);
      const $messageBar = $view.C("message_bar")[0];
      if (status === "error") {
        $messageBar.addClass("error");
        $messageBar.innerHTML = message;
      } else {
        $messageBar.removeClass("error");
        $messageBar.removeChildren();
      }
      if (data != null) { return data; }
      throw new Error("板の取得に失敗しました");
    })();

    try {
      let readState, thread;
      const [readStateArray, board] = await Promise.all([getReadStatePromise, getBoardPromise]);
      const readStateIndex = {};
      for (let key = 0; key < readStateArray.length; key++) {
        readState = readStateArray[key];
        readStateIndex[readState.url] = key;
      }

      threadList.empty();
      const item = [];
      for (let threadNumber = 0; threadNumber < board.length; threadNumber++) {
        var bookmark;
        thread = board[threadNumber];
        readState = readStateArray[readStateIndex[thread.url]];
        if (__guard__((bookmark = app.bookmark.get(thread.url)), x => x.readState) != null) {
          if (app.util.isNewerReadState(readState, bookmark.readState)) { ({readState} = bookmark); }
        }
        thread.readState = readState;
        thread.threadNumber = threadNumber;
        item.push(thread);
      }
      threadList.addItem(item);

      // スレ建て後の処理
      if (ex != null) {
        const writeFlag = (!app.config.isOn("no_writehistory"));
        if (ex.kind === "own") {
          if (writeFlag) {
            await app.WriteHistory.add({
              url: ex.thread_url,
              res: 1,
              title: ex.title,
              name: ex.name,
              mail: ex.mail,
              message: ex.mes,
              date: Date.now().valueOf()
            });
          }
          app.message.send("open", {url: ex.thread_url, new_tab: true});
        } else {
          for (thread of board) {
            if (thread.title.includes(ex.title)) {
              if (writeFlag) {
                await app.WriteHistory.add({
                  url: thread.url,
                  res: 1,
                  title: ex.title,
                  name: ex.name,
                  mail: ex.mail,
                  message: ex.mes,
                  date: thread.createdAt
                });
              }
              app.message.send("open", {url: thread.url, new_tab: true});
              break;
            }
          }
        }
      }

      tableSorter.update();
    } catch (error1) {}

    $view.removeClass("loading");

    if ($table.hasClass("table_search")) {
      $view.C("searchbox")[0].emit(new Event("input"));
    }

    $view.emit(new Event("view_loaded"));

    const $button = $view.C("button_reload")[0];
    $button.addClass("disabled");
    await app.wait5s();
    $button.removeClass("disabled");
  };

  $view.on("request_reload", function({detail}) {
    if ($view.hasClass("loading")) { return; }
    if ($view.C("button_reload")[0].hasClass("disabled")) { return; }
    load(detail);
  });
  load();
});

function __guard__(value, transform) {
  return (typeof value !== 'undefined' && value !== null) ? transform(value) : undefined;
}