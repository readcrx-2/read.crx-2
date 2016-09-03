namespace UI {
  "use strict";

  export class VirtualNotch {
    private wheelDelta = 0;
    private lastMouseWheel = Date.now();
    private interval: number;

    constructor (private element: Element, private threshold: number = 120) {
      this.element.addEventListener("mousewheel", this.onMouseWheel.bind(this));
      this.interval = setInterval(this.onInterval.bind(this), 500);
    }

    private onInterval (): void {
      if (this.lastMouseWheel < Date.now() - 500) {
        this.wheelDelta = 0;
      }
    }

    private onMouseWheel (e: any): void {
      var event: any;

      this.wheelDelta += e.wheelDelta;
      this.lastMouseWheel = Date.now();

      while (Math.abs(this.wheelDelta) >= this.threshold) {
        event = document.createEvent("MouseEvents");
        event.initEvent("notchedmousewheel");
        event.wheelDelta = this.threshold * (this.wheelDelta > 0 ? 1 : -1);
        this.wheelDelta -= event.wheelDelta;
        this.element.dispatchEvent(event);
      }
    }
  }
}
