///<reference path="../global.d.ts" />

namespace UI {
  "use strict";

  declare var app: any;

  export class SearchNextThread {
    private element:HTMLElement;
    private $element:JQuery;

    constructor (element:HTMLElement) {
      this.element = element;
      this.$element = $(element);

      this.$element.find(".close").on("click", () => {
        this.hide();
      });
    }

    show ():void {
      UI.Animate.fadeIn(this.element);
    }

    hide ():void {
      UI.Animate.fadeOut(this.element);
    }

    search (url:string, title:string):void {
      var $ol = this.$element.find("ol");

      $ol.empty();
      this.$element.find(".current").text(title);
      this.$element.find(".status").text("検索中");

      app.util.search_next_thread(url, title)
        .then( (res) => {
          for(var thread of res) {
            var $li = $("<li>", {
              class: "open_in_rcrx",
              text: thread.title,
              "data-href": thread.url
            }).appendTo($ol);

            if (app.bookmark.get(thread.url)) {
              $li.addClass("bookmarked");
            }
          }

          this.$element.find(".status").text("");
        })
        .catch( () => {
          this.$element.find(".status").text("次スレ検索に失敗しました");
        });
    }
  }
}
