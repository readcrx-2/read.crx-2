/**
 * HTTPで指定されたGETを、HTTPSへ切り替えるかどうかの方針。
 * - https_only: HTTPSだけで接続し、HTTPへは戻さない。
 * - https_first: HTTPSを先に試し、TLS接続に失敗した場合だけ元のHTTPへ戻す。
 * - auto: URLのとおりに接続し、HTTPSへ切り替えない。
 */
export type HttpsMode = "https_only" | "https_first" | "auto";

export const DEFAULT_HTTPS_MODE: HttpsMode = "https_first";

/** 保存値が未設定・不正なときは、従来の挙動（HTTPS優先）に戻す。 */
export function normalizeHttpsMode(value: unknown): HttpsMode {
  return value === "https_only" || value === "https_first" || value === "auto"
    ? value
    : DEFAULT_HTTPS_MODE;
}

/**
 * GETはHTTP指定でもHTTPSを先に試し、TLS接続に失敗した場合だけ元のURLへ戻す。
 * 変更理由: 平文通信を避けつつ、HTTPS非対応の掲示板は従来どおり読めるようにする。
 * mode で、HTTPへ戻さない（https_only）か、切り替え自体をしない（auto）かを選べる。
 */
export async function fetchHttpsFirst<T extends { status: number }>(
  url: string,
  method: string | undefined,
  fetchUrl: (url: string) => Promise<T>,
  headers?: Readonly<Record<string, string>>,
  mode: HttpsMode = DEFAULT_HTTPS_MODE,
): Promise<T> {
  if (mode === "auto") return fetchUrl(url);
  if ((method ?? "GET").toUpperCase() !== "GET") return fetchUrl(url);

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return fetchUrl(url);
  }
  if (parsedUrl.protocol !== "http:") return fetchUrl(url);

  parsedUrl.protocol = "https:";
  try {
    return await fetchUrl(parsedUrl.href);
  } catch (error) {
    // HTTPSだけを使う設定では、平文での再試行をしない。
    if (mode === "https_only") throw error;

    const hasSensitiveHeader = Object.keys(headers ?? {}).some((name) =>
      ["authorization", "cookie"].includes(name.toLowerCase()),
    );
    if (hasSensitiveHeader) throw error;

    if (
      (typeof DOMException !== "undefined" &&
        error instanceof DOMException &&
        error.name === "AbortError") ||
      (typeof error === "string" && /abort/i.test(error))
    ) {
      throw error;
    }

    // 変更理由: HTTPへの再試行はHTTPS接続自体ができない場合だけに限定し、
    // HTTPSで拒否された要求や認証情報を平文で再送しない。
    console.warn("HTTPS接続に失敗したため、元のHTTP URLで再試行します", error);
    return fetchUrl(url);
  }
}
