import { normalizeObfuscatedUrl, URL_LIKE_PATTERN } from "src/core/network/url-utils";

/**
 * レス本文からのURL抽出と画像ビューア向けURL変換をまとめる。
 * URLの復元・抽出・Imgur変換は同じ正規化規則を共有するため、メディア判定やDOM操作から
 * 分離した一つの境界に置いて、表示側がURL処理の詳細へ依存しないようにする。
 */

export function extractUrlsFromMessage(message: string): string[] {
  const result: string[] = [];
  const seen = new Set<string>();

  const pushUrl = (url: string) => {
    const trimmed = normalizeObfuscatedUrl(url.trim().replace(/[),.;]+$/, ""));
    if (!/^https?:\/\//i.test(trimmed)) return;
    if (seen.has(trimmed)) return;
    seen.add(trimmed);
    result.push(trimmed);
  };

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(message, "text/html");
    for (const a of Array.from(doc.querySelectorAll("a[href]"))) {
      pushUrl(a.getAttribute("href") ?? "");
    }
  } catch {
    // HTMLパースに失敗した場合でも正規表現抽出で継続
  }

  const textMatch = message.match(URL_LIKE_PATTERN) ?? [];
  for (const url of textMatch) {
    pushUrl(url);
  }

  return result;
}

/**
 * imgurのリサイズパラメータ付きサムネイルURLから、オリジナル解像度のURLを返す。
 * リサイズパラメータ（m など）が付いていない場合は null を返す。
 */
export function toOriginalImageUrl(thumbnailUrl: string): string | null {
  try {
    const url = new window.URL(thumbnailUrl);
    if (url.hostname.toLowerCase() !== "i.imgur.com") return null;
    // /[id]m.jpg のパターンからリサイズパラメータを除去してオリジナルURLを生成
    const match = url.pathname.match(/^\/([a-z0-9]+)m\.([a-z]+)$/i);
    if (!match) return null;
    const [, id, ext] = match;
    return `https://i.imgur.com/${id}.${ext}`;
  } catch {
    return null;
  }
}

/**
 * 生のURLを、メディアビューアで表示可能な画像URLに変換する。
 *
 * Imgurについては、読み込み速度向上のためリサイズパラメータ(m: 320px)を付与してサムネイルURLに変換する。
 * - シングル画像: imgur.com/[id] や imgur.com/[id]/ → i.imgur.com/[id]m.jpg
 * - アルバム: imgur.com/a/[album_id] は変換しない（画像URLではないため対象外）
 * - 既に拡張子付きのi.imgur画像: i.imgur.com/[id].jpg → i.imgur.com/[id]m.jpg （リサイズパラメータ追加）
 */
export function toViewerImageUrl(rawUrl: string): string | null {
  try {
    const url = new window.URL(normalizeObfuscatedUrl(rawUrl));
    const host = url.hostname.toLowerCase();
    const pathname = url.pathname;

    // imgur URL の処理を最初に行う（他の拡張子チェックより優先）
    if (host === "i.imgur.com") {
      // 動画は汎用の拡張子変換から外し、ResMediaGalleryのネイティブ再生へ渡す。
      if (/\.(?:mp4|m4v|webm|ogv|mov|avi|gifv)$/i.test(pathname)) return null;
      // i.imgur.comの既存画像URLについて、リサイズパラメータを追加してサムネイルを高速化
      // 形式: https://i.imgur.com/[id].jpg → https://i.imgur.com/[id]m.jpg
      const match = pathname.match(/^\/([a-z0-9]+)\.([a-z]+)$/i);
      if (match) {
        const [, id, ext] = match;
        return `https://i.imgur.com/${id}m.${ext}`;
      }
      return url.href;
    }

    if (host === "imgur.com" || host === "m.imgur.com") {
      const parts = pathname.split("/").filter(Boolean);

      // 動画URLを「拡張子付き画像」として変換すると再生可能なMP4を失うため除外する。
      if (parts.length === 1 && /\.(?:mp4|m4v|webm|ogv|mov|avi|gifv)$/i.test(parts[0])) {
        return null;
      }

      // imgur.com/[id] または imgur.com/[id]/ の形式（シングル画像）
      if (parts.length === 1) {
        const id = parts[0].split(".")[0];
        if (id) {
          // リサイズパラメータ(m: Medium Thumbnail 320px)を追加して高速化
          return `https://i.imgur.com/${id}m.jpg`;
        }
      }

      // imgur.com/a/[album_id] の形式（アルバム）
      if (parts.length === 2 && parts[0].toLowerCase() === "a") {
        // アルバムURLはHTMLコンテナであり画像直接リンクではない。
        // 変換すると誤表示や誤解決を招くため、サムネイル対象から除外する。
        return null;
      }
    }

    // pbs.twimg.com の画像は「XXX.jpg:orig」のように拡張子の直後へ
    // コロン付きのサイズ指定サフィックス（:thumb/:small/:medium/:large/:orig など）が付く。
    // なぜこの分岐が必要か: コロン以下を拡張子の一部とみなすと画像判定から漏れるため、
    // サフィックス付きでも通常の画像として扱い、元のURLのまま表示する。
    if (/\.(jpe?g|png|gif|webp|bmp|avif)(?::[a-z0-9]+)?(\?.*)?$/i.test(pathname)) {
      return url.href;
    }

    if (
      host === "pbs.twimg.com" &&
      pathname.startsWith("/media/") &&
      /^(jpe?g|png|gif|webp|bmp|avif)$/i.test(url.searchParams.get("format") ?? "")
    ) {
      return url.href;
    }
  } catch {
    return null;
  }
  return null;
}
