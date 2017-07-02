app.boot "/view/bookmark_source_selector.html", ->
  $view = document.documentElement

  new app.view.IframeView($view)

  $view.on("click", (e) ->
    return unless e.target.hasClass("node")
    sourceSelector = e.target.closest(".view_bookmark_source_selector")
    sourceSelector.C("selected")[0]?.removeClass("selected")
    sourceSelector.C("submit")[0]?.removeAttr("disabled")
    e.target.addClass("selected")
    return
  )
  $view.C("submit")[0].on("click", (e) ->
    bookmark_id = (
      e.target
        .closest(".view_bookmark_source_selector")
          .$(".node.selected")
            .dataset.bookmarkId
    )
    app.config.set("bookmark_id", bookmark_id)
    app.bookmarkEntryList.setRootNodeId(bookmark_id)
    parent.postMessage(JSON.stringify(type: "request_killme"), location.origin)
    return
  )

  fn = (array_of_tree, ul) ->
    for tree in array_of_tree when tree.children?
      li = $__("li")
      span = $__("span")
      span.addClass("node")
      span.textContent = tree.title
      span.dataset.bookmarkId = tree.id
      li.addLast(span)
      ul.addLast(li)

      cul = $__("ul")
      li.addLast(cul)

      fn(tree.children, cul)
    null

  parent.chrome.bookmarks.getTree (array_of_tree) ->
    fn(array_of_tree[0].children, $view.$(".node_list > ul"))
