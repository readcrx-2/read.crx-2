interface NotchedMouseWheelEvent extends MouseEvent {
  wheelDelta: number;
}

export default class VirtualNotch {
  private wheelDelta = 0;
  private lastMouseWheel = Date.now();

  constructor(private element: Element, private threshold = 100) {
    this.element.on("wheel", this.onMouseWheel.bind(this), { passive: true });
    setInterval(this.onInterval.bind(this), 500);
  }

  private onInterval() {
    if (this.lastMouseWheel < Date.now() - 500) {
      this.wheelDelta = 0;
    }
  }

  private onMouseWheel(e: WheelEvent) {
    switch (e.deltaMode) {
      case WheelEvent.DOM_DELTA_PIXEL:
        this.wheelDelta += e.deltaY;
        break;
      case WheelEvent.DOM_DELTA_LINE:
        this.wheelDelta += e.deltaY * 40;
        break;
      case WheelEvent.DOM_DELTA_PAGE:
        this.wheelDelta += e.deltaY * 120;
        break;
      default:
        this.wheelDelta += e.deltaY;
        return;
    }

    this.lastMouseWheel = Date.now();

    while (Math.abs(this.wheelDelta) >= this.threshold) {
      const event = <NotchedMouseWheelEvent>new MouseEvent("notchedmousewheel");
      event.wheelDelta = this.threshold * Math.sign(this.wheelDelta);
      this.wheelDelta -= event.wheelDelta;
      this.element.emit(event);
    }
  }
}
