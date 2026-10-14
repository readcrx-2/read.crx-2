import { normalizeObfuscatedUrl, URL_LIKE_PATTERN } from "src/core/network/url-utils";
import { isInlineVideoEmbedUrl } from "src/core/util/external-media";

/**
 * レス本文のメディア・外部リンク判定をまとめる。
 * フィルタは MessageProcessor の表示結果ではなく取得した生HTMLを判定するため、
 * レス表示やURL変換の実装とは独立した入力判定として保つ。
 */

export function hasImage(message: string): boolean {
  const normalizedMessage = message.replace(URL_LIKE_PATTERN, normalizeObfuscatedUrl);
  return (
    // なぜサフィックスを許容するか: pbs.twimg.com の画像は「XXX.jpg:orig」のように
    // 拡張子の直後へコロン付きのサイズ指定（:thumb/:small/:medium/:large/:orig など）が付く。
    // コロン以下を拡張子の一部とみなすと画像判定から漏れるため、通常の画像として扱う。
    /\.(jpe?g|png|gif|webp|bmp|avif)(?::[a-z0-9]+)?(?:\?[^"<]*)?(?=["<\s]|$)/i.test(
      normalizedMessage,
    ) ||
    /https?:\/\/pbs\.twimg\.com\/media\/[^\s"'<>?]+\?[^\s"'<>]*format=(?:jpe?g|png|gif|webp|bmp|avif)\b/i.test(
      normalizedMessage,
    )
  );
}

export function hasVideo(message: string): boolean {
  const normalizedMessage = message.replace(URL_LIKE_PATTERN, normalizeObfuscatedUrl);
  return (
    /\.(mp4|webm|avi|mov)(?:\?[^"<]*)?(?=["<\s]|$)/i.test(normalizedMessage) ||
    /<video\b/i.test(normalizedMessage) ||
    (normalizedMessage
      .match(/https?:\/\/[^\s"'<>]+/gi)
      ?.some((url) => isInlineVideoEmbedUrl(url)) ??
      false)
  );
}

export function hasExternalLink(message: string): boolean {
  // res.message はレンダリング前の生HTMLで、通常URLはまだ <a> タグ化されていない
  // （linkify は MessageProcessor が描画時に行う）ため、<a href> だけを見ると常に不一致になる。
  // 生テキスト中の http(s) URL と、先頭を削った URL も対象にする。
  return new RegExp(URL_LIKE_PATTERN.source, "i").test(message);
}
