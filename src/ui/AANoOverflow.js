/*
 * decaffeinate suggestions:
 * DS206: Consider reworking classes to avoid initClass
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
let AANoOverflow;
export default AANoOverflow = (function() {
  let _AA_CLASS_NAME = undefined;
  let _MINI_AA_CLASS_NAME = undefined;
  let _SCROLL_AA_CLASS_NAME = undefined;
  AANoOverflow = class AANoOverflow {
    static initClass() {
      _AA_CLASS_NAME = "aa";
      _MINI_AA_CLASS_NAME = "mini_aa";
      _SCROLL_AA_CLASS_NAME = "scroll_aa";
    }

    // minRatioはパーセント
    constructor($view, param) {
      this.$view = $view;
      if (param == null) { param = {}; }
      const {minRatio = 40, maxFont = 16} = param;
      this.minRatio = minRatio;
      this.maxFont = maxFont;
      if (this.minRatio >= 100) {
        return;
      }
      this.canvasEle = $__("canvas");
      this.ctx = this.canvasEle.getContext("2d");
      this.ctx.font = this.maxFont+'px "MS PGothic", "IPAMonaPGothic", "Konatu", "Monapo", "Textar"';

      this.$view.on("view_loaded", () => {
        this._setFontSizes();
      });
      // Todo: observe resize
    }

    _getStrLength(str) {
      // canvas上での幅(おそらくhtml上でも同様)
      return this.ctx.measureText(str).width;
    }

    _setFontSize($article, width) {
      const $message = $article.C("message")[0];
      const charCountInLine = $message.innerText.split("\n").map(this._getStrLength.bind(this));
      const textMaxWidth = Math.max(...charCountInLine);

      // リセット
      $message.removeClass(_MINI_AA_CLASS_NAME, _SCROLL_AA_CLASS_NAME);
      $message.style.transform = null;
      $message.style.width = null;
      $message.style.marginBottom = null;

      if (width > textMaxWidth) { return; }

      let ratio = width/textMaxWidth;
      ratio = Math.floor(ratio*100)/100;
      if (ratio < (this.minRatio/100)) {
        ratio = this.minRatio/100;
        $message.addClass(_SCROLL_AA_CLASS_NAME);
        $message.style.width = `${width / ratio}px`;
      }

      $message.addClass(_MINI_AA_CLASS_NAME);

      const heightOld = $message.clientHeight;

      $message.style.transform = `scale(${ratio})`;
      $message.style.marginBottom = `${-(1-ratio) * heightOld}px`;
    }

    async _setFontSizes() {
      await app.waitAF();
      const $aaArticles = this.$view.C("content")[0].C(_AA_CLASS_NAME);
      if (!($aaArticles.length > 0)) { return; }

      // レスの幅はすべて同じと考える
      const width = this.$view.C("content")[0].C("message")[0].clientWidth;
      for (let $article of $aaArticles) {
        this._setFontSize($article, width);
      }
    }

    setMiniAA($article) {
      $article.addClass(_AA_CLASS_NAME);
      this._setFontSize($article, $article.C("message")[0].clientWidth);
    }

    unsetMiniAA($article) {
      $article.removeClass(_AA_CLASS_NAME);
      const $message = $article.C("message")[0];
      $message.removeClass(_MINI_AA_CLASS_NAME, _SCROLL_AA_CLASS_NAME);
      $message.style.transform = null;
      $message.style.width = null;
      $message.style.marginBottom = null;
    }
  };
  AANoOverflow.initClass();
  return AANoOverflow;
})();
