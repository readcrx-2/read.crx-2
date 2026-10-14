import { createLogger } from "src/app/logger";
import { toTwitterPostEmbed, type TwitterPostEmbed } from "src/core/util/external-media";

export const FXTWITTER_API_REQUEST_TIMEOUT_MS = 8_000;

interface UnknownRecord {
  [key: string]: unknown;
}

export interface TwitterPostImage {
  type: "image";
  url: string;
  altText: string | null;
}

export interface TwitterPostVideo {
  type: "video";
  url: string;
  posterUrl: string | null;
  isGif: boolean;
}

export type TwitterPostMedia = TwitterPostImage | TwitterPostVideo;

export type TwitterVerificationBadgeColor = "blue" | "gold" | "gray";

export interface TwitterVerificationBadge {
  color: TwitterVerificationBadgeColor;
  type: "individual" | "organization" | "government" | null;
}

export interface TwitterPostMetrics {
  replies: number | null;
  reposts: number | null;
  quotes: number | null;
  likes: number | null;
  views: number | null;
  bookmarks: number | null;
}

export interface TwitterPostTranslation {
  text: string;
  sourceLang: string;
  targetLang: string;
}

export interface TwitterPost {
  id: string;
  url: string;
  text: string;
  lang: string | null;
  translation: TwitterPostTranslation | null;
  createdTimestamp: number | null;
  source: string | null;
  author: {
    name: string;
    screenName: string;
    avatarUrl: string | null;
    verificationBadge: TwitterVerificationBadge | null;
  };
  metrics: TwitterPostMetrics;
  media: readonly TwitterPostMedia[];
}

export interface TwitterPostHttpResponse {
  status: number;
  body: string;
}

export interface TwitterPostResolverOptions {
  fetch?: (url: string, headers: Record<string, string>) => Promise<TwitterPostHttpResponse>;
  timeoutMs?: number;
  logError?: (message: string, error?: unknown) => void;
}

const logger = createLogger("TwitterPostResolver");

function asRecord(value: unknown): UnknownRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function getString(record: UnknownRecord, key: string): string | null {
  const value = record[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function getArray(record: UnknownRecord, key: string): unknown[] {
  const value = record[key];
  return Array.isArray(value) ? value : [];
}

function getNumber(record: UnknownRecord, key: string): number | null {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parseCreatedTimestamp(status: UnknownRecord): number | null {
  const timestamp = getNumber(status, "created_timestamp");
  if (timestamp != null) return timestamp;

  const createdAt = getString(status, "created_at");
  if (!createdAt) return null;

  // v2の数値時刻が欠けた旧応答でも、画面上の投稿日時だけは復元できるようにする。
  const parsedTimestamp = Date.parse(createdAt);
  return Number.isFinite(parsedTimestamp) ? parsedTimestamp / 1_000 : null;
}

function parseVerificationBadge(author: UnknownRecord | null): TwitterVerificationBadge | null {
  if (!author) return null;

  const verification = asRecord(author.verification);
  if (!verification || verification.verified !== true) return null;

  const type = getString(verification, "type");
  if (type === "organization") {
    return { color: "gold", type };
  }
  if (type === "government") {
    return { color: "gray", type };
  }
  if (type === "individual") {
    return { color: "blue", type };
  }

  // APIが旧形式のverifiedだけを返す場合も、Xの通常認証色として表示を欠落させない。
  return { color: "blue", type: null };
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`FxTwitter APIが${timeoutMs}ms以内に応答しませんでした`)),
      timeoutMs,
    );
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}

function chooseVideoUrl(media: UnknownRecord): string | null {
  const directUrl = getString(media, "url") ?? getString(media, "transcode_url");
  if (directUrl) return directUrl;

  const formats = getArray(media, "formats")
    .map(asRecord)
    .filter((format): format is UnknownRecord => format != null)
    .filter((format) => getString(format, "container") === "mp4")
    .map((format) => ({
      url: getString(format, "url"),
      bitrate: typeof format.bitrate === "number" ? format.bitrate : 0,
    }))
    .filter((format): format is { url: string; bitrate: number } => format.url != null)
    .sort((left, right) => right.bitrate - left.bitrate);

  return formats[0]?.url ?? null;
}

