import ContextMenu from "./ContextMenu.js";

/**
@class PopupView
@constructor
@param {Element} defaultParent
*/
export default class PopupView {

  constructor(defaultParent){
    /**
    @property _popupStack
    @type Array
    @private
    */
    this._onMouseEnter = this._onMouseEnter.bind(this);
    this._onMouseLeave = this._onMouseLeave.bind(this);
    this._onMouseMove = this._onMouseMove.bind(this);
    this._onRemoveContextmenu = this._onRemoveContextmenu.bind(this);
    this.defaultParent = defaultParent;
    this._popupStack = [];

    /**
    @property _popupArea
    @type Object
    @private
    */
    this._popupArea = this.defaultParent.C("popup_area")[0];

    /**
    @property _popupStyle
    @type Object
    @private
    */
    this._popupStyle = null;

    /**
    @property _popupMarginHeight
    @type Number
    @private
    */
    this._popupMarginHeight = -1;

    /**
    @property _currentX
    @type Number
    @private
    */
    this._currentX = 0;

    /**
    @property _currentY
    @type Number
    @private
    */
    this._currentY = 0;

    /**
    @property _delayTime
    @type Number
    @private
    */
    this._delayTime = parseInt(app.config.get("popup_delay_time"));

    /**
    @property _delayTimeoutID
    @type Number
    @private
    */
    this._delayTimeoutID = 0;

    /**
    @property _delayRemoveTimeoutID
    @type Number
    @private
    */
    this._delayRemoveTimeoutID = 0;

  }

