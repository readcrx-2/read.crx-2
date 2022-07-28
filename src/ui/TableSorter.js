/**
@class TableSorter
@constructor
@param {Element} table
*/
let TableSorter;
export default TableSorter = (function() {
  TableSorter = class TableSorter {
    static initClass() {
      this.collator = new Intl.Collator("ja", { numeric: true });
    }

    constructor(table) {
      this.table = table;
      this.table.addClass("table_sort");
      this.table.on("click", ({target}) => {
        if (target.tagName !== "TH") { return; }

        const order = target.hasClass("table_sort_desc") ? "asc" : "desc";

        this.clearSortClass();

        target.addClass(`table_sort_${order}`);
        this.table.$(`col.${target.dataset.key}`).addClass(`table_sort_${order}`);

        this.update();
      });
    }

    /**
    @method update
    @param {Object} [param]
      @param {String} [param.sortIndex]
      @param {String} [param.sortAttribute]
      @param {String} [param.sortOrder]
    */
    update(param) {
      let $th, $tr, data;
      if (param == null) { param = {}; }
      let {sortIndex, sortAttribute, sortOrder} = param;
      const event = new Event("table_sort_before_update");
      this.table.emit(event);
      if (event.defaultPrevented) { return; }

      if ((sortIndex != null) && (sortOrder != null)) {
        this.clearSortClass();
        $th = this.table.$(`th:nth-child(${sortIndex + 1})`);
        $th.addClass(`table_sort_${sortOrder}`);
        this.table.$(`col.${$th.dataset.key}`).addClass(`table_sort_${sortOrder}`);
      } else if ((sortAttribute == null)) {
        $th = this.table.$("th.table_sort_asc, th.table_sort_desc");

        if (!$th) { return; }

        sortIndex = 0;
        let tmp = $th;
        while ((tmp = tmp.prev())) {
          sortIndex++;
        }

        sortOrder = $th.hasClass("table_sort_asc") ? "asc" : "desc";
      }

      if (sortIndex != null) {
        data = {};
        for (let $td of this.table.$$(`td:nth-child(${sortIndex + 1})`)) {
          if (!data[$td.textContent]) { data[$td.textContent] = []; }
          data[$td.textContent].push($td.parent());
        }
      } else if (sortAttribute != null) {
        this.clearSortClass();

        data = {};
        for ($tr of this.table.$("tbody").T("tr")) {
          const value = $tr.getAttr(sortAttribute);
          if (data[value] == null) { data[value] = []; }
          data[value].push($tr);
        }
      }

      const dataKeys = Object.keys(data);

      dataKeys.sort( function(a, b) {
        let diff = TableSorter.collator.compare(a, b);
        if (sortOrder === "desc") { diff *= -1; }
        return diff;
      });

      const $tbody = this.table.$("tbody");
      $tbody.innerHTML = "";
      for (let key of dataKeys) {
        for ($tr of data[key]) {
          $tbody.addLast($tr);
        }
      }

      const exparam = {sort_order: sortOrder};

      if (sortIndex != null) {
        exparam.sort_index = sortIndex;
      } else {
        exparam.sort_attribute = sortAttribute;
      }

      this.table.emit(new CustomEvent("table_sort_updated", { detail: exparam }));
    }

    /**
    @method updateSnake
    @param {Object} [param]
      @param {String} [param.sort_index]
      @param {String} [param.sort_attribute]
      @param {String} [param.sort_order]
    */
    updateSnake({sort_index = null, sort_attribute = null, sort_order = null}) {
      this.update({
        sortIndex: sort_index,
        sortAttribute: sort_attribute,
        sortOrder: sort_order
      });
    }

    /**
    @method updateSnake
    */
    clearSortClass() {
      let $dom;
      const iterable = this.table.C("table_sort_asc");
      for (let i = iterable.length - 1; i >= 0; i--) {
        $dom = iterable[i];
        $dom.removeClass("table_sort_asc");
      }
      const iterable1 = this.table.C("table_sort_desc");
      for (let j = iterable1.length - 1; j >= 0; j--) {
        $dom = iterable1[j];
        $dom.removeClass("table_sort_desc");
      }
    }
  };
  TableSorter.initClass();
  return TableSorter;
})();
