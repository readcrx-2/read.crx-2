// @ts-ignore
import {slideDown, slideUp} from "./Animate.coffee"

export default class Accordion {
  protected readonly $element: HTMLElement;

  constructor($element: HTMLElement) {
    this.$element = $element;
    this.$element.addClass("accordion");

    const openAccordions = this.$element.C("accordion_open");
    for (let i = openAccordions.length - 1; i >= 0; i--) {
      openAccordions[i].removeClass("accordion_open");
    }

    this.$element.on("click", ({target}) => {
      if (target.parent() === this.$element && target.tagName === "H3") {
        if (target.hasClass("accordion_open")) {
          this.close(target);
        } else {
          this.open(target);
        }
      }
    });
  }

  update() {
    for (const dom of this.$element.$$("h3 + *")) {
      dom.addClass("hidden");
    }
    this.setOpen(this.$element.$("h3"));
  }

  setOpen($header: HTMLElement) {
    $header.addClass("accordion_open");
    $header.next().removeClass("hidden");
  }

  open($header: HTMLElement) {
    $header.addClass("accordion_open");
    slideDown($header.next());

    for (const dom of $header.parent().child()) {
      if (dom !== $header && dom.hasClass("accordion_open")) {
        this.close(dom);
      }
    }
  }

  close($header: HTMLElement) {
    $header.removeClass("accordion_open");
    slideUp($header.next());
  }
}
