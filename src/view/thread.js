/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS103: Rewrite code to no longer use __guard__, or convert again using --optional-chaining
 * DS104: Avoid inline assignments
 * DS202: Simplify dynamic range loops
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
(async function() {
  let font;
  if (navigator.platform.includes("Win")) { return; }
  try {
    font = localStorage.getItem("textar_font");
    if (font == null) {
      throw new Error("localstorageからのフォントの取得に失敗しました");
    }
  } catch (error) {
    const response = await fetch("https://readcrx-2.github.io/read.crx-2/textar-min.woff2");
    const blob = await response.blob();
    font = await new Promise( function(resolve) {
      const fr = new FileReader();
      fr.onload = function() {
        resolve(fr.result);
      };
      fr.readAsDataURL(blob);
    });
    localStorage.setItem("textar_font", font);
  }
  const fontface = new FontFace("Textar", `url(${font})`);
  document.fonts.add(fontface);
})();

app.viewThread = {};

app.boot("/view/thread.html", function() {
  let AANoOverflow, viewUrlStr;
  try {
    viewUrlStr = app.URL.parseQuery(location.search).get("q");
  } catch (error) {
    alert("不正な引数です");
    return;
  }
  const viewUrl = new app.URL.URL(viewUrlStr);
  viewUrlStr = viewUrl.href;

  const $view = document.documentElement;
  $view.dataset.url = viewUrlStr;

  const $content = $view.C("content")[0];
  const threadContent = new UI.ThreadContent(viewUrl, $content);
  const mediaContainer = new UI.MediaContainer($view);
  const lazyLoad = new UI.LazyLoad($content);
  app.DOMData.set($view, "threadContent", threadContent);
  app.DOMData.set($view, "selectableItemList", threadContent);
  app.DOMData.set($view, "lazyload", lazyLoad);

  new app.view.TabContentView($view);

  const searchNextThread = new UI.SearchNextThread(
    $view.C("next_thread_list")[0]
  );
  const popupView = new UI.PopupView($view);

  if (app.config.get("aa_font") === "aa") {
    $content.addClass("config_use_aa_font");
    AANoOverflow = new UI.AANoOverflow($view, {minRatio: app.config.get("aa_min_ratio")});
  }

  $view.on("became_expired", function() {
    parent.postMessage({type: "became_expired"}, location.origin);
    return $view.addClass("expired");
  }
  , {once: true});
  $view.on("became_over1000", function() {
    parent.postMessage({type: "became_over1000"}, location.origin);
    return $view.addClass("over1000");
  }
  , {once: true});

  const write = function(param) {
    if (param == null) { param = {}; }
    param.url = viewUrlStr;
    param.title = document.title;
    const windowX = app.config.get("write_window_x");
    const windowY = app.config.get("write_window_y");
    const openUrl = `/write/submit_res.html?${app.URL.buildQuery(param)}`;
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

  const popupHelper = async function(that, e, fn) {
    let dom;
    const $popup = fn();
    if ($popup.child().length === 0) { return; }
    for (dom of $popup.T("article")) {
      dom.removeClass("last", "read", "received");
    }
    //ポップアップ内のサムネイルの遅延ロードを解除
    if (!lazyLoad.isManualLoad) {
      for (dom of $popup.$$("img[data-src], video[data-src]")) {
        lazyLoad.immediateLoad(dom);
      }
    }
    await app.defer();
    // popupの表示
    popupView.show($popup, e.clientX, e.clientY, that);
  };

  const canWrite = () => $view.C("button_write")[0] != null;

  const removeWriteButton = function() {
    __guard__($view.C("button_write")[0], x => x.remove());
  };

  $view.on("became_expired", removeWriteButton, {once: true});
  $view.on("became_over1000", removeWriteButton, {once: true});

  // したらばの過去ログ
  if (viewUrl.isArchive()) {
    $view.emit(new Event("became_expired"));
  } else {
    $view.C("button_write")[0].on("click", function() {
      write();
    });
  }

  //リロード処理
  $view.on("request_reload", async function({ detail: ex = {} }) {
    let left;
    threadContent.refreshNG();
    //先にread_state更新処理を走らせるために、処理を飛ばす
    await app.defer();
    const jumpResNum = +((left = ex.written_res_num != null ? ex.written_res_num : ex.param_res_num) != null ? left : -1);
    if (
      !ex.force_update &&
      (
        $view.hasClass("loading") ||
        $view.C("button_reload")[0].hasClass("disabled")
      )
    ) {
      if (jumpResNum > 0) { threadContent.select(jumpResNum, false, true, -60); }
      return;
    }

    const thread = await app.viewThread._draw($view, { forceUpdate: ex.force_update, jumpResNum });
    if ((ex.mes == null) || !!app.config.isOn("no_writehistory")) { return; }
    const postMes = ex.mes.replace(/\s/g, "");
    for (let i = thread.res.length - 1; i >= 0; i--) {
      const t = thread.res[i];
      if (postMes === app.util.decodeCharReference(app.util.stripTags(t.message)).replace(/\s/g, "")) {
        const date = app.util.stringToDate(t.other).valueOf();
        if (date != null) {
          app.WriteHistory.add({
            url: viewUrlStr,
            res: i+1,
            title: document.title,
            name: app.util.decodeCharReference(t.name),
            mail: app.util.decodeCharReference(t.mail),
            inputName: ex.name,
            inputMail: ex.mail,
            message: ex.mes,
            date
          });
        }
        threadContent.addClassWithOrg($content.child()[i], "written");
        break;
      }
    }
  });

  //初回ロード処理
  (async function() {
    let boardTitle;
    const openedAt = Date.now();

    app.viewThread._readStateManager($view);
    $view.on("read_state_attached", function({ detail: {jumpResNum, requestReloadFlag, loadCount} = {} }) {
      let defaultScroll;
      let onScroll = false;
      $content.on("scroll", function() {
        onScroll = true;
      }
      , {once: true});

      (defaultScroll = function() {
        const $last = $content.C("last")[0];
        const lastNum = $content.$(":scope > article:last-child").C("num")[0].textContent;
        // 指定レス番号へ
        if (0 < jumpResNum && jumpResNum <= lastNum) {
          threadContent.select(jumpResNum, false, true, -60);
        // 最終既読位置へ
        } else if ($last != null) {
          let left;
          const offset = (left = $last.attr("last-offset")) != null ? left : 0;
          threadContent.scrollTo($last, false, +offset);
        }
      })();

      //スクロールされなかった場合も余所の処理を走らすためにscrollを発火
      if (!onScroll) {
        $content.emit(new Event("scroll"));
      }

      //二度目以降のread_state_attached時
      $view.on("read_state_attached", function({ detail: {jumpResNum, requestReloadFlag, loadCount} = {} }) {
        // リロード時の一回目の処理
        let $res, dom;
        if (requestReloadFlag && (loadCount === 1)) {
          defaultScroll();
          return;
        }

        let moveMode = "new";
        //通常時と自動更新有効時で、更新後のスクロールの動作を変更する
        if ($view.hasClass("autoload") && !$view.hasClass("autoload_pause")) { moveMode = app.config.get("auto_load_move"); }
        switch (moveMode) {
          case "new":
            var lastNum = +__guard__($content.$(":scope > article:last-child"), x => x.C("num")[0].textContent);
            if (0 < jumpResNum && jumpResNum <= lastNum) {
              threadContent.select(jumpResNum, false, true, -60);
            } else {
              let $tmp;
              let offset = -100;
              for (dom of $content.child()) {
                if (dom.matches(".last.received + article")) {
                  $tmp = dom;
                  break;
                }
              }
              // 新着が存在しない場合はスクロールを実行するためにレスを探す
              if ($tmp == null) {
                let left;
                $tmp = $content.$(":scope > article.last");
                offset = (left = ($tmp != null ? $tmp.attr("last-offset") : undefined)) != null ? left : -100;
              }
              if ($tmp == null) { $tmp = $content.$(":scope > article.read"); }
              if ($tmp == null) { $tmp = $content.$(":scope > article:last-child"); }
              if ($tmp != null) { threadContent.scrollTo($tmp, true, +offset); }
            }
            break;
          case "surely_new":
            for (dom of $content.child()) {
              if (dom.matches(".last.received + article")) {
                $res = dom;
                break;
              }
            }
            if ($res != null) { threadContent.scrollTo($res, true); }
            break;
          case "latest50":
            var lastResNum = +__guard__($content.$(":scope > article.last"), x1 => x1.C("num")[0].textContent);
            var latest50ResNum = +__guard__($content.$(":scope > article.latest50"), x2 => x2.C("num")[0].textContent);
            if (latest50ResNum > lastResNum) {
              threadContent.scrollTo(latest50ResNum, true);
            }
            break;
          case "newest":
            $res = $content.$(":scope > article:last-child");
            if ($res != null) { threadContent.scrollTo($res, true); }
            break;
        }
      });
    }
    , {once: true});

    let jumpResNum = -1;
    const iframe = parent.$$.$(`iframe[data-url=\"${viewUrlStr}\"]`);
    if (iframe) {
      jumpResNum = +iframe.dataset.writtenResNum;
      if (jumpResNum < 1) { jumpResNum = +iframe.dataset.paramResNum; }
    }


    try {
      await app.viewThread._draw($view, {jumpResNum});
    } catch (error1) {}
    const boardUrl = viewUrl.toBoard();
    try {
      boardTitle = await app.BoardTitleSolver.ask(boardUrl);
    } catch (error2) {
      boardTitle = "";
    }
    if (!app.config.isOn("no_history")) { app.History.add(viewUrlStr, document.title, openedAt, boardTitle); }
  })();

  //レスメニュー表示(ヘッダー上)
  const onHeaderMenu = async function(e) {
    const target = e.target.closest("article > header");
    if (target == null) { return; }
    if (target.tagName === "A") { return; }

    // id/参照ポップアップの表示処理との競合回避
    if (
      (e.type === "click") &&
      (app.config.get("popup_trigger") === "click") &&
      e.target.matches(".id.link, .id.freq, .anchor_id, .slip.link, .slip.freq, .trip.link, .trip.freq, .rep.link, .rep.freq")
    ) {
      return;
    }

    if (e.type === "contextmenu") {
      e.preventDefault();
    }

    const $article = target.parent();
    const $menu = $$.I("template_res_menu").content.$(".res_menu").cloneNode(true);
    $menu.addClass("hidden");
    let altParent = null;
    if ($article.parent().hasClass("popup")) {
      altParent = $view.C("popup_area")[0];
      altParent.addLast($menu);
      $menu.setAttr("resnum", $article.C("num")[0].textContent);
      $article.parent().addClass("has_contextmenu");
    } else {
      $article.addLast($menu);
    }

    const $toggleAaMode = $menu.C("toggle_aa_mode")[0];
    if ($article.parent().hasClass("config_use_aa_font")) {
      $toggleAaMode.textContent = $article.hasClass("aa") ? "AA表示モードを解除" : "AA表示モードに変更";
    } else {
      $toggleAaMode.remove();
    }

    if ($article.dataset.id == null) {
      $menu.C("copy_id")[0].remove();
      $menu.C("add_id_to_ngwords")[0].remove();
    }

    if ($article.dataset.slip == null) {
      $menu.C("copy_slip")[0].remove();
      $menu.C("add_slip_to_ngwords")[0].remove();
    }

    if ($article.dataset.trip == null) {
      $menu.C("copy_trip")[0].remove();
    }

    if (!canWrite()) {
      $menu.C("res_to_this")[0].remove();
      $menu.C("res_to_this2")[0].remove();
    }

    if ($article.hasClass("written")) {
      $menu.C("add_writehistory")[0].remove();
    } else {
      $menu.C("del_writehistory")[0].remove();
    }

    if (!$article.matches(".popup > article")) {
      $menu.C("jump_to_this")[0].remove();
    }

    // 画像にぼかしをかける/画像のぼかしを解除する
    if (!$article.hasClass("has_image")) {
      $menu.C("set_image_blur")[0].remove();
      $menu.C("reset_image_blur")[0].remove();
    } else {
      if ($article.$(".thumbnail.image_blur[media-type='image'], .thumbnail.image_blur[media-type='video']") != null) {
        $menu.C("set_image_blur")[0].remove();
      } else {
        $menu.C("reset_image_blur")[0].remove();
      }
    }

    await app.defer();
    if (getSelection().toString().length === 0) {
      $menu.C("copy_selection")[0].remove();
      $menu.C("search_selection")[0].remove();
    }

    $menu.removeClass("hidden");
    UI.ContextMenu($menu, e.clientX, e.clientY, altParent);
  };

  $view.on("click", onHeaderMenu);
  $view.on("contextmenu", onHeaderMenu);

  //レスメニュー表示(内容上)
  $view.on("contextmenu", function({target}) {
    if (!target.matches("article > .message")) { return; }
    // 選択範囲をNG登録
    app.ContextMenus.update("add_selection_to_ngwords", {
      onclick(info, tab) {
        const selectedText = getSelection().toString();
        if (selectedText.length > 0) {
          app.NG.add(selectedText);
          threadContent.refreshNG();
        }
      }
    });
  });

  //レスメニュー項目クリック
  $view.on("click", function({target}) {
    let addString, exDate, selectedText;
    if (!target.matches(".res_menu > li")) { return; }
    let $res = target.closest("article");
    if (!$res) {
      const rn = target.closest(".res_menu").getAttr("resnum");
      for (let res of $view.$$(".popup.has_contextmenu > article")) {
        if (res.C("num")[0].textContent === rn) {
          $res = res;
          break;
        }
      }
    }

    if (target.hasClass("copy_selection")) {
      selectedText = getSelection().toString();
      if (selectedText.length > 0) { document.execCommand("copy"); }

    } else if (target.hasClass("search_selection")) {
      selectedText = getSelection().toString();
      if (selectedText.length > 0) {
        open(`https://www.google.co.jp/search?q=${selectedText}`, "_blank");
      }

    } else if (target.hasClass("copy_id")) {
      app.clipboardWrite($res.dataset.id);

    } else if (target.hasClass("copy_slip")) {
      app.clipboardWrite($res.dataset.slip);

    } else if (target.hasClass("copy_trip")) {
      app.clipboardWrite($res.dataset.trip);

    } else if (target.hasClass("add_id_to_ngwords")) {
      addString = $res.dataset.id;
      exDate = _getExpireDateString("id");
      if (exDate) { addString = `expireDate:${exDate},${addString}`; }
      app.NG.add(addString);
      threadContent.refreshNG();

    } else if (target.hasClass("add_slip_to_ngwords")) {
      addString = "Slip:" + $res.dataset.slip;
      exDate = _getExpireDateString("slip");
      if (exDate) { addString = `expireDate:${exDate},${addString}`; }
      app.NG.add(addString);
      threadContent.refreshNG();

    } else if (target.hasClass("jump_to_this")) {
      threadContent.scrollTo($res, true);

    } else if (target.hasClass("res_to_this")) {
      write({message: `>>${$res.C("num")[0].textContent}\n`});

    } else if (target.hasClass("res_to_this2")) {
      write({message: `\
>>${$res.C("num")[0].textContent}
${$res.C("message")[0].innerText.replace(/^/gm, '>')}\n\
`});

    } else if (target.hasClass("add_writehistory")) {
      threadContent.addWriteHistory($res);
      threadContent.addClassWithOrg($res, "written");

    } else if (target.hasClass("del_writehistory")) {
      threadContent.removeWriteHistory($res);
      threadContent.removeClassWithOrg($res, "written");

    } else if (target.hasClass("toggle_aa_mode")) {
      if ($res.hasClass("aa")) {
        AANoOverflow.unsetMiniAA($res);
      } else {
        AANoOverflow.setMiniAA($res);
      }

    } else if (target.hasClass("res_permalink")) {
      open(app.safeHref(viewUrlStr + $res.C("num")[0].textContent));

    // 画像をぼかす
    } else if (target.hasClass("set_image_blur")) {
      UI.MediaContainer.setImageBlur($res, true);

    // 画像のぼかしを解除する
    } else if (target.hasClass("reset_image_blur")) {
      UI.MediaContainer.setImageBlur($res, false);
    }

    target.parent().remove();
  });

  // アンカーポップアップ
  $view.on("mouseenter", function(e) {
    const {target} = e;
    if (!target.hasClass("anchor") && !target.hasClass("name_anchor")) { return; }

    let anchor = target.innerHTML;
    if (!target.hasClass("anchor")) { anchor = anchor.trim(); }

    popupHelper(target, e, () => {
      let $div;
      const $popup = $__("div");
      let resCount = 0;

      if (target.hasClass("disabled")) {
        $div = $__("div").addClass("popup_disabled");
        $div.textContent = target.dataset.disabledReason;
        $popup.addLast($div);
      } else {
        const anchorData = app.util.Anchor.parseAnchor(anchor);

        if (anchorData.targetCount >= 25) {
          $div = $__("div").addClass("popup_disabled");
          $div.textContent = "指定されたレスの量が極端に多いため、ポップアップを表示しません";
          $popup.addLast($div);
        } else if (0 < anchorData.targetCount) {
          resCount = anchorData.targetCount;
          const tmp = $content.child();
          for (let [start, end] of anchorData.segments) {
            for (let i = start, end1 = end, asc = start <= end1; asc ? i <= end1 : i >= end1; asc ? i++ : i--) {
              var res;
              const now = i-1;
              if (!(res = tmp[now])) { break; }
              if (res.hasClass("ng") && !res.hasClass("disp_ng")) { continue; }
              $popup.addLast(res.cloneNode(true));
            }
          }
        }
      }

      const popupCount = $popup.child().length;
      if (popupCount === 0) {
        $div = $__("div").addClass("popup_disabled");
        $div.textContent = "対象のレスが見つかりません";
        $popup.addLast($div);
      } else if (popupCount < resCount) {
        $div = $__("div").addClass("ng_count");
        $div.setAttr("ng-count", resCount - popupCount);
        $popup.addLast($div);
      }

      return $popup;
    });
  }
  , true);

  //アンカーリンク
  $view.on("click", function(e) {
    const {target} = e;
    if (!target.hasClass("anchor")) { return; }
    e.preventDefault();
    if (target.hasClass("disabled")) { return; }

    const tmp = app.util.Anchor.parseAnchor(target.innerHTML);
    const targetResNum = tmp.segments[0] != null ? tmp.segments[0][0] : undefined;
    if (targetResNum != null) {
      threadContent.scrollTo(targetResNum, true);
    }
  });

  // サムネイルクリック読み込み
  if (lazyLoad.isManualLoad) {
    $view.on("click", function(e) {
      let {target: $target} = e;
      if (!$target.hasClass("thumbnail")) {
        $target = $target.parent(".thumbnail");
        if ($target == null) { return; }
      }
      const $medias = $target.$$("img[data-src], video[data-src]");
      if (!($medias.length > 0)) { return; }

      e.preventDefault();
      for (let $media of $medias) {
        lazyLoad.immediateLoad($media);
      }
    });
  }

  //通常リンク
  const onLink = async function(e) {
    const {target} = e;
    if (!target.matches(".message a:not(.anchor)")) { return; }

    //http、httpsスキーム以外ならクリックを無効化する
    if (!/^https?:$/.test(target.protocol)) {
      e.preventDefault();
      return;
    }

    //.open_in_rcrxが付与されている場合、処理は他モジュールに任せる
    if (target.hasClass("open_in_rcrx")) { return; }

    let targetUrlStr = target.href;
    const targetUrl = new app.URL.URL(targetUrlStr);
    const {type: srcType, bbsType} = targetUrl.guessType();
    targetUrlStr = targetUrl.href;

    //read.crxで開けるURLかどうかを判定
    const flg = (function() {
      //スレのURLはほぼ確実に判定できるので、そのままok
      if (srcType === "thread") { return true; }
      //2chタイプ以外の板urlもほぼ確実に判定できる
      if ((srcType === "board") && (bbsType !== "2ch")) { return true; }
      //2chタイプの板は誤爆率が高いので、もう少し細かく判定する
      if ((srcType === "board") && (bbsType === "2ch")) {
        //2ch自体の場合の判断はguess_typeを信じて板判定
        if (targetUrl.getTsld() === "5ch.net") { return true; }
        //ブックマークされている場合も板として判定
        if (app.bookmark.get(targetUrlStr)) { return true; }
      }
      return false;
    })();

    //read.crxで開ける板だった場合は.open_in_rcrxを付与して再度クリックイベント送出
    if (flg) {
      e.preventDefault();
      target.addClass("open_in_rcrx");
      target.dataset.href = targetUrlStr;
      target.href = "javascript:undefined;";
      if (srcType === "thread") {
        const paramResNum = targetUrl.getResNumber();
        if (paramResNum) { target.dataset.paramResNum = paramResNum; }
      }
      await app.defer();
      target.emit(e);
    }
  };

  $view.on("click", onLink);
  $view.on("mousedown", onLink);

  //リンク先情報ポップアップ
  $view.on("mouseenter", async function(e) {
    let after, boardUrl;
    const {target} = e;
    if (!target.matches(".message a:not(.anchor)")) { return; }
    const url = new app.URL.URL(target.href);
    url.convertFromPhone();
    switch (url.guessType().type) {
      case "board":
        boardUrl = url;
        after = "";
        break;
      case "thread":
        boardUrl = url.toBoard();
        after = "のスレ";
        break;
      default:
        return;
    }

    try {
      const title = await app.BoardTitleSolver.ask(boardUrl);
      popupHelper(target, e, () => {
        const $div = $__("div").addClass("popup_linkinfo");
        const $div2 = $__("div");
        $div2.textContent = title + after;
        $div.addLast($div2);
        return $div;
      });
    } catch (error1) {}
  }
  , true);

  //IDポップアップ
  $view.on(app.config.get("popup_trigger"), function(e) {
    const {target} = e;
    if (!target.matches(".id.link, .id.freq, .anchor_id, .slip.link, .slip.freq, .trip.link, .trip.freq")) { return; }
    e.preventDefault();

    popupHelper(target, e, () => {
      let $div, resNum, targetRes;
      const $article = target.closest("article");
      const $popup = $__("div");

      let id = "";
      let slip = "";
      let trip = "";
      if (target.hasClass("anchor_id")) {
        id = target.textContent
          .replace(/^id:/i, "ID:")
          .replace(/\(\d+\)$/, "")
          .replace(/\u25cf$/, ""); //末尾●除去
        $popup.addClass("popup_id");
      } else if (target.hasClass("id")) {
        ({
          id
        } = $article.dataset);
        $popup.addClass("popup_id");
      } else if (target.hasClass("slip")) {
        ({
          slip
        } = $article.dataset);
        $popup.addClass("popup_slip");
      } else if (target.hasClass("trip")) {
        ({
          trip
        } = $article.dataset);
        $popup.addClass("popup_trip");
      }

      let nowPopuping = "";
      const $parentArticle = $article.parent();
      if (
        $parentArticle.hasClass("popup_id") &&
        ($article.dataset.id === id)
      ) {
        nowPopuping = "IP/ID";
      } else if (
        $parentArticle.hasClass("popup_slip") &&
        ($article.dataset.slip === slip)
      ) {
        nowPopuping = "SLIP";
      } else if (
        $parentArticle.hasClass("popup_trip") &&
        ($article.dataset.trip === trip)
      ) {
        nowPopuping = "トリップ";
      }

      let resCount = 0;
      if (nowPopuping !== "") {
        $div = $__("div").addClass("popup_disabled");
        $div.textContent = `現在ポップアップしている${nowPopuping}です`;
        $popup.addLast($div);
      } else if (threadContent.idIndex.has(id)) {
        resCount = threadContent.idIndex.get(id).size;
        for (resNum of threadContent.idIndex.get(id)) {
          targetRes = $content.child()[resNum - 1];
          if (targetRes.hasClass("ng") && !targetRes.hasClass("disp_ng")) { continue; }
          $popup.addLast(targetRes.cloneNode(true));
        }
      } else if (threadContent.slipIndex.has(slip)) {
        resCount = threadContent.slipIndex.get(slip).size;
        for (resNum of threadContent.slipIndex.get(slip)) {
          targetRes = $content.child()[resNum - 1];
          if (targetRes.hasClass("ng") && !targetRes.hasClass("disp_ng")) { continue; }
          $popup.addLast(targetRes.cloneNode(true));
        }
      } else if (threadContent.tripIndex.has(trip)) {
        resCount = threadContent.tripIndex.get(trip).size;
        for (resNum of threadContent.tripIndex.get(trip)) {
          targetRes = $content.child()[resNum - 1];
          if (targetRes.hasClass("ng") && !targetRes.hasClass("disp_ng")) { continue; }
          $popup.addLast(targetRes.cloneNode(true));
        }
      }

      const popupCount = $popup.child().length;
      if (popupCount === 0) {
        $div = $__("div").addClass("popup_disabled");
        $div.textContent = "対象のレスが見つかりません";
        $popup.addLast($div);
      } else if (popupCount < resCount) {
        $div = $__("div").addClass("ng_count");
        $div.setAttr("ng-count", resCount - popupCount);
        $popup.addLast($div);
      }
      return $popup;
    });
  }
  , true);

  //リプライポップアップ
  $view.on(app.config.get("popup_trigger"), function(e) {
    const {target} = e;
    if (!target.hasClass("rep")) { return; }
    popupHelper(target, e, () => {
      let $div;
      const tmp = $content.child();

      const frag = $_F();
      const resNum = +target.closest("article").C("num")[0].textContent;
      for (let targetResNum of threadContent.repIndex.get(resNum)) {
        const targetRes = tmp[targetResNum - 1];
        if (targetRes.hasClass("ng") && (!targetRes.hasClass("disp_ng") || app.config.isOn("reject_ng_rep"))) { continue; }
        frag.addLast(targetRes.cloneNode(true));
      }

      const $popup = $__("div");
      $popup.addLast(frag);
      const resCount = threadContent.repIndex.get(resNum).size;
      const popupCount = $popup.child().length;
      if (popupCount === 0) {
        $div = $__("div").addClass("popup_disabled");
        $div.textContent = "対象のレスが見つかりません";
        $popup.addLast($div);
      } else if ((popupCount < resCount) && !app.config.isOn("reject_ng_rep")) {
        $div = $__("div").addClass("ng_count");
        $div.setAttr("ng-count", resCount - popupCount);
        $popup.addLast($div);
      }
      return $popup;
    });
  }
  , true);

  // 展開済みURLのポップアップ
  $view.on("mouseenter", function(e) {
    const {target} = e;
    if (!target.hasClass("has_expandedURL")) { return; }
    if (app.config.get("expand_short_url") !== "popup") { return; }
    popupHelper(target, e, () => {
      const targetUrl = target.href;

      const frag = $_F();
      let sib = target;
      while (true) {
        sib = sib.next();
        if(
          (sib != null ? sib.hasClass("expandedURL") : undefined) &&
          ((sib != null ? sib.getAttr("short-url") : undefined) === targetUrl)
        ) {
          frag.addLast(sib.cloneNode(true));
          break;
        }
      }

      frag.$(".expandedURL").removeClass("hide_data");
      const $popup = $__("div");
      $popup.addLast(frag);
      return $popup;
    });
  }
  , true);

  // リンクのコンテキストメニュー
  $view.on("contextmenu", function({target}) {
    let menuTitle;
    if (!target.matches(".message > a")) { return; }
    // リンクアドレスをNG登録
    let enableFlg = !(target.hasClass("anchor") || target.hasClass("anchor_id"));
    app.ContextMenus.update("add_link_to_ngwords", {
      enabled: enableFlg,
      onclick: (info, tab) => {
        app.NG.add(target.href);
        threadContent.refreshNG();
      }
    });
    // レス番号を指定してリンクを開く
    if (app.config.isOn("enable_link_with_res_number")) {
      menuTitle = "レス番号を無視してリンクを開く";
    } else {
      menuTitle = "レス番号を指定してリンクを開く";
    }
    enableFlg = (target.hasClass("open_in_rcrx") && (target.dataset.paramResNum !== undefined));
    app.ContextMenus.update("open_link_with_res_number", {
      title: menuTitle,
      enabled: enableFlg,
      onclick: async (info, tab) => {
        target.setAttr("toggle-param-res-num", "on");
        await app.defer();
        target.emit(new Event("mousedown", {"bubbles": true}));
      }
    });
  });

  // 画像のコンテキストメニュー
  $view.on("contextmenu", function({target}) {
    let menuTitle;
    if (!target.matches("img, video, audio")) { return; }
    switch (target.tagName) {
      case "IMG":
        menuTitle = "画像のアドレスをNG指定";
        // リンクアドレスをNG登録
        app.ContextMenus.update("add_link_to_ngwords", {
          enabled: true,
          onclick: (info, tab) => {
            app.NG.add(target.parent().href);
            threadContent.refreshNG();
          }
        });
        break;
      case "VIDEO":
        menuTitle = "動画のアドレスをNG指定";
        break;
      case "AUDIO":
        menuTitle = "音声のアドレスをNG指定";
        break;
    }
    // メディアのアドレスをNG登録
    app.ContextMenus.update("add_media_to_ngwords", {
      title: menuTitle,
      onclick: (info, tab) => {
        app.NG.add(target.src);
        threadContent.refreshNG();
      }
    });
  });

  //何もないところをダブルクリックすると更新する
  $view.on("dblclick", function({target}) {
    if (!app.config.isOn("dblclick_reload")) { return; }
    if (!target.hasClass("message")) { return; }
    if ((target.tagName === "A") || target.hasClass("thumbnail")) { return; }
    $view.emit(new Event("request_reload"));
  });

  var _getExpireDateString = function(type) {
    let dStr = null;
    let exDate = null;
    if (["id", "slip"].includes(type)) {
      switch (app.config.get(`ng_${type}_expire`)) {
        case "date":
          var d = Date.now() + (+app.config.get(`ng_${type}_expire_date`) * 86400 * 1000);
          exDate = new Date(d);
          break;
        case "day":
          var t = new Date();
          var dDay = +app.config.get(`ng_${type}_expire_day`) - t.getDay();
          if (dDay < 1) { dDay += 7; }
          d = Date.now() + (dDay * 86400 * 1000);
          exDate = new Date(d);
          break;
      }
    }
    if (exDate) {
      dStr = exDate.getFullYear() + "/" + (exDate.getMonth() + 1) + "/" + exDate.getDate();
    }
    return dStr;
  };

  //クイックジャンプパネル
  (function() {
    const jumpArticleSelector = {
      ".jump_one": "article:first-child",
      ".jump_newest": "article:last-child",
      ".jump_not_read": "article.read + article",
      ".jump_new": "article.received + article",
      ".jump_last": "article.last",
      ".jump_latest50": "article.latest50"
    };

    const $jumpPanel = $view.C("jump_panel")[0];

    $view.on("read_state_attached", function() {
      const already = {};
      for (let panelItemSelector in jumpArticleSelector) {
        var resNum;
        const targetResSelector = jumpArticleSelector[panelItemSelector];
        const res = $view.$(targetResSelector);
        if (res) { resNum = +res.C("num")[0].textContent; }
        if (res && !already[resNum]) {
          $jumpPanel.$(panelItemSelector).style.display = "block";
          already[resNum] = true;
        } else {
          $jumpPanel.$(panelItemSelector).style.display = "none";
        }
      }
    });

    $jumpPanel.on("click", function({target}) {
      let key, offset, selector;
      for (key in jumpArticleSelector) {
        const val = jumpArticleSelector[key];
        if (target.matches(key)) {
          selector = val;
          offset = [".jump_not_read", ".jump_new"].includes(key) ? -100 : 0;
          break;
        }
      }

      if (!selector) { return; }
      const $res = $view.$(selector);

      if ($res != null) {
        if (key === ".jump_last") {
          let left;
          offset = (left = $res.attr("last-offset")) != null ? left : offset;
        }
        threadContent.scrollTo($res, true, +offset);
      } else {
        app.log("warn", "[view_thread] .jump_panel: ターゲットが存在しません");
      }
    });
  })();

  //検索ボックス
  (function() {
    let searchStoredScrollTop = null;
    const $searchbox = $view.C("searchbox")[0];

    $searchbox.on("compositionend", function() {
      this.emit(new Event("input"));
    });
    $searchbox.on("input", function({ isComposing, detail: {isEnter = false} = {} }) {
      let dom, scrollTop;
      if (isComposing) { return; }
      const searchRegExpMode = $content.hasClass("search_regexp");
      if (searchRegExpMode && !isEnter) { return; }
      let searchRegExp = null;
      if (searchRegExpMode && (this.value !== "")) {
        try {
          searchRegExp = new RegExp(this.value, "i");
        } catch (e) {
          app.message.send("notify", {
            message: "正規表現が正しくありません。",
            background_color: "red"
          }
          );
          return;
        }
      }

      $content.emit(new Event("searchstart"));
      if (this.value !== "") {
        if (typeof searchStoredScrollTop !== "number") {
          searchStoredScrollTop = $content.scrollTop;
        }

        let hitCount = 0;
        const query = app.util.normalize(this.value);

        ({
          scrollTop
        } = $content);

        $content.addClass("searching");
        for (dom of $content.child()) {
          if (
            ((searchRegExp && searchRegExp.test(dom.textContent)) ||
             app.util.normalize(dom.textContent).includes(query)) &&
            (!dom.hasClass("ng") || dom.hasClass("disp_ng"))
          ) {
            dom.addClass("search_hit");
            hitCount++;
          } else {
            dom.removeClass("search_hit");
          }
        }
        $content.dataset.resSearchHitCount = hitCount;
        $view.C("hit_count")[0].textContent = `${hitCount}hit`;

        if (scrollTop === $content.scrollTop) {
          $content.emit(new Event("scroll"));
        }
      } else {
        $content.removeClass("searching");
        $content.removeAttr("data-res-search-hit-count");
        const iterable = $view.C("search_hit");
        for (let i = iterable.length - 1; i >= 0; i--) {
          dom = iterable[i];
          dom.removeClass("search_hit");
        }
        $view.C("hit_count")[0].textContent = "";

        if (typeof searchStoredScrollTop === "number") {
          $content.scrollTop = searchStoredScrollTop;
          searchStoredScrollTop = null;
        }
      }

      $content.emit(new Event("searchfinish"));
    });

    $searchbox.on("keydown", function({key}) {
      if ($content.hasClass("search_regexp")) {
        if (["Enter", "Escape"].includes(key)) {
          if (key === "Escape") { this.value = ""; }
          this.emit(new CustomEvent("input", {detail: {isEnter: true}}));
        }
        return;
      }
      if (key === "Escape") {
        if (this.value !== "") {
          this.value = "";
          this.emit(new Event("input"));
        }
      }
    });

    // 検索モードの切り替え
    $view.on("change_search_regexp", function() {
      $content.toggleClass("search_regexp");
      $searchbox.emit(new CustomEvent("input", {detail: {isEnter: true}}));
    });
  })();

  //フッター表示処理
  (function() {
    let canBeShown = false;
    const observer = new IntersectionObserver( function(changes) {
      for (let {boundingClientRect, rootBounds} of changes) {
        canBeShown = (boundingClientRect.top < rootBounds.height);
      }
      return updateThreadFooter();
    }
    , {root: $content, threshold: [0, 0.05, 0.5, 0.95, 1.0]});
    const setObserve = function() {
      observer.disconnect();
      let $ele = $content.last();
      if ($ele == null) { return; }
      while (threadContent.isHidden($ele)) {
        const $pEle = $ele.prev();
        if ($pEle == null) { break; }
        $ele = $pEle;
      }
      if ($ele != null) { observer.observe($ele); }
    };

    //未読ブックマーク数表示
    const $nextUnread = {
      _ele: $view.C("next_unread")[0],
      show() {
        let bookmark, read;
        let next = null;

        const bookmarks = app.bookmark.getAll().filter( ({type, url}) => (type === "thread") && (url !== viewUrlStr));

        //閲覧中のスレッドに新着が有った場合は優先して扱う
        if (bookmark = app.bookmark.get(viewUrlStr)) {
          bookmarks.unshift(bookmark);
        }

        for (bookmark of bookmarks) {
          if (bookmark.resCount != null) {var iframe;
          
            read = null;

            if (iframe = parent.$$.$(`[data-url=\"${bookmark.url}\"]`)) {
              read = __guardMethod__(iframe.contentWindow, '$$', o => o.$$(".content > article").length);
            }

            if (!read) {
              read = (bookmark.readState != null ? bookmark.readState.read : undefined) || 0;
            }

            if (bookmark.resCount > read) {
              next = bookmark;
              break;
            }
          }
        }

        if (next) {
          let text;
          if (next.url === viewUrlStr) {
            text = "新着レスがあります";
          } else {
            text = `未読ブックマーク: ${next.title}`;
          }
          if (next.resCount != null) {
            text += ` (未読${next.resCount - ((next.readState != null ? next.readState.read : undefined) || 0)}件)`;
          }
          this._ele.href = app.safeHref(next.url);
          this._ele.textContent = text;
          this._ele.dataset.title = next.title;
          this._ele.removeClass("hidden");
        } else {
          this.hide();
        }
      },
      hide() {
        this._ele.addClass("hidden");
      }
    };

    const $searchNextThread = {
      _ele: $view.C("search_next_thread")[0],
      show() {
        if (
          ($content.child().length >= 1000) ||
          $view.C("message_bar")[0].hasClass("error") ||
          $view.hasClass("expired") ||
          $view.hasClass("over1000")
        ) {
          this._ele.removeClass("hidden");
        } else {
          this.hide();
        }
      },
      hide() {
        this._ele.addClass("hidden");
      }
    };

    var updateThreadFooter = function() {
      if (canBeShown) {
        $nextUnread.show();
        $searchNextThread.show();
      } else {
        $nextUnread.hide();
        $searchNextThread.hide();
      }
    };

    $view.on("tab_selected", function() {
      updateThreadFooter();
    });
    $view.on("view_loaded", function() {
      setObserve();
      updateThreadFooter();
    });
    $view.on("view_refreshed", function() {
      setObserve();
      updateThreadFooter();
    });
    app.message.on("bookmark_updated", function() {
      if (canBeShown) {
        $nextUnread.show();
      }
    });
    $view.on("became_expired", function() {
      updateThreadFooter();
    });
    $view.on("became_over1000", function() {
      updateThreadFooter();
    });

    //次スレ検索
    for (let dom of $view.$$(".button_tool_search_next_thread, .search_next_thread")) {
      dom.on("click", function() {
        searchNextThread.show();
        searchNextThread.search(viewUrlStr, document.title, $content.textContent);
      });
    }
  })();

  //パンくずリスト表示
  (async function() {
    let title;
    const boardUrl = viewUrl.toBoard();
    try {
      title = (await app.BoardTitleSolver.ask(boardUrl)).replace(/板$/, "");
    } catch (error1) {
      title = "";
    }
    const $a = $view.$(".breadcrumb > li > a");
    $a.href = boardUrl.href;
    $a.textContent = `${title}板`;
    $a.addClass("hidden");
    // Windows版Chromeで描画が崩れる現象を防ぐため、わざとリフローさせる。
    await app.defer();
    $view.$(".breadcrumb > li > a").style.display = "inline-block";
  })();

});

app.viewThread._draw = async function($view, {forceUpdate = false, jumpResNum = -1} = {}) {
  let ok;
  const threadContent = app.DOMData.get($view, "threadContent");
  $view.addClass("loading");
  $view.style.cursor = "wait";
  const $reloadButton = $view.C("button_reload")[0];
  $reloadButton.addClass("disabled");
  let loadCount = 0;

  const fn = async function(thread, error) {
    const $messageBar = $view.C("message_bar")[0];
    if (error) {
      $messageBar.addClass("error");
      $messageBar.innerHTML = thread.message;
    } else {
      $messageBar.removeClass("error");
      $messageBar.removeChildren();
    }

    if (thread.res == null) {
      throw new Error("スレの取得に失敗しました");
    }

    document.title = thread.title;

    await threadContent.addItem(thread.res.slice($view.C("content")[0].child().length), thread.title);
    loadCount++;
    const lazyLoad = app.DOMData.get($view, "lazyload");
    if (!lazyLoad.isManualLoad) { lazyLoad.scan(); }

    if (!$view.hasClass("expired") && thread.expired) {
      $view.emit(new Event("became_expired"));
    }

    if (!$view.hasClass("over1000") && (threadContent.over1000ResNum != null)) {
      $view.emit(new Event("became_over1000"));
    }

    if ($view.C("content")[0].hasClass("searching")) {
      $view.C("searchbox")[0].emit(new Event("input"));
    }

    $view.emit(new CustomEvent("view_loaded", {detail: {jumpResNum, loadCount}}));
    return thread;
  };

  const thread = new app.Thread($view.dataset.url);
  let threadSetFromCacheBeforeHTTPPromise = Promise.resolve();
  var threadGetPromise = app.util.promiseWithState(thread.get(forceUpdate, function() {
    // 通信する前にキャッシュを取得して一旦表示する
    if (!threadGetPromise.isResolved()) {
      threadSetFromCacheBeforeHTTPPromise = fn(thread, false);
    }
  }));
  try {
    await threadGetPromise.promise;
  } catch (error) {}
  try {
    await threadSetFromCacheBeforeHTTPPromise;
  } catch (error1) {}
  try {
    await fn(thread, !threadGetPromise.isResolved());
    ok = true;
  } catch (error2) {
    ok = false;
  }
  $view.removeClass("loading");
  $view.style.cursor = "auto";
  if (!ok) {
    throw new Error("スレの表示に失敗しました");
  }
  (async function() {
    await app.wait5s();
    $reloadButton.removeClass("disabled");
  })();
  return thread;
};

app.viewThread._readStateManager = async function($view) {
  let readState;
  const threadContent = app.DOMData.get($view, "threadContent");
  const $content = $view.C("content")[0];
  let viewUrlStr = $view.dataset.url;
  const viewUrl = new app.URL.URL(viewUrlStr);
  viewUrlStr = viewUrl.href;
  const boardUrlStr = viewUrl.toBoard().href;
  let requestReloadFlag = false;
  let scanCountByReloaded = 0;
  const attachedReadState = {last: 0, read: 0, received: 0, offset: null};
  let readStateUpdated = false;
  let allRead = false;

  //read_stateの取得
  const getReadState = (async function() {
    let bookmark;
    let readState = {received: 0, read: 0, last: 0, url: viewUrlStr, offset: null, date:null};
    readStateUpdated = false;
    if (__guard__((bookmark = app.bookmark.get(viewUrlStr)), x => x.readState) != null) {
      ({readState} = bookmark);
    }
    const _readState = await app.ReadState.get(viewUrlStr);
    if (app.util.isNewerReadState(readState, _readState)) { readState = _readState; }
    return {readState, readStateUpdated};
  })();

  //スレの描画時に、read_state関連のクラスを付与する
  $view.on("view_loaded", async function({ detail: {jumpResNum, loadCount} }) {
    const contentChild = $content.child();
    const contentLength = contentChild.length;
    if (loadCount === 1) {
      // 初回の処理
      let readState;
      ({readState, readStateUpdated} = await getReadState);
      __guard__($content.C("last")[0], x => x.removeClass("last"));
      __guard__($content.C("read")[0], x1 => x1.removeClass("read"));
      __guard__($content.C("received")[0], x2 => x2.removeClass("received"));
      __guard__($content.C("latest50")[0], x3 => x3.removeClass("latest50"));

      // キャッシュの内容が古い場合にreadStateの内容の方が大きくなることがあるので
      // その場合は次回の処理に委ねる
      if (readState.last <= contentLength) {
        __guard__(contentChild[readState.last - 1], x4 => x4.addClass("last"));
        __guard__(contentChild[readState.last - 1], x5 => x5.attr("last-offset", readState.offset));
        attachedReadState.last = -1;
      } else {
        attachedReadState.last = readState.last;
        attachedReadState.offset = readState.offset;
      }
      if (readState.read <= contentLength) {
        __guard__(contentChild[readState.read - 1], x6 => x6.addClass("read"));
        attachedReadState.read = -1;
      } else {
        attachedReadState.read = readState.read;
      }
      if (readState.received <= contentLength) {
        __guard__(contentChild[readState.received - 1], x7 => x7.addClass("received"));
        attachedReadState.received = -1;
      } else {
        attachedReadState.received = readState.received;
      }
      if (contentLength > 50) {
        __guard__(contentChild[contentLength - 51], x8 => x8.addClass("latest50"));
      }

      $view.emit(new CustomEvent("read_state_attached", {detail: {jumpResNum, requestReloadFlag, loadCount}}));
      if ((attachedReadState.read > 0) && (attachedReadState.received > 0)) {
        app.message.send("read_state_updated", {board_url: boardUrlStr, read_state: readState});
        if (allRead) {
          readState.date = Date.now();
          app.ReadState.set(readState);
          app.bookmark.updateReadState(readState);
          readStateUpdated = false;
          allRead = false;
        }
      }
      return;
    }
    // 2回目の処理
    // 画像のロードにより位置がずれることがあるので初回処理時の内容を使用する
    const tmpReadState = {read: null, received: null, url: viewUrlStr};
    if (attachedReadState.last > 0) {
      __guard__($content.C("last")[0], x9 => x9.removeClass("last"));
      __guard__(contentChild[attachedReadState.last - 1], x10 => x10.addClass("last"));
      __guard__(contentChild[attachedReadState.last - 1], x11 => x11.attr("last-offset", attachedReadState.offset));
    }
    if (attachedReadState.read > 0) {
      __guard__($content.C("read")[0], x12 => x12.removeClass("read"));
      __guard__(contentChild[attachedReadState.read - 1], x13 => x13.addClass("read"));
      tmpReadState.read = attachedReadState.read;
    }
    if (attachedReadState.received > 0) {
      __guard__($content.C("received")[0], x14 => x14.removeClass("received"));
      __guard__(contentChild[attachedReadState.received - 1], x15 => x15.addClass("received"));
      tmpReadState.received = attachedReadState.received;
    }
    if (contentLength > 50) {
      __guard__($content.C("latest50")[0], x16 => x16.removeClass("latest50"));
      __guard__(contentChild[contentLength - 51], x17 => x17.addClass("latest50"));
    }

    $view.emit(new CustomEvent("read_state_attached", {detail: {jumpResNum, requestReloadFlag, loadCount}}));
    if (tmpReadState.read && tmpReadState.received) {
      app.message.send("read_state_updated", {board_url: boardUrlStr, read_state: tmpReadState});
      if (allRead) {
        attachedReadState.date = Date.now();
        app.ReadState.set(attachedReadState);
        app.bookmark.updateReadState(attachedReadState);
        readStateUpdated = false;
        allRead = false;
      }
    }
    requestReloadFlag = false;
  });

  ({readState, readStateUpdated} = await getReadState);
  const scan = function(byScroll) {
    let last;
    if (byScroll == null) { byScroll = false; }
    const received = $content.child().length;
    //onbeforeunload内で呼び出された時に、この値が0になる場合が有る
    if (received === 0) { return; }

    // 既読情報が存在しない場合readState.lastは0
    if (readState.last === 0) {
      last = threadContent.getRead(1);
    } else {
      last = threadContent.getRead(readState.last);
    }

    if (requestReloadFlag && !byScroll) { scanCountByReloaded++; }

    if (readState.received < received) {
      readState.received = received;
      readStateUpdated = true;
    }

    const lastDisplay = threadContent.getDisplay(last);
    if (lastDisplay) {
      if (
        (!requestReloadFlag || (scanCountByReloaded === 1)) &&
        !lastDisplay.bottom
      ) {
        if (
          (readState.last !== lastDisplay.resNum) ||
          (readState.offset !== lastDisplay.offset)
        ) {
          readState.last = lastDisplay.resNum;
          readState.offset = lastDisplay.offset;
          readStateUpdated = true;
        }
      } else if (readState.last !== last) {
        readState.last = last;
        readState.offset = null;
        readStateUpdated = true;
      }
    }

    if (readState.read < last) {
      readState.read = last;
      readStateUpdated = true;
      if (readState.read === received) { allRead = true; }
    }

  };

  //アンロード時は非同期系の処理をzombie.htmlに渡す
  //そのためにlocalStorageに更新するread_stateの情報を渡す
  const onBeforezombie = function() {
    scan();
    if (readStateUpdated) {
      let data;
      if (localStorage.zombie_read_state != null) {
        data = JSON.parse(localStorage["zombie_read_state"]);
      } else {
        data = [];
      }
      readState.date = Date.now();
      data.push(readState);
      localStorage["zombie_read_state"] = JSON.stringify(data);
    }
  };

  parent.window.on("beforezombie", onBeforezombie);

  //スクロールされたら定期的にスキャンを実行する
  let doneScroll = false;
  let isScaning = false;
  const scrollWatcher = setInterval( function() {
    if (!doneScroll || isScaning) { return; }
    isScaning = true;
    (async function() {
      await app.waitAF();
      scan(true);
      if (readStateUpdated) {
        app.message.send("read_state_updated", {board_url: boardUrlStr, read_state: readState});
      }
      if (allRead) {
        readState.date = Date.now();
        app.ReadState.set(readState);
        app.bookmark.updateReadState(readState);
        readStateUpdated = false;
        allRead = false;
      }
      isScaning = false;
    })();
    doneScroll = false;
  }
  , 250);

  const scanAndSave = function() {
    scan();
    if (readStateUpdated) {
      readState.date = Date.now();
      app.ReadState.set(readState);
      app.bookmark.updateReadState(readState);
      readStateUpdated = false;
    }
  };

  app.message.on("request_update_read_state", function(param) {
    if (param == null) { param = {}; }
    const {board_url} = param;
    if ((board_url == null) || (board_url === boardUrlStr)) {
      scanAndSave();
    }
  });

  $content.on("scroll", function() {
    doneScroll = true;
  }
  , {passive: true});
  $view.on("request_reload", function() {
    requestReloadFlag = true;
    scanCountByReloaded = 0;
    scanAndSave();
  });
  $view.on("view_refreshed", function() {
    scanAndSave();
  });

  window.on("view_unload", function() {
    clearInterval(scrollWatcher);
    parent.window.off("beforezombie", onBeforezombie);
    //ロード中に閉じられた場合、スキャンは行わない
    if ($view.hasClass("loading")) { return; }
    scanAndSave();
  });
};

function __guard__(value, transform) {
  return (typeof value !== 'undefined' && value !== null) ? transform(value) : undefined;
}
function __guardMethod__(obj, methodName, transform) {
  if (typeof obj !== 'undefined' && obj !== null && typeof obj[methodName] === 'function') {
    return transform(obj, methodName);
  } else {
    return undefined;
  }
}