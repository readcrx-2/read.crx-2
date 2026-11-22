import { fadeIn, fadeOut } from "./Animate.js";

export default class SearchNextThread {
  private readonly $element: HTMLElement;
  private readonly $replaceBookmarkLabel: HTMLElement;
  private readonly $replaceBookmark: HTMLInputElement;
  private currentUrl = "";

  constructor($element: HTMLElement) {
    this.$element = $element;
    this.$replaceBookmarkLabel = this.$element.C(
      "replace_bookmark_label",
    )[0] as HTMLElement;
    this.$replaceBookmark = this.$element.C(
      "replace_bookmark",
    )[0] as HTMLInputElement;

    this.$element.C("close")[0].on("click", () => {
      this.hide();
    });

    const $ol = this.$element.T("ol")[0];
    $ol.on("mousedown", (e: MouseEvent) => {
      if (e.button === 2) {
        return;
      }
      const target = (e.target as HTMLElement).closest(
        "li.open_in_rcrx",
      ) as HTMLElement | null;
      if (!target || !this.$replaceBookmark.checked || !this.currentUrl) {
        return;
      }

      const nextUrl = target.dataset.href;
      const nextTitle = target.textContent ?? "";
      const nextResCount = target.dataset.resCount
        ? Number(target.dataset.resCount)
        : undefined;
      if (!nextUrl) {
        return;
      }

      app.bookmark.replace(this.currentUrl, nextUrl, nextTitle, nextResCount);
      target.addClass("bookmarked");
      this.$replaceBookmarkLabel.addClass("hidden");
      this.$replaceBookmark.checked = false;
    });
  }

  show() {
    fadeIn(this.$element);
  }

  hide() {
    fadeOut(this.$element);
  }

  private updateReplaceBookmarkState() {
    if (this.currentUrl && app.bookmark.get(this.currentUrl)) {
      this.$replaceBookmarkLabel.removeClass("hidden");
      this.$replaceBookmark.checked = app.config.isOn(
        "replace_bookmark_on_next_thread",
      );
    } else {
      this.$replaceBookmarkLabel.addClass("hidden");
      this.$replaceBookmark.checked = false;
    }
  }

  async search(url: string, title: string, resString: string) {
    const $ol = this.$element.T("ol")[0];

    this.currentUrl = url;
    this.updateReplaceBookmarkState();

    $ol.innerHTML = "";
    this.$element.C("current")[0].textContent = title;
    this.$element.C("status")[0].textContent = "検索中";

    try {
      const res = await app.util.searchNextThread(url, title, resString);

      for (const thread of res) {
        const $li = $__("li").addClass("open_in_rcrx");
        $li.textContent = thread.title;
        $li.dataset.href = thread.url;
        if (thread.resCount != null) {
          $li.dataset.resCount = String(thread.resCount);
        }
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
