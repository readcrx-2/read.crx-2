window.UI ?= {}

###*
@namespace UI
@class TableSorter
@constructor
@param {Element} table
@requires jQuery
###
class UI.TableSorter
  "use strict"

  constructor: (@table) ->
    @table.classList.add("table_sort")
    @table.addEventListener "click", (e) =>
      return if e.target.nodeName isnt "TH"

      th = e.target
      order = if th.classList.contains("table_sort_desc") then "asc" else "desc"

      for tmp in @table.querySelectorAll(".table_sort_asc, .table_sort_desc")
        tmp.classList.remove("table_sort_asc")
        tmp.classList.remove("table_sort_desc")

      th.classList.add("table_sort_#{order}")

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
    event = $.Event("table_sort_before_update")
    $(@table).trigger(event)
    if event.isDefaultPrevented()
      return

    if param.sortIndex? and param.sortOrder?
      for tmp in @table.querySelectorAll(".table_sort_asc, .table_sort_desc")
        tmp.classList.remove("table_sort_asc")
        tmp.classList.remove("table_sort_desc")
      th = @table.querySelector("th:nth-child(#{param.sortIndex + 1})")
      th.classList.add("table_sort_#{param.sortOrder}")
      param.sortType ?= th.getAttribute("data-table_sort_type")
    else if not param.sortAttribute?
      th = @table.querySelector(".table_sort_asc, .table_sort_desc")

      unless th
        return

      param.sortIndex = 0
      tmp = th
      while tmp = tmp.previousElementSibling
        param.sortIndex++

      param.sortOrder =
        if th.classList.contains("table_sort_asc")
          "asc"
        else
          "desc"

    if param.sortIndex?
      param.sortType ?= th.getAttribute("data-table_sort_type") or "str"
      data = {}
      for td in @table.querySelectorAll("td:nth-child(#{param.sortIndex + 1})")
        data[td.textContent] or= []
        data[td.textContent].push(td.parentNode)
    else if param.sortAttribute?
      for tmp in @table.querySelectorAll(".table_sort_asc, .table_sort_desc")
        tmp.classList.remove("table_sort_asc")
        tmp.classList.remove("table_sort_desc")

      param.sortType ?= "str"

      data = {}
      for tr in @table.querySelector("tbody").getElementsByTagName("tr")
        value = tr.getAttribute(param.sortAttribute)
        data[value] ?= []
        data[value].push(tr)

    dataKeys = Object.keys(data)
    if param.sortType is "num"
      dataKeys.sort((a, b) -> a - b)
    else
      dataKeys.sort()

    if param.sortOrder is "desc"
      dataKeys.reverse()

    tbody = @table.querySelector("tbody")
    tbody.innerHTML = ""
    for key in dataKeys
      for tr in data[key]
        tbody.appendChild(tr)

    exparam = {
      sort_order: param.sortOrder
      sort_type: param.sortType
    }

    if param.sortIndex?
      exparam.sort_index = param.sortIndex
    else
      exparam.sort_attribute = param.sortAttribute

    $(@table).trigger("table_sort_updated", exparam)
    return

# 互換性確保
do ($ = jQuery) ->
  $.fn.table_sort = (method = "init", config = {}) ->
    if method is "init"
      @data("tableSorter", new UI.TableSorter(@[0]))

    if method is "update"
      tmp = {}
      if config.sort_index? then tmp.sortIndex = config.sort_index
      if config.sort_attribute? then tmp.sortAttribute = config.sort_attribute
      if config.sort_order? then tmp.sortOrder = config.sort_order
      if config.sort_type? then tmp.sortType = config.sort_type
      @data("tableSorter").update(tmp)

    @
  return
