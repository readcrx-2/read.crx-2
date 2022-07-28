import {get as getBBSMenu} from "./BBSMenu.js";
import Board from "./Board.js";
import {Request} from "./HTTP.ts";
import {URL} from "./URL.ts";
import {levenshteinDistance} from "./Util.ts";

/**
@class Anchor
スレッドフロートBBSで用いられる「アンカー」形式の文字列を扱う。
*/
export var Anchor = {
  reg: {
    ANCHOR: /(?:&gt;|＞){1,2}[\d\uff10-\uff19]+(?:[\-\u30fc][\d\uff10-\uff19]+)?(?:\s*[,、]\s*[\d\uff10-\uff19]+(?:[\-\u30fc][\d\uff10-\uff19]+)?)*/g,
    _FW_NUMBER: /[\uff10-\uff19]/g
  },

  parseAnchor(str) {
    let segment;
    const data = {
      targetCount: 0,
      segments: []
    };

    str = app.replaceAll(str, "\u30fc", "-");
    str = str.replace(Anchor.reg._FW_NUMBER, $0 => String.fromCharCode($0.charCodeAt(0) - 65248));

    if (!/^(?:&gt;|＞){0,2}([\d]+(?:-\d+)?(?:\s*[,、]\s*\d+(?:-\d+)?)*)$/.test(str)) {
      return data;
    }

    const segReg = /(\d+)(?:-(\d+))?/g;
    while ((segment = segReg.exec(str))) {
      // 桁数の大きすぎる値は無視
      var segrangeEnd, segrangeStart;
      if ((segment[1].length > 5) || ((segment[2] != null ? segment[2].length : undefined) > 5)) { continue; }
      // 1以下の値は無視
      if (+segment[1] < 1) { continue; }

      if (segment[2]) {
        if (+segment[1] <= +segment[2]) {
          segrangeStart = +segment[1];
          segrangeEnd = +segment[2];
        } else {
          segrangeStart = +segment[2];
          segrangeEnd = +segment[1];
        }
      } else {
        segrangeStart = (segrangeEnd = +segment[1]);
      }

      data.targetCount += (segrangeEnd - segrangeStart) + 1;
      data.segments.push([segrangeStart, segrangeEnd]);
    }
    return data;
  }
};

const boardUrlReg = /^https?:\/\/\w+\.5ch\.net\/(\w+)\/$/;
//2chの鯖移転検出関数
//移転を検出した場合は移転先のURLをresolveに載せる
//検出出来なかった場合はrejectする
//htmlを渡す事で通信をスキップする事が出来る
export var chServerMoveDetect = async function(oldBoardUrl, html) {
  let newBoardUrl;
  oldBoardUrl.protocol = "http:";
  if (typeof html !== "string") {
    //htmlが渡されなかった場合は通信する
    let status;
    ({status, body: html} = await (new Request("GET", oldBoardUrl.href, {
      mimeType: "text/html; charset=Shift_JIS",
      cache: false
    }
    )).send());
    if (status !== 200) {
      throw new Error("サーバー移転判定のための通信に失敗しました");
    }
  }

  //htmlから移転を判定
  const res = new RegExp(`location\\.href="(https?://(\\w+\\.)?5ch\\.net/\\w*/)"`).exec(html);
  if (res) {
    let newBoardUrlTmp;
    if (res[2] != null) {
      newBoardUrlTmp = new URL(res[1]);
    } else {
      const {responseURL} = await (new Request("GET", res[1])).send();
      newBoardUrlTmp = new URL(responseURL);
    }
    newBoardUrlTmp.protocol = "http";
    if (newBoardUrlTmp.hostname !== oldBoardUrl.hostname) {
      newBoardUrl = newBoardUrlTmp;
    }
  }

  //bbsmenuから検索
  if (newBoardUrl == null) {
    newBoardUrl = await (async function() {
      const {menu: data} = await getBBSMenu();
      if (data == null) {
        throw new Error("BBSMenuの取得に失敗しました");
      }
      const boardKey = __guard__(oldBoardUrl.pathname.split("/"), x => x[1]);
      if (!boardKey) {
        throw new Error("板のURL形式が不明です");
      }
      for (let category of data) {
        for (let board of category.board) {
          const m = board.url.match(boardUrlReg);
          if (m != null) {
            const newUrl = new URL(m[0]);
            newUrl.protocol = "http:";
            if ((boardKey === m[1]) && (oldBoardUrl.hostname !== newUrl.hostname)) {
              return newUrl;
            }
          }
        }
      }
      throw new Error("BBSMenuにその板のサーバー情報が存在しません");
    })();
  }

  //移転を検出した場合は移転検出メッセージを送出
  app.message.send("detected_ch_server_move",
    {before: oldBoardUrl.href, after: newBoardUrl.href});
  return newBoardUrl;
};

//文字参照をデコード
const $span = $__("span");
export var decodeCharReference = str => str.replace(/\&(?:#(\d+)|#x([\dA-Fa-f]+)|([\da-zA-Z]+));/g, function($0, $1, $2, $3) {
  //数値文字参照 - 10進数
  if ($1 != null) {
    return String.fromCodePoint($1);
  }
  //数値文字参照 - 16進数
  if ($2 != null) {
    return String.fromCodePoint(parseInt($2, 16));
  }
  //文字実体参照
  if ($3 != null) {
    $span.innerHTML = $0;
    return $span.textContent;
  }
  return $0;
});

