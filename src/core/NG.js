/*
 * decaffeinate suggestions:
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
import {decodeCharReference, normalize, stringToDate} from "./util.coffee";

/**
@class NG
@static
*/

export var TYPE = {
  INVALID: "invalid",
  REG_EXP: "RegExp",
  REG_EXP_TITLE: "RegExpTitle",
  REG_EXP_NAME: "RegExpName",
  REG_EXP_MAIL: "RegExpMail",
  REG_EXP_ID: "RegExpId",
  REG_EXP_SLIP: "RegExpSlip",
  REG_EXP_BODY: "RegExpBody",
  REG_EXP_URL: "RegExpUrl",
  TITLE: "Title",
  NAME: "Name",
  MAIL: "Mail",
  ID: "ID",
  SLIP: "Slip",
  BODY: "Body",
  WORD: "Word",
  URL: "Url",
  RES_COUNT: "ResCount",
  AUTO: "Auto",
  AUTO_CHAIN: "Chain",
  AUTO_CHAIN_ID: "ChainID",
  AUTO_CHAIN_SLIP: "ChainSLIP",
  AUTO_NOTHING_ID: "NothingID",
  AUTO_NOTHING_SLIP: "NothingSLIP",
  AUTO_REPEAT_MESSAGE: "RepeatMessage",
  AUTO_FORWARD_LINK: "ForwardLink"
};

const _CONFIG_NAME = "ngobj";
const _CONFIG_STRING_NAME = "ngwords";

let _ng = null;
const _ignoreResRegNumber = /^ignoreResNumber:(\d+)(?:-?(\d+))?,(.*)$/;
const _ignoreNgType = /^ignoreNgType:(?:\$\((.*?)\):)?(.*)$/;
const _expireDate = /^expireDate:(\d{4}\/\d{1,2}\/\d{1,2}),(.*)$/;
const _attachName = /^attachName:([^,]*),(.*)$/;
const _expNgWords = /^\$\[(.*?)\]\$:(.*)$/;

//jsonには正規表現のオブジェクトが含めれないので
//それを展開
const _setupReg = function(obj) {
  const _convReg = function({type, word}) {
    let reg = null;
    try {
      reg = new RegExp(word);
    } catch (error) {
      app.message.send("notify", {
        message: `\
NG機能の正規表現(${type}: ${word})を読み込むのに失敗しました
この行は無効化されます\
`,
        background_color: "red"
      }
      );
    }
    return reg;
  };

  for (let n of obj) {
    let convFlag = true;
    if (n.subElements != null) {
      for (let subElement of n.subElements) {
        if (!subElement.type.startsWith(TYPE.REG_EXP)) { continue; }
        subElement.reg = _convReg(subElement);
        if (!subElement.reg) {
          subElement.type = TYPE.INVALID;
          convFlag = false;
          break;
        }
      }
    }
    if (convFlag && n.type.startsWith(TYPE.REG_EXP)) {
      n.reg = _convReg(n);
      if (!n.reg) { convFlag = false; }
    }
    if (!convFlag) { n.type = TYPE.INVALID; }
  }
};

const _config = {
  get() {
    return JSON.parse(app.config.get(_CONFIG_NAME));
  },
  set(str) {
    app.config.set(_CONFIG_NAME, JSON.stringify(str));
  },
  getString() {
    return app.config.get(_CONFIG_STRING_NAME);
  },
  setString(str) {
    app.config.set(_CONFIG_STRING_NAME, str);
  }
};

/**
@method get
@return {Object}
*/
export var get = function() {
  if (_ng == null) {
    _ng = new Set(_config.get());
    _setupReg(_ng);
  }
  return _ng;
};

