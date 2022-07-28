// @ts-ignore
import {fadeIn, fadeOut} from "./Animate.js"

export default class SearchNextThread {
  private readonly $element: HTMLElement;

  constructor($element: HTMLElement) {
    this.$element = $element;

    this.$element.C("close")[0].on("click", () => {
      this.hide();
    });
  }

  show() {
    fadeIn(this.$element);
  }

  hide() {
    fadeOut(this.$element);
  }

  async search(url:string, title:string, resString: string) {
    const $ol = this.$element.T("ol")[0];

    $ol.innerHTML = "";
    this.$element.C("current")[0].textContent = title;
    this.$element.C("status")[0].textContent = "検索中";

    try {
      const res = await app.util.searchNextThread(url, title, resString);

      for(const thread of res) {
        const $li = $__("li").addClass("open_in_rcrx");
        $li.textContent = thread.title;
        $li.dataset.href = thread.url;
        $ol.addLast($li);

        if (app.bookmark.get(thread.url)) {
          $li.addClass("bookmarked");
        }
      }

      this.$element.C("status")[0].textContent = "";
    } catch {
      this.$element.C("status")[0].textContent = "次スレ検索に失敗しました";
    }
  }
}
