///<reference path="../global.d.ts" />

namespace UI {
  export class Accordion {
    $element: HTMLElement;

    constructor ($element: HTMLElement) {
      var accordion: Accordion, openAccordions;

      this.$element = $element;

      accordion = this;

      this.$element.addClass("accordion");

      openAccordions = this.$element.C("accordion_open");
      for (var i = openAccordions.length - 1; i >= 0; i--) {
        openAccordions[i].removeClass("accordion_open");
      }

      this.$element.on("click", (e) => {
        var target = <HTMLElement>e.target;
        if (target.parent() === this.$element && target.tagName === "H3") {
          if (target.hasClass("accordion_open")) {
            accordion.close(target);
          } else {
            accordion.open(target);
          }
        }
      });
    }

    update (): void {
      for (var dom of this.$element.$$("h3 + *")) {
        dom.addClass("hidden");
      }
      this.setOpen(this.$element.$("h3"));
    }

    setOpen ($header: HTMLElement): void {
      $header.addClass("accordion_open");
      $header.next().removeClass("hidden");
    }

    open ($header: HTMLElement): void {
      var accordion: Accordion;

      accordion = this;

      $header.addClass("accordion_open");
      UI.Animate.slideDown($header.next());

      for (var dom of $header.parent().child()) {
        if (dom !== $header && dom.hasClass("accordion_open")) {
          accordion.close(dom);
        }
      }
    }

    close ($header: HTMLElement): void {
      $header.removeClass("accordion_open")
      UI.Animate.slideUp($header.next())
    }
  }
}