/**
@method parse
@param {String} string
@return {Object}
*/
const parse = function(string) {
  const ng = new Set();
  if (string === "") { return ng; }

  var _getNgElement = function(ngWord) {
    let tmp;
    if (ngWord.startsWith("Comment:") || (ngWord === "")) { return null; }
    const ngElement = {
      type: "",
      word: "",
      subElements: []
    };
    // キーワードごとのNG処理
    switch (false) {
      case !ngWord.startsWith("RegExp:"):
        ngElement.type = TYPE.REG_EXP;
        ngElement.word = ngWord.substr(7);
        break;
      case !ngWord.startsWith("RegExpTitle:"):
        ngElement.type = TYPE.REG_EXP_TITLE;
        ngElement.word = ngWord.substr(12);
        break;
      case !ngWord.startsWith("RegExpName:"):
        ngElement.type = TYPE.REG_EXP_NAME;
        ngElement.word = ngWord.substr(11);
        break;
      case !ngWord.startsWith("RegExpMail:"):
        ngElement.type = TYPE.REG_EXP_MAIL;
        ngElement.word = ngWord.substr(11);
        break;
      case !ngWord.startsWith("RegExpID:"):
        ngElement.type = TYPE.REG_EXP_ID;
        ngElement.word = ngWord.substr(9);
        break;
      case !ngWord.startsWith("RegExpSlip:"):
        ngElement.type = TYPE.REG_EXP_SLIP;
        ngElement.word = ngWord.substr(11);
        break;
      case !ngWord.startsWith("RegExpBody:"):
        ngElement.type = TYPE.REG_EXP_BODY;
        ngElement.word = ngWord.substr(11);
        break;
      case !ngWord.startsWith("RegExpUrl:"):
        ngElement.type = TYPE.REG_EXP_URL;
        ngElement.word = ngWord.substr(10);
        break;
      case !ngWord.startsWith("Title:"):
        ngElement.type = TYPE.TITLE;
        ngElement.word = normalize(ngWord.substr(6));
        break;
      case !ngWord.startsWith("Name:"):
        ngElement.type = TYPE.NAME;
        ngElement.word = normalize(ngWord.substr(5));
        break;
      case !ngWord.startsWith("Mail:"):
        ngElement.type = TYPE.MAIL;
        ngElement.word = normalize(ngWord.substr(5));
        break;
      case !ngWord.startsWith("ID:"):
        ngElement.type = TYPE.ID;
        ngElement.word = ngWord;
        break;
      case !ngWord.startsWith("Slip:"):
        ngElement.type = TYPE.SLIP;
        ngElement.word = ngWord.substr(5);
        break;
      case !ngWord.startsWith("Body:"):
        ngElement.type = TYPE.BODY;
        ngElement.word = normalize(ngWord.substr(5));
        break;
      case !ngWord.startsWith("Url:"):
        ngElement.type = TYPE.URL;
        ngElement.word = ngWord.substr(4);
        break;
      case !ngWord.startsWith("ResCount:"):
        ngElement.type = TYPE.RES_COUNT;
        ngElement.word = parseInt(ngWord.substr(9));
        break;
      case !ngWord.startsWith("Auto:"):
        ngElement.type = TYPE.AUTO;
        ngElement.word = ngWord.substr(5);
        if (ngElement.word === "") {
          ngElement.word = "*";
        } else if (tmp = /\$\((.*)\):/.exec(ngElement.word)) {
          if (tmp[1] != null) { ngElement.subType = tmp[1].split(","); }
        }
        break;
      // AND条件用副要素の切り出し
      case !_expNgWords.test(ngWord):
        var m = _expNgWords.exec(ngWord);
        for (let i = 1; i <= 2; i++) {
          const ele = _getNgElement(m[i]);
          if (!ele) { continue; }
          if (ngElement.type !== "") {
            const subElement = {
              type: ngElement.type,
              word: ngElement.word
            };
            ngElement.subElements.push(subElement);
          }
          ngElement.type = ele.type;
          ngElement.word = ele.word;
          if ((ele.subElements != null ? ele.subElements.length : undefined) > 0) {
            ngElement.subElements.push(...ele.subElements);
          }
        }
        break;
      default:
        ngElement.type = TYPE.WORD;
        ngElement.word = normalize(ngWord);
    }
    return ngElement;
  };

  const ngStrSplit = string.split("\n");
  for (let ngWord of ngStrSplit) {
    // 関係ないプレフィックスは飛ばす
    var m;
    if (ngWord.startsWith("Comment:") || (ngWord === "")) { continue; }

    let ngElement = {};

    // 指定したレス番号はNG除外する
    if ((m = ngWord.match(_ignoreResRegNumber)) != null) {
      ngElement = {
        start: m[1],
        finish: m[2]
      };
      ngWord = m[3];
    // 例外NgTypeの指定
    } else if ((m = ngWord.match(_ignoreNgType)) != null) {
      ngElement = {
        exception: true,
        subType: ((m[1] != null) ? m[1].split(",") : undefined)
      };
      ngWord = m[2];
    // 有効期限の指定
    } else if ((m = ngWord.match(_expireDate)) != null) {
      const expire = stringToDate(`${m[1]} 23:59:59`);
      ngElement =
        {expire: expire.valueOf() + 1000};
      ngWord = m[2];
    // 名前の付与
    } else if ((m = ngWord.match(_attachName)) != null) {
      ngElement =
        {name: m[1]};
      ngWord = m[2];
    }
    // キーワードごとの取り出し
    const ele = _getNgElement(ngWord);
    ngElement.type = ele.type;
    ngElement.word = ele.word;
    if (ele.subType != null) { ngElement.subType = ele.subType; }
    if (ele.subElements != null) { ngElement.subElements = ele.subElements; }
    // 拡張項目の設定
    if (ngElement.exception == null) {
      ngElement.exception = false;
    }
    if (ngElement.subType != null) {
      for (let i = ngElement.subType.length - 1; i >= 0; i--) {
        const st = ngElement.subType[i];
        ngElement.subType[i] = st.trim();
        if (ngElement.subType[i] === "") {
          ngElement.subType.splice(i, 1);
        }
      }
      if (ngElement.subType.length === 0) {
        ngElement.subType = null;
      }
    }

    if (ngElement.word !== "") { ng.add(ngElement); }
  }
  return ng;
};

