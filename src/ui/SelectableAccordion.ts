///<reference path="../../node_modules/@types/jquery/index.d.ts" />
///<reference path="Accordion.ts" />

/*
.select対応のAccordion。
Accordionと違って汎用性が無い。
*/

interface Element {
  scrollIntoViewIfNeeded: Function;
}

namespace UI {
  "use strict";

  export class SelectableAccordion extends Accordion {
    constructor (element: HTMLElement) {
      super(element);

      this.$element.on("click", () => {
        this.$element.find(".selected").removeClass("selected");
      });
    }

    getSelected (): HTMLElement {
      return <HTMLElement>this.element.querySelector("h3.selected, a.selected") || null;
    }

    select (target: HTMLElement): void {
      var targetHeader: HTMLElement;

      this.clearSelect();

      if (target.nodeName === "H3") {
        this.close(target);
      }
      else if (target.nodeName === "A") {
        targetHeader = <HTMLElement>target.parentElement.parentElement.previousElementSibling;
        if (!targetHeader.classList.contains("accordion_open")) {
          this.open(targetHeader);
        }
      }

      target.classList.add("selected");
      target.scrollIntoViewIfNeeded();
    }

    clearSelect (): void {
      var selected: HTMLElement;

      selected = this.getSelected();

      if (selected) {
        selected.classList.remove("selected");
      }
    }

    selectNext (repeat: number = 1): void {
      var current: HTMLElement,
        prevCurrent: HTMLElement,
        currentH3: HTMLElement,
        nextH3: HTMLElement,
        key: number;

      if (current = this.getSelected()) {
        for (key = 0; key < repeat; key++) {
          prevCurrent = current;

          if (current.nodeName === "A" && current.parentElement.nextElementSibling) {
            current = <HTMLElement>current.parentElement.nextElementSibling.firstElementChild;
          }
          else {
            if (current.nodeName === "A") {
              currentH3 = <HTMLElement>current.parentElement.parentElement.previousElementSibling;
            }
            else {
              currentH3 = current;
            }

            nextH3 = <HTMLElement>currentH3.nextElementSibling;
            while (nextH3 && nextH3.nodeName !== "H3") {
              nextH3 = <HTMLElement>nextH3.nextElementSibling;
            }

            if (nextH3) {
              if (nextH3.classList.contains("accordion_open")) {
                current = <HTMLElement>nextH3.nextElementSibling.querySelector("li > a");
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
        current = <HTMLElement>this.element.querySelector(".accordion_open + ul a");
        current = current || <HTMLElement>this.element.querySelector("h3");
      }

      if (current && current !== this.getSelected()) {
        this.select(current);
      }
    }

    selectPrev (repeat: number = 1): void {
      var current: HTMLElement,
        prevCurrent: HTMLElement,
        currentH3: HTMLElement,
        prevH3: HTMLElement,
        key: number;

      if (current = this.getSelected()) {
        for (key = 0; key < repeat; key++) {
          prevCurrent = current;

          if (current.nodeName === "A" && current.parentElement.previousElementSibling) {
            current = <HTMLElement>current.parentElement.previousElementSibling.firstElementChild;
          }
          else {
            if (current.nodeName === "A") {
              currentH3 = <HTMLElement>current.parentElement.parentElement.previousElementSibling;
            }
            else {
              currentH3 = current;
            }

            prevH3 = <HTMLElement>currentH3.previousElementSibling;
            while (prevH3 && prevH3.nodeName !== "H3") {
              prevH3 = <HTMLElement>prevH3.previousElementSibling;
            }

            if (prevH3) {
              if (prevH3.classList.contains("accordion_open")) {
                current = <HTMLElement>prevH3.nextElementSibling.querySelector("li:last-child > a");
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
        current = <HTMLElement>this.element.querySelector(".accordion_open + ul a");
        current = current || <HTMLElement>this.element.querySelector("h3");
      }

      if (current && current !== this.getSelected()) {
        this.select(current);
      }
    }
  }
}