function parseMediaItem(value: unknown): TwitterPostMedia | null {
  const media = asRecord(value);
  if (!media) return null;

  const type = getString(media, "type");
  if (type === "photo") {
    const url = getString(media, "url");
    return url
      ? {
          type: "image",
          url,
          altText: getString(media, "altText"),
        }
      : null;
  }

  if (type === "video" || type === "gif") {
    const url = chooseVideoUrl(media);
    return url
      ? {
          type: "video",
          url,
          posterUrl: getString(media, "thumbnail_url"),
          isGif: type === "gif",
        }
      : null;
  }

  return null;
}

function parseMedia(status: UnknownRecord): readonly TwitterPostMedia[] {
  const media = asRecord(status.media);
  if (!media) return [];

  const all = getArray(media, "all");
  const values =
    all.length > 0 ? all : [...getArray(media, "photos"), ...getArray(media, "videos")];
  return values.flatMap((value) => {
    const parsed = parseMediaItem(value);
    return parsed ? [parsed] : [];
  });
}

export function parseTwitterPostResponse(
  body: string,
  fallbackUrl: string,
  expectedPostId: string,
): TwitterPost {
  let payload: UnknownRecord;
  try {
    const parsed: unknown = JSON.parse(body);
    const record = asRecord(parsed);
    if (!record) throw new Error("FxTwitter APIの応答がオブジェクトではありません");
    payload = record;
  } catch (error) {
    throw new Error("FxTwitter APIが不正なJSONを返しました", { cause: error });
  }

  const code = typeof payload.code === "number" ? payload.code : null;
  if (code != null && (code < 200 || code >= 300)) {
    throw new Error(`FxTwitter APIが投稿を取得できませんでした（code: ${code}）`);
  }

  const status = asRecord(payload.status);
  if (!status) {
    throw new Error("FxTwitter APIの応答に投稿がありません");
  }
  if (getString(status, "type") !== "status") {
    const message = getString(status, "message") ?? "投稿が削除または非公開です";
    throw new Error(`FxTwitter APIの投稿を表示できません: ${message}`);
  }

  const id = getString(status, "id");
  if (id !== expectedPostId) {
    throw new Error("FxTwitter APIの投稿IDが要求と一致しません");
  }

  const author = asRecord(status.author);
  const translationRecord = asRecord(status.translation);
  const translationText = translationRecord ? getString(translationRecord, "text") : null;
  const translationSourceLang = translationRecord
    ? getString(translationRecord, "source_lang")
    : null;
  const translationTargetLang = translationRecord
    ? getString(translationRecord, "target_lang")
    : null;
  return {
    id,
    url: getString(status, "url") ?? fallbackUrl,
    text: getString(status, "text") ?? "",
    lang: getString(status, "lang"),
    translation:
      translationText && translationSourceLang && translationTargetLang
        ? {
            text: translationText,
            sourceLang: translationSourceLang,
            targetLang: translationTargetLang,
          }
        : null,
    createdTimestamp: parseCreatedTimestamp(status),
    source: getString(status, "source"),
    author: {
      name: author ? (getString(author, "name") ?? "Twitter/X") : "Twitter/X",
      screenName: author ? (getString(author, "screen_name") ?? "") : "",
      avatarUrl: author ? getString(author, "avatar_url") : null,
      verificationBadge: parseVerificationBadge(author),
    },
    metrics: {
      replies: getNumber(status, "replies"),
      // 現行v2のrepostsを優先しつつ、旧APIのretweetsも同じ指標として扱う。
      reposts: getNumber(status, "reposts") ?? getNumber(status, "retweets"),
      quotes: getNumber(status, "quotes"),
      likes: getNumber(status, "likes"),
      views: getNumber(status, "views"),
      bookmarks: getNumber(status, "bookmarks"),
    },
    media: parseMedia(status),
  };
}

