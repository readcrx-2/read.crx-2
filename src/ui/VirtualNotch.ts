///<reference path="../global.d.ts" />
namespace UI {
  export class VirtualNotch {
    private wheelDelta = 0;
    private lastMouseWheel = Date.now();
    private interval: number;

    constructor (private element: Element, private threshold: number = 100) {
      this.element.on("wheel", this.onMouseWheel.bind(this), { passive: true });
      this.interval = setInterval(this.onInterval.bind(this), 500);
    }

    private onInterval (): void {
      if (this.lastMouseWheel < Date.now() - 500) {
        this.wheelDelta = 0;
      }
    }

    private onMouseWheel (e: any): void {
      var event: any;

      this.wheelDelta += e.deltaY;
      this.lastMouseWheel = Date.now();

      while (Math.abs(this.wheelDelta) >= this.threshold) {
        event = new MouseEvent("notchedmousewheel");
        event.wheelDelta = this.threshold * (this.wheelDelta > 0 ? 1 : -1);
        this.wheelDelta -= event.wheelDelta;
        this.element.dispatchEvent(event);
      }
    }
  }
}
