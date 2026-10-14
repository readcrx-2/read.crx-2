import "@testing-library/jest-dom/vitest";

import { extractUrlsFromMessage, toViewerImageUrl } from "src/core/util/url-media";
import {
  formatIdForCopy,
  formatMarkdownLink,
  formatResForCopy,
  hasExternalLink,
  hasImage,
  hasVideo,
  normalizeIdLinkText,
  parseAnchorDisplayTargets,
  stripHtml,
} from "src/view/browser/utils/utils";
import { describe, expect, it } from "vite-plus/test";

describe("browser utils compatibility entrypoint", () => {
  it("責務別モジュールの公開APIを従来のimport先から利用できる", () => {
    expect(formatIdForCopy("abc123")).toBe("ID:abc123");
    expect(parseAnchorDisplayTargets(">>10")).toEqual([10]);
    expect(toViewerImageUrl("https://imgur.com/TestImage")).toBe(
      "https://i.imgur.com/TestImagem.jpg",
    );
  });

  it("stripHtml は数値文字参照の絵文字を復元する", () => {
    expect(stripHtml("<span>&#128514;</span><br>&amp;test")).toBe("😂\n&test");
  });

  it("twitter 画像URLをビューア向けURLとして扱う", () => {
    const url = "https://pbs.twimg.com/media/TestTwitterImage?format=jpg&name=large";

    expect(toViewerImageUrl(url)).toBe(url);
    expect(hasImage(url)).toBe(true);
  });

  it("先頭を削った画像URLを復元してリンク・画像として扱う", () => {
    const message = [
      "s://pbs.twimg.com/media/TestTwitterImageA.jpg",
      "ps://pbs.twimg.com/media/TestTwitterImageB.jpg",
      "p://i.imgur.com/TestImageC.jpg",
    ].join(" ");

    expect(extractUrlsFromMessage(message)).toEqual([
      "https://pbs.twimg.com/media/TestTwitterImageA.jpg",
      "https://pbs.twimg.com/media/TestTwitterImageB.jpg",
      "http://i.imgur.com/TestImageC.jpg",
    ]);
    expect(hasExternalLink(message)).toBe(true);
    expect(hasImage(message)).toBe(true);
    expect(toViewerImageUrl("p://i.imgur.com/TestImageC.jpg")).toBe(
      "https://i.imgur.com/TestImageCm.jpg",
    );
  });

  it("YouTube と直リンク mp4 を動画として判定する", () => {
    expect(hasVideo("https://youtu.be/TestVideo01")).toBe(true);
    expect(
      hasVideo(
        "https://video.twimg.com/amplify_video/0000000000000000000/vid/avc1/1280x720/test-video.mp4?tag=14",
      ),
    ).toBe(true);
  });

  it("anchor_id の表示文字列をIDポップアップ向けに正規化する", () => {
    expect(normalizeIdLinkText("id:ABC123(4)")).toBe("ID:ABC123");
  });

  it("コピー用IDをID:形式へ正規化する", () => {
    expect(formatIdForCopy("abc123")).toBe("ID:abc123");
    expect(formatIdForCopy("id:ABC123")).toBe("ID:ABC123");
    expect(formatIdForCopy(undefined)).toBe("");
  });

  it("レスのコピー形式にIDを含める", () => {
    expect(
      formatResForCopy({
        num: 10,
        name: "name",
        mail: "",
        date: "date",
        id: "abc123",
        message: "message",
      }),
    ).toBe("10 name ID:abc123  date\nmessage");
  });

  it("MarkdownリンクのタイトルとURLに含まれる構文文字をエスケープする", () => {
    expect(formatMarkdownLink("Title ] \\ note", "https://example.test/thread/(1)?next=2)")).toBe(
      "[Title \\] \\\\ note](https://example.test/thread/\\(1\\)?next=2\\))",
    );
  });

  describe("imgur URL変換（リサイズパラメータ付き）", () => {
    it("imgur.com/[id] をサムネイル形式に変換する", () => {
      expect(toViewerImageUrl("https://imgur.com/TestImage")).toBe(
        "https://i.imgur.com/TestImagem.jpg",
      );
    });

    it("imgur.com/[id]/ （末尾スラッシュあり）をサムネイル形式に変換する", () => {
      expect(toViewerImageUrl("https://imgur.com/TestImage/")).toBe(
        "https://i.imgur.com/TestImagem.jpg",
      );
    });

    it("imgur.com/a/[album_id] は画像URLへ変換しない", () => {
      expect(toViewerImageUrl("https://imgur.com/a/TestAlbum")).toBeNull();
    });

    it("m.imgur.com/[id] をサムネイル形式に変換する", () => {
      expect(toViewerImageUrl("https://m.imgur.com/TestImage")).toBe(
        "https://i.imgur.com/TestImagem.jpg",
      );
    });

    it("既存の i.imgur.com 画像にリサイズパラメータを追加する", () => {
      expect(toViewerImageUrl("https://i.imgur.com/TestImage.jpg")).toBe(
        "https://i.imgur.com/TestImagem.jpg",
      );
    });

    it("i.imgur.com の png 画像にもリサイズパラメータを追加する", () => {
      expect(toViewerImageUrl("https://i.imgur.com/TestImage.png")).toBe(
        "https://i.imgur.com/TestImagem.png",
      );
    });

    it("末尾スラッシュと拡張子を含むURLを処理する", () => {
      expect(toViewerImageUrl("https://imgur.com/TestImage.jpg/")).toBe(
        "https://i.imgur.com/TestImagem.jpg",
      );
    });
  });
});