  /**
  @method show
  @param {Element} popup
  @param {Number} mouseX
  @param {Number} mouseY
  @param {Element} source
  */
  async show(popup, mouseX, mouseY, source) {
    let popupInfo;
    this.popup = popup;
    this.source = source;

    // 同一ソースからのポップアップが既に有る場合は、処理を中断
    if (this._popupStack.length > 0) {
      popupInfo = this._popupStack[this._popupStack.length - 1];
      if (source === popupInfo.source) { return; }
    }

    // sourceがpopup内のものならば、兄弟ノードの削除
    // それ以外は、全てのノードを削除
    if (this.source.closest(".popup")) {
      this.source.closest(".popup").addClass("active");
      this._remove(false);
    } else {
      this._remove(true);
    }

    // 待機中の処理があればキャンセルする
    if (this._delayTimeoutID !== 0) {
      clearTimeout(this._delayTimeoutID);
      this._delayTimeoutID = 0;
    }

    // コンテキストメニューの破棄
    ContextMenu.remove();

    // 表示位置の決定
    const setDispPosition = popupNode => {
      let cssTop;
      const margin = 20;
      const {offsetHeight: bodyHeight, offsetWidth: bodyWidth} = document.body;
      const viewTop = this.defaultParent.$(".nav_bar").offsetHeight;
      const viewHeight = bodyHeight - viewTop;
      const maxWidth = bodyWidth - (margin * 2);

      // カーソルの上下左右のスペースを測定
      const space = {
        left: mouseX,
        right: bodyWidth - mouseX,
        top: mouseY,
        bottom: bodyHeight - mouseY
      };

      // 通常はカーソル左か右のスペースを用いるが、そのどちらもが狭い場合は上下に配置する
      if (Math.max(space.left, space.right) > 400) {
        // 例え右より左が広くても、右に十分なスペースが有れば右に配置
        if (space.right > 350) {
          popupNode.style.left = `${space.left + margin}px`;
          popupNode.style.maxWidth = `${maxWidth - space.left}px`;
        } else {
          popupNode.style.right = `${space.right + margin}px`;
          popupNode.style.maxWidth = `${maxWidth - space.right}px`;
        }
        const cursorTop = Math.max(space.top, viewTop + (margin * 2));
        const outerHeight = this._getOuterHeight(popupNode, true);
        if (viewHeight > (outerHeight + margin)) {
          cssTop = Math.min(cursorTop, bodyHeight - outerHeight) - margin;
        } else {
          cssTop = viewTop + margin;
        }
        popupNode.style.top = `${cssTop}px`;
        popupNode.style.maxHeight = `${bodyHeight - cssTop - margin}px`;
      } else {
        popupNode.style.left = `${margin}px`;
        popupNode.style.maxWidth = `${maxWidth}px`;
        // 例え上より下が広くても、上に十分なスペースが有れば上に配置
        if (space.top > Math.min(350, space.bottom)) {
          const cssBottom = Math.max(space.bottom, margin);
          popupNode.style.bottom = `${cssBottom}px`;
          popupNode.style.maxHeight = `${viewHeight - cssBottom - margin}px`;
        } else {
          cssTop = (bodyHeight - space.bottom) + margin;
          popupNode.style.top = `${cssTop}px`;
          popupNode.style.maxHeight = `${viewHeight - cssTop - margin}px`;
        }
      }
    };

    // マウス座標とコンテキストメニューの監視
    if (this._popupStack.length === 0) {
      this._currentX = mouseX;
      this._currentY = mouseY;
      this.defaultParent.on("mousemove", this._onMouseMove);
      this._popupArea.on("contextmenu_removed", this._onRemoveContextmenu);
    }

    // 新規ノードの設定
    const setupNewNode = (sourceNode, popupNode) => {
      // CSSContainmentの恩恵を受けるために表示位置決定前にクラスを付加する
      popupNode.addClass("popup");

      // 表示位置の決定
      setDispPosition(popupNode);

      // ノードの設定
      sourceNode.addClass("popup_source");
      sourceNode.setAttr("stack-index", this._popupStack.length);
      sourceNode.on("mouseenter", this._onMouseEnter);
      sourceNode.on("mouseleave", this._onMouseLeave);
      if (app.config.get("aa_font") === "aa") {
        popupNode.addClass("config_use_aa_font");
      }
      popupNode.setAttr("stack-index", this._popupStack.length);
      popupNode.on("mouseenter", this._onMouseEnter);
      popupNode.on("mouseleave", this._onMouseLeave);

      // リンク情報の保管
      popupInfo = {
        source: sourceNode,
        popup: popupNode
      };
      this._popupStack.push(popupInfo);

    };

    // 即時表示の場合
    if (this._delayTime < 100) {
      // 新規ノードの設定
      setupNewNode(this.source, this.popup);
      // popupの表示
      this._popupArea.addLast(this.popup);
      // ノードのアクティブ化
      await app.defer();
      this._activateNode();

    // 遅延表示の場合
    } else {
      ((sourceNode, popupNode) => {
        this._delayTimeoutID = setTimeout( () => {
          this._delayTimeoutID = 0;
          // マウス座標がポップアップ元のままの場合のみ実行する
          const ele = document.elementFromPoint(this._currentX, this._currentY);
          if (ele === sourceNode) {
            // 新規ノードの設定
            setupNewNode(sourceNode, popupNode);
            // ノードのアクティブ化
            sourceNode.addClass("active");
            // popupの表示
            return this._popupArea.addLast(popupNode);
          }
        }
        , this._delayTime);
      })(this.source, this.popup);
    }

  }

  /**
  @method _remove
  @param {Boolean} forceRemove
  */
  _remove(forceRemove) {
    if (this._popupArea.hasClass("has_contextmenu")) { return; }
    for (let i = this._popupStack.length - 1; i >= 0; i--) {
      // 末端の非アクティブ・ノードを選択
      const {popup, source} = this._popupStack[i];
      if (
        !forceRemove &&
        (
          source.hasClass("active") ||
          popup.hasClass("active")
        )
      ) { break; }
      // 該当ノードの除去
      source.off("mouseenter", this._onMouseEnter);
      source.off("mouseleave", this._onMouseLeave);
      popup.off("mouseenter", this._onMouseEnter);
      popup.off("mouseleave", this._onMouseLeave);
      source.removeClass("popup_source");
      source.removeAttr("stack-index");
      popup.remove();
      this._popupStack.pop();
      // コンテキストメニューの破棄
      if (this._popupArea.hasClass("has_contextmenu")) {
        ContextMenu.remove();
      }
    }

    // マウス座標とコンテキストメニューの監視終了
    if (this._popupStack.length === 0) {
      this.defaultParent.off("mousemove", this._onMouseMove);
      this._popupArea.off("contextmenu_removed", this._onRemoveContextmenu);
    }
  }

