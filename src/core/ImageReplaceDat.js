// TODO: This file was created by bulk-decaffeinate.
// Sanity-check the conversion and remove this comment.
/*
 * decaffeinate suggestions:
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
/**
@class ImageReplaceDat
@static
*/
let _dat = null;
const _CONFIG_NAME = "image_replace_dat_obj";
const _CONFIG_STRING_NAME = "image_replace_dat";
const _INVALID_URL = "invalid://invalid";

//jsonには正規表現のオブジェクトが含めれないので
//それを展開
const _setupReg = function() {
  for (let d of _dat) {
    try {
      d.baseUrlReg = new RegExp(d.baseUrl, "i");
    } catch (error) {
      app.message.send("notify", {
        message: `\
ImageViewURLReplace.datの一致URLの正規表現(${d.baseUrl})を読み込むのに失敗しました
この行は無効化されます\
`,
        background_color: "red"
      }
      );
      d.baseUrl = _INVALID_URL;
    }
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
  if (_dat == null) {
    if (app.config.get(_CONFIG_NAME) === "") {
      set(_config.getString());
    }
    _dat = new Set(_config.get());
    _setupReg();
  }
  return _dat;
};

/**
@method parse
@param {String} string
@return {Object}
*/
const parse = function(string) {
  const dat = new Set();
  if (string === "") { return dat; }
  const datStrSplit = string.split("\n");
  for (var d of datStrSplit) {
    if (d === "") { continue; }
    if (["//",";", "'"].some(ele => d.startsWith(ele))) { continue; }
    const r = d.split("\t");
    if (r[0] == null) { continue; }
    const obj = {
      baseUrl: r[0],
      replaceUrl: r[1] != null ? r[1] : "",
      referrerUrl: r[2] != null ? r[2] : "",
      userAgent: r[5] != null ? r[5] : ""
    };

    if (r[3] != null) {
      obj.param = {};
      const rurl = r[3].split("=")[1];
      if (r[3].includes("$EXTRACT")) {
        obj.param = {
          type: "extract",
          pattern: r[4],
          referrerUrl: rurl != null ? rurl : ""
        };
      } else if (r[4].includes("$COOKIE")) {
        obj.param = {
          type: "cookie",
          referrerUrl: rurl != null ? rurl : ""
        };
      }
    }
    dat.add(obj);
  }
  return dat;
};

/**
@method set
@param {String} string
*/
export var set = function(string) {
  _dat = parse(string);
  _config.set([..._dat]);
  _setupReg();
};

/*
@method replace
@param {String} string
@return {Object}
*/
export var replace = function(string) {
  const dat = get();
  const res = {};
  for (let d of dat) {
    if (d.baseUrl === _INVALID_URL) { continue; }
    if (!d.baseUrlReg.test(string)) { continue; }
    if (d.replaceUrl === "") {
      return {res, err: "No parsing"};
    }
    if ((d.param != null) && (d.param.type === "extract")) {
      res.type = "extract";
      res.text = string.replace(d.baseUrlReg, d.replaceUrl);
      res.extract = string.replace(d.baseUrlReg, d.referrerUrl);
      res.extractReferrer = d.param.referrerUrl;
      res.pattern = d.param.pattern;
      res.userAgent = d.userAgent;
      return {res};
    } else if ((d.param != null) && (d.param.type === "cookie")) {
      res.type = "cookie";
      res.text = string.replace(d.baseUrlReg, d.replaceUrl);
      res.cookie = string.replace(d.baseUrlReg, d.referrerUrl);
      res.cookieReferrer = d.param.referrerUrl;
      res.userAgent = d.userAgent;
      return {res};
    } else {
      res.type = "default";
      res.text = string.replace(d.baseUrlReg, d.replaceUrl);
      if ((d.referrerUrl !== "") || (d.userAgent !== "")) {
        res.type = "referrer";
        res.referrer = string.replace(d.baseUrlReg, d.referrerUrl);
        res.userAgent = d.userAgent;
      }
      return {res};
    }
  }
  return {res, err: "Fail noBaseUrlReg"};
};
