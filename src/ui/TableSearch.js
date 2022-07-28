// TODO: This file was created by bulk-decaffeinate.
// Sanity-check the conversion and remove this comment.
let TableSearch;
export default TableSearch = function($table, method, prop) {
  let dom;
  $table.addClass("hidden");
  $table.removeAttr("data-table-search-hit-count");
  const iterable = $table.C("table_search_hit");
  for (let i = iterable.length - 1; i >= 0; i--) {
    dom = iterable[i];
    dom.removeClass("table_search_hit");
  }
  const iterable1 = $table.C("table_search_not_hit");
  for (let j = iterable1.length - 1; j >= 0; j--) {
    dom = iterable1[j];
    dom.removeClass("table_search_not_hit");
  }

  // prop.query, prop.search_col
  if (method === "search") {
    prop.query = app.util.normalize(prop.query);
    $table.addClass("table_search");
    let hitCount = 0;
    for (let $tr of $table.T("tbody")[0].child()) {
      const $td = $tr.child()[prop.target_col-1];
      if (!$tr.hasClass("hidden") && app.util.normalize($td.textContent).includes(prop.query)) {
        $tr.addClass("table_search_hit");
        hitCount++;
      } else {
        $tr.addClass("table_search_not_hit");
      }
    }
    $table.dataset.tableSearchHitCount = hitCount;
  } else if (method === "clear") {
    $table.removeClass("table_search");
  }

  $table.removeClass("hidden");
  return $table;
};
