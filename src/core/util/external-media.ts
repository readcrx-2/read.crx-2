export type ExternalVideoProvider = "youtube";

export interface TwitterPostEmbed {
  provider: "twitter";
  rawUrl: string;
  externalUrl: string;
  thumbnailUrl: string;
  fallbackThumbnailUrl: string;
  providerLabel: string;
  postId: string;
  apiUrl: string;
}

export interface ExternalVideoEmbed {
  provider: ExternalVideoProvider;
  rawUrl: string;
  embedUrl: string;
  externalUrl: string;
  thumbnailUrl: string;
  fallbackThumbnailUrl: string;
  providerLabel: string;
  iframeTitle: string;
}

export type ExternalMediaEmbed = ExternalVideoEmbed | TwitterPostEmbed;

const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtu.be",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
]);
const youtubeFallbackThumbnailUrl = createThumbnailPlaceholder("YouTube", "#ef4444", "#111827");
const nativeVideoFallbackThumbnailUrl = createThumbnailPlaceholder("VIDEO", "#f8fafc", "#0f172a");
const twitterFallbackThumbnailUrl = createThumbnailPlaceholder("X POST", "#1d9bf0", "#0f172a");
const DIRECT_VIDEO_REG = /\.(?:mp4|m4v|webm|ogv|mov|avi|gifv)(?:[?#:].*)?$/i;
const TWITTER_POST_HOSTS = new Set([
  "twitter.com",
  "www.twitter.com",
  "mobile.twitter.com",
  "x.com",
  "www.x.com",
  "fxtwitter.com",
  "www.fxtwitter.com",
  "fixupx.com",
  "www.fixupx.com",
  "twittpr.com",
  "www.twittpr.com",
]);

function createThumbnailPlaceholder(
  providerLabel: string,
  accentColor: string,
  backgroundColor: string,
): string {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 208 208" role="img" aria-label="${providerLabel}">
      <rect width="208" height="208" rx="20" fill="${backgroundColor}" />
      <circle cx="104" cy="86" r="34" fill="${accentColor}" opacity="0.16" />
      <path d="M92 68v36l32-18-32-18Z" fill="${accentColor}" />
      <rect x="28" y="142" width="152" height="30" rx="15" fill="rgba(255,255,255,0.08)" />
      <text x="104" y="161" fill="#ffffff" font-family="Segoe UI, sans-serif" font-size="17" font-weight="700" text-anchor="middle">${providerLabel}</text>
    </svg>
  `;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function isValidYouTubeVideoId(value: string | null): value is string {
  return value != null && /^[\w-]{11}$/.test(value);
}

function extractYouTubeVideoId(url: URL): string | null {
  if (!YOUTUBE_HOSTS.has(url.hostname.toLowerCase())) {
    return null;
  }

  if (url.hostname.toLowerCase() === "youtu.be") {
    const shortId = url.pathname.split("/").filter(Boolean)[0] ?? null;
    return isValidYouTubeVideoId(shortId) ? shortId : null;
  }

  if (url.pathname === "/watch") {
    const watchId = url.searchParams.get("v");
    return isValidYouTubeVideoId(watchId) ? watchId : null;
  }

  const pathParts = url.pathname.split("/").filter(Boolean);
  const embedPrefixes = new Set(["embed", "shorts", "live", "v"]);
  if (pathParts.length >= 2 && embedPrefixes.has(pathParts[0])) {
    const embeddedId = pathParts[1] ?? null;
    return isValidYouTubeVideoId(embeddedId) ? embeddedId : null;
  }

  return null;
}

function extractTwitterPostId(url: URL): string | null {
  if (!TWITTER_POST_HOSTS.has(url.hostname.toLowerCase())) {
    return null;
  }

  // /i/web/status/<id> を含むため、ユーザー名の形式には依存せず status 部分を探す。
  return url.pathname.match(/\/(?:status|statuses)\/(\d{2,20})(?:\/|$)/i)?.[1] ?? null;
}

function buildYouTubeEmbedUrl(youtubeVideoId: string): string {
  // ベースURLは環境非依存に保ち、拡張機能固有の origin は表示時に付与する。
  const embedUrl = new URL(`https://www.youtube.com/embed/${youtubeVideoId}`);
  embedUrl.searchParams.set("rel", "0");
  embedUrl.searchParams.set("playsinline", "1");
  return embedUrl.toString();
}

function buildYouTubeExternalUrl(youtubeVideoId: string, sourceUrl: URL): string {
  const externalUrl = new URL("https://www.youtube.com/watch");
  externalUrl.searchParams.set("v", youtubeVideoId);

  const playlistId = sourceUrl.searchParams.get("list");
  if (playlistId) {
    externalUrl.searchParams.set("list", playlistId);
  }

  const timeParam = sourceUrl.searchParams.get("t");
  if (timeParam) {
    externalUrl.searchParams.set("t", timeParam);
  }

  return externalUrl.toString();
}

export function shouldOpenYouTubeExternally(
  embed: ExternalVideoEmbed,
  pageOrigin: string | null | undefined,
): boolean {
  if (embed.provider !== "youtube" || pageOrigin == null || pageOrigin === "null") {
    return false;
  }

  // 拡張ページの YouTube iframe は Referer が欠けやすく、さらに他拡張の content script が
  // 介入すると 153 へ直行しやすいので、extension origin では通常の watch URL へ逃がす。
  return /^[a-z-]+extension:\/\//.test(pageOrigin);
}

export function toRuntimeVideoEmbedUrl(
  embed: ExternalVideoEmbed,
  pageOrigin: string | null | undefined,
): string {
  if (embed.provider !== "youtube" || pageOrigin == null || pageOrigin === "null") {
    return embed.embedUrl;
  }

  if (shouldOpenYouTubeExternally(embed, pageOrigin) || !/^https?:\/\//.test(pageOrigin)) {
    // 拡張機能の chrome-extension:// origin を付けると YouTube 側が API client として
    // 受け入れず 153 になることがあるため、拡張環境では通常の Referer 判定に任せる。
    return embed.embedUrl;
  }

  const runtimeEmbedUrl = new URL(embed.embedUrl);
  // Web配信時は https origin を明示して YouTube 側へ API client identity を渡す。
  runtimeEmbedUrl.searchParams.set("enablejsapi", "1");
  runtimeEmbedUrl.searchParams.set("origin", pageOrigin);
  return runtimeEmbedUrl.toString();
}

export function toInlineVideoEmbed(rawUrl: string): ExternalVideoEmbed | null {
  try {
    const parsedUrl = new URL(rawUrl);
    const youtubeVideoId = extractYouTubeVideoId(parsedUrl);
    if (youtubeVideoId) {
      return {
        provider: "youtube",
        rawUrl,
        // モーダルではなくレス内で開くため、通常ページではなく iframe 用URLをここで確定させる。
        embedUrl: buildYouTubeEmbedUrl(youtubeVideoId),
        // 拡張ページでは iframe 再生を諦めるため、失敗しない通常視聴 URL も保持しておく。
        externalUrl: buildYouTubeExternalUrl(youtubeVideoId, parsedUrl),
        thumbnailUrl: `https://img.youtube.com/vi/${youtubeVideoId}/hqdefault.jpg`,
        fallbackThumbnailUrl: youtubeFallbackThumbnailUrl,
        providerLabel: "YouTube",
        iframeTitle: "YouTube 動画プレーヤー",
      };
    }
  } catch {
    return null;
  }

  return null;
}

export function toTwitterPostEmbed(rawUrl: string): TwitterPostEmbed | null {
  try {
    const parsedUrl = new URL(rawUrl);
    const postId = extractTwitterPostId(parsedUrl);
    if (!postId) {
      return null;
    }

    return {
      provider: "twitter",
      rawUrl,
      // API取得に失敗しても元の投稿URLを開けるよう、入力URLをそのまま保持する。
      externalUrl: rawUrl,
      thumbnailUrl: twitterFallbackThumbnailUrl,
      fallbackThumbnailUrl: twitterFallbackThumbnailUrl,
      providerLabel: "FxTwitter",
      postId,
      apiUrl: `https://api.fxtwitter.com/2/status/${postId}`,
    };
  } catch {
    return null;
  }
}

export function isDirectVideoUrl(rawUrl: string): boolean {
  try {
    return DIRECT_VIDEO_REG.test(new URL(rawUrl).pathname);
  } catch {
    return DIRECT_VIDEO_REG.test(rawUrl);
  }
}

export function getDirectVideoLabel(rawUrl: string): string {
  try {
    const hostname = new URL(rawUrl).hostname.toLowerCase();
    if (hostname.endsWith("twimg.com")) {
      return "Twitter Video";
    }
  } catch {
    // URL として解釈できない場合は汎用ラベルを返す。
  }

  return "Video";
}

export function getDirectVideoFallbackThumbnailUrl(): string {
  return nativeVideoFallbackThumbnailUrl;
}

export function isInlineVideoEmbedUrl(rawUrl: string): boolean {
  return isDirectVideoUrl(rawUrl) || toInlineVideoEmbed(rawUrl) != null;
}
