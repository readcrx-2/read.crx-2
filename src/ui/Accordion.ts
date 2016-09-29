///<reference path="../../node_modules/@types/jquery/index.d.ts" />
///<reference path="../app.ts" />

namespace UI {
  "use strict";

  export class Accordion {
    element: HTMLElement;
    $element: JQuery;

    constructor (element: HTMLElement) {
      var accordion: Accordion;

      this.element = element;
      this.$element = $(element);

      accordion = this;

      this.$element.addClass("accordion");

      this.$element.find(".accordion_open").removeClass(".accordion_open");

      this.$element.on("click", "> :header", function () {
        if (this.classList.contains("accordion_open")) {
          accordion.close(this);
        }
        else {
          accordion.open(this);
        }
      });
    }

    private getOriginHeight($ele: JQuery): number {
      var $e = $ele.clone();
      var width = $ele[0].clientWidth;
      $e.css({
        height: "auto",
        width: width,
        position: "absolute",
        visibility: "hidden",
        display: "block"
      });
      $("body").append($e);
      var height = $e[0].clientHeight;
      $e.remove();
      return height;
    }

    update (): void {
      this.$element
        .find(".accordion_open + *")
          .removeClass("hidden")
        .end()
        .find(":header:not(.accordion_open) + *")
          .removeAttr("style");
        setTimeout( () => {
          this.$element
            .find(".accordion_open + *")
              .css("height", this.getOriginHeight(this.$element.find(".accordion_open + *")));
        }, 0);
        setTimeout( () => {
          this.$element
            .find(":header:not(.accordion_open) + *")
              .addClass("hidden");
        }, 250);
    }

    open (header: HTMLElement): void {
      var accordion: Accordion;

      accordion = this;

      $(header)
        .addClass("accordion_open")
        .next()
          .removeClass("hidden")
        .end()
        .siblings(".accordion_open")
          .each(function () {
            accordion.close(this);
          });
        setTimeout( () => {
          $(header)
            .addClass("accordion_open")
            .next()
              .css("height", this.getOriginHeight($(header).next()));
        }, 0);
    }

    close (header: HTMLElement): void {
      $(header)
        .removeClass("accordion_open")
        .next()
          .removeAttr("style");
        setTimeout( () => {
          $(header).next()
            .addClass("hidden");
        }, 250);
    }
  }
}