function getDefaultFetch(): (
  url: string,
  headers: Record<string, string>,
) => Promise<TwitterPostHttpResponse> {
  return async (url, headers) => {
    // ブラウザのCORS制約とTauriのWebView制約を同じAPIで越えるため、通信はplatformへ委譲する。
    const { platform } = await import("src/app/platform");
    const response = await platform.http.fetch(url, {
      headers,
      timeout: FXTWITTER_API_REQUEST_TIMEOUT_MS,
    });
    return { status: response.status, body: response.body };
  };
}

export class TwitterPostResolver {
  private readonly fetcher: NonNullable<TwitterPostResolverOptions["fetch"]>;
  private readonly timeoutMs: number;
  private readonly logError: NonNullable<TwitterPostResolverOptions["logError"]>;
  private readonly cache = new Map<string, TwitterPost>();
  private readonly inFlight = new Map<string, Promise<TwitterPost | null>>();
  private readonly translationCache = new Map<string, TwitterPostTranslation>();
  private readonly translationInFlight = new Map<string, Promise<TwitterPostTranslation | null>>();

  constructor(options: TwitterPostResolverOptions = {}) {
    this.fetcher = options.fetch ?? getDefaultFetch();
    this.timeoutMs = options.timeoutMs ?? FXTWITTER_API_REQUEST_TIMEOUT_MS;
    this.logError = options.logError ?? ((message, error) => logger.error(message, { error }));
  }

  async resolve(rawUrl: string): Promise<TwitterPost | null> {
    const embed = toTwitterPostEmbed(rawUrl);
    if (!embed) return null;

    const cached = this.cache.get(embed.apiUrl);
    if (cached) return cached;

    const current = this.inFlight.get(embed.apiUrl);
    if (current) return current;

    const request = this.fetchPost(embed);
    this.inFlight.set(embed.apiUrl, request);
    try {
      return await request;
    } finally {
      this.inFlight.delete(embed.apiUrl);
    }
  }

  async translate(rawUrl: string, targetLang: string): Promise<TwitterPostTranslation | null> {
    const embed = toTwitterPostEmbed(rawUrl);
    if (!embed || !/^[a-z]{2}(?:-[a-z]{2})?$/i.test(targetLang)) return null;

    const cacheKey = `${embed.apiUrl}?lang=${targetLang.toLowerCase()}`;
    const cached = this.translationCache.get(cacheKey);
    if (cached) return cached;

    const current = this.translationInFlight.get(cacheKey);
    if (current) return current;

    const request = this.fetchPost(embed, targetLang.toLowerCase()).then((post) => {
      const translation = post?.translation;
      if (!translation || translation.targetLang.toLowerCase() !== targetLang.toLowerCase()) {
        return null;
      }
      this.translationCache.set(cacheKey, translation);
      return translation;
    });
    this.translationInFlight.set(cacheKey, request);
    try {
      return await request;
    } finally {
      this.translationInFlight.delete(cacheKey);
    }
  }

  private async fetchPost(
    embed: TwitterPostEmbed,
    targetLang?: string,
  ): Promise<TwitterPost | null> {
    try {
      const requestUrl = new URL(embed.apiUrl);
      if (targetLang) {
        // 変更理由: 翻訳は表示要求があった時だけ取得し、通常の投稿表示で追加通信を発生させない。
        requestUrl.searchParams.set("lang", targetLang);
      }
      const response = await withTimeout(
        this.fetcher(requestUrl.toString(), { Accept: "application/json" }),
        this.timeoutMs,
      );
      if (response.status < 200 || response.status >= 300) {
        throw new Error(`FxTwitter APIがHTTP ${response.status}を返しました`);
      }

      const post = parseTwitterPostResponse(response.body, embed.externalUrl, embed.postId);
      if (!targetLang) {
        this.cache.set(embed.apiUrl, post);
      }
      return post;
    } catch (error) {
      // 本文や認証情報はログへ出さず、投稿IDと原因だけを記録して元URLへのフォールバックを残す。
      this.logError(
        `[TwitterPostResolver] ${targetLang ? "投稿翻訳" : "投稿"}の取得に失敗しました: ${embed.postId}`,
        error,
      );
      return null;
    }
  }
}

export const twitterPostResolver = new TwitterPostResolver();