/**
@method set
@param {Object} obj
*/
export var set = function(string) {
  _ng = parse(string);
  _config.set([..._ng]);
  _setupReg(_ng);
};

/**
@method add
@param {String} string
*/
export var add = function(string) {
  _config.setString(string + "\n" + _config.getString());
  const addNg = parse(string);
  _config.set([..._config.get()].concat([...addNg]));

  _setupReg(addNg);
  for (let ang of addNg) {
    _ng.add(ang);
  }
};

/**
@method _checkWord
@param {Object} ngObj
@param {Object} threadObj/resObj
@private
*/
const _checkWord = function({type, reg, word}, {all, name, mail, id, slip, mes, title, url, resCount}) {
  if (
    ( (type === TYPE.REG_EXP) && reg.test(all) ) ||
    ( (type === TYPE.REG_EXP_NAME) && reg.test(name) ) ||
    ( (type === TYPE.REG_EXP_MAIL) && reg.test(mail) ) ||
    ( (type === TYPE.REG_EXP_ID) && (id != null) && reg.test(id) ) ||
    ( (type === TYPE.REG_EXP_SLIP) && (slip != null) && reg.test(slip) ) ||
    ( (type === TYPE.REG_EXP_BODY) && reg.test(mes) ) ||
    ( (type === TYPE.REG_EXP_TITLE) && reg.test(title) ) ||
    ( (type === TYPE.REG_EXP_URL) && reg.test(url) ) ||
    ( (type === TYPE.TITLE) && normalize(title).includes(word) ) ||
    ( (type === TYPE.NAME) && normalize(name).includes(word) ) ||
    ( (type === TYPE.MAIL) && normalize(mail).includes(word) ) ||
    ( (type === TYPE.ID) && (id != null ? id.includes(word) : undefined) ) ||
    ( (type === TYPE.SLIP) && (slip != null ? slip.includes(word) : undefined) ) ||
    ( (type === TYPE.BODY) && normalize(mes).includes(word) ) ||
    ( (type === TYPE.WORD) && normalize(all).includes(word) ) ||
    ( (type === TYPE.URL) && url.includes(word) ) ||
    ( (type === TYPE.RES_COUNT) && (word < resCount) )
  ) {
    return type;
  }
  return null;
};

/**
@method _checkResNum
@param {Object} ngObj
@param {Number} resNum
@private
*/
const _checkResNum = ({start, finish}, resNum) => (start != null) && (
  ( (finish != null) && (start <= resNum && resNum <= finish) ) ||
  ( parseInt(start) === resNum )
);

