import { get as getBBSMenu, target as BBSMenuTarget } from "./BBSMenu.js";
import { Request } from "./HTTP.ts";
import { URL } from "./URL.ts";

/**
@class BoardTitleSolver
@static
*/

/**
@property _bbsmenu
@private
@type Map | null
*/
let _bbsmenu = null;

/**
@property _bbsmenuPromise
@private
@type Promise | null
*/
let _bbsmenuPromise = null;

/**
@method _generateBBSMenu
@return {Promise}
@private
*/
const _generateBBSMenu = function ({ status, menu, message }) {
  if (status === "error") {
    (async function () {
      await app.defer();
      app.message.send("notify", {
        message,
        background_color: "red",
      });
    })();
  }
  if (menu == null) {
    throw new Error("板一覧が取得できませんでした");
  }

  const bbsmenu = new Map();
  for (let { board } of menu) {
    for (let { url, title } of board) {
      bbsmenu.set(url, title);
    }
  }
  _bbsmenu = bbsmenu;
};

/**
@method _setBBSMenu
@return {Promise}
@private
*/
const _setBBSMenu = async function () {
  const obj = await getBBSMenu();
  _generateBBSMenu(obj);
  BBSMenuTarget.on("change", ({ detail: obj }) => {
    _generateBBSMenu(obj);
  });
};

/**
@method _getBBSMenu
@return {Promise}
@private
*/
const _getBBSMenu = async function () {
  if (_bbsmenu != null) {
    return _bbsmenu;
  }
  if (_bbsmenuPromise != null) {
    await _bbsmenuPromise;
  } else {
    _bbsmenuPromise = _setBBSMenu();
    await _bbsmenuPromise;
    _bbsmenuPromise = null;
  }
  return _bbsmenu;
};

/**
@method searchFromBBSMenu
@param {app.URL.URL} url
@return {Promise}
*/
const searchFromBBSMenu = async function (url) {
  let left, left1;
  const bbsmenu = await _getBBSMenu();
  // スキーム違いについても確認をする
  const url2 = url.createProtocolToggled();
  const boardName =
    (left =
      (left1 = bbsmenu.get(url.href)) != null
        ? left1
        : bbsmenu.get(url2.href)) != null
      ? left
      : null;
  return boardName;
};

/**
@method _formatBoardTitle
@param {String} title
@param {app.URL.URL} url
@private
@return {String}
*/
const _formatBoardTitle = function (title, url) {
  switch (url.getTsld()) {
    case "5ch.net":
      title = title.replace("＠2ch掲示板", "");
      break;
    case "2ch.sc":
      title += "_sc";
      break;
    case "open2ch.net":
      title += "_op";
      break;
  }
  return title;
};

/**
@method searchFromBookmark
@param {app.URL.URL} url
@return {Promise}
*/
const searchFromBookmark = function (url) {
  // スキーム違いについても確認をする
  let left;
  const url2 = url.createProtocolToggled();
  const bookmark =
    (left = app.bookmark.get(url.href)) != null
      ? left
      : app.bookmark.get(url2.href);
  if (bookmark) {
    return _formatBoardTitle(bookmark.title, new URL(bookmark.url));
  }
  return null;
};

/**
@method searchFromSettingTXT
@param {app.URL.URL} url
@return {Promise}
*/
const searchFromSettingTXT = async function (url) {
  let res;
  const { status, body } = await new Request("GET", `${url.href}SETTING.TXT`, {
    mimeType: "text/plain; charset=Shift_JIS",
    timeout: 1000 * 10,
  }).send();
  if (status !== 200) {
    throw new Error("SETTING.TXTを取得する通信に失敗しました");
  }
  if ((res = /^BBS_TITLE_ORIG=(.+)$/m.exec(body))) {
    return _formatBoardTitle(res[1], url);
  }
  if ((res = /^BBS_TITLE=(.+)$/m.exec(body))) {
    return _formatBoardTitle(res[1], url);
  }
  throw new Error("SETTING.TXTに名前の情報がありません");
};

/**
@method searchFromJbbsAPI
@param {String} url
@return {Promise}
*/
const searchFromJbbsAPI = async function (url) {
  let res;
  const tmp = url.pathname.split("/");
  const ajaxPath = `${url.protocol}//jbbs.shitaraba.net/bbs/api/setting.cgi/${tmp[1]}/${tmp[2]}/`;

  const { status, body } = await new Request("GET", ajaxPath, {
    mimeType: "text/plain; charset=EUC-JP",
    timeout: 1000 * 10,
  }).send();
  if (status !== 200) {
    throw new Error("したらばの板のAPIの通信に失敗しました");
  }
  if ((res = /^BBS_TITLE=(.+)$/m.exec(body))) {
    return res[1];
  }
  throw new Error("したらばの板のAPIに名前の情報がありません");
};

/**
@method ask
@param {app.URL.URL} url
@return Promise
*/
export var ask = async function (url) {
  // bbsmenu内を検索
  let name = await searchFromBBSMenu(url);
  if (name != null) {
    return name;
  }

  // ブックマーク内を検索
  name = await searchFromBookmark(url);
  if (name != null) {
    return name;
  }

  try {
    // SETTING.TXTからの取得を試みる
    if (url.guessType().bbsType === "2ch") {
      return await searchFromSettingTXT(url);
    }
    // したらばのAPIから取得を試みる
    if (url.guessType().bbsType === "jbbs") {
      return await searchFromJbbsAPI(url);
    }
  } catch (e) {
    throw new Error(`板名の取得に失敗しました: ${e}`);
  }
};
