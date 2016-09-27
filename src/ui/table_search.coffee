do ($ = jQuery) ->
  $.fn.table_search = (method, prop) ->
    $table = $(@)
    $table
      .addClass("hidden")
      .removeAttr("data-table_search_hit_count")
      .find(".table_search_hit")
        .removeClass("table_search_hit")
      .end()
      .find(".table_search_not_hit")
        .removeClass("table_search_not_hit")

    # prop.query, prop.search_col
    if method is "search"
      prop.query = app.util.normalize(prop.query)
      $table.addClass("table_search")
      hit_count = 0
      for tr in $table.find("tbody")[0].children
        td = tr.children[prop.target_col]
        if !tr.classList.contains("hidden") and app.util.normalize(td.textContent).includes(prop.query)
          tr.classList.add("table_search_hit")
          hit_count++
        else
          tr.classList.add("table_search_not_hit")
      $table.attr("data-table_search_hit_count", hit_count)
    else if method is "clear"
      $table.removeClass("table_search")

    $table.removeClass("hidden")
    @
