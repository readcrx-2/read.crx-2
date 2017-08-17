///<reference path="../global.d.ts" />

namespace UI {
  "use strict";

  declare var app: any;

  export class SearchNextThread {
    private $element:HTMLElement;

    constructor ($element:HTMLElement) {
      this.$element = $element;

      this.$element.C("close")[0].on("click", () => {
        this.hide();
      });
    }

    show ():void {
      UI.Animate.fadeIn(this.$element);
    }

    hide ():void {
      UI.Animate.fadeOut(this.$element);
    }

    search (url:string, title:string):void {
      var $ol = this.$element.T("ol")[0];

      $ol.innerHTML = "";
      this.$element.C("current")[0].textContent = title;
      this.$element.C("status")[0].textContent = "検索中";

      app.util.search_next_thread(url, title)
        .then( (res) => {
          for(var thread of res) {
            var $li = $__("li")
            $li.addClass("open_in_rcrx")
            $li.textContent = thread.title
            $li.dataset.href = thread.url
            $ol.addLast($li)

            if (app.bookmark.get(thread.url)) {
              $li.addClass("bookmarked");
            }
          }

          this.$element.C("status")[0].textContent = "";
        })
        .catch( () => {
          this.$element.C("status")[0].textContent = "次スレ検索に失敗しました";
        });
    }
  }
}
