///<reference path="../../lib/DefinitelyTyped/jquery/jquery.d.ts" />

module UI {
  "use strict";

  export class Sortable {
    container: HTMLElement;

    constructor (container: HTMLElement, option: {exclude?: string} = {}) {
      var sorting = false,
        start: {x: number; y: number} = {x: null, y: null},
        target = null,
        overlay: HTMLDivElement,
        onHoge: Function;

      this.container = container;

      this.container.classList.add("sortable");

      overlay = document.createElement("div")
      overlay.classList.add("sortable_overlay");

      overlay.addEventListener("contextmenu", function (e) {
        e.preventDefault();
      });

      overlay.addEventListener("mousemove", (e) => {
        var targetCenter: {x: number; y: number},
          tmp: HTMLElement,
          cacheX: number,
          cacheY: number;

        if (!sorting) {
          start.x = e.pageX;
          start.y = e.pageY;
          sorting = true;
        }

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
              start.x += target.offsetLeft - cacheX;
              start.y += target.offsetTop - cacheY;
            }
            else if (
              targetCenter.x < tmp.offsetLeft + tmp.offsetWidth / 2 ||
              targetCenter.y < tmp.offsetTop + tmp.offsetHeight / 2
            ) {
              cacheX = target.offsetLeft;
              cacheY = target.offsetTop;
              tmp.insertAdjacentElement("beforebegin", target);
              start.x += target.offsetLeft - cacheX;
              start.y += target.offsetTop - cacheY;
            }
            break;
          }
          tmp = <HTMLElement>tmp.nextElementSibling;
        }

        target.style.left = (e.pageX - start.x) + "px";
        target.style.top = (e.pageY - start.y) + "px";
      });

      onHoge = function () {
        // removeするとmouseoutも発火するので二重に呼ばれる
        sorting = false;

        if (target) {
          target.classList.remove("sortable_dragging");
          target.style.left = "initial";
          target.style.top = "initial";
          target = null;
          this.parentNode.removeChild(this);
        }
      };

      overlay.addEventListener("mouseup", <any>onHoge);
      overlay.addEventListener("mouseout", <any>onHoge);

      var clicks = 1;
      var timer = null;
      this.container.addEventListener("mousedown", function (e) {
        if (e.target === container) return;
        if (e.which !== 1) return;
        if (option.exclude && (<Element>e.target).webkitMatchesSelector(option.exclude)) return;
        
        clearTimeout(timer);
        
        // 1秒待ってダブルクリックかシングルクリックか判定する
        timer = setTimeout(function() {
          clicks = 1;
        },500);
        
        if(clicks === 1) {
          target = e.target;
          while (target.parentNode !== container) {
            target = target.parentNode;
          }

          target.classList.add("sortable_dragging");
          document.body.appendChild(overlay);
          
          clicks = 1;
        }else if(clicks === 2) {
          clicks = 1;
        }
        clicks++;
      });
    }
  }
}
/*

*/
(function ($) {
  $.fn.sortable = function (option) {
    $(this).each(function () {
      new UI.Sortable(this, option);
    });

    return this;
  };
})(jQuery);
