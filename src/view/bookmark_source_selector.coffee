app.boot("/view/bookmark_source_selector.html", ->
  $view = document.documentElement

  new app.view.IframeView($view)

  $view.on("click", ({target}) ->
    return unless target.hasClass("node")
    sourceSelector = target.closest(".view_bookmark_source_selector")
    sourceSelector.C("selected")[0]?.removeClass("selected")
    sourceSelector.C("submit")[0]?.disabled = false
    target.addClass("selected")
    return
  )
  $view.C("submit")[0].on("click", ({target}) ->
    {bookmarkId} = (
      target
        .closest(".view_bookmark_source_selector")
          .$(".node.selected")
            .dataset
    )
    app.config.set("bookmark_id", bookmarkId)
    app.bookmarkEntryList.setRootNodeId(bookmarkId)
    parent.postMessage(JSON.stringify(type: "request_killme"), location.origin)
    return
  )

  fn = (arrayOfTree, ul) ->
    for {title, id, children} in arrayOfTree when children?
      li = $__("li")
      span = $__("span")
      span.addClass("node")
      span.textContent = title
      span.dataset.bookmarkId = id
      li.addLast(span)
      ul.addLast(li)

      cul = $__("ul")
      li.addLast(cul)

      fn(children, cul)
    return

  parent.chrome.bookmarks.getTree( (arrayOfTree) ->
    fn(arrayOfTree[0].children, $view.$(".node_list > ul"))
  )
  return
)
