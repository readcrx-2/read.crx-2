import "@testing-library/jest-dom/vitest";

import { describe, expect, it } from "vite-plus/test";

import { extractUrlsFromMessage, toOriginalImageUrl, toViewerImageUrl } from "./url-media";

describe("url-media", () => {
  it("先頭を削ったURLを復元して重複なく抽出する", () => {
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
  });

  it("スキーム後のスラッシュが1本だけのURLも正規化して抽出する", () => {
    expect(extractUrlsFromMessage("https:/example.com/image.jpeg")).toEqual([
      "https://example.com/image.jpeg",
    ]);
  });

  it("twitter画像URLをビューア向けURLとして扱う", () => {
    const url = "https://pbs.twimg.com/media/TestTwitterImage?format=jpg&name=large";

    expect(toViewerImageUrl(url)).toBe(url);
  });

  it("twitter画像のコロン付きサイズ指定URLを通常画像として扱う", () => {
    // pbs.twimg.com は「XXX.jpg:orig」のように拡張子の直後へコロン付きサイズ指定を付ける。
    // なぜそのまま返すか: サフィックスは表示サイズの指定であり、画像本体は元のURLで取得できるため。
    const urls = [
      "https://pbs.twimg.com/media/TestTwitterImageA.jpg:orig",
      "https://pbs.twimg.com/media/TestTwitterImageB.jpg:large",
      "https://pbs.twimg.com/media/TestTwitterImageC.jpg:small",
      "https://pbs.twimg.com/media/TestTwitterImageD.jpg:medium",
      "https://pbs.twimg.com/media/TestTwitterImageE.png:orig",
    ];
    for (const url of urls) {
      expect(toViewerImageUrl(url)).toBe(url);
    }
  });

  it("コロン付きサイズ指定URLを抽出時に欠けさせない", () => {
    expect(
      extractUrlsFromMessage("see https://pbs.twimg.com/media/TestTwitterImageA.jpg:orig here"),
    ).toEqual(["https://pbs.twimg.com/media/TestTwitterImageA.jpg:orig"]);
  });

  it("コロン付きでも画像拡張子でなければビューア対象にしない", () => {
    expect(toViewerImageUrl("https://example.com/notimage.txt:orig")).toBeNull();
  });

  it("先頭を削ったimgur画像URLをサムネイル形式に変換する", () => {
    expect(toViewerImageUrl("p://i.imgur.com/TestImageC.jpg")).toBe(
      "https://i.imgur.com/TestImageCm.jpg",
    );
  });

  it("ImgurのMP4直リンクを画像サムネイルへ変換しない", () => {
    expect(toViewerImageUrl("https://i.imgur.com/TestImgurVideo.mp4")).toBeNull();
    expect(toViewerImageUrl("https://imgur.com/TestImgurVideo.mp4")).toBeNull();
  });

  it("省略スキームと完全スキームが重複したimgur画像URLを正規化して扱う", () => {
    const rawUrl = "ps://https://i.imgur.com/jZia7GC.png";

    expect(extractUrlsFromMessage(rawUrl)).toEqual(["https://i.imgur.com/jZia7GC.png"]);
    expect(toViewerImageUrl(rawUrl)).toBe("https://i.imgur.com/jZia7GCm.png");
  });

  it("スラッシュが1本だけの画像URLを正規化してビューアで扱う", () => {
    expect(toViewerImageUrl("https:/example.com/image.jpeg")).toBe(
      "https://example.com/image.jpeg",
    );
  });

  it("スキームを省略したホスト名の画像URLを抽出してビューアで扱う", () => {
    const url = "images.example.com/media/sample.jpg";

    expect(extractUrlsFromMessage(url)).toEqual([`https://${url}`]);
    expect(toViewerImageUrl(url)).toBe(`https://${url}`);
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

  it("imgurのサムネイルURLからオリジナルURLを復元する", () => {
    expect(toOriginalImageUrl("https://i.imgur.com/TestImagem.jpg")).toBe(
      "https://i.imgur.com/TestImage.jpg",
    );
    expect(toOriginalImageUrl("https://i.imgur.com/TestImage.jpg")).toBeNull();
  });
});
