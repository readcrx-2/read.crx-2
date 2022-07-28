app.boot("/view/search.html", ["ThreadSearch"], async function(ThreadSearch) {
  let queries, query;
  try {
    queries = app.URL.parseQuery(location.search);
    query = queries.get("query");
  } catch (error) {
    alert("不正な引数です");
    return;
  }
  const scheme = queries.get("scheme");
  const openedAt = Date.now();

  const $view = document.documentElement;
  $view.dataset.url = `search:${query}`;
  $view.setAttr("scheme", scheme);

  const $content = $$.C("content")[0];
  const $messageBar = $view.C("message_bar")[0];
  const $buttonReload = $view.C("button_reload")[0];

  const $table = $__("table");
  const threadList = new UI.ThreadList($table, {
    th: ["bookmark", "title", "boardTitle", "res", "heat", "createdDate"],
    searchbox: $view.C("searchbox")[0]
  }
  );
  app.DOMData.set($view, "threadList", threadList);
  app.DOMData.set($view, "selectableItemList", threadList);
  const tableSorter = new UI.TableSorter($table);
  app.DOMData.set($table, "tableSorter", tableSorter);
  $content.addFirst($table);

  new app.view.TabContentView($view);

  document.title = `検索:${query}`;
  if (!app.config.isOn("no_history")) {
    app.History.add($view.dataset.url, document.title, openedAt, "");
  }

  $view.$(".button_link > a").href = `${scheme}://dig.5ch.net/search?maxResult=500&keywords=${encodeURIComponent(query)}`;

  let threadSearch = new ThreadSearch(query, `${scheme}:`);
  const $tbody = $view.T("tbody")[0];

  const load = async function(add = false) {
    if ($view.hasClass("loading") && !add) { return; }
    $view.addClass("loading");
    $buttonReload.addClass("disabled");
    $view.C("more")[0].textContent = "検索中";
    $view.C("more")[0].removeClass("hidden");
    try {
      const result = await threadSearch.read();
      $messageBar.removeClass("error");
      $messageBar.removeChildren();

      threadList.addItem(result);

      if ($tbody.child().length === 0) {
        $tbody.addClass("body_empty");
      } else {
        let empty = true;
        for (let dom of $tbody.child()) {
          if (dom.offsetHeight !== 0) {
            empty = false;
            break;
          }
        }
        if (empty) {
          $tbody.addClass("body_empty");
        } else {
          $tbody.removeClass("body_empty");
        }
      }

      $view.removeClass("loading");
    } catch (error) {
      const {message} = error;
      $messageBar.addClass("error");
      $messageBar.textContent = message;
      $view.removeClass("loading");
    }

    $view.C("more")[0].addClass("hidden");
    (async function() {
      await app.wait5s();
      $buttonReload.removeClass("disabled");
    })();
  };

  var onScroll =  function() {
    const {offsetHeight, scrollHeight, scrollTop} = $content;
    const scrollPosition = offsetHeight + scrollTop;

    if ((scrollHeight - scrollPosition) < 100) {
      $content.off("scroll", onScroll);
      load(true);
    }
  };
  $content.on("scroll", onScroll, {passive: true});

  $buttonReload.on("click", async function() {
    if ($buttonReload.hasClass("disabled")) { return; }
    threadList.empty();
    threadSearch = new ThreadSearch(query, `${scheme}:`);
    await load();
    onScroll(); // 20件分がスクロールなしで表示できる場合
    $content.on("scroll", onScroll, {passive: true});
  });

  await load();
  onScroll(); // 20件分がスクロールなしで表示できる場合
  app.config.set("thread_search_last_mode", scheme);
});
