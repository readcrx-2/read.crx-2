import Accordion from "./Accordion";

/*
.select対応のAccordion。
Accordionと違って汎用性が無い。
*/

export default class SelectableAccordion extends Accordion {
  constructor($element: HTMLElement) {
    super($element);

    this.$element.on("click", () => {
      const selected = this.$element.C("selected");
      if (selected.length > 0) {
        selected[0].removeClass("selected");
      }
    });
  }

  getSelected(): HTMLElement | null {
    return this.$element.$("h3.selected, a.selected") || null;
  }

  select(target: HTMLElement) {
    this.clearSelect();

    if (target.tagName === "H3") {
      this.close(target);
    } else if (target.tagName === "A") {
      const targetHeader = <HTMLElement>target.parent().parent().prev();
      if (!targetHeader.hasClass("accordion_open")) {
        this.open(targetHeader);
      }
    }

    target.addClass("selected");
    target.scrollIntoView(<any>{
      behavior: "instant",
      block: "center",
      inline: "center",
    });
  }

  clearSelect() {
    const selected = this.getSelected();

    if (selected) {
      selected.removeClass("selected");
    }
  }

  selectNext(repeat = 1) {
    let current = this.getSelected();

    if (current) {
      for (let key = 0; key < repeat; key++) {
        const prevCurrent: HTMLElement = current;

        if (current.tagName === "A" && current.parent().next()) {
          current = <HTMLElement>current.parent().next().first();
        } else {
          let currentH3 = current;
          if (current.tagName === "A") {
            currentH3 = <HTMLElement>current.parent().parent().prev();
          }

          let nextH3 = <HTMLElement>currentH3.next();
          while (nextH3 && nextH3.tagName !== "H3") {
            nextH3 = <HTMLElement>nextH3.next();
          }

          if (nextH3) {
            if (nextH3.hasClass("accordion_open")) {
              current = <HTMLElement>nextH3.next().$("li > a");
            } else {
              current = nextH3;
            }
          }
        }

        if (current === prevCurrent) {
          break;
        }
      }
    } else {
      current = this.$element.$(".accordion_open + ul a");
      current = current || this.$element.$("h3");
    }

    if (current && current !== this.getSelected()) {
      this.select(current);
    }
  }

  selectPrev(repeat = 1) {
    let current = this.getSelected();

    if (current) {
      for (let key = 0; key < repeat; key++) {
        const prevCurrent: HTMLElement = current;

        if (current.tagName === "A" && current.parent().prev()) {
          current = <HTMLElement>current.parent().prev().first();
        } else {
          let currentH3 = current;
          if (current.tagName === "A") {
            currentH3 = <HTMLElement>current.parent().parent().prev();
          }

          let prevH3 = <HTMLElement>currentH3.prev();
          while (prevH3 && prevH3.tagName !== "H3") {
            prevH3 = <HTMLElement>prevH3.prev();
          }

          if (prevH3) {
            if (prevH3.hasClass("accordion_open")) {
              current = <HTMLElement>prevH3.next().$("li:last-child > a");
            } else {
              current = prevH3;
            }
          }
        }

        if (current === prevCurrent) {
          break;
        }
      }
    } else {
      current = this.$element.$(".accordion_open + ul a");
      current = current || this.$element.$("h3");
    }

    if (current && current !== this.getSelected()) {
      this.select(current);
    }
  }
}
