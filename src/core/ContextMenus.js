/**
@class ContextMenus
@static
*/
// browser.contextMenusの呼び出しレベルを統一するための代理クラス
// (Chrome 53 対策)

/**
@method createAll
*/
export var createAll = function () {
  const baseUrl = browser.runtime.getURL("");
  const viewThread = [`${baseUrl}view/thread.html*`];

  create({
    id: "add_selection_to_ngwords",
    title: "選択範囲をNG指定",
    contexts: ["selection"],
    documentUrlPatterns: viewThread,
  });
  create({
    id: "add_link_to_ngwords",
    title: "リンクアドレスをNG指定",
    contexts: ["link"],
    enabled: false,
    documentUrlPatterns: viewThread,
  });
  create({
    id: "add_media_to_ngwords",
    title: "メディアのアドレスをNG指定",
    contexts: ["image", "video", "audio"],
    documentUrlPatterns: viewThread,
  });
  create({
    id: "open_link_with_res_number",
    title: "レス番号を指定してリンクを開く",
    contexts: ["link"],
    enabled: false,
    documentUrlPatterns: viewThread,
  });
};

/**
@method create
@parm {Object} obj
@return {Number|String} id
*/
export var create = (obj) => browser.contextMenus.create(obj);

/**
@method update
@parm {Number|String} id
@parm {Object} obj
*/
export var update = function (id, obj) {
  browser.contextMenus.update(id, obj);
};

/**
@method remove
@parm {Number|String} id
*/
export var remove = function (id) {
  browser.contextMenus.remove(id);
};

/**
@method removeAll
*/
export var removeAll = function () {
  // removeAll()を使うとbackgroundのコンテキストメニューも削除されてしまうので個別に削除する
  remove("add_selection_to_ngwords");
  remove("add_link_to_ngwords");
  remove("add_media_to_ngwords");
  remove("open_link_with_res_number");
};