/**
@method isNGBoard
@param {String} threadTitle
@param {String} url
@param {Number} resCount
@param {Boolean} exceptionFlg
@param {String} subType
@return {Object|null}
*/
export var isNGBoard = function(threadTitle, url, resCount, exceptionFlg, subType = null) {
  if (exceptionFlg == null) { exceptionFlg = false; }
  const threadObj = {
    all: normalize(threadTitle),
    title: threadTitle,
    url,
    resCount
  };

  const now = Date.now();
  for (let n of get()) {
    if ((n.type === TYPE.INVALID) || (n.type === "") || (n.word === "")) { continue; }
    if (![TYPE.REG_EXP, TYPE.REG_EXP_TITLE, TYPE.TITLE, TYPE.WORD, TYPE.REG_EXP_URL, TYPE.URL, TYPE.RES_COUNT].includes(n.type)) { continue; }
    // 有効期限のチェック
    if ((n.expire != null) && (now > n.expire)) { continue; }
    // ignoreNgType用例外フラグのチェック
    if (n.exception !== exceptionFlg) { continue; }
    // ng-typeのチエック
    if ((n.subType != null) && subType && !n.subType.includes(subType)) { continue; }

    // サブ条件のチェック
    if (n.subElements != null) {
      if (!n.subElements.every( subElement => _checkWord(subElement, threadObj))) { continue; }
    }
    // メイン条件のチェック
    const ngType = _checkWord(n, threadObj);
    if (ngType) { return {type: ngType, name: n.name}; }
  }
  return null;
};

/**
@method isNGThread
@param {Object} res
@param {String} title
@param {String} url
@param {Number} resCount
@param {Boolean} exceptionFlg
@param {String} subType
@return {Object|null}
*/
export var isNGThread = function(res, title, url, exceptionFlg, subType = null) {
  if (exceptionFlg == null) { exceptionFlg = false; }
  const name = decodeCharReference(res.name);
  const mail = decodeCharReference(res.mail);
  const other = decodeCharReference(res.other);
  const mes = decodeCharReference(res.message);
  const all = name + " " + mail + " " + other + " " + mes;
  const resObj = {
    all,
    name,
    mail,
    id: res.id != null ? res.id : null,
    slip: res.slip != null ? res.slip : null,
    mes,
    title,
    url
  };

  const now = Date.now();
  for (let n of get()) {
    if ((n.type === TYPE.INVALID) || (n.type === "") || (n.word === "")) { continue; }
    // ignoreResNumber用レス番号のチェック
    if (_checkResNum(n, res.num)) { continue; }
    // 有効期限のチェック
    if ((n.expire != null) && (now > n.expire)) { continue; }
    // ignoreNgType用例外フラグのチェック
    if (n.exception !== exceptionFlg) { continue; }
    // ng-typeのチエック
    if ((n.subType != null) && subType && !n.subType.includes(subType)) { continue; }

    // サブ条件のチェック
    if (n.subElements != null) {
      if (!n.subElements.every( subElement => _checkWord(subElement, resObj))) { continue; }
    }
    // メイン条件のチェック
    const ngType = _checkWord(n, resObj);
    if (ngType) { return {type: ngType, name: n.name}; }
  }
  return null;
};

/**
@method isIgnoreResNumForAuto
@param {Number} resNum
@param {String} subType
@return {Boolean}
*/
export var isIgnoreResNumForAuto = function(resNum, subType) {
  if (subType == null) { subType = ""; }
  for (let n of get()) {
    if (n.type !== TYPE.AUTO) { continue; }
    if ((n.subType != null) && !n.subType.includes(subType)) { continue; }
    if (_checkResNum(n, resNum)) { return true; }
  }
  return false;
};

/**
@method isThreadIgnoreNgType
@param {Object} res
@param {String} threadTitle
@param {String} url
@param {String} ngType
@return {Boolean}
*/
export var isThreadIgnoreNgType = (res, threadTitle, url, ngType) => isNGThread(res, threadTitle, url, true, ngType);

/**
@method execExpire
*/
export var execExpire = function() {
  const configStr = _config.getString();
  let newConfigStr = "";
  let updateFlag = false;

  const ngStrSplit = configStr.split("\n");
  const now = Date.now();
  for (let ngWord of ngStrSplit) {
    // 有効期限の確認
    if (_expireDate.test(ngWord)) {
      const m = ngWord.match(_expireDate);
      const expire = stringToDate(m[1] + " 23:59:59");
      if ((expire.valueOf() + 1000) < now) {
        updateFlag = true;
        continue;
      }
    }
    if (newConfigStr !== "") { newConfigStr += "\n"; }
    newConfigStr += ngWord;
  }
  // 期限切れデータが存在した場合はNG情報を更新する
  if (updateFlag) {
    _config.setString(newConfigStr);
    _ng = parse(newConfigStr);
    _config.set([..._ng]);
    _setupReg(_ng);
  }
};
