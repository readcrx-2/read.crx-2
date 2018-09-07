///<reference path="../global.d.ts" />
// @ts-ignore
import {fadeIn, fadeOut} from "./Animate.coffee"

export default class SearchNextThread {
  private $element:HTMLElement;

  constructor ($element:HTMLElement) {
    this.$element = $element;

    this.$element.C("close")[0].on("click", () => {
      this.hide();
    });
  }

  show ():void {
    fadeIn(this.$element);
  }

  hide ():void {
    fadeOut(this.$element);
  }

  async search (url:string, title:string, resString: string): Promise<void> {
    var $ol = this.$element.T("ol")[0];

    $ol.innerHTML = "";
    this.$element.C("current")[0].textContent = title;
    this.$element.C("status")[0].textContent = "検索中";

    try {
      var res = await app.util.searchNextThread(url, title, resString);

      for(var thread of res) {
        var $li = $__("li").addClass("open_in_rcrx");
        $li.textContent = thread.title;
        $li.dataset.href = thread.url;
        $ol.addLast($li);

        if (app.bookmark.get(thread.url)) {
          $li.addClass("bookmarked");
        }
      }

      this.$element.C("status")[0].textContent = "";
    } catch (e) {
      this.$element.C("status")[0].textContent = "次スレ検索に失敗しました";
    }
  }
}
