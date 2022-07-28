/*
 * decaffeinate suggestions:
 * DS103: Rewrite code to no longer use __guard__, or convert again using --optional-chaining
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
app.boot("/view/bookmark_source_selector.html", async function() {
  const $view = document.documentElement;

  new app.view.IframeView($view);

  $view.on("click", function({target}) {
    if (!target.hasClass("node")) { return; }
    const sourceSelector = target.closest(".view_bookmark_source_selector");
    __guard__(sourceSelector.C("selected")[0], x => x.removeClass("selected"));
    __guard__(sourceSelector.C("submit")[0], x1 => x1.disabled = false);
    target.addClass("selected");
  });
  $view.C("submit")[0].on("click", function({target}) {
    const {bookmarkId} = (
      target
        .closest(".view_bookmark_source_selector")
          .$(".node.selected")
            .dataset
    );
    app.config.set("bookmark_id", bookmarkId);
    app.bookmarkEntryList.setRootNodeId(bookmarkId);
    parent.postMessage({type: "request_killme"}, location.origin);
  });

  var fn = function(arrayOfTree, ul) {
    for (let {title, id, children} of arrayOfTree) {
      if (children != null) {
        const li = $__("li");
        const span = $__("span").addClass("node");
        span.textContent = title;
        span.dataset.bookmarkId = id;
        li.addLast(span);
        ul.addLast(li);

        const cul = $__("ul");
        li.addLast(cul);

        fn(children, cul);
      }
    }
  };

  const arrayOfTree = await parent.browser.bookmarks.getTree();
  fn(arrayOfTree[0].children, $view.$(".node_list > ul"));
});

function __guard__(value, transform) {
  return (typeof value !== 'undefined' && value !== null) ? transform(value) : undefined;
}