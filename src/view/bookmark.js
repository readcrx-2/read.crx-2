app.boot("/view/bookmark.html", ["Board"], function (Board) {
  const $view = document.documentElement;

  const $table = $__("table");
  const tableHeaders = [
    "title",
    "boardTitle",
    "res",
    "unread",
    "heat",
    "createdDate",
  ];
  const threadList = new UI.ThreadList($table, {
    th: tableHeaders,
    bookmarkAddRm: true,
    searchColumn: $view.C("search_item_selector")[0],
    searchbox: $view.C("searchbox")[0],
  });
  app.DOMData.set($view, "threadList", threadList);
  app.DOMData.set($view, "selectableItemList", threadList);
  $$.C("content")[0].addLast($table);
  const tableSorter = new UI.TableSorter($table);
  app.DOMData.set($table, "tableSorter", tableSorter);

  // ソート関連
  (function () {
    const DEFAULT_SORT = { sort_index: 3, sort_order: "desc" };
    let lastSort = (() => {
      switch (app.config.get("bookmark_sort_save_type")) {
        case "none":
          return DEFAULT_SORT;
        case "board":
          return JSON.parse(app.config.get("last_board_sort_config"));
        case "bookmark":
          return JSON.parse(app.config.get("last_bookmark_sort_config"));
      }
    })();
    if (!lastSort || lastSort.sort_attribute === "data-thread-number") {
      lastSort = DEFAULT_SORT;
    }
    tableSorter.updateSnake(lastSort);

    $table.on("table_sort_updated", function ({ detail }) {
      app.config.set("last_bookmark_sort_config", JSON.stringify(detail));
    });
  })();

  new app.view.TabContentView($view);

  const trUpdatedObserver = new MutationObserver(function (records) {
    for (let { target: $record } of records) {
      if ($record.matches("tr.updated")) {
        $record.parent().addLast($record);
      }
    }
  });

  //リロード時処理
  $view.on("request_reload", function (param) {
    let url;
    if (param == null) {
      param = {};
    }
    const { detail: auto = false } = param;
    if ($view.hasClass("loading")) {
      return;
    }
    const $reloadButton = $view.C("button_reload")[0];
    if ($reloadButton.hasClass("disabled")) {
      return;
    }

    $view.addClass("loading");
    $view.C("searchbox")[0].disabled = true;
    const $loadingOverlay = $view.C("loading_overlay")[0];

    $reloadButton.addClass("disabled");

    trUpdatedObserver.observe($view.T("tbody")[0], {
      subtree: true,
      attributes: true,
      attributeFilter: ["class"],
    });

    // TODO: Collection Normalization Proposalで書くとよりよく
    // ES2019 Stage 2(2019/02/05現在)
    // https://github.com/tc39/proposal-collection-normalization
    const boardList = new Set();
    const boardThreadTable = new Map();
    for ({ url } of app.bookmark.getAllThreads()) {
      const boardUrl = app.URL.threadToBoard(url);
      boardList.add(boardUrl);
      if (boardThreadTable.has(boardUrl)) {
        boardThreadTable.get(boardUrl).push(url);
      } else {
        boardThreadTable.set(boardUrl, [url]);
      }
    }

    const count = {
      all: boardList.size,
      success: 0,
      error: 0,
    };

    const loadingServer = new Set();

    var fn = function (res) {
      let board;
      if (res != null) {
        loadingServer.delete(app.URL.getDomain(this.prev));
        const status = res.status === "success" ? "success" : "error";
        count[status]++;
        if (status === "error") {
          for (board of boardThreadTable.get(this.prev)) {
            app.message.send("bookmark_updated", {
              type: "errored",
              bookmark: { type: "thread", url: board },
            });
          }
        } else {
          for (board of boardThreadTable.get(this.prev)) {
            app.message.send("bookmark_updated", {
              type: "updated",
              bookmark: { type: "thread", url: board },
            });
          }
        }
      }

      if (count.all === count.success + count.error) {
        //更新完了
        //ソート後にブックマークが更新されてしまう場合に備えて、少し待つ
        (async function () {
          await app.wait(500);
          tableSorter.clearSortClass();
          for (let tr of $view.$$("tr:not(.updated)")) {
            tr.parent().addLast(tr);
          }
          trUpdatedObserver.disconnect();
          $view.removeClass("loading");
          if (app.config.isOn("auto_bookmark_notify") && auto) {
            notify();
          }
          $view.C("searchbox")[0].disabled = false;
          await app.wait(10 * 1000);
          $reloadButton.removeClass("disabled");
        })();
      }
      // 同一サーバーへの最大接続数: 1
      for (board of boardList) {
        const server = app.URL.getDomain(board);
        if (loadingServer.has(server)) {
          continue;
        }
        loadingServer.add(server);
        boardList.delete(board);
        Board.get(new URL(board)).then(fn.bind({ prev: board }));
        fn();
        break;
      }

      //ステータス表示更新
      $loadingOverlay.C("success")[0].textContent = count.success;
      $loadingOverlay.C("error")[0].textContent = count.error;
      $loadingOverlay.C("pending")[0].textContent =
        count.all - count.success - count.error;
    };

    fn();
  });

  const getPromises = app.bookmark
    .getAllThreads()
    .map(async function ({
      title,
      url,
      resCount = 0,
      readState = { url, read: 0, received: 0, last: 0 },
      expired,
    }) {
      let boardTitle;
      const urlObj = new app.URL.URL(url);
      const boardUrlObj = urlObj.toBoard();
      try {
        boardTitle = await app.BoardTitleSolver.ask(boardUrlObj);
      } catch (error) {
        boardTitle = "";
      }
      threadList.addItem({
        title,
        url,
        resCount,
        readState,
        createdAt: /\/(\d+)\/$/.exec(urlObj.pathname)[1] * 1000,
        expired,
        boardUrl: boardUrlObj.href,
        boardTitle,
        isHttps: urlObj.isHttps(),
      });
    });

  (async function () {
    await Promise.all(getPromises);
    app.message.send("request_update_read_state");
    tableSorter.update();

    $view.emit(new Event("view_loaded"));
  })();

  const titleIndex = tableHeaders.indexOf("title");
  const resIndex = tableHeaders.indexOf("res");
  const unreadIndex = tableHeaders.indexOf("unread");
  // 新着通知
  var notify = function () {
    let notifyStr = "";
    for (let tr of $view.$$("tr.updated")) {
      const tds = tr.T("td");
      let title = tds[titleIndex].textContent;
      if (title.length >= 10) {
        title = title.slice(0, 15 - 3) + "...";
      }
      const before = parseInt(tds[resIndex].dataset.beforeres);
      const after = parseInt(tds[resIndex].textContent);
      const unreadRes = tds[unreadIndex].textContent;
      if (after > before) {
        notifyStr += `タイトル: ${title}  新規: ${
          after - before
        }  未読: ${unreadRes}\n`;
      }
    }
    if (notifyStr !== "") {
      new app.Notification(
        "ブックマークの更新",
        notifyStr,
        "bookmark",
        "bookmark"
      );
    }
  };
});
