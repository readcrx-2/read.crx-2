///<reference path="../../typings/globals/jquery/index.d.ts" />

module UI {
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
      this.$element.find(":header + :not(:header)").hide();

      this.$element.on("click", "> :header", function () {
        if (this.classList.contains("accordion_open")) {
          accordion.close(this);
        }
        else {
          accordion.open(this);
        }
      });
    }

    update (): void {
      this.$element
        .find(".accordion_open + *")
          .finish()
          .show()
        .end()
        .find(":header:not(.accordion_open) + *")
          .finish()
          .hide();
    }

    open (header: HTMLElement, duration: number = 250): void {
      var accordion: Accordion;

      accordion = this;

      $(header)
        .addClass("accordion_open")
        .next()
          .finish()
          .slideDown(duration)
        .end()
        .siblings(".accordion_open")
          .each(function () {
            accordion.close(this, duration);
          });
    }

    close (header: HTMLElement, duration: number = 250): void {
      $(header)
        .removeClass("accordion_open")
        .next()
          .finish()
          .slideUp(duration);
    }
  }
}
