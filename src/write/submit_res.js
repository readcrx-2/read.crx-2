import Write from "./write.js";
import { getByUrl as getWriteHistoryByUrl } from "../core/WriteHistory.js";
import { URL } from "../core/URL.ts";

Write.setFont();

class SubmitRes extends Write {
  constructor() {
    super();
    this._setupDatalist();
  }

  async _setHeaderModifier() {
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
    browser.webRequest.onHeadersReceived.addListener(
      function ({ responseHeaders }) {
        // X-Frame-Options回避
        for (let i = 0; i < responseHeaders.length; i++) {
          const { name } = responseHeaders[i];
          if (name === "X-Frame-Options") {
            responseHeaders.splice(i, 1);
            return { responseHeaders };
          }
        }
      },
      {
        tabId: id,
        types: ["sub_frame"],
        urls: ["*://*/test/bbs.cgi*", "*://jbbs.shitaraba.net/bbs/write.cgi/*"],
      },
      ["blocking", "responseHeaders"]
    );
  }

  _onError(message) {
    super._onError(message);
    const { url, message: mes, name, mail } = this;
    browser.runtime.sendMessage({
      type: "written?",
      url: url.href,
      mes,
      name,
      mail,
    });
  }

  _onSuccess(key) {
    const mes = this.$view.C("message")[0].value;
    const name = this.$view.C("name")[0].value;
    const mail = this.$view.C("mail")[0].value;
    browser.runtime.sendMessage({
      type: "written",
      url: this.url.href,
      mes,
      name,
      mail,
    });
  }

  async _setupDatalist() {
    let $option;
    const data = await getWriteHistoryByUrl(this.url.href);
    const names = [];
    const mails = [];
    for (let { input_name, input_mail } of data) {
      if (names.length <= 5) {
        if (input_name !== "" && !names.includes(input_name)) {
          names.push(input_name);
        }
      }
      if (mails.length <= 5) {
        if (input_mail !== "" && !mails.includes(input_mail)) {
          mails.push(input_mail);
        }
      }
      if (names.length + mails.length >= 10) {
        break;
      }
    }
    const $names = $__("datalist");
    $names.id = "names";
    for (let n of names) {
      $option = $__("option");
      $option.value = n;
      $names.addLast($option);
    }
    const $mails = $__("datalist");
    $mails.id = "mails";
    for (let m of mails) {
      $option = $__("option");
      $option.value = m;
      $mails.addLast($option);
    }
    $$.I("main").addLast($names, $mails);
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
            submit: "書",
            bbs: splittedUrl[3],
            key: splittedUrl[4],
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
            submit: "書きこむ",
            time: Math.floor(Date.now() / 1000) - 60,
            bbs: splittedUrl[3],
            key: splittedUrl[4],
            FROM: args.rcrxName,
            mail: args.rcrxMail,
            oekaki_thread1: "",
          },
          textarea: {
            MESSAGE: args.rcrxMessage,
          },
        };
      }
      // したらば
    } else if (bbsType === "jbbs") {
      return {
        action: `${protocol}//jbbs.shitaraba.net/bbs/write.cgi/${splittedUrl[3]}/${splittedUrl[4]}/${splittedUrl[5]}/`,
        charset: "EUC-JP",
        input: {
          TIME: Math.floor(Date.now() / 1000) - 60,
          DIR: splittedUrl[3],
          BBS: splittedUrl[4],
          KEY: splittedUrl[5],
          NAME: args.rcrxName,
          MAIL: args.rcrxMail,
        },
        textarea: {
          MESSAGE: args.rcrxMessage,
        },
      };
      // まちBBS
    } else if (bbsType === "machi") {
      return {
        action: `${protocol}//${hostname}/bbs/write.cgi`,
        charset: "Shift_JIS",
        input: {
          submit: "書きこむ",
          TIME: Math.floor(Date.now() / 1000) - 60,
          BBS: splittedUrl[3],
          KEY: splittedUrl[4],
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

app.boot("/write/submit_res.html", function () {
  new SubmitRes();
});
