///<reference path="../global.d.ts" />

namespace UI {
  export class Sortable {
    container: HTMLElement;

    constructor (container: HTMLElement, option: {exclude?: string} = {}) {
      var sorting = false,
        start: {x: number|null; y: number|null} = {x: null, y: null},
        target: HTMLElement|null = null,
        overlay: HTMLDivElement,
        onDrop: Function;

      this.container = container;

      this.container.addClass("sortable");

      overlay = $__("div")
      overlay.addClass("sortable_overlay");

      overlay.on("contextmenu", (e) => {
        e.preventDefault();
      });

      overlay.on("mousemove", ({pageX, pageY}) => {
        var targetCenter: {x: number; y: number},
          tmp: HTMLElement,
          cacheX: number,
          cacheY: number;

        if (!sorting) {
          start.x = pageX;
          start.y = pageY;
          sorting = true;
        }

        if (target) {
          targetCenter = {
            x: target.offsetLeft + target.offsetWidth / 2,
            y: target.offsetTop + target.offsetHeight / 2
          };

          tmp = <HTMLElement>this.container.firstElementChild;

          while (tmp) {
            if (tmp !== target && !(
              targetCenter.x < tmp.offsetLeft ||
              targetCenter.y < tmp.offsetTop ||
              targetCenter.x > tmp.offsetLeft + tmp.offsetWidth ||
              targetCenter.y > tmp.offsetTop + tmp.offsetHeight
            )) {
              if (
                target.compareDocumentPosition(tmp) === 4 &&
                (
                  targetCenter.x > tmp.offsetLeft + tmp.offsetWidth / 2 ||
                  targetCenter.y > tmp.offsetTop + tmp.offsetHeight / 2
                )
              ) {
                cacheX = target.offsetLeft;
                cacheY = target.offsetTop;
                tmp.insertAdjacentElement("afterend", target);
                start.x = start.x! + target.offsetLeft - cacheX;
                start.y = start.y! + target.offsetTop - cacheY;
              }
              else if (
                targetCenter.x < tmp.offsetLeft + tmp.offsetWidth / 2 ||
                targetCenter.y < tmp.offsetTop + tmp.offsetHeight / 2
              ) {
                cacheX = target.offsetLeft;
                cacheY = target.offsetTop;
                tmp.insertAdjacentElement("beforebegin", target);
                start.x = start.x! + target.offsetLeft - cacheX;
                start.y = start.y! + target.offsetTop - cacheY;
              }
              break;
            }
            tmp = <HTMLElement>tmp.nextElementSibling;
          }

          target.style.left = (pageX - start.x!) + "px";
          target.style.top = (pageY - start.y!) + "px";
        }
      });

      onDrop = function (this:HTMLElement) {
        // removeするとmouseoutも発火するので二重に呼ばれる
        sorting = false;

        if (target) {
          target.removeClass("sortable_dragging");
          target.style.left = "initial";
          target.style.top = "initial";
          target = null;
          this.remove();
        }
      };

      overlay.on("mouseup", onDrop);
      overlay.on("mouseout", onDrop);

      var clicks = 1;
      var timer: number|null = null;
      this.container.on("mousedown", (e) => {
        if (e.target === container) return;
        if (e.which !== 1) return;
        if (option.exclude && e.target!.matches(option.exclude)) return;

        clearTimeout(timer!);

        // 0.5秒待ってダブルクリックかシングルクリックか判定する
        timer = setTimeout( () => {
          clicks = 1;
        },500);

        if(clicks === 1) {
          target = e.target;
          if(target) {
            while (target.parent() !== container) {
              target = target.parent();
            }

            target.addClass("sortable_dragging");
            document.body.addLast(overlay);
          }

          clicks = 1;
        }else if(clicks === 2) {
          clicks = 1;
        }
        clicks++;
      });
    }
  }
}
