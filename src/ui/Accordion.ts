///<reference path="../global.d.ts" />

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

      this.$element.on("click", "> h3", function () {
        if (this.classList.contains("accordion_open")) {
          accordion.close(this);
        }
        else {
          accordion.open(this);
        }
      });
    }

    update (): void {
      this.$element.find("h3 + *").each(function () {
        this.addClass("hidden");
      });
      this.setOpen(this.element.querySelector("h3"));
    }

    setOpen (header: HTMLElement): void {
      var $header = $(header)
      $header.addClass("accordion_open")
      $header.next().removeClass("hidden")
    }

    open (header: HTMLElement): void {
      var accordion: Accordion;

      accordion = this;

      var $header = $(header)
      $header.addClass("accordion_open")
      UI.Animate.slideDown($header.next()[0])

      $header
        .siblings(".accordion_open")
          .each(function () {
            accordion.close(this);
          });
    }

    close (header: HTMLElement): void {
      var $header = $(header)
      $header.removeClass("accordion_open")
      UI.Animate.slideUp($header.next()[0])
    }
  }
}
