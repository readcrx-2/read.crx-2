window.UI ?= {}
do ->
  UI.TableSearch = ($table, method, prop) ->
    $table.addClass("hidden")
    $table.removeAttr("data-table-search-hit-count")
    for dom in $table.C("table_search_hit") by -1
      dom.removeClass("table_search_hit")
    for dom in $table.C("table_search_not_hit") by -1
      dom.removeClass("table_search_not_hit")

    # prop.query, prop.search_col
    if method is "search"
      prop.query = app.util.normalize(prop.query)
      $table.addClass("table_search")
      hitCount = 0
      for $tr in $table.T("tbody")[0].child()
        $td = $tr.child()[prop.target_col-1]
        if !$tr.hasClass("hidden") and app.util.normalize($td.textContent).includes(prop.query)
          $tr.addClass("table_search_hit")
          hitCount++
        else
          $tr.addClass("table_search_not_hit")
      $table.dataset.tableSearchHitCount = hitCount
    else if method is "clear"
      $table.removeClass("table_search")

    $table.removeClass("hidden")
    return $table
