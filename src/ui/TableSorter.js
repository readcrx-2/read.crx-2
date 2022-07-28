###*
@class TableSorter
@constructor
@param {Element} table
###
export default class TableSorter
  @collator: new Intl.Collator("ja", { numeric: true })

  constructor: (@table) ->
    @table.addClass("table_sort")
    @table.on("click", ({target}) =>
      return if target.tagName isnt "TH"

      order = if target.hasClass("table_sort_desc") then "asc" else "desc"

      @clearSortClass()

      target.addClass("table_sort_#{order}")
      @table.$("col.#{target.dataset.key}").addClass("table_sort_#{order}")

      @update()
      return
    )
    return

  ###*
  @method update
  @param {Object} [param]
    @param {String} [param.sortIndex]
    @param {String} [param.sortAttribute]
    @param {String} [param.sortOrder]
  ###
  update: ({sortIndex, sortAttribute, sortOrder} = {}) ->
    event = new Event("table_sort_before_update")
    @table.emit(event)
    return if event.defaultPrevented

    if sortIndex? and sortOrder?
      @clearSortClass()
      $th = @table.$("th:nth-child(#{sortIndex + 1})")
      $th.addClass("table_sort_#{sortOrder}")
      @table.$("col.#{$th.dataset.key}").addClass("table_sort_#{sortOrder}")
    else if not sortAttribute?
      $th = @table.$("th.table_sort_asc, th.table_sort_desc")

      return unless $th

      sortIndex = 0
      tmp = $th
      while tmp = tmp.prev()
        sortIndex++

      sortOrder = if $th.hasClass("table_sort_asc") then "asc" else "desc"

    if sortIndex?
      data = {}
      for $td in @table.$$("td:nth-child(#{sortIndex + 1})")
        data[$td.textContent] or= []
        data[$td.textContent].push($td.parent())
    else if sortAttribute?
      @clearSortClass()

      data = {}
      for $tr in @table.$("tbody").T("tr")
        value = $tr.getAttr(sortAttribute)
        data[value] ?= []
        data[value].push($tr)

    dataKeys = Object.keys(data)

    dataKeys.sort( (a, b) ->
      diff = TableSorter.collator.compare(a, b)
      diff *= -1  if sortOrder is "desc"
      return diff
    )

    $tbody = @table.$("tbody")
    $tbody.innerHTML = ""
    for key in dataKeys
      for $tr in data[key]
        $tbody.addLast($tr)

    exparam = {sort_order: sortOrder}

    if sortIndex?
      exparam.sort_index = sortIndex
    else
      exparam.sort_attribute = sortAttribute

    @table.emit(new CustomEvent("table_sort_updated", { detail: exparam }))
    return

  ###*
  @method updateSnake
  @param {Object} [param]
    @param {String} [param.sort_index]
    @param {String} [param.sort_attribute]
    @param {String} [param.sort_order]
  ###
  updateSnake: ({sort_index = null, sort_attribute = null, sort_order = null}) ->
    @update(
      sortIndex: sort_index
      sortAttribute: sort_attribute
      sortOrder: sort_order
    )
    return

  ###*
  @method updateSnake
  ###
  clearSortClass: ->
    for $dom in @table.C("table_sort_asc") by -1
      $dom.removeClass("table_sort_asc")
    for $dom in @table.C("table_sort_desc") by -1
      $dom.removeClass("table_sort_desc")
    return
