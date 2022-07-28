// TODO: This file was created by bulk-decaffeinate.
// Sanity-check the conversion and remove this comment.
/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS103: Rewrite code to no longer use __guard__, or convert again using --optional-chaining
 * DS104: Avoid inline assignments
 * DS202: Simplify dynamic range loops
 * DS204: Change includes calls to have a more natural evaluation order
 * DS206: Consider reworking classes to avoid initClass
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
let ThreadContent;
import MediaContainer from "./MediaContainer.js";

/**
@class ThreadContent
@constructor
@param {String} URL
@param {Element} container
*/
export default ThreadContent = (function() {
  let _OVER1000_DATA = undefined;
  ThreadContent = class ThreadContent {
    static initClass() {
      _OVER1000_DATA = "Over 1000";
    }

    constructor(url, container) {
      /**
      @property url
      @type app.URL.URL
      */
      this.setNG = this.setNG.bind(this);
      this._chainNG = this._chainNG.bind(this);
      this._chainNgById = this._chainNgById.bind(this);
      this._chainNgBySlip = this._chainNgBySlip.bind(this);
      this._checkNG = this._checkNG.bind(this);
      this._getNgType = this._getNgType.bind(this);
      this.refreshNG = this.refreshNG.bind(this);
      this.container = container;
      this.url = url;

      /**
      @property urlStr
      @type String
      */
      this.urlStr = this.url.href;

      /**
      @property idIndex
      @type Object
      */
      this.idIndex = new Map();

      /**
      @property slipIndex
      @type Object
      */
      this.slipIndex = new Map();

      /**
      @property tripIndex
      @type Object
      */
      this.tripIndex = new Map();

      /**
      @property repIndex
      @type Object
      */
      this.repIndex = new Map();

      /**
      @property repNgIndex
      @type Object
      */
      this.repNgIndex = new Map();

      /**
      @property ancIndex
      @type Object
      */
      this.ancIndex = new Map();

      /**
      @property harmImgIndex
      @type Array
      */
      this.harmImgIndex = new Set();

      /**
      @property oneId
      @type null | String
      */
      this.oneId = null;

      /**
      @property over1000ResNum
      @type Number
      */
      this.over1000ResNum = null;

      /**
      @property _lastScrollInfo
      @type Object
      @private
      */
      this._lastScrollInfo = {
        resNum: 0,
        animate: false,
        offset: 0,
        animateTo: 0,
        animateChange: 0
      };

      /**
      @property _timeoutID
      @type Number
      @private
      */
      this._timeoutID = 0;

      /**
      @property _existIdAtFirstRes
      @type Boolean
      @private
      */
      this._existIdAtFirstRes = false;

      /**
      @property _existSlipAtFirstRes
      @type Boolean
      @private
      */
      this._existSlipAtFirstRes = false;

      /**
      @property _hiddenSelectors
      @type
      @private
      */
      this._hiddenSelectors = null;

      /**
      @property _isScrolling
      @type Boolean
      @private
      */
      this._isScrolling = false;

      /**
      @property _scrollRequestID
      @type Number
      @private
      */
      this._scrollRequestID = 0;

      /**
      @property _rawResData
      @type Array
      @private
      */
      this._rawResData = [];

      /**
      @property _ngIdForChain
      @type Object
      @private
      */
      this._ngIdForChain = new Set();

      /**
      @property _ngSlipForChain
      @type Object
      @private
      */
      this._ngSlipForChain = new Set();

      /**
      @property _resMessageMap
      @type Object
      @private
      */
      this._resMessageMap = new Map();

      /**
      @property _threadTitle
      @type String|null
      @private
      */
      this._threadTitle = null;

      try {
        this.harmfulReg = new RegExp(app.config.get("image_blur_word"));
        this.findHarmfulFlag = true;
      } catch (e) {
        app.message.send("notify", {
          message: `\
画像ぼかしの正規表現を読み込むのに失敗しました
画像ぼかし機能は無効化されます\
`,
          background_color: "red"
        }
        );
        this.findHarmfulFlag = false;
      }

      this.container.on("scrollstart", () => {
        this._isScrolling = true;
      });
      this.container.on("scrollfinish", () => {
        this._isScrolling = false;
      });

    }

    /**
    @method _reScrollTo
    @private
    */
    _reScrollTo() {
      this.scrollTo(this._lastScrollInfo.resNum, this._lastScrollInfo.animate, this._lastScrollInfo.offset, true);
    }

    /**
    @method isHidden
    */
    isHidden(ele) {
      if (this._hiddenSelectors == null) {
        this._hiddenSelectors = [];
        const css = $$.I("user_css").sheet.cssRules;
        for (let {selectorText, style, type} of css) {
          if (type === 1) {
            if (style.display === "none") {
              this._hiddenSelectors.push(selectorText);
            }
          }
        }
      }
      return (ele.hasClass("ng") && !app.config.isOn("display_ng")) ||
      this._hiddenSelectors.some( selector => ele.matches(selector));
    }

    /**
    @method _loadNearlyImages
    @param {Number} resNum
    @param {Number} [offset=0]
    @return {Boolean} loadFlag
    */
    _loadNearlyImages(resNum, offset) {
      let isHidden;
      if (offset == null) { offset = 0; }
      let loadFlag = false;
      const target = this.container.children[resNum - 1];

      const {offsetHeight: containerHeight, scrollHeight: containerScroll} = this.container;
      let viewTop = target.offsetTop;
      if (offset < 0) { viewTop += offset; }
      let viewBottom = viewTop + containerHeight;
      if (viewBottom > containerScroll) {
        viewBottom = containerScroll;
        viewTop = viewBottom - containerHeight;
      }

      // 遅延ロードの解除
      const loadImageByElement = targetElement => {
        for (let media of targetElement.$$("img[data-src], video[data-src]")) {
          loadFlag = true;
          media.emit(new Event("immediateload", {"bubbles": true}));
        }
      };

      // 表示範囲内の要素をスキャンする
      // (上方)
      let tmpTarget = target;
      while (
        tmpTarget &&
        (
          (isHidden = this.isHidden(tmpTarget)) ||
          ((tmpTarget.offsetTop + tmpTarget.offsetHeight) > viewTop)
        )
      ) {
        if (!isHidden) { loadImageByElement(tmpTarget); }
        tmpTarget = tmpTarget.prev();
      }
      // (下方)
      tmpTarget = target.next();
      while (
        tmpTarget &&
        (
          (isHidden = this.isHidden(tmpTarget)) ||
          (tmpTarget.offsetTop < viewBottom)
        )
      ) {
        if (!isHidden) { loadImageByElement(tmpTarget); }
        tmpTarget = tmpTarget.next();
      }

      // 遅延スクロールの設定
      if (
        (loadFlag || (this._timeoutID !== 0)) &&
        !app.config.isOn("image_height_fix")
      ) {
        if (this._timeoutID !== 0) { clearTimeout(this._timeoutID); }
        const delayScrollTime = parseInt(app.config.get("delay_scroll_time"));
        this._timeoutID = setTimeout( () => {
          this._timeoutID = 0;
          return this._reScrollTo();
        }
        , delayScrollTime);
      }

      return loadFlag;
    }

    /**
    @method scrollTo
    @param {Element | Number} target
    @param {Boolean} [animate=false]
    @param {Number} [offset=0]
    @param {Boolean} [rerun=false]
    */
    scrollTo(target, animate, offset, rerun) {
      let resNum;
      if (animate == null) { animate = false; }
      if (offset == null) { offset = 0; }
      if (rerun == null) { rerun = false; }
      if (typeof target === "number") {
        resNum = target;
      } else {
        resNum = +target.C("num")[0].textContent;
      }
      this._lastScrollInfo.resNum = resNum;
      this._lastScrollInfo.animate = animate;
      this._lastScrollInfo.offset = offset;
      let loadFlag = false;

      target = this.container.children[resNum - 1];

      // 検索中で、ターゲットが非ヒット項目で非表示の場合、スクロールを中断
      if (
        target &&
        this.container.hasClass("searching") &&
        !target.hasClass("search_hit")
      ) {
        target = null;
      }

      // もしターゲットがNGだった場合、その直前/直後の非NGレスをターゲットに変更する
      if (target && this.isHidden(target)) {
        let replaced = target;
        while (replaced = replaced.prev()) {
          if (!this.isHidden(replaced)) {
            target = replaced;
            break;
          }
          if ((replaced == null)) {
            replaced = target;
            while (replaced = replaced.next()) {
              if (!this.isHidden(replaced)) {
                target = replaced;
                break;
              }
            }
          }
        }
      }

      if (target) {
        // 前後に存在する画像を事前にロードする
        if (!rerun) { loadFlag = this._loadNearlyImages(resNum, offset); }

        // offsetが比率の場合はpxを求める
        if (0 < offset && offset < 1) {
          offset = Math.round(target.offsetHeight * offset);
        }

        // 遅延スクロール時の実行必要性確認
        if (rerun && (this.container.scrollTop === (target.offsetTop + offset))) { return; }

        // スクロールの実行
        if (animate) {
          let rerunAndCancel = false;
          if (this._isScrolling) {
            cancelAnimationFrame(this._scrollRequestID);
            if (rerun) { rerunAndCancel = true; }
          }
          (() => {
            let _scrollInterval, change;
            this.container.emit(new Event("scrollstart"));

            let to = target.offsetTop + offset;
            let movingHeight = to - this.container.scrollTop;
            if (rerunAndCancel && (to === this._lastScrollInfo.animateTo)) {
              change = this._lastScrollInfo.animateChange;
            } else {
              change = Math.max(Math.round(movingHeight / 15), 1);
            }
            let min = Math.min(to-change, to+change);
            let max = Math.max(to-change, to+change);
            if (!rerun) {
              this._lastScrollInfo.animateTo = to;
              this._lastScrollInfo.animateChange = change;
            }

            return this._scrollRequestID = requestAnimationFrame(_scrollInterval = () => {
              const before = this.container.scrollTop;
              // 画像のロードによる座標変更時の補正
              if (to !== (target.offsetTop + offset)) {
                to = target.offsetTop + offset;
                if ((to - this.container.scrollTop) > movingHeight) {
                  movingHeight = to - this.container.scrollTop;
                  change = Math.max(Math.round(movingHeight / 15), 1);
                }
                min = Math.min(to-change, to+change);
                max = Math.max(to-change, to+change);
                if (!rerun) {
                  this._lastScrollInfo.animateTo = to;
                  this._lastScrollInfo.animateChange = change;
                }
              }
              // 例外発生時の停止処理
              if (
                ((change > 0) && (this.container.scrollTop > max)) ||
                ((change < 0) && (this.container.scrollTop < min))
              ) {
                this.container.scrollTop = to;
                this.container.emit(new Event("scrollfinish"));
                return;
              }
              // 正常時の処理
              if (min <= this.container.scrollTop && this.container.scrollTop <= max) {
                this.container.scrollTop = to;
                this.container.emit(new Event("scrollfinish"));
                return;
              } else {
                this.container.scrollTop += change;
              }
              if (this.container.scrollTop === before) {
                this.container.emit(new Event("scrollfinish"));
                return;
              }
              this._scrollRequestID = requestAnimationFrame(_scrollInterval);
            }
            );
          })();
        } else {
          this.container.scrollTop = target.offsetTop + offset;
        }
      }
    }

    /**
    @method getRead
    @param {Number} beforeRead 直近に読んでいたレスの番号
    @return {Number} 現在読んでいると推測されるレスの番号
    */
    getRead(beforeRead) {
      let read;
      if (beforeRead == null) { beforeRead = 1; }
      const containerBottom = this.container.scrollTop + this.container.clientHeight;
      const $read = this.container.children[beforeRead - 1];
      const readTop = $read != null ? $read.offsetTop : undefined;
      if (!$read || (readTop < containerBottom && containerBottom < readTop + $read.offsetHeight)) {
        return beforeRead;
      }

      // 最後のレスはcontainerの余白の関係で取得できないので別で判定
      const $last = this.container.last();
      if ($last.offsetTop < containerBottom) {
        return this.container.children.length;
      }

      // 直近に読んでいたレスの上下を順番に調べる
      let $next = $read.next();
      let $prev = $read.prev();
      while (true) {
        if ($next != null) {
          const nextTop = $next.offsetTop;
          if (nextTop < containerBottom && containerBottom < nextTop + $next.offsetHeight) {
            read = $next.C("num")[0].textContent;
            break;
          }
          $next = $next.next();
        }
        if ($prev != null) {
          const prevTop = $prev.offsetTop;
          if (prevTop < containerBottom && containerBottom < prevTop + $prev.offsetHeight) {
            read = $prev.C("num")[0].textContent;
            break;
          }
          $prev = $prev.prev();
        }
        // どのレスも判定されなかった場合
        if (($next == null) && ($prev == null)) {
          break;
        }
      }

      // >>1の底辺が表示領域外にはみ出していた場合対策
      if (read == null) {
        return 1;
      }

      return parseInt(read);
    }

    /**
    @method getDisplay
    @param {Number} beforeRead 直近に読んでいたレスの番号
    @return {Object|null} 現在表示していると推測されるレスの番号とオフセット
    */
    getDisplay(beforeRead) {
      const containerTop = this.container.scrollTop;
      const containerBottom = containerTop + this.container.clientHeight;
      const resRead = {resNum: 1, offset: 0, bottom: false};

      // 既に画面の一番下までスクロールしている場合
      // (いつのまにか位置がずれていることがあるので余裕を設ける)
      if (containerBottom >= (this.container.scrollHeight - 60)) {
        resRead.bottom = true;
      }

      let $read = this.container.children[beforeRead - 1];
      if (!$read) { return null; }
      const readTop = $read.offsetTop;
      if (!(readTop < containerTop && containerTop < readTop + $read.offsetHeight)) {
        // 直近に読んでいたレスの上下を順番に調べる
        let $next = $read.next();
        let $prev = $read.prev();
        while (true) {
          if ($next != null) {
            const nextTop = $next.offsetTop;
            if (nextTop <= containerTop && containerTop < nextTop + $next.offsetHeight) {
              $read = $next;
              break;
            }
            $next = $next.next();
          }
          if ($prev != null) {
            const prevTop = $prev.offsetTop;
            if (prevTop <= containerTop && containerTop < prevTop + $prev.offsetHeight) {
              $read = $prev;
              break;
            }
            $prev = $prev.prev();
          }
          // どのレスも判定されなかった場合
          if (($next == null) && ($prev == null)) {
            break;
          }
        }
      }

      resRead.resNum = parseInt($read.C("num")[0].textContent);
      resRead.offset = (containerTop - $read.offsetTop) / $read.offsetHeight;

      return resRead;
    }

    /**
    @method getSelected
    @return {Element|null}
    */
    getSelected() {
      return this.container.$("article.selected");
    }

    /**
    @method select
    @param {Element | Number} target
    @param {Boolean} [preventScroll = false]
    @param {Boolean} [animate = false]
    @param {Number} [offset = 0]
    */
    select(target, preventScroll, animate, offset) {
      if (preventScroll == null) { preventScroll = false; }
      if (animate == null) { animate = false; }
      if (offset == null) { offset = 0; }
      __guard__(this.container.$("article.selected"), x => x.removeClass("selected"));

      if (typeof target === "number") {
        target = this.container.$(`article:nth-child(${target}), article:last-child`);
      }

      if (!target) { return; }

      target.addClass("selected");
      if (!preventScroll) {
        this.scrollTo(target, animate, offset);
      }
    }

    /**
    @method clearSelect
    */
    clearSelect() {
      __guard__(this.getSelected(), x => x.removeClass("selected"));
    }

    /**
    @method selectNext
    @param {number} [repeat = 1]
    */
    selectNext(repeat) {
      let bottom;
      if (repeat == null) { repeat = 1; }
      let current = this.getSelected();
      const containerHeight = this.container.offsetHeight;

      if (current) {
        let top;
        ({top, bottom} = current.getBoundingClientRect());
        // 現在選択されているレスが表示範囲外だった場合、それを無視する
        if ((top >= containerHeight) || (bottom <= 0)) {
          current = null;
        }
      }

      if (!current) {
        this.select(this.container.child()[this.getRead() - 1], true);
      } else {
        let target = current;

        for (let i = 0, end = repeat, asc = 0 <= end; asc ? i < end : i > end; asc ? i++ : i--) {
          let targetHeight;
          const prevTarget = target;

          let {bottom: targetBottom} = target.getBoundingClientRect();
          if ((targetBottom <= containerHeight) && target.next()) {
            target = target.next();

            while (target && this.isHidden(target)) {
              target = target.next();
            }
          }

          if (!target) {
            target = prevTarget;
            break;
          }

          ({bottom: targetBottom, height: targetHeight} = target.getBoundingClientRect());
          if (containerHeight < targetBottom) {
            if (targetHeight >= containerHeight) {
              this.container.scrollTop += containerHeight * 0.5;
            } else {
              this.container.scrollTop += (
                (targetBottom -
                containerHeight) +
                10
              );
            }
          } else if (!target.next()) {
            this.container.scrollTop += containerHeight * 0.5;
            if (target === prevTarget) {
              break;
            }
          }
        }

        if (target && (target !== current)) {
          this.select(target, true);
        }
      }
    }

    /**
    @method selectPrev
    @param {number} [repeat = 1]
    */
    selectPrev(repeat) {
      let top;
      if (repeat == null) { repeat = 1; }
      let current = this.getSelected();
      const containerHeight = this.container.offsetHeight;

      if (current) {
        let bottom;
        ({top, bottom} = current.getBoundingClientRect());
        // 現在選択されているレスが表示範囲外だった場合、それを無視する
        if ((top >= containerHeight) || (bottom <= 0)) {
          current = null;
        }
      }

      if (!current) {
        this.select(this.container.child()[this.getRead() - 1], true);
      } else {
        let target = current;

        for (let i = 0, end = repeat, asc = 0 <= end; asc ? i < end : i > end; asc ? i++ : i--) {
          const prevTarget = target;

          let {top: targetTop, height: targetHeight} = target.getBoundingClientRect();
          if ((0 <= targetTop) && target.prev()) {
            target = target.prev();

            while (target && this.isHidden(target)) {
              target = target.prev();
            }
          }

          if (!target) {
            target = prevTarget;
            break;
          }

          ({top: targetTop, height: targetHeight} = target.getBoundingClientRect());
          if (targetTop < 0) {
            if (targetHeight >= containerHeight) {
              this.container.scrollTop -= containerHeight * 0.5;
            } else {
              this.container.scrollTop = target.offsetTop - 10;
            }
          } else if (!target.prev()) {
            this.container.scrollTop -= containerHeight * 0.5;
            if (target === prevTarget) {
              break;
            }
          }
        }

        if (target && (target !== current)) {
          this.select(target, true);
        }
      }
    }

    /**
    @method addItem
    @param {Object | Array}
    */
    async addItem(items, threadTitle) {
      let res;
      if (!Array.isArray(items)) { items = [items]; }

      if (!(items.length > 0)) {
        return;
      }

      let resNum = this.container.child().length;
      const startResNum = resNum+1;
      const {bbsType} = this.url.guessType();
      const writtenRes = await app.WriteHistory.getByUrl(this.urlStr);
      this._threadTitle = threadTitle;

      const $fragment = $_F();

      for (res of items) {
        var ngObj, ngType;
        resNum++;

        res.num = resNum;
        res.class = [];
        var {protocol} = this.url;

        res = app.ReplaceStrTxt.replace(this.urlStr, document.title, res);

        if (/(?:\u3000{5}|\u3000\u0020|[^>]\u0020\u3000)(?!<br>|$)/i.test(res.message)) {
          res.class.push("aa");
        }

        for (let writtenHistory of writtenRes) {
          if (writtenHistory.res === resNum) {
            res.class.push("written");
            break;
          }
        }

        const $article = $__("article");
        const $header = $__("header");

        //.num
        const $num = $__("span").addClass("num");
        $num.textContent = resNum;
        $header.addLast($num);

        //.name
        const $name = $__("span").addClass("name");
        if (/^\s*(?:&gt;|\uff1e){0,2}([\d\uff10-\uff19]+(?:[\-\u30fc][\d\uff10-\uff19]+)?(?:\s*,\s*[\d\uff10-\uff19]+(?:[\-\u30fc][\d\uff10-\uff19]+)?)*)\s*$/.test(res.name)) {
          $name.addClass("name_anchor");
        }
        $name.innerHTML = (
          res.name
            .replace(/<\/?a[^>]*>/g, "")
            .replace(/<(?!\/?(?:b|small|font(?: color="?[#a-zA-Z0-9]+"?)?)>)/g, "&lt;")
            .replace(/<\/b>\(([^<>]+? [^<>]+?)\)<b>$/, ($0, $1) => {
              res.slip = $1;
              if (resNum === 1) {
                this._existSlipAtFirstRes = true;
              }

              if (!this.slipIndex.has($1)) { this.slipIndex.set($1, new Set()); }
              this.slipIndex.get($1).add(resNum);
              return "";
             })
            .replace(/<\/b> ?(◆[^<>]+?) ?<b>/, ($0, $1) => {
              res.trip = $1;

              if (!this.tripIndex.has($1)) { this.tripIndex.set($1, new Set()); }
              this.tripIndex.get($1).add(resNum);

              return `<span class="trip">${$1}</span>`;
            })
            .replace(/<\/b>(.*?)<b>/g, "<span class=\"ob\">$1</span>")
            .replace(/&lt;span[^>]*?>(.*?)&lt;\/span>/g, "<span class=\"ob\">$1</span>")
        );
        $header.addLast($name);

        //.mail
        const $mail = $__("span").addClass("mail");
        $mail.innerHTML = res.mail.replace(/<.*?(?:>|$)/g, "");
        $header.addLast($mail);

        //.other
        const $other = $__("span").addClass("other");
        let tmp = (
          res.other
            //be
            .replace(/<\/div><div class="be[^>]*?"><a href="(https?:\/\/be\.[25]ch\.net\/user\/\d+?)"[^>]*>(.*?)<\/a>/, "<a class=\"beid\" href=\"$1\" target=\"_blank\">$2</a>")
            //タグ除去
            .replace(/<(?!(?:a class="beid"[^>]*|\/a)>).*?(?:>|$)/g, "")
            //.id
            .replace(" ID:???", "ID:???")
            .replace(/(?:^| |(\d))(ID:(?!\?\?\?)[^ <>"']+|発信元:\d+.\d+.\d+.\d+)/, ($0, $1, $2) => {
              let fixedId = $2;
              //末尾●除去
              if (fixedId.endsWith("\u25cf")) {
                fixedId = fixedId.slice(0, -1);
              }

              res.id = fixedId;
              if (resNum === 1) {
                this.oneId = fixedId;
                this._existIdAtFirstRes = true;
              }

              if (fixedId === this.oneId) {
                res.class.push("one");
              }

              if (fixedId.endsWith(".net")) {
                res.class.push("net");
              }

              if (!this.idIndex.has(fixedId)) { this.idIndex.set(fixedId, new Set()); }
              this.idIndex.get(fixedId).add(resNum);

              let str = $1 != null ? $1 : "";
              // slip追加(IDが存在しているとき)
              if (res.slip != null) {
                str += `<span class="slip">SLIP:${res.slip}</span>`;
              }
              str += `<span class="id">${$2}</span>`;
              return str;
            })
            //.beid
            .replace(/(?:^| )(BE:(\d+)\-[A-Z\d]+\(\d+\))/,
              `<a class="beid" href="${protocol}//be.5ch.net/test/p.php?i=$3" target="_blank">$1</a>`)
            //.date
            .replace(/\d{4}\/\d{1,2}\/\d{1,2}\(.\)\s\d{1,2}:\d\d(?::\d\d(?:\.\d+)?)?/, "<time class=\"date\">$&</time>")
        );
        // slip追加(IDが存在していないとき)
        if ((res.slip != null) && (res.id == null)) {
          tmp += `<span class="slip">SLIP:${res.slip}</span>`;
        }
        $other.innerHTML = tmp;
        $header.addLast($other);
        $article.addLast($header);

        // スレッド終端の自動追加メッセージの確認
        if (
          (bbsType === "2ch") &&
          tmp.startsWith(_OVER1000_DATA) &&
          !this.over1000ResNum
        ) {
          this.over1000ResNum = resNum;
        }

        //文字色
        const color = __guard__(res.message.match(/<font color="(.*?)">/i), x => x[1]);

        // id, slip, tripが取り終わったタイミングでNG判定を行う
        // NG判定されるものは、ReplaceStrTxtで置き換え後のテキストなので注意すること
        if (ngObj = this._checkNG(res, bbsType)) {
          res.class.push("ng");
          ngType = ngObj.type;
          if (ngObj.name != null) { ngType += ":" + ngObj.name; }
        }

        // resデータの保管
        this._rawResData[resNum] = res;

        tmp = (
          res.message
            //imgタグ変換
            .replace(/<img src="([\w]+):\/\/(.*?)"[^>]*>/ig, "$1://$2")
            .replace(/<img src="\/\/(.*?)"[^>]*>/ig, `${protocol}//$1`)
            //Rock54
            .replace(/(?:<small[^>]*>&#128064;|<i>&#128064;<\/i>)<br>Rock54: (Caution|Warning)\(([^<>()]+)\) ?.*?(?:<\/small>)?/ig, "<br><div-block class=\"rock54\">&#128064; Rock54: $1($2)</div-block>")
            //SLIPが変わったという表示
            .replace(/<hr>VIPQ2_EXTDAT: ([^<>]+): EXT was configured /i, "<br><div-block class=\"slipchange\">VIPQ2_EXTDAT: $1: EXT configure</div-block>")
            //タグ除去
            .replace(/<(?!(?:br|hr|\/?div-block[^<>]*|\/?b)>).*?(?:>|$)/ig, "")
            .replace(/<(\/)?div-block([^<>]*)>/g, "<$1div$2>")
            //URLリンク
            .replace(/(h)?(ttps?:\/\/(?!img\.[25]ch\.net\/(?:ico|emoji|premium)\/[\w\-_]+\.gif)(?:[a-hj-zA-HJ-Z\d_\-.!~*'();\/?:@=+$,%#]|\&(?!gt;)|[iI](?![dD]:)+)+)/g,
              '<a href="h$2" target="_blank">$1$2</a>')
            //Beアイコン埋め込み表示
            .replace(new RegExp(`^(?:\\s*sssp|https?)://(img\\.[25]ch\\.net/(?:ico|premium)/[\\w\\-_]+\\.gif)\\s*<br>`), ($0, $1) => {
              let needle;
              if ((needle = this.url.getTsld(), ["5ch.net", "bbspink.com", "2ch.sc"].includes(needle))) {
                return `<img class="beicon" src="/img/dummy_1x1.&[IMG_EXT]" data-src="${protocol}//${$1}"><br>`;
              }
              return $0;
            })
            //エモーティコン埋め込み表示
            .replace(new RegExp(`(?:\\s*sssp|https?)://(img\\.[25]ch\\.net/emoji/[\\w\\-_]+\\.gif)\\s*`, 'g'), ($0, $1) => {
              let needle;
              if ((needle = this.url.getTsld(), ["5ch.net", "bbspink.com", "2ch.sc"].includes(needle))) {
                return `<img class="beicon emoticon" src="/img/dummy_1x1.&[IMG_EXT]" data-src="${protocol}//${$1}">`;
              }
              return $0;
            })
            //アンカーリンク
            .replace(app.util.Anchor.reg.ANCHOR, $0 => {
              let disabled, disabledReason;
              const anchor = app.util.Anchor.parseAnchor($0);

              if (anchor.targetCount >= 25) {
                disabled = true;
                disabledReason = "指定されたレスの量が極端に多いため、ポップアップを表示しません";
              } else if (anchor.targetCount === 0) {
                disabled = true;
                disabledReason = "指定されたレスが存在しません";
              } else {
                disabled = false;
              }

              //グロ/死ねの返信レス
              const isThatHarmImg = this.findHarmfulFlag && this.harmfulReg.test(res.message);
              if (isThatHarmImg) { res.class.push("has_harm_word"); }

              //rep_index更新
              if (!disabled) {
                for (let segment of anchor.segments) {
                  let target = segment[0];
                  while (target <= segment[1]) {
                    if (!this.repIndex.has(target)) { this.repIndex.set(target, new Set()); }
                    this.repIndex.get(target).add(resNum);
                    if (isThatHarmImg) { this.harmImgIndex.add(target); }
                    if (!this.ancIndex.has(resNum)) { this.ancIndex.set(resNum, new Set()); }
                    this.ancIndex.get(resNum).add(target);
                    target++;
                  }
                }
              }

              return "<a href=\"javascript:undefined;\" class=\"anchor" +
              (disabled ? ` disabled\" data-disabled-reason=\"${disabledReason}\"` : "\"") +
              `>${$0}</a>`;
            })
            //IDリンク
            .replace(/id:(?:[a-hj-z\d_\+\/\.\!]|i(?!d:))+/ig, "<a href=\"javascript:undefined;\" class=\"anchor_id\">$&</a>")
        );

        const $message = $__("div").addClass("message");
        if (color != null) {
          $message.style.color = `#${color}`;
        }
        $message.innerHTML = tmp;
        $article.addLast($message);

        if (res.class.length > 0) { $article.setClass(...res.class); }
        if (res.id != null) { $article.dataset.id = res.id; }
        if (res.slip != null) { $article.dataset.slip = res.slip; }
        if (res.trip != null) { $article.dataset.trip = res.trip; }
        if (res.class.includes("ng")) {
          this.setNG($article, ngType);
        }

        $fragment.addLast($article);
      }

      this.updateFragmentIds($fragment, startResNum);

      this.container.addLast($fragment);

      this.updateIds(startResNum);

      // NG判定されたIDとSLIPの連鎖NG
      if (app.config.isOn("chain_ng_id")) {
        for (let id of this._ngIdForChain) {
          this._chainNgById(id);
        }
      }
      if (app.config.isOn("chain_ng_slip")) {
        for (let slip of this._ngSlipForChain) {
          this._chainNgBySlip(slip);
        }
      }
      // 返信数の更新
      this.updateRepCount();

      //サムネイル追加処理
      try {
        await Promise.all(
          Array.from(this.container.$$(
            ".message > a:not(.anchor):not(.thumbnail):not(.has_thumbnail):not(.expandedURL):not(.has_expandedURL)"
          )).map( async a => {
            let err, href, link;
            ({a, link} = await this.checkUrlExpand(a));
            ({res, err} = app.ImageReplaceDat.replace(link));
            if (err == null) {
              href = res.text;
            } else {
              ({
                href
              } = a);
            }
            let mediaType = app.URL.getExtType(
              href, {
              audio: app.config.isOn("audio_supported"),
              video: app.config.isOn("audio_supported"),
              oggIsAudio: app.config.isOn("audio_supported_ogg"),
              oggIsVideo: app.config.isOn("video_supported_ogg")
            }
            );
            if (err == null) { if (mediaType == null) { mediaType = "image"; } }
            // サムネイルの追加
            if (mediaType) { this.addThumbnail(a, href, mediaType, res); }
          })
        );
        // harmImg更新
        this.updateHarmImages();
      } catch (error) {}
    }

    /**
    @method updateId
    @param {String} className
    @param {Map} map
    @param {String} prefix
    */
    updateId({startRes = 1, endRes, dom}, className, map, prefix) {
      for (let [id, index] of map) {
        const count = index.size;
        let i = 0;
        for (let resNum of index) {
          i++;
          if (!(startRes <= resNum) || (!(endRes == null) && !(resNum <= endRes))) { continue; }
          const ele = dom.child()[resNum - startRes].C(className)[0];
          ele.textContent = `${prefix}${id}(${i}/${count})`;
          if (count >= 5) {
            ele.removeClass("link");
            ele.addClass("freq");
          } else if (count >= 2) {
            ele.addClass("link");
          }
        }
      }
    }

    /**
    @method updateFragmentIds
    */
    updateFragmentIds($fragment, startRes) {
      //id, slip, trip更新
      this.updateId({ startRes, dom: $fragment }, "id", this.idIndex, "");
      this.updateId({ startRes, dom: $fragment }, "slip", this.slipIndex, "SLIP:");
      this.updateId({ startRes, dom: $fragment }, "trip", this.tripIndex, "");
    }

    /**
    @method updateIds
    */
    updateIds(endRes) {
      //id, slip, trip更新
      this.updateId({ endRes, dom: this.container }, "id", this.idIndex, "");
      this.updateId({ endRes, dom: this.container }, "slip", this.slipIndex, "SLIP:");
      this.updateId({ endRes, dom: this.container }, "trip", this.tripIndex, "");

      //参照関係再構築
      (() => {
        for (let [resKey, index] of this.repIndex) {
          const res = this.container.child()[resKey - 1];
          if (!res) { continue; }
          //連鎖NG
          if (app.config.isOn("chain_ng") && res.hasClass("ng")) {
            this._chainNG(res);
          }
          //自分に対してのレス
          if (res.hasClass("written")) {
            for (let r of index) {
              this.container.child()[r - 1].addClass("to_written");
            }
          }
        }
      })();
    }

    /**
    @method updateRepCount
    */
    updateRepCount() {
      for (let [resKey, index] of this.repIndex) {
        var ele, newFlg;
        const res = this.container.child()[resKey - 1];
        if (!res) { continue; }
        let resCount = index.size;
        if (app.config.isOn("reject_ng_rep") && this.repNgIndex.has(resKey)) {
          resCount -= this.repNgIndex.get(resKey).size;
        }
        if (ele = res.C("rep")[0]) {
          newFlg = false;
        } else {
          newFlg = true;
          if (resCount > 0) { ele = $__("span"); }
        }
        if (resCount > 0) {
          ele.textContent = `返信 (${resCount})`;
          ele.className = resCount >= 5 ? "rep freq" : "rep link";
          res.dataset.rescount = __range__(1, resCount, true).join(" ");
          if (newFlg) {
            res.C("other")[0].addLast(
              document.createTextNode(" "),
              ele
            );
          }
        } else if (ele) {
          res.removeAttr("data-rescount");
          ele.remove();
        }
      }
    }

    /**
    @method setNG
    @param {Element} res
    @param {string} ngType
    */
    setNG(res, ngType) {
      res.addClass("ng");
      if (app.config.isOn("display_ng")) { res.addClass("disp_ng"); }
      res.setAttr("ng-type", ngType);
      const resNum = +res.C("num")[0].textContent;
      if (this.ancIndex.has(resNum)) {
        for (let rn of this.ancIndex.get(resNum)) {
          if (!this.repNgIndex.has(rn)) { this.repNgIndex.set(rn, new Set()); }
          this.repNgIndex.get(rn).add(resNum);
        }
      }
    }

    /**
    @method _chainNG
    @param {Element} res
    @private
    */
    _chainNG(res) {
      const resNum = +res.C("num")[0].textContent;
      if (!this.repIndex.has(resNum)) { return; }
      for (let r of this.repIndex.get(resNum)) {
        if (r <= resNum) { continue; }
        const getRes = this.container.child()[r - 1];
        if (getRes.hasClass("ng")) { continue; }
        const rn = +getRes.C("num")[0].textContent;
        if (app.NG.isIgnoreResNumForAuto(rn, app.NG.TYPE.AUTO_CHAIN)) { continue; }
        if (app.NG.isThreadIgnoreNgType(this._rawResData[rn], this._threadTitle, this.urlStr, app.NG.TYPE.AUTO_CHAIN)) { continue; }
        this.setNG(getRes, app.NG.TYPE.AUTO_CHAIN);
        // NG連鎖IDの登録
        if (app.config.isOn("chain_ng_id") && app.config.isOn("chain_ng_id_by_chain")) {
          var id;
          if (id = getRes.getAttr("data-id")) {
            if (!this._ngIdForChain.has(id)) { this._ngIdForChain.add(id); }
            this._chainNgById(id);
          }
        }
        // NG連鎖SLIPの登録
        if (app.config.isOn("chain_ng_slip") && app.config.isOn("chain_ng_slip_by_chain")) {
          var slip;
          if (slip = getRes.getAttr("data-slip")) {
            if (!this._ngSlipForChain.has(slip)) { this._ngSlipForChain.add(slip); }
            this._chainNgBySlip(slip);
          }
        }
        this._chainNG(getRes);
      }
    }

    /**
    @method _chainNgById
    @param {String} id
    @private
    */
    _chainNgById(id) {
      // 連鎖IDのNG
      for (let r of this.container.$$(`article[data-id=\"${id}\"]`)) {
        if (r.hasClass("ng")) { continue; }
        const rn = +r.C("num")[0].textContent;
        if (app.NG.isIgnoreResNumForAuto(rn, app.NG.TYPE.AUTO_CHAIN_ID)) { continue; }
        if (app.NG.isThreadIgnoreNgType(this._rawResData[rn], this._threadTitle, this.urlStr, app.NG.TYPE.AUTO_CHAIN_ID)) { continue; }
        this.setNG(r, app.NG.TYPE.AUTO_CHAIN_ID);
        // 連鎖NG
        if (app.config.isOn("chain_ng")) { this._chainNG(r); }
      }
    }

    /**
    @method _chainNgBySlip
    @param {String} slip
    @private
    */
    _chainNgBySlip(slip) {
      // 連鎖SLIPのNG
      for (let r of this.container.$$(`article[data-slip=\"${slip}\"]`)) {
        if (r.hasClass("ng")) { continue; }
        const rn = +r.C("num")[0].textContent;
        if (app.NG.isIgnoreResNumForAuto(rn, app.NG.TYPE.AUTO_CHAIN_SLIP)) { continue; }
        if (app.NG.isThreadIgnoreNgType(this._rawResData[rn], this._threadTitle, this.urlStr, app.NG.TYPE.AUTO_CHAIN_SLIP)) { continue; }
        this.setNG(r, app.NG.TYPE.AUTO_CHAIN_SLIP);
        // 連鎖NG
        if (app.config.isOn("chain_ng")) { this._chainNG(r); }
      }
    }

    /**
    @method _checkNG
    @param {Object} objRes
    @param {String} bbsType
    @return {Object|null}
    @private
    */
    _checkNG(objRes, bbsType) {
      let ngObj;
      if (ngObj = this._getNgType(objRes, bbsType)) {
        // NG連鎖IDの登録
        if (
          app.config.isOn("chain_ng_id") &&
          (objRes.id != null) &&
          !([app.NG.TYPE.ID, app.NG.TYPE.AUTO_CHAIN_ID].includes(ngObj.type))
        ) {
          if (!this._ngIdForChain.has(objRes.id)) { this._ngIdForChain.add(objRes.id); }
        }
        // NG連鎖SLIPの登録
        if (
          app.config.isOn("chain_ng_slip") &&
          (objRes.slip != null) &&
          !([app.NG.TYPE.SLIP, app.NG.TYPE.AUTO_CHAIN_SLIP].includes(ngObj.type))
        ) {
          if (!this._ngSlipForChain.has(objRes.slip)) { this._ngSlipForChain.add(objRes.slip); }
        }
      }
      return ngObj;
    }

    /**
    @method _getNgType
    @param {Object} objRes
    @param {String} bbsType
    @return {Object|null}
    @private
    */
    _getNgType(objRes, bbsType) {
      let ngObj, resMessage;
      if ((this.over1000ResNum != null) && (objRes.num >= this.over1000ResNum)) { return null; }

      // 登録ワードのNG
      if (
        (ngObj = app.NG.isNGThread(objRes, this._threadTitle, this.urlStr)) &&
        !app.NG.isThreadIgnoreNgType(objRes, this._threadTitle, this.urlStr, ngObj.type)
      ) {
        return ngObj;
      }

      if (bbsType === "2ch") {
        const judgementIdType = app.config.get("how_to_judgment_id");
        // idなしをNG
        if (
          app.config.isOn("nothing_id_ng") &&
          (objRes.id == null) &&
          (
            ((judgementIdType === "first_res") && this._existIdAtFirstRes) ||
            ((judgementIdType === "exists_once") && (this.idIndex.size !== 0))
          ) &&
          !app.NG.isIgnoreResNumForAuto(objRes.num, app.NG.TYPE.AUTO_NOTHING_ID) &&
          !app.NG.isThreadIgnoreNgType(objRes, this._threadTitle, this.urlStr, app.NG.TYPE.AUTO_NOTHING_ID)
        ) {
          return {type: app.NG.TYPE.AUTO_NOTHING_ID};
        }
        // slipなしをNG
        if (
          app.config.isOn("nothing_slip_ng") &&
          (objRes.slip == null) &&
          (
            ((judgementIdType === "first_res") && this._existSlipAtFirstRes) ||
            ((judgementIdType === "exists_once") && (this.slipIndex.size !== 0))
          ) &&
          !app.NG.isIgnoreResNumForAuto(objRes.num, app.NG.TYPE.AUTO_NOTHING_SLIP) &&
          !app.NG.isThreadIgnoreNgType(objRes, this._threadTitle, this.urlStr, app.NG.TYPE.AUTO_NOTHING_SLIP)
        ) {
          return {type: app.NG.TYPE.AUTO_NOTHING_SLIP};
        }
      }

      // 連鎖IDのNG
      if (
        app.config.isOn("chain_ng_id") &&
        (objRes.id != null) &&
        this._ngIdForChain.has(objRes.id) &&
        !app.NG.isIgnoreResNumForAuto(objRes.num, app.NG.TYPE.AUTO_CHAIN_ID) &&
        !app.NG.isThreadIgnoreNgType(objRes, this._threadTitle, this.urlStr, app.NG.TYPE.AUTO_CHAIN_ID)
      ) {
        return {type: app.NG.TYPE.AUTO_CHAIN_ID};
      }
      // 連鎖SLIPのNG
      if (
        app.config.isOn("chain_ng_slip") &&
        (objRes.slip != null) &&
        this._ngSlipForChain.has(objRes.slip) &&
        !app.NG.isIgnoreResNumForAuto(objRes.num, app.NG.TYPE.AUTO_CHAIN_SLIP) &&
        !app.NG.isThreadIgnoreNgType(objRes, this._threadTitle, this.urlStr, app.NG.TYPE.AUTO_CHAIN_SLIP)
      ) {
        return {type: app.NG.TYPE.AUTO_CHAIN_SLIP};
      }

      // 連投レスをNG
      if (app.config.get("repeat_message_ng_count") > 1) {
        resMessage = (
          objRes.message
            // アンカーの削除
            .replace(/<a [^>]*>(?:&gt;){1,2}\d+(?:[-,]\d+)*<\/a>/g, "")
            // <a>タグの削除
            .replace(/<\/?a[^>]*>/g, "")
            // 行末ブランクの削除
            .replace(/\s+<br>/g, "<br>")
            // 空行の削除
            .replace(/^<br>/, "")
            .replace(/(?:<br>){2,}/g, "<br>")
            // 前後ブランクの削除
            .trim()
        );
        if (!this._resMessageMap.has(resMessage)) { this._resMessageMap.set(resMessage, new Set()); }
        this._resMessageMap.get(resMessage).add(objRes.num);
        if (
          (this._resMessageMap.get(resMessage).size >= +app.config.get("repeat_message_ng_count")) &&
          !app.NG.isIgnoreResNumForAuto(objRes.num, app.NG.TYPE.AUTO_REPEAT_MESSAGE) &&
          !app.NG.isThreadIgnoreNgType(objRes, this._threadTitle, this.urlStr, app.NG.TYPE.AUTO_REPEAT_MESSAGE)
        ) {
          return {type: app.NG.TYPE.AUTO_REPEAT_MESSAGE};
        }
      }

      // 前方参照をNG
      if (
        app.config.isOn("forward_link_ng") &&
        !app.NG.isIgnoreResNumForAuto(objRes.num, app.NG.TYPE.AUTO_FORWARD_LINK) &&
        !app.NG.isThreadIgnoreNgType(objRes, this._threadTitle, this.urlStr, app.NG.TYPE.AUTO_FORWARD_LINK)
      ) {
        let ngFlag = false;
        resMessage = (
          objRes.message
            // <a>タグの削除
            .replace(/<\/?a[^>]*>/g, "")
        );
        const m = resMessage.match(app.util.Anchor.reg.ANCHOR);
        if (m) {
          for (let anc of m) {
            const anchor = app.util.Anchor.parseAnchor(anc);
            for (let segment of anchor.segments) {
              let target = segment[0];
              while (target <= segment[1]) {
                if (target > objRes.num) {
                  ngFlag = true;
                  break;
                }
                target++;
              }
              if (ngFlag) { break; }
            }
            if (ngFlag) { break; }
          }
        }
        if (ngFlag) { return {type: app.NG.TYPE.AUTO_FORWARD_LINK}; }
      }

      return null;
    }

    /**
    @method refreshNG
    */
    refreshNG() {
      let res;
      const {bbsType} = this.url.guessType();
      this._ngIdForChain.clear();
      this._ngSlipForChain.clear();
      this._resMessageMap.clear();
      this.repNgIndex.clear();
      // NGの解除
      for (res of this.container.$$("article.ng")) {
        res.removeClass("ng", "disp_ng");
        res.removeAttr("ng-type");
      }
      // NGの再設定
      for (res of this.container.$$("article")) {
        var ngObj;
        if (res.hasClass("ng")) { continue; }
        const resNum = +res.C("num")[0].textContent;
        if (ngObj = this._checkNG(this._rawResData[resNum], bbsType)) {
          let ngType = ngObj.type;
          if (ngObj.name != null) { ngType += ":" + ngObj.name; }
          this.setNG(res, ngType);
          // 連鎖NG
          if (app.config.isOn("chain_ng") && this.repIndex.has(resNum)) {
            this._chainNG(res);
          }
        }
      }
      // NG判定されたIDとSLIPの連鎖NG
      if (app.config.isOn("chain_ng_id")) {
        for (let id of this._ngIdForChain) {
          this._chainNgById(id);
        }
      }
      if (app.config.isOn("chain_ng_slip")) {
        for (let slip of this._ngSlipForChain) {
          this._chainNgBySlip(slip);
        }
      }
      // 返信数の更新
      this.updateRepCount();
      // harmImg更新
      this.updateHarmImages();
      // 表示更新通知
      this.container.emit(new Event("view_refreshed", {"bubbles": true}));
    }

    /**
    @method updateHarmImages
    */
    updateHarmImages() {
      const imageBlur = app.config.isOn("image_blur");
      for (let res of this.harmImgIndex) {
        const ele = this.container.child()[res - 1];
        if (!ele) { continue; }
        let isBlur = false;
        for (let rep of this.repIndex.get(res)) {
          const repEle = this.container.child()[rep - 1];
          if (!repEle) { continue; }
          if (!repEle.hasClass("has_harm_word")) { continue; }
          if (repEle.hasClass("ng")) { continue; }
          isBlur = true;
          break;
        }

        if (isBlur && !ele.hasClass("has_blur_word")) {
          ele.addClass("has_blur_word");
          if (ele.hasClass("has_image") && imageBlur) {
            MediaContainer.setImageBlur(ele, true);
          }
        } else if (!isBlur && ele.hasClass("has_blur_word")) {
          ele.removeClass("has_blur_word");
          if (ele.hasClass("has_image") && imageBlur) {
            MediaContainer.setImageBlur(ele, false);
          }
        }
      }
    }

    /**
    @method addThumbnail
    @param {HTMLAElement} sourceA
    @param {String} thumbnailPath
    @param {String} [mediaType="image"]
    @param {Object} res
    */
    addThumbnail(sourceA, thumbnailPath, mediaType, res) {
      let thumbnailLink, webkitFilter;
      if (mediaType == null) { mediaType = "image"; }
      sourceA.addClass("has_thumbnail");

      const thumbnail = $__("div").addClass("thumbnail");
      thumbnail.setAttr("media-type", mediaType);

      if (["image", "video"].includes(mediaType)) {
        const article = sourceA.closest("article");
        article.addClass("has_image");
        // グロ画像に対するぼかし処理
        if (article.hasClass("has_blur_word") && app.config.isOn("image_blur")) {
          thumbnail.addClass("image_blur");
          const v = app.config.get("image_blur_length");
          webkitFilter = `blur(${v}px)`;
        } else {
          webkitFilter = "none";
        }
      }

      switch (mediaType) {
        case "image":
          thumbnailLink = $__("a");
          thumbnailLink.href = app.safeHref(sourceA.href);
          thumbnailLink.target = "_blank";

          var thumbnailImg = $__("img").addClass("image");
          thumbnailImg.src = "/img/dummy_1x1.&[IMG_EXT]";
          thumbnailImg.style.WebkitFilter = webkitFilter;
          thumbnailImg.style.maxWidth = `${app.config.get("image_width")}px`;
          thumbnailImg.style.maxHeight = `${app.config.get("image_height")}px`;
          thumbnailImg.dataset.src = thumbnailPath;
          thumbnailImg.dataset.type = res.type;
          if (res.extract != null) { thumbnailImg.dataset.extract = res.extract; }
          if (res.extractReferrer != null) { thumbnailImg.dataset.extractReferrer = res.extractReferrer; }
          if (res.pattern != null) { thumbnailImg.dataset.pattern = res.pattern; }
          if (res.cookie != null) { thumbnailImg.dataset.cookie = res.cookie; }
          if (res.cookieReferrer != null) { thumbnailImg.dataset.cookieReferrer = res.cookieReferrer; }
          if (res.referrer != null) { thumbnailImg.dataset.referrer = res.referrer; }
          if (res.userAgent != null) { thumbnailImg.dataset.userAgent = res.userAgent; }
          thumbnailLink.addLast(thumbnailImg);

          var thumbnailFavicon = $__("img").addClass("favicon");
          thumbnailFavicon.src = "/img/dummy_1x1.&[IMG_EXT]";
          thumbnailFavicon.dataset.src = `https://www.google.com/s2/favicons?domain=${sourceA.hostname}`;
          thumbnailLink.addLast(thumbnailFavicon);
          break;

        case "audio": case "video":
          thumbnailLink = $__(mediaType);
          thumbnailLink.src = "";
          thumbnailLink.dataset.src = thumbnailPath;
          thumbnailLink.preload = "metadata";
          switch (mediaType) {
            case "audio":
              thumbnailLink.style.width = `${app.config.get("audio_width")}px`;
              thumbnailLink.controls = true;
              break;
            case "video":
              thumbnailLink.style.WebkitFilter = webkitFilter;
              thumbnailLink.style.maxWidth = `${app.config.get("video_width")}px`;
              thumbnailLink.style.maxHeight = `${app.config.get("video_height")}px`;
              if (app.config.isOn("video_controls")) {
                thumbnailLink.controls = true;
              }
              break;
          }
          break;
      }

      thumbnail.addLast(thumbnailLink);

      // 高さ固定の場合
      if (app.config.isOn("image_height_fix")) {
        let h;
        switch (mediaType) {
          case "image":
            h = parseInt(app.config.get("image_height"));
            break;
          case "video":
            h = parseInt(app.config.get("video_height"));
            break;
          default:
            h = 100;   // 最低高
        }
        thumbnail.style.height = `${h}px`;
      }

      let sib = sourceA;
      while (true) {
        const pre = sib;
        sib = pre.next();
        if ((sib == null) || (sib.tagName === "BR")) {
          if (__guard__(sib != null ? sib.next() : undefined, x => x.hasClass("thumbnail"))) {
            continue;
          }
          pre.addAfter(thumbnail);
          if (!pre.hasClass("thumbnail")) {
            pre.addAfter($__("br"));
          }
          break;
        }
      }
    }

    /**
    @method addExpandedURL
    @param {HTMLAElement} sourceA
    @param {String} finalUrl
    */
    addExpandedURL(sourceA, finalUrl) {
      let expandedURLLink;
      sourceA.addClass("has_expandedURL");

      const expandedURL = $__("div").addClass("expandedURL");
      expandedURL.setAttr("short-url", sourceA.href);
      if (app.config.get("expand_short_url") === "popup") {
        expandedURL.addClass("hide_data");
      }

      if (finalUrl) {
        expandedURLLink = $__("a");
        expandedURLLink.textContent = finalUrl;
        expandedURLLink.href = app.safeHref(finalUrl);
        expandedURLLink.target = "_blank";
        expandedURL.addLast(expandedURLLink);
      } else {
        expandedURL.addClass("expand_error");
        expandedURLLink = null;
      }

      let sib = sourceA;
      while (true) {
        const pre = sib;
        sib = pre.next();
        if ((sib == null) || (sib.tagName === "BR")) {
          if (__guard__(sib != null ? sib.next() : undefined, x => x.hasClass("expandedURL"))) {
            continue;
          }
          pre.addAfter(expandedURL);
          if (!pre.hasClass("expandedURL")) {
            pre.addAfter($__("br"));
          }
          break;
        }
      }
      return expandedURLLink;
    }

    /**
    @method checkUrlExpand
    @param {HTMLAnchorElement} a
    */
    async checkUrlExpand(a) {
      if (
        (app.config.get("expand_short_url") !== "none") &&
        app.URL.SHORT_URL_LIST.has(a.hostname)
      ) {
        // 短縮URLの展開
        const finalUrl = await app.URL.expandShortURL(a.href);
        const newLink = this.addExpandedURL(a, finalUrl);
        if (finalUrl) {
          return {a, link: newLink.href};
        }
      }
      return {a, link: a.href};
    }

    /**
    @method addClassWithOrg
    @param {Element} $res
    @param {String} className
    */
    addClassWithOrg($res, className) {
      $res.addClass(className);
      const resnum = parseInt($res.C("num")[0].textContent);
      this.container.child()[resnum-1].addClass(className);
    }

    /**
    @method removeClassWithOrg
    @param {Element} $res
    @param {String} className
    */
    removeClassWithOrg($res, className) {
      $res.removeClass(className);
      const resnum = parseInt($res.C("num")[0].textContent);
      this.container.child()[resnum-1].removeClass(className);
    }

    /**
    @method addWriteHistory
    @param {Element} $res
    */
    addWriteHistory($res) {
      const date = app.util.stringToDate($res.C("other")[0].textContent).valueOf();
      if (date != null) {
        app.WriteHistory.add({
          url: this.urlStr,
          res: parseInt($res.C("num")[0].textContent),
          title: document.title,
          name: $res.C("name")[0].textContent,
          mail: $res.C("mail")[0].textContent,
          message: $res.C("message")[0].textContent,
          date
        });
      }
    }

    /**
    @method removeWriteHistory
    @param {Element} $res
    */
    removeWriteHistory($res) {
      const resnum = parseInt($res.C("num")[0].textContent);
      app.WriteHistory.remove(this.urlStr, resnum);
    }
  };
  ThreadContent.initClass();
  return ThreadContent;
})();

function __guard__(value, transform) {
  return (typeof value !== 'undefined' && value !== null) ? transform(value) : undefined;
}
function __range__(left, right, inclusive) {
  let range = [];
  let ascending = left < right;
  let end = !inclusive ? right : ascending ? right + 1 : right - 1;
  for (let i = left; ascending ? i < end : i > end; ascending ? i++ : i--) {
    range.push(i);
  }
  return range;
}