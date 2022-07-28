let Write;
import { URL, parseQuery } from "../core/URL.ts";
import { fadeIn, fadeOut } from "../ui/Animate.js";

class Timer {
  static initClass() {
    this.prototype._timeout = null;
    this.prototype._MSEC = 30 * 1000;
  }

  constructor(onFinish) {
    this.onFinish = onFinish;
  }

  wake() {
    if (this._timeout != null) {
      this.kill();
    }
    this._timeout = setTimeout(() => {
      this.onFinish();
    }, this._MSEC);
  }

  kill() {
    clearTimeout(this._timeout);
    this._timeout = null;
  }
}
Timer.initClass();

export default Write = (function () {
  Write = class Write {
    static initClass() {
      this.prototype.url = null;
      this.prototype.title = null;
      this.prototype.name = null;
      this.prototype.mail = null;
      this.prototype.message = null;

      this.prototype.$view = $$.C("view_write")[0];
      this.prototype.timer = null;
      this.prototype._PONG_MSG = "write_iframe_pong";
    }

    static setFont() {
      if (navigator.platform.includes("Win")) {
        return;
      }
      const font = localStorage.getItem("textar_font");
      if (font == null) {
        return;
      }
      const fontface = new FontFace("Textar", `url(${font})`);
      document.fonts.add(fontface);
    }

    constructor() {
      let left, left1, left2, left3;
      this._onTimerFinish = this._onTimerFinish.bind(this);
      const param = parseQuery(location.search);
      this.url = new URL(param.get("url"));
      this.title =
        (left = param.get("title")) != null ? left : param.get("url");
      this.name =
        (left1 = param.get("name")) != null
          ? left1
          : app.config.get("default_name");
      this.mail =
        (left2 = param.get("mail")) != null
          ? left2
          : app.config.get("default_mail");
      this.message = (left3 = param.get("message")) != null ? left3 : "";
      this.timer = new Timer(this._onTimerFinish);

      this._setHeaderModifier();
      this._setupTheme();
      this._setDOM();
      this._setBeforeUnload();
      this._setTitle();
      this._setupMessage();
      this._setupForm();
    }

    _beforeSendFunc() {
      const url = new URL(this.url.href);
      return function ({ method, requestHeaders }) {
        let name;
        const origin = browser.runtime.getURL("").slice(0, -1);
        const isSameOrigin =
          requestHeaders.some(
            ({ name, value }) =>
              name === "Origin" && (value === origin || value === "null")
          ) || !requestHeaders.includes("Origin");
        if (method !== "POST" || !isSameOrigin) {
          return;
        }
        if (url.getTsld() === "2ch.sc") {
          url.protocol = "http:";
        }

        const ua = app.config.get("useragent").trim();
        const uaExists = ua.length > 0;
        let setReferer = false;
        let setUserAgent = !uaExists;

        for (let i = 0; i < requestHeaders.length; i++) {
          ({ name } = requestHeaders[i]);
          if (!setReferer && name === "Referer") {
            requestHeaders[i].value = url.href;
            setReferer = true;
          } else if (!setUserAgent && name === "User-Agent") {
            requestHeaders[i].value = ua;
            setUserAgent = true;
          }
          if (setReferer && setUserAgent) {
            break;
          }
        }

        if (!setReferer) {
          requestHeaders.push({ name: "Referer", value: url.href });
        }
        if (!setUserAgent && uaExists) {
          requestHeaders.push({ name: "User-Agent", value: ua });
        }

        return { requestHeaders };
      };
    }

    _setHeaderModifier() {}

    _setupTheme() {
      // テーマ適用
      this._changeTheme(app.config.get("theme_id"));
      this._insertUserCSS();

      // テーマ更新反映
      app.message.on("config_updated", ({ key, val }) => {
        if (key === "theme_id") {
          this._changeTheme(val);
        }
      });
    }

    _changeTheme(themeId) {
      // テーマ適用
      this.$view.removeClass("theme_default", "theme_dark", "theme_none");
      this.$view.addClass(`theme_${themeId}`);
    }

    _insertUserCSS() {
      const style = $__("style");
      style.id = "user_css";
      style.textContent = app.config.get("user_css");
      document.head.addLast(style);
    }

    _setDOM() {
      this._setSageDOM();
      this._setDefaultInput();

      this.$view.C("preview_button")[0].on("click", (e) => {
        e.preventDefault();

        let text = this.$view.T("textarea")[0].value;
        //行頭のスペースは削除される。複数のスペースは一つに纏められる。
        text = text.replace(/^\u0020*/g, "").replace(/\u0020+/g, " ");

        const $div = $__("div").addClass("preview");
        const $pre = $__("pre");
        $pre.textContent = text;
        const $button = $__("button").addClass("close_preview");
        $button.textContent = "戻る";
        $button.on("click", function () {
          this.parent().remove();
        });
        $div.addLast($pre, $button);
        document.body.addLast($div);
      });

      this.$view.C("message")[0].on("keyup", ({ target }) => {
        const line = target.value.split(/\n/).length;
        this.$view.C(
          "notice"
        )[0].textContent = `${target.value.length}文字 ${line}行`;
      });
    }

    _setSageDOM() {
      const $sage = this.$view.C("sage")[0];
      const $mail = this.$view.C("mail")[0];

      if (app.config.isOn("sage_flag")) {
        $sage.checked = true;
        $mail.disabled = true;
      }
      this.$view.C("sage")[0].on("change", function () {
        if (this.checked) {
          app.config.set("sage_flag", "on");
          $mail.disabled = true;
        } else {
          app.config.set("sage_flag", "off");
          $mail.disabled = false;
        }
      });
    }

    _setDefaultInput() {
      this.$view.C("name")[0].value = this.name;
      this.$view.C("mail")[0].value = this.mail;
      this.$view.C("message")[0].value = this.message;
    }

    _setTitle() {
      const $h1 = this.$view.T("h1")[0];
      document.title = this.title;
      $h1.textContent = this.title;
      if (this.url.isHttps()) {
        $h1.addClass("https");
      }
    }

    _setBeforeUnload() {
      window.on("beforeunload", function () {
        browser.runtime.sendMessage({
          type: "write_position",
          x: screenX,
          y: screenY,
        });
      });
    }

    _onTimerFinish() {
      this._onError("一定時間経過しても応答が無いため、処理を中断しました");
    }

    _onError(message) {
      for (let dom of this.$view.$$("form input, form textarea")) {
        if (!dom.hasClass("mail") || !app.config.isOn("sage_flag")) {
          dom.disabled = false;
        }
      }

      const $notice = this.$view.C("notice")[0];
      if (message) {
        $notice.textContent = `書き込み失敗 - ${message}`;
      } else {
        $notice.textContent = "";
        fadeIn(this.$view.C("iframe_container")[0]);
      }
    }

    _onSuccess(key) {}

    _setupMessage() {
      window.on("message", async ({ data: { type, key, message }, source }) => {
        switch (type) {
          case "ping":
            source.postMessage(this._PONG_MSG, "*");
            this.timer.wake();
            break;
          case "success":
            this.$view.C("notice")[0].textContent = "書き込み成功";
            this.timer.kill();
            await app.wait(message);
            this._onSuccess(key);
            var { id } = await browser.tabs.getCurrent();
            browser.tabs.remove(id);
            break;
          case "confirm":
            fadeIn(this.$view.C("iframe_container")[0]);
            this.timer.kill();
            break;
          case "error":
            this._onError(message);
            this.timer.kill();
            break;
        }
      });
    }

    _getIframeArgs() {
      return {
        rcrxName: this.$view.C("name")[0].value,
        rcrxMail: this.$view.C("sage")[0].checked
          ? "sage"
          : this.$view.C("mail")[0].value,
        rcrxMessage: this.$view.C("message")[0].value,
      };
    }

    _getFormData() {
      const { bbsType } = this.url.guessType();
      const splittedUrl = this.url.pathname.split("/");
      const args = this._getIframeArgs();
      return { bbsType, splittedUrl, args };
    }

    _setupForm() {
      this.$view.C("hide_iframe")[0].on("click", () => {
        this.timer.kill();
        const $iframeC = this.$view.C("iframe_container")[0];
        (async function () {
          const ani = await fadeOut($iframeC);
          ani.on("finish", function () {
            $iframeC.T("iframe")[0].remove();
          });
        })();
        for (let dom of this.$view.$$("input, textarea")) {
          if (!dom.hasClass("mail") || !app.config.isOn("sage_flag")) {
            dom.disabled = false;
          }
        }
        this.$view.C("notice")[0].textContent = "";
      });

      this.$view.T("form")[0].on("submit", (e) => {
        e.preventDefault();

        for (let dom of this.$view.$$("input, textarea")) {
          if (!dom.hasClass("mail") || !app.config.isOn("sage_flag")) {
            dom.disabled = true;
          }
        }

        const $iframe = $__("iframe");
        $iframe.src = "/view/empty.html";
        $iframe.on(
          "load",
          () => {
            let key, val;
            const formData = this._getFormData();
            const iframeDoc = $iframe.contentDocument;
            //フォーム生成
            const form = iframeDoc.createElement("form");
            form.acceptCharset = formData.charset;
            form.action = formData.action;
            form.method = "POST";
            for (key in formData.input) {
              val = formData.input[key];
              const input = iframeDoc.createElement("input");
              input.name = key;
              input.value = val;
              form.appendChild(input);
            }
            for (key in formData.textarea) {
              val = formData.textarea[key];
              const textarea = iframeDoc.createElement("textarea");
              textarea.name = key;
              textarea.textContent = val;
              form.appendChild(textarea);
            }
            iframeDoc.body.appendChild(form);
            Object.getPrototypeOf(form).submit.call(form);
          },
          { once: true }
        );
        $$.C("iframe_container")[0].addLast($iframe);

        this.timer.wake();
        this.$view.C("notice")[0].textContent = "書き込み中";
      });
    }
  };
  Write.initClass();
  return Write;
})();
