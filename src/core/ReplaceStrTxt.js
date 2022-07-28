/**
@class ReplaceStrTxt
@static
*/

let _replaceTable = null;
const _CONFIG_NAME = "replace_str_txt_obj";
const _CONFIG_STRING_NAME = "replace_str_txt";
const _URL_PATTERN = {
  CONTAIN: 0,
  DONTCONTAIN: 1,
  MATCH: 2,
  DONTMATCH: 3,
  REGEX: 4,
  DONTREGEX: 5,
};
const _PLACE_TABLE = new Map([
  ["name", "name"],
  ["mail", "mail"],
  ["date", "other"],
  ["msg", "message"],
]);
const _INVALID_BEFORE = "#^##invalid##^#";
const _INVALID_URL = "invalid://invalid";

//jsonには正規表現のオブジェクトが含めれないので
//それを展開
const _setupReg = function () {
  for (var d of _replaceTable) {
    try {
      d.beforeReg = (() => {
        switch (d.type) {
          case "rx":
            return new RegExp(d.before, "g");
          case "rx2":
            return new RegExp(d.before, "ig");
          case "ex":
            return new RegExp(
              d.before.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&"),
              "ig"
            );
        }
      })();
    } catch (error) {
      app.message.send("notify", {
        message: `\
ReplaceStr.txtの置換対象正規表現(${d.before})を読み込むのに失敗しました
この行は無効化されます\
`,
        background_color: "red",
      });
      d.before = _INVALID_BEFORE;
    }

    try {
      if ([_URL_PATTERN.REGEX, _URL_PATTERN.DONTREGEX].includes(d.urlPattern)) {
        d.urlReg = new RegExp(d.url);
      }
    } catch (error1) {
      app.message.send("notify", {
        message: `\
ReplaceStr.txtの対象URL/タイトル正規表現(${d.url})を読み込むのに失敗しました
この行は無効化されます\
`,
        background_color: "red",
      });
      d.url = _INVALID_URL;
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
  },
};

/**
@method get
@return {Object}
*/
export var get = function () {
  if (_replaceTable == null) {
    _replaceTable = new Set(_config.get());
    _setupReg();
  }
  return _replaceTable;
};

/**
@method parse
@param {String} string
@return {Object}
*/
const parse = function (string) {
  const replaceTable = new Set();
  if (string === "") {
    return replaceTable;
  }
  const replaceStrSplit = string.split("\n");
  for (var r of replaceStrSplit) {
    if (r === "") {
      continue;
    }
    if (["//", ";", "'"].some((ele) => r.startsWith(ele))) {
      continue;
    }
    const s =
      /(?:<(\w{2,3})>)?(.*)\t(.+)\t(name|mail|date|msg|all)(?:\t(?:<(\d)>)?(.+))?/.exec(
        r
      );
    if (s == null) {
      continue;
    }
    const obj = {
      type: s[1] != null ? s[1] : "ex",
      place: s[4],
      before: s[2],
      after: s[3],
      urlPattern: s[5],
      url: s[6],
    };
    if (obj.type === "") {
      obj.type = "rx";
    }
    if (obj.place === "") {
      obj.place = "all";
    }
    if (s[6] != null && s[5] == null) {
      obj.urlPattern = 0;
    }
    replaceTable.add(obj);
  }
  return replaceTable;
};

/**
@method set
@param {String} string
*/
export var set = function (string) {
  _replaceTable = parse(string);
  _config.set([..._replaceTable]);
  _setupReg();
};

/*
@method replace
@param {String} url
@param {String} title
@param {Object} res
*/
export var replace = function (url, title, res) {
  for (let d of get()) {
    var after, before, place;
    if (d.before === _INVALID_BEFORE) {
      continue;
    }
    if (d.url === _INVALID_URL) {
      continue;
    }
    if (d.url != null) {
      var flag;
      if (
        [_URL_PATTERN.CONTAIN, _URL_PATTERN.DONTCONTAIN].includes(d.urlPattern)
      ) {
        flag = url.includes(d.url) || title.includes(d.url);
      } else if (
        [_URL_PATTERN.MATCH, _URL_PATTERN.DONTMATCH].includes(d.urlPattern)
      ) {
        flag = [url, title].includes(d.url);
      }
      if (
        [_URL_PATTERN.DONTCONTAIN, _URL_PATTERN.DONTMATCH].includes(
          d.urlPattern
        )
      ) {
        flag = !flag;
      }
      if (!flag) {
        continue;
      }
    }
    if (d.type === "ex2") {
      ({ place, before, after } = d);
      if (place === "all") {
        res = {
          name: app.replaceAll(res.name, before, after),
          mail: app.replaceAll(res.mail, before, after),
          other: app.replaceAll(res.other, before, after),
          message: app.replaceAll(res.message, before, after),
        };
      } else {
        place = _PLACE_TABLE.get(place);
        res[place] = app.replaceAll(res[place], before, after);
      }
    } else {
      ({ place, beforeReg: before, after } = d);
      if (place === "all") {
        res = {
          name: res.name.replace(before, after),
          mail: res.mail.replace(before, after),
          other: res.other.replace(before, after),
          message: res.message.replace(before, after),
        };
      } else {
        place = _PLACE_TABLE.get(place);
        res[place] = res[place].replace(before, after);
      }
    }
  }
  return res;
};