  /**
  @method _delayRemove
  @param {Boolean} forceRemove
  */
  _delayRemove(forceRemove) {
    if (this._delayRemoveTimeoutID !== 0) { clearTimeout(this._delayRemoveTimeoutID); }
    this._delayRemoveTimeoutID = setTimeout( () => {
      this._delayRemoveTimeoutID = 0;
      return this._remove(forceRemove);
    }
    , 300);
  }

  /**
  @method _onMouseEnter
  @param {Object} Event
  */
  _onMouseEnter({currentTarget: target}) {
    target.addClass("active");
    // ペア・ノードの非アクティブ化
    const stackIndex = target.getAttr("stack-index");
    if (target.hasClass("popup")) {
      this._popupStack[stackIndex].source.removeClass("active");
    } else if (target.hasClass("popup_source")) {
      this._popupStack[stackIndex].popup.removeClass("active");
    }
    // 末端ノードの非アクティブ化
    if ((this._popupStack.length - 1) > stackIndex) {
      this._popupStack[this._popupStack.length - 1].source.removeClass("active");
      this._popupStack[this._popupStack.length - 1].popup.removeClass("active");
      this._delayRemove(false);
    }
  }

  /**
  @method _onMouseLeave
  @param {Object} Event
  */
  _onMouseLeave({ currentTarget: target }) {
    target.removeClass("active");
    if (this._popupArea.hasClass("has_contextmenu")) { return; }
    this._delayRemove(false);
  }

  /**
  @method _onMouseMove
  @param {Object} Event
  */
  _onMouseMove({clientX, clientY}) {
    this._currentX = clientX;
    this._currentY = clientY;
  }

  /**
  @method _activateNode
  */
  _activateNode() {
    const ele = document.elementFromPoint(this._currentX, this._currentY);
    if (ele === this.source) {
      this.source.addClass("active");
    } else if ((ele === this.popup) || (ele.closest(".popup") === this.popup)) {
      this.popup.addClass("active");
    } else if (ele.hasClass("popup_source") || ele.hasClass("popup")) {
      ele.addClass("active");
    } else if (ele.closest(".popup")) {
      ele.closest(".popup").addClass("active");
    } else {
      this.source.removeClass("active");
      this.popup.removeClass("active");
      this._delayRemove(false);
    }
  }

  /**
  @method _onRemoveContextmenu
  */
  _onRemoveContextmenu() {
    this._activateNode();
    this._remove(false);
  }

  /**
  @method _getOuterHeight
  @param {Object} ele
  @param {Boolean} margin
  */
  // .outerHeight()の代用関数
  _getOuterHeight(ele, margin) {
    // 下層に表示してoffsetHeightを取得する
    if (margin == null) { margin = false; }
    ele.style.zIndex = "-1";
    this._popupArea.addLast(ele);
    let outerHeight = ele.offsetHeight;
    ele.remove();
    ele.style.zIndex = "3";    // ソースでは"3"だが、getComputedStyleでは"0"になるため
    // 表示済みのノードが存在すればCSSの値を取得する
    if ((this._popupStyle === null) && (this._popupStack.length > 0)) {
      this._popupStyle = getComputedStyle(this._popupStack[0].popup, null);
    }
    // margin等の取得
    if (margin && (this._popupStyle !== null)) {
      if (this._popupMarginHeight < 0) {
        this._popupMarginHeight = 0;
        this._popupMarginHeight += parseInt(this._popupStyle.marginTop);
        this._popupMarginHeight += parseInt(this._popupStyle.marginBottom);
        const {
          boxShadow
        } = this._popupStyle;
        const tmp = /rgba?\(.*\) (-?[\d]+)px (-?[\d]+)px ([\d]+)px (-?[\d]+)px/.exec(boxShadow);
        this._popupMarginHeight += Math.abs(parseInt(tmp[2]));
        this._popupMarginHeight += Math.abs(parseInt(tmp[4]));
      }
      outerHeight += this._popupMarginHeight;
    }
    ele.style.zIndex = null;
    return outerHeight;
  }
}
