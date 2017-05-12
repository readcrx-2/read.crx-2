window.UI ?= {}

###*
@namespace UI
@class TableSorter
@constructor
@param {Element} table
###
class UI.TableSorter
  "use strict"

  constructor: (@table) ->
    @table.addClass("table_sort")
    @table.on "click", (e) =>
      return if e.target.tagName isnt "TH"

      $th = e.target
      order = if $th.hasClass("table_sort_desc") then "asc" else "desc"

      for tmp in @table.$$(".table_sort_asc, .table_sort_desc")
        tmp.removeClass("table_sort_asc")
        tmp.removeClass("table_sort_desc")

      $th.addClass("table_sort_#{order}")

      @update()
      return
    return

  ###*
  @method update
  @param {Object} [param]
    @param {String} [param.sortIndex]
    @param {String} [param.sortAttribute]
    @param {String} [param.sortOrder]
    @param {String} [param.sortType]
  ###
  update: (param = {}) ->
    event = new Event("table_sort_before_update")
    @table.dispatchEvent(event)
    if event.defaultPrevented
      return

    if param.sortIndex? and param.sortOrder?
      for tmp in @table.$$(".table_sort_asc, .table_sort_desc")
        tmp.removeClass("table_sort_asc")
        tmp.removeClass("table_sort_desc")
      $th = @table.$("th:nth-child(#{param.sortIndex + 1})")
      $th.addClass("table_sort_#{param.sortOrder}")
      param.sortType ?= $th.getAttr("data-table_sort_type")
    else if not param.sortAttribute?
      $th = @table.$(".table_sort_asc, .table_sort_desc")

      unless $th
        return

      param.sortIndex = 0
      tmp = $th
      while tmp = tmp.prev()
        param.sortIndex++

      param.sortOrder =
        if $th.hasClass("table_sort_asc")
          "asc"
        else
          "desc"

    if param.sortIndex?
      param.sortType ?= $th.getAttr("data-table_sort_type") or "str"
      data = {}
      for $td in @table.$$("td:nth-child(#{param.sortIndex + 1})")
        data[$td.textContent] or= []
        data[$td.textContent].push($td.parent())
    else if param.sortAttribute?
      for tmp in @table.$$(".table_sort_asc, .table_sort_desc")
        tmp.removeClass("table_sort_asc")
        tmp.removeClass("table_sort_desc")

      param.sortType ?= "str"

      data = {}
      for $tr in @table.$("tbody").T("tr")
        value = $tr.getAttr(param.sortAttribute)
        data[value] ?= []
        data[value].push($tr)

    dataKeys = Object.keys(data)
    if param.sortType is "num"
      dataKeys.sort((a, b) -> a - b)
    else
      dataKeys.sort()

    if param.sortOrder is "desc"
      dataKeys.reverse()

    $tbody = @table.$("tbody")
    $tbody.innerHTML = ""
    for key in dataKeys
      for $tr in data[key]
        $tbody.addLast($tr)

    exparam = {
      sort_order: param.sortOrder
      sort_type: param.sortType
    }

    if param.sortIndex?
      exparam.sort_index = param.sortIndex
    else
      exparam.sort_attribute = param.sortAttribute

    @table.dispatchEvent(new CustomEvent("table_sort_updated", { detail: exparam }))
    return

  ###*
  @method updateSnake
  @param {Object} [param]
    @param {String} [param.sort_index]
    @param {String} [param.sort_attribute]
    @param {String} [param.sort_order]
    @param {String} [param.sort_type]
  ###
  updateSnake: (param = {}) ->
    @update(
      sortIndex: param.sort_index ? null
      sortAttribute: param.sort_attribute ? null
      sortOrder: param.sort_order ? null
      sortType: param.sort_type ? null
    )
    return
