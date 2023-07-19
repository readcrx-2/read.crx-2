app.boot("/view/writehistory.html", function () {
  const $view = document.documentElement;
  const $content = $$.C("content")[0];

  const $table = $__("table");
  const threadList = new UI.ThreadList($table, {
    th: ["title", "writtenRes", "name", "mail", "message", "writtenDate"],
    searchColumn: $view.C("search_item_selector")[0],
    searchbox: $view.C("searchbox")[0],
  });
  app.DOMData.set($view, "threadList", threadList);
  app.DOMData.set($view, "selectableItemList", threadList);
  $content.addLast($table);
  const tableSorter = new UI.TableSorter($table);
  app.DOMData.set($table, "tableSorter", tableSorter);

  new app.view.TabContentView($view);

  const NUMBER_OF_DATA_IN_ONCE = 500;
  let loadAddCount = 0;
  let isLoadedEnd = false;

  const load = async function ({ add = false } = {}) {
    let offset;
    if ($view.hasClass("loading")) {
      return;
    }
    if ($view.C("button_reload")[0].hasClass("disabled") && !add) {
      return;
    }
    if (add && isLoadedEnd) {
      return;
    }

    $view.addClass("loading");
    if (add) {
      offset = loadAddCount * NUMBER_OF_DATA_IN_ONCE;
    } else {
      offset = undefined;
    }

    const data = await app.WriteHistory.get(offset, NUMBER_OF_DATA_IN_ONCE);
    if (add) {
      loadAddCount++;
    } else {
      threadList.empty();
      loadAddCount = 1;
    }

    if (data.length < NUMBER_OF_DATA_IN_ONCE) {
      isLoadedEnd = true;
    }

    threadList.addItem(data);
    $view.removeClass("loading");
    if (add && data.length === 0) {
      return;
    }
    $view.emit(new Event("view_loaded"));
    $view.C("button_reload")[0].addClass("disabled");
    await app.wait5s();
    $view.C("button_reload")[0].removeClass("disabled");
  };

  $view.on("request_reload", load);
  load();

  let isInLoadArea = false;
  $content.on(
    "scroll",
    function () {
      const { offsetHeight, scrollHeight, scrollTop } = $content;
      const scrollPosition = offsetHeight + scrollTop;

      if (scrollHeight - scrollPosition < 100) {
        if (isInLoadArea) {
          return;
        }
        isInLoadArea = true;
        load({ add: true });
      } else {
        isInLoadArea = false;
      }
    },
    { passive: true }
  );

  $view.C("button_history_clear")[0].on("click", async function () {
    if (await UI.Dialog("confirm", { message: "履歴を削除しますか？" })) {
      try {
        await app.WriteHistory.clear();
        load();
      } catch (error) {}
    }
  });
});
