///<reference path="../global.d.ts" />

interface Position {
  x: number;
  y: number;
}

export default class Sortable {
  container: HTMLElement;
  option: {exclude?: string};
  overlay: HTMLElement;

  isSorting: boolean = false;
  //ドラッグ開始時の場所
  start: Position|null = null;
  //ドラッグ中の場所
  last: Position|null = null;

  //ドラッグしているDOM
  target: HTMLElement|null = null;
  //ドラッグしているDOMの戻るときの中央座標
  targetCenter: Position|null = null;

  rAFId: number = 0;

  clicks: number = 1;
  clickTimer: number = 0;

  constructor (container: HTMLElement, option: {exclude?: string} = {}) {
    this.container = container;
    this.option = option;

    this.container.addClass("sortable");
    this.overlay = $__("div").addClass("sortable_overlay");

    this.overlay.on("contextmenu", this.onContextMenu);

    this.container.on("mousedown", this.onMousedown.bind(this));
    this.overlay.on("mousemove", this.onMove.bind(this));
    this.overlay.on("mouseup", this.onFinish.bind(this));
    this.overlay.on("mouseout", this.onFinish.bind(this));
  }

  setTarget(target: HTMLElement): void {
    this.target = target;
    this.target.addClass("sortable_dragging");
    this.target.style["will-change"] = "transform";
    this.targetCenter = {
      x: target.offsetLeft + target.offsetWidth/2,
      y: target.offsetTop + target.offsetHeight/2
    };
  }

  removeTarget(): void {
    if (!this.target) return;
    this.target.removeClass("sortable_dragging");
    this.target.style.transform = null;
    this.target.style["will-change"] = null;
    this.target = null;
    this.targetCenter = null;
  }

  changeStart(func: Function): void {
    const beforeLeft = this.target!.offsetLeft;
    const beforeTop = this.target!.offsetTop;
    func();
    const diffX = this.target!.offsetLeft - beforeLeft;
    const diffY = this.target!.offsetTop - beforeTop;
    this.start = {
      x: this.start!.x + diffX,
      y: this.start!.y + diffY
    };
    this.targetCenter = {
      x: this.targetCenter!.x + diffX,
      y: this.targetCenter!.y + diffY
    };
  }

  onMousedown ({target, which}): void {
    if (target === this.container) return;
    if (which !== 1) return;
    if (
      this.option.exclude &&
      target!.matches(this.option.exclude)
    ) return;

    if (this.clickTimer !== 0) {
      clearTimeout(this.clickTimer);
    }

    // 0.5秒待ってダブルクリックかシングルクリックか判定する
    this.clickTimer = window.setTimeout( () => {
      this.clicks = 1;
    }, 500);

    if (this.clicks === 1) {
      this.onStart(target);

      this.clicks = 1;
    } else if (this.clicks === 2) {
      this.clicks = 1;
    }
    this.clicks++;
  }

  onStart (target): void {
    if (!target) return;
    while (target.parent() !== this.container) {
      target = target.parent();
    }
    this.setTarget(target);
    document.body.addLast(this.overlay);
  }

  onMove({ pageX, pageY }): void {
    if (!this.isSorting) {
      this.start = {
        x: pageX,
        y: pageY
      };
      this.isSorting = true;
    }

    if (!this.target) return;

    this.last = {
      x: pageX,
      y: pageY
    };

    if (this.rAFId === 0) {
      this.animate();
    }
  }

  _animate (): void {
    let tmp = <HTMLElement>this.container.first();
    let diffX = this.last!.x - this.start!.x;
    let diffY = this.last!.y - this.start!.y;

    // もっているものの中央座標
    const x = this.targetCenter!.x + diffX;
    const y = this.targetCenter!.y + diffY;

    while (tmp) {
      const {
        offsetLeft: tLeft,
        offsetTop: tTop,
        offsetWidth: tWidth,
        offsetHeight: tHeight
      } = tmp;

      if (
        tmp !== this.target &&
        !( x < tLeft || y < tTop || x > tLeft+tWidth || y > tTop+tHeight )
      ) {
        if (
          this.target!.compareDocumentPosition(tmp) === 4 &&
          ( x > tLeft + tWidth/2 || y > tTop + tHeight/2 )
        ) {
          this.changeStart( () => {
            tmp.addAfter(this.target);
          });
        } else if ( x < tLeft + tWidth/ 2 || y < tTop + tHeight/ 2 ) {
          this.changeStart( () => {
            tmp.addBefore(this.target);
          });
        }
        diffX = this.last!.x - this.start!.x;
        diffY = this.last!.y - this.start!.y;
        break;
      }
      tmp = <HTMLElement>tmp.next();
    }

    this.target!.style.transform = `translate(${diffX}px, ${diffY}px)`;

    this.rAFId = requestAnimationFrame(<any>this.animate);
  }
  animate: Function = this._animate.bind(this);

  onFinish (): void {
    // removeするとmouseoutも発火するので二重に呼ばれる
    this.isSorting = false;

    if (this.rAFId !== 0) {
      cancelAnimationFrame(this.rAFId);
      this.rAFId = 0;
    }

    if (this.target) {
      this.removeTarget();
      this.overlay.remove();
    }
  }

  onContextMenu (e): void {
    e.preventDefault();
  }
}
