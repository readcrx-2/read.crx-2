import Write from "./write.js";

Write.setFont();

class SubmitThread extends Write {
  static initClass() {
    this.prototype._PONG_MSG = "write_iframe_pong:thread";
  }

  constructor() {
    super();
  }

  async _setHeaderModifierWebRequest() {
    const { id } = await browser.tabs.getCurrent();
    const extraInfoSpec = ["requestHeaders", "blocking"];
    if (
      browser.webRequest.OnBeforeSendHeadersOptions.hasOwnProperty(
        "EXTRA_HEADERS"
      )
    ) {
      extraInfoSpec.push("extraHeaders");
    }

    browser.webRequest.onBeforeSendHeaders.addListener(
      this._beforeSendFunc(),
      {
        tabId: id,
        types: ["sub_frame"],
        urls: ["*://*/test/bbs.cgi*", "*://jbbs.shitaraba.net/bbs/write.cgi/*"],
      },
      extraInfoSpec
    );
  }

  _setTitle() {
    const title = this.title + "板";
    const $h1 = this.$view.T("h1")[0];
    document.title = title;
    $h1.textContent = title;
    if (this.url.isHttps()) {
      $h1.addClass("https");
    }
  }

  _onSuccess(key) {
    let needle;
    const mes = this.$view.C("message")[0].value;
    const name = this.$view.C("name")[0].value;
    const mail = this.$view.C("mail")[0].value;
    const title = this.$view.C("title")[0].value;
    const { url } = this;

    if (
      ((needle = url.getTsld()),
      ["5ch.net", "2ch.sc", "bbspink.com", "open2ch.net"].includes(needle))
    ) {
      const keys = key.match(/.*\/test\/read\.cgi\/(\w+?)\/(\d+)\/l\d+/);
      if (keys == null) {
        $notice.textContent = "書き込み失敗 - 不明な転送場所";
      } else {
        const server = url.origin;
        const thread_url = `${server}/test/read.cgi/${keys[1]}/${keys[2]}/`;
        browser.runtime.sendMessage({
          type: "written",
          kind: "own",
          url: url.href,
          thread_url,
          mes,
          name,
          mail,
          title,
        });
      }
    } else if (url.getTsld() === "shitaraba.net") {
      browser.runtime.sendMessage({
        type: "written",
        kind: "board",
        url: url.href,
        mes,
        name,
        mail,
        title,
      });
    }
  }

  _getIframeArgs() {
    const args = super._getIframeArgs();
    args.rcrxTitle = this.$view.C("title")[0].value;
    return args;
  }

  _getFormData() {
    const { protocol, hostname } = this.url;
    const { bbsType, splittedUrl, args } = super._getFormData();
    // 2ch
    if (bbsType === "2ch") {
      // open2ch
      if (this.url.getTsld() === "open2ch.net") {
        return {
          action: `${protocol}//${hostname}/test/bbs.cgi`,
          charset: "UTF-8",
          input: {
            submit: "新規スレッド作成",
            bbs: splittedUrl[1],
            subject: args.rcrxTitle,
            FROM: args.rcrxName,
            mail: args.rcrxMail,
          },
          textarea: {
            MESSAGE: args.rcrxMessage,
          },
        };
      } else {
        return {
          action: `${protocol}//${hostname}/test/bbs.cgi`,
          charset: "Shift_JIS",
          input: {
            submit: "新規スレッド作成",
            time: Math.floor(Date.now() / 1000) - 60,
            bbs: splittedUrl[1],
            subject: args.rcrxTitle,
            FROM: args.rcrxName,
            mail: args.rcrxMail,
          },
          textarea: {
            MESSAGE: args.rcrxMessage,
          },
        };
      }
      // したらば
    } else if (bbsType === "jbbs") {
      return {
        action: `${protocol}//jbbs.shitaraba.net/bbs/write.cgi/${splittedUrl[1]}/${splittedUrl[2]}/new/`,
        charset: "EUC-JP",
        input: {
          submit: "新規スレッド作成",
          TIME: Math.floor(Date.now() / 1000) - 60,
          DIR: splittedUrl[1],
          BBS: splittedUrl[2],
          SUBJECT: args.rcrxTitle,
          NAME: args.rcrxName,
          MAIL: args.rcrxMail,
        },
        textarea: {
          MESSAGE: args.rcrxMessage,
        },
      };
    }
  }
}
SubmitThread.initClass();

app.boot("/write/submit_thread.html", function () {
  new SubmitThread();
});