//マウスクリックのイベントオブジェクトから、リンク先をどう開くべきかの情報を導く
const openMap = new Map([
  //button(number), shift(bool), ctrl(bool)の文字列
  ["0falsefalse", { newTab: false, newWindow: false, background: false }],
  ["0truefalse",  { newTab: false, newWindow: true,  background: false }],
  ["0falsetrue",  { newTab: true,  newWindow: false, background: true  }],
  ["0truetrue",   { newTab: true,  newWindow: false, background: false }],
  ["1falsefalse", { newTab: true,  newWindow: false, background: true  }],
  ["1truefalse",  { newTab: true,  newWindow: false, background: false }],
  ["1falsetrue",  { newTab: true,  newWindow: false, background: true  }],
  ["1truetrue",   { newTab: true,  newWindow: false, background: false }]
]);
export var getHowToOpen = function({type, button, shiftKey, ctrlKey, metaKey}) {
  if (!ctrlKey) { ctrlKey = metaKey; }
  const def = {newTab: false, newWindow: false, background: false};
  if (type === "mousedown") {
    const key = "" + button + shiftKey + ctrlKey;
    if (openMap.has(key)) { return openMap.get(key); }
  }
  return def;
};

export var searchNextThread = async function(threadUrlStr, threadTitle, resString) {
  const threadUrl = new URL(threadUrlStr);
  const boardUrl = threadUrl.toBoard();
  threadTitle = normalize(threadTitle);

  let {data: threads} = await Board.get(boardUrl);
  if (threads == null) {
    throw new Error("板の取得に失敗しました");
  }
  threads = threads.filter( ({url, resCount}) => (url !== threadUrl.href) && (resCount < 1001)).map( function({title, url}) {
    let left;
    let score = levenshteinDistance(threadTitle, normalize(title), false);
    const m = url.match(/(?:https:\/\/)?(?:\w+(\.[25]ch\.net\/.+)|(.+))$/);
    if (resString.includes((left = m[1] != null ? m[1] : m[2]) != null ? left : url)) {
      score -= 3;
    }
    return {score, title, url};
  }).sort( (a, b) => a.score - b.score);
  return threads.slice(0, 5);
};

const wideSlimNormalizeReg = new RegExp(`[\
\
\\uff01-\\uff5d\
\
\\uff66-\\uff9d\
]+`, 'g');
const kataHiraReg = new RegExp(`[\
\\u30a1-\\u30f3\
]`, 'g');
// 検索用に全角/半角や大文字/小文字を揃える
export var normalize = function(str) {
  str = str
    // 全角記号/英数を半角記号/英数に、半角カタカナを全角カタカナに変換
    .replace(
      wideSlimNormalizeReg,
      s => s.normalize("NFKC"))
    // カタカナをひらがなに変換
    .replace(
      kataHiraReg,
      $0 => String.fromCharCode($0.charCodeAt(0) - 96));
  // 全角スペース/半角スペースを削除
  str = app.replaceAll(
    app.replaceAll(str, "\u0020", "")
  , "\u3000", "");
  // 大文字を小文字に変換
  return str.toLowerCase();
};

// striptags
export var stripTags = str => str.replace(/<[^>]+>/ig, "");

const titleReg = / ?(?:\[(?:無断)?転載禁止\]|(?:\(c\)|©|�|&copy;|&#169;)(?:2ch\.net|@?bbspink\.com)) ?/g;
// タイトルから無断転載禁止などを取り除く
export var removeNeedlessFromTitle = function(title) {
  const title2 = title.replace(titleReg,"");
  title = title2 === "" ? title : title2;
  return app.replaceAll(
    app.replaceAll(title, "<mark>", "")
  , "</mark>", "");
};

export var promiseWithState = function(promise) {
  let state = "pending";
  promise.then( function() {
    state = "resolved";
  }
  , function() {
    state = "rejected";
  });
  return {
    isResolved() {
      return state === "resolved";
    },
    isRejected() {
      return state === "rejected";
    },
    getState() {
      return state;
    },
    promise
  };
};

export var indexedDBRequestToPromise = req => new Promise( function(resolve, reject) {
  req.onsuccess = resolve;
  req.onerror = reject;
});

export var stampToDate = stamp => new Date(stamp * 1000);

export var stringToDate = function(string) {
  const date = string.match(/(\d{4})\/(\d{1,2})\/(\d{1,2})(?:\(.\))?\s?(\d{1,2}):(\d\d)(?::(\d\d)(?:\.\d+)?)?/);
  let flg = false;
  if (date != null) {
    if (date[1] != null) { flg = true; }
    if ((date[2] == null) || !(1 <= +date[2] && +date[2] <= 12)) { flg = false; }
    if ((date[3] == null) || !(1 <= +date[3] && +date[3] <= 31)) { flg = false; }
    if ((date[4] == null) || !(0 <= +date[4] && +date[4] <= 23)) { flg = false; }
    if ((date[5] == null) || !(0 <= +date[5] && +date[5] <= 59)) { flg = false; }
    if ((date[6] == null) || !(0 <= +date[6] && +date[6] <= 59)) { date[6] = 0; }
  }
  if (flg) {
    return new Date(date[1], date[2] - 1, date[3], date[4], date[5], date[6]);
  }
  return null;
};

export var isNewerReadState = function(a, b) {
  if (!b) {
    return false;
  }
  if (!a) {
    return true;
  }

  if (a.received !== b.received) {
    return (a.received < b.received);
  }
  if (a.read !== b.read) {
    return (a.read < b.read);
  }
  if (a.date && b.date) {
    return (a.date < b.date);
  } else if (a.date) {
    return false;
  } else if (b.date) {
    return true;
  }
  if (a.last !== b.last) {
    return true;
  }
  if (a.offset !== b.offset) {
    return true;
  }

  return false;
};

function __guard__(value, transform) {
  return (typeof value !== 'undefined' && value !== null) ? transform(value) : undefined;
}
