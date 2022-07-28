import Cache from "./Cache.js";
import { Request } from "./HTTP.ts";
import { fix as fixUrl, tsld as getTsld } from "./URL.ts";

let bbsmenuOption = null;

export var target = $__("div");

/**
@method fetchAll
@param {Boolean} [forceReload=false]
*/
export var fetchAll = async function (forceReload = false) {
  let menu;
  const bbsmenu = [];

  if (!bbsmenuOption || forceReload) {
    if (!bbsmenuOption) {
      bbsmenuOption = new Set();
    } else {
      bbsmenuOption.clear();
    }
    const tmpOpt = app.config.get("bbsmenu_option").split("\n");
    for (let opt of tmpOpt) {
      if (opt === "" || opt.startsWith("//")) {
        continue;
      }
      bbsmenuOption.add(opt);
    }
  }

  const bbsmenuUrl = app.config.get("bbsmenu").split("\n");
  for (let url of bbsmenuUrl) {
    if (url === "" || url.startsWith("//")) {
      continue;
    }
    try {
      ({ menu } = await fetch(url, forceReload));
      bbsmenu.push(...menu);
    } catch (error) {
      app.message.send("notify", {
        message: `板一覧の取得に失敗しました。(${url})`,
        background_color: "red",
      });
    }
  }

  return { menu: bbsmenu };
};

/**
@method fetch
@param {String} url
@param {Boolean} [force=false]
*/
export var fetch = async function (url, force) {
  //キャッシュ取得
  let menu, response;
  const cache = new Cache(url);

  try {
    await cache.get();
    if (force) {
      throw new Error("最新のものを取得するために通信します");
    }
    if (
      Date.now() - cache.lastUpdated >
      +app.config.get("bbsmenu_update_interval") * 1000 * 60 * 60 * 24
    ) {
      throw new Error("キャッシュが期限切れなので通信します");
    }
  } catch (error) {
    //通信
    const request = new Request("GET", url, {
      mimeType: "text/plain; charset=Shift_JIS",
    });
    if (cache.lastModified != null) {
      request.headers["If-Modified-Since"] = new Date(
        cache.lastModified
      ).toUTCString();
    }

    if (cache.etag != null) {
      request.headers["If-None-Match"] = cache.etag;
    }
    response = await request.send();
  }

  if ((response != null ? response.status : undefined) === 200) {
    menu = parse(response.body);

    //キャッシュ更新
    cache.data = response.body;
    cache.lastUpdated = Date.now();

    const lastModified = new Date(
      response.headers["Last-Modified"] || "dummy"
    ).getTime();

    if (Number.isFinite(lastModified)) {
      cache.lastModified = lastModified;
    }
    cache.put();
  } else if (cache.data != null) {
    menu = parse(cache.data);

    //キャッシュ更新
    if ((response != null ? response.status : undefined) === 304) {
      cache.lastUpdated = Date.now();
      cache.put();
    }
  }

  if (!((menu != null ? menu.length : undefined) > 0)) {
    throw { response };
  }

  if (
    (response != null ? response.status : undefined) !== 200 &&
    (response != null ? response.status : undefined) !== 304 &&
    (!!response || cache.data == null)
  ) {
    throw { response, menu };
  }

  return { response, menu };
};

/**
@method get
@param {Function} Callback
@param {Boolean} [ForceReload=false]
*/
export var get = async function (forceReload = false) {
  let _updatingPromise, obj;
  if (_updatingPromise == null) {
    _updatingPromise = _update(forceReload);
  }
  try {
    obj = await _updatingPromise;
    obj.status = "success";
    if (forceReload) {
      target.emit(new CustomEvent("change", { detail: obj }));
    }
  } catch (error) {
    obj = error;
    obj.status = "error";
    if (forceReload) {
      target.emit(new CustomEvent("change", { detail: obj }));
    }
  }
  return obj;
};

/**
@method parse
@param {String} html
@return {Array}
*/
var parse = function (html) {
  let regCategoryRes;
  const regCategory = new RegExp(
    `<b>(.+?)</b>(?:.*[\\r\\n]+<a\\s.*?>.+?</a>)+`,
    "gi"
  );
  const regBoard = new RegExp(
    `<a\\shref=(https?://(?!info\\.[25]ch\\.net/|headline\\.bbspink\\.com)\
(?:\\w+\\.(?:[25]ch\\.net|open2ch\\.net|2ch\\.sc|bbspink\\.com)|(?:\\w+\\.)?machi\\.to)/\\w+/)(?:\\s.*?)?>(.+?)</a>`,
    "gi"
  );
  const menu = [];
  const bbspinkException = bbsmenuOption.has("bbspink.com");

  while ((regCategoryRes = regCategory.exec(html))) {
    var regBoardRes;
    const category = {
      title: regCategoryRes[1],
      board: [],
    };

    let subName = null;
    while ((regBoardRes = regBoard.exec(regCategoryRes[0]))) {
      if (bbsmenuOption.has(getTsld(regBoardRes[1]))) {
        continue;
      }
      if (bbspinkException && regBoardRes[1].includes("5ch.net/bbypink")) {
        continue;
      }
      if (!subName) {
        if (regBoardRes[1].includes("open2ch.net")) {
          subName = "op";
        } else if (regBoardRes[1].includes("2ch.sc")) {
          subName = "sc";
        } else {
          subName = "";
        }
        if (
          subName !== "" &&
          !(
            category.title.endsWith(`(${subName})`) ||
            category.title.endsWith(`_${subName}`)
          )
        ) {
          category.title += `(${subName})`;
        }
      }
      if (
        subName !== "" &&
        !(
          regBoardRes[2].endsWith(`(${subName})`) ||
          regBoardRes[2].endsWith(`_${subName}`)
        )
      ) {
        regBoardRes[2] += `_${subName}`;
      }
      category.board.push({
        url: fixUrl(regBoardRes[1]),
        title: regBoardRes[2],
      });
    }

    if (category.board.length > 0) {
      menu.push(category);
    }
  }
  return menu;
};

let _updatingPromise = null;
var _update = async function (forceReload) {
  const { menu } = await fetchAll(forceReload);
  _updatingPromise = null;
  return { menu };
};
