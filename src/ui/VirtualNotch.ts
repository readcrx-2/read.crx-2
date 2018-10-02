///<reference path="../global.d.ts" />

export default class VirtualNotch {
  private wheelDelta = 0;
  private lastMouseWheel = Date.now();

  constructor (private element: Element, private threshold: number = 100) {
    this.element.on("wheel", this.onMouseWheel.bind(this), { passive: true });
    setInterval(this.onInterval.bind(this), 500);
  }

  private onInterval (): void {
    if (this.lastMouseWheel < Date.now() - 500) {
      this.wheelDelta = 0;
    }
  }

  private onMouseWheel (e: any): void {
    var event: any;

    // @ts-ignore: true === falseは常にfalse
    if ("&[BROWSER]" === "chrome") {
      this.wheelDelta += e.deltaY;
    // @ts-ignore: true === falseは常にfalse
    } else if ("&[BROWSER]" === "firefox") {
      this.wheelDelta += e.deltaY * 40;
    }

    this.lastMouseWheel = Date.now();

    while (Math.abs(this.wheelDelta) >= this.threshold) {
      event = new MouseEvent("notchedmousewheel");
      event.wheelDelta = this.threshold * (this.wheelDelta > 0 ? 1 : -1);
      this.wheelDelta -= event.wheelDelta;
      this.element.emit(event);
    }
  }
}
