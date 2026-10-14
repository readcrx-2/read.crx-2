// @vitest-environment node
import { describe, expect, it } from "vite-plus/test";

import {
  getDirectVideoLabel,
  isDirectVideoUrl,
  shouldOpenYouTubeExternally,
  toInlineVideoEmbed,
  toRuntimeVideoEmbedUrl,
  toTwitterPostEmbed,
} from "./external-media";

describe("external media", () => {
  it("YouTube URL をレス内埋め込み向けURLへ変換する", () => {
    const media = toInlineVideoEmbed("https://youtu.be/TestVideo01?t=3");

    expect(media).not.toBeNull();
    expect(media?.provider).toBe("youtube");
    expect(media?.embedUrl).toContain("https://www.youtube.com/embed/TestVideo01");
    expect(media?.externalUrl).toBe("https://www.youtube.com/watch?v=TestVideo01&t=3");
    // ベースURLは静的に保ち、拡張機能固有の origin は描画時にのみ付ける。
    expect(media?.embedUrl).not.toContain("enablejsapi");
    expect(media?.embedUrl).not.toContain("origin=");
    expect(media?.thumbnailUrl).toBe("https://img.youtube.com/vi/TestVideo01/hqdefault.jpg");
  });

  it("通常のWebオリジンでは実オリジン付きのYouTube埋め込みURLへ変換する", () => {
    const media = toInlineVideoEmbed("https://youtu.be/TestVideo01?t=3");

    expect(media).not.toBeNull();
    const runtimeUrl = new URL(toRuntimeVideoEmbedUrl(media!, "https://example.com"));

    expect(runtimeUrl.searchParams.get("enablejsapi")).toBe("1");
    expect(runtimeUrl.searchParams.get("origin")).toBe("https://example.com");
  });

  it("拡張機能オリジンでは追加のYouTube APIパラメータを付けない", () => {
    const media = toInlineVideoEmbed("https://youtu.be/TestVideo01?t=3");

    expect(media).not.toBeNull();
    expect(shouldOpenYouTubeExternally(media!, "chrome-extension://abcdefghijklmnop")).toBe(true);
    const runtimeUrl = toRuntimeVideoEmbedUrl(media!, "chrome-extension://abcdefghijklmnop");

    expect(runtimeUrl).toBe(media!.embedUrl);
  });

  it("通常のWebオリジンでは YouTube を外部タブへ退避しない", () => {
    const media = toInlineVideoEmbed("https://youtu.be/TestVideo01?t=3");

    expect(media).not.toBeNull();
    expect(shouldOpenYouTubeExternally(media!, "https://example.com")).toBe(false);
  });

  it("video.twimg.com の直リンクをネイティブ動画として判定する", () => {
    const rawUrl =
      "https://video.twimg.com/amplify_video/0000000000000000000/vid/avc1/1280x720/test-video.mp4?tag=14";

    expect(isDirectVideoUrl(rawUrl)).toBe(true);
    expect(getDirectVideoLabel(rawUrl)).toBe("Twitter Video");
  });

  it("Imgurのgifv直リンクもネイティブ動画として判定する", () => {
    expect(isDirectVideoUrl("https://i.imgur.com/TestImgurVideo.gifv")).toBe(true);
  });

  it("Twitter/X投稿URLをFxTwitter API向けのメディア項目へ変換する", () => {
    const media = toTwitterPostEmbed("https://x.com/example/status/1234567890123456789?ref=share");

    expect(media).toMatchObject({
      provider: "twitter",
      postId: "1234567890123456789",
      apiUrl: "https://api.fxtwitter.com/2/status/1234567890123456789",
      externalUrl: "https://x.com/example/status/1234567890123456789?ref=share",
    });
  });

  it("Twitter/Xの投稿以外と不正な投稿IDは埋め込み対象にしない", () => {
    expect(toTwitterPostEmbed("https://x.com/example")).toBeNull();
    expect(toTwitterPostEmbed("https://example.com/user/status/123456789")).toBeNull();
    expect(toTwitterPostEmbed("https://twitter.com/example/status/not-a-number")).toBeNull();
  });
});
