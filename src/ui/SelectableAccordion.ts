///<reference path="../global.d.ts" />
import Accordion from "./Accordion"

/*
.select対応のAccordion。
Accordionと違って汎用性が無い。
*/

export default class SelectableAccordion extends Accordion {
  constructor ($element: HTMLElement) {
    super($element);

    this.$element.on("click", () => {
      var selected = this.$element.C("selected");
      if (selected.length > 0) {
        selected[0].removeClass("selected");
      }
    });
  }

  getSelected (): HTMLElement|null {
    return this.$element.$("h3.selected, a.selected") || null;
  }

  select (target: HTMLElement): void {
    var targetHeader: HTMLElement;

    this.clearSelect();

    if (target.tagName === "H3") {
      this.close(target);
    }
    else if (target.tagName === "A") {
      targetHeader = <HTMLElement>target.parent().parent().prev();
      if (!targetHeader.hasClass("accordion_open")) {
        this.open(targetHeader);
      }
    }

    target.addClass("selected");
    target.scrollIntoView({behavior: "instant", block: "center", inline: "center"});
  }

  clearSelect (): void {
    var selected: HTMLElement|null;

    selected = this.getSelected();

    if (selected) {
      selected.removeClass("selected");
    }
  }

  selectNext (repeat: number = 1): void {
    var current: HTMLElement|null,
      prevCurrent: HTMLElement,
      currentH3: HTMLElement,
      nextH3: HTMLElement,
      key: number;

    if (current = this.getSelected()) {
      for (key = 0; key < repeat; key++) {
        prevCurrent = current;

        if (current.tagName === "A" && current.parent().next()) {
          current = <HTMLElement>current.parent().next().first();
        }
        else {
          if (current.tagName === "A") {
            currentH3 = <HTMLElement>current.parent().parent().prev();
          }
          else {
            currentH3 = current;
          }

          nextH3 = <HTMLElement>currentH3.next();
          while (nextH3 && nextH3.tagName !== "H3") {
            nextH3 = <HTMLElement>nextH3.next();
          }

          if (nextH3) {
            if (nextH3.hasClass("accordion_open")) {
              current = <HTMLElement>nextH3.next().$("li > a");
            }
            else {
              current = nextH3;
            }
          }
        }

        if (current === prevCurrent) {
          break;
        }
      }
    }
    else {
      current = this.$element.$(".accordion_open + ul a");
      current = current || this.$element.$("h3");
    }

    if (current && current !== this.getSelected()) {
      this.select(current);
    }
  }

  selectPrev (repeat: number = 1): void {
    var current: HTMLElement|null,
      prevCurrent: HTMLElement,
      currentH3: HTMLElement,
      prevH3: HTMLElement,
      key: number;

    if (current = this.getSelected()) {
      for (key = 0; key < repeat; key++) {
        prevCurrent = current;

        if (current.tagName === "A" && current.parent().prev()) {
          current = <HTMLElement>current.parent().prev().first();
        }
        else {
          if (current.tagName === "A") {
            currentH3 = <HTMLElement>current.parent().parent().prev();
          }
          else {
            currentH3 = current;
          }

          prevH3 = <HTMLElement>currentH3.prev();
          while (prevH3 && prevH3.tagName !== "H3") {
            prevH3 = <HTMLElement>prevH3.prev();
          }

          if (prevH3) {
            if (prevH3.hasClass("accordion_open")) {
              current = <HTMLElement>prevH3.next().$("li:last-child > a");
            }
            else {
              current = prevH3;
            }
          }
        }

        if (current === prevCurrent) {
          break;
        }
      }
    }
    else {
      current = this.$element.$(".accordion_open + ul a");
      current = current || this.$element.$("h3");
    }

    if (current && current !== this.getSelected()) {
      this.select(current);
    }
  }
}
