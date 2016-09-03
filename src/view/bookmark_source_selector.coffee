app.boot "/view/bookmark_source_selector.html", ->
  new app.view.IframeView(document.documentElement)

  $view = $(document.documentElement)

  $view
    .on "click", ".node", ->
      $(this)
        .closest(".view_bookmark_source_selector")
          .find(".selected")
            .removeClass("selected")
          .end()
          .find(".submit")
            .removeAttr("disabled")
          .end()
        .end()
        .addClass("selected")
      return

    .find(".submit")
      .on "click", ->
        bookmark_id = (
          $(this)
            .closest(".view_bookmark_source_selector")
              .find(".node.selected")
                .attr("data-bookmark_id")
        )
        app.config.set("bookmark_id", bookmark_id)
        app.bookmarkEntryList.setRootNodeId(bookmark_id)
        parent.postMessage(JSON.stringify(type: "request_killme"), location.origin)
        return

  fn = (array_of_tree, ul) ->
    for tree in array_of_tree when tree.children?
      li = document.createElement("li")
      span = document.createElement("span")
      span.className = "node"
      span.textContent = tree.title
      span.setAttribute("data-bookmark_id", tree.id)
      li.appendChild(span)
      ul.appendChild(li)

      cul = document.createElement("ul")
      li.appendChild(cul)

      fn(tree.children, cul)
    null

  parent.chrome.bookmarks.getTree (array_of_tree) ->
    fn(array_of_tree[0].children, $view.find(".node_list > ul")[0])
