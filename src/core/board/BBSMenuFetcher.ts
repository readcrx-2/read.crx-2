import {
  BBSMenuHtmlParser,
  buildBBSMenuFetchPolicy,
  type ParsedBBSMenu,
  resolveBBSMenuResponse,
} from "packages/chlib/src/index";
import { createLogger } from "src/app/logger";
import { Request } from "src/core/network/HTTP";
import type { ICacheItem } from "src/core/ports/cache";

const logger = createLogger("BBSMenuFetcher");

export interface IFetcherDeps {
  getCache(url: string): ICacheItem;
  getExcludeTslds(): Set<string>;
}

// レスポンス型（Request.send() の戻り値に合わせて調整すること）
type HttpResponse = Awaited<ReturnType<InstanceType<typeof Request>["send"]>>;

// -------------------------------
// BBSMenuFetcher
// -------------------------------

/**
 * 単一URLからBBSMenuを取得する責務を担うクラス。
 * キャッシュ判定・HTTPリクエスト・キャッシュ更新を行う。
 */
export class BBSMenuFetcher {
  constructor(private readonly deps: IFetcherDeps) {}

  async getCached(url: string): Promise<ParsedBBSMenu | null> {
    // ホームの板名表示では、キャッシュがなくても通信や条件付きGETへ進まない。
    const cache = this.deps.getCache(url);
    if (!(await this.tryLoadCache(cache))) return null;
    return this.resolveMenu(url, cache, undefined);
  }

  /**
   * 指定URLからBBSMenuを取得する。
   *
   * - キャッシュが存在し、force=false → キャッシュから返す
   * - キャッシュ未存在 / force=true  → HTTP通信し結果を返す
   *   - 304 の場合は lastUpdated だけ更新してキャッシュデータを返す
   */
  async fetch(url: string, force = false): Promise<ParsedBBSMenu> {
    const cache = this.deps.getCache(url);

    logger.debug(`Cache を確認します: ${url}`, { cache });

    const cacheLoaded = await this.tryLoadCache(cache);
    // Why: bbsmenu_update_interval 設定を廃止し、期限切れ判定では再取得しない。
    // 明示的な force 更新時のみHTTPへ行くことで挙動を単純化する。
    const shouldFetch = !cacheLoaded || force;

    logger.debug(`Fetching BBSMenu from ${url}`, {
      force,
      cacheLoaded,
      shouldFetch,
      cacheLastUpdated: cache.lastUpdated,
    });

    const response = shouldFetch
      ? await this.sendRequest(url, cacheLoaded ? cache : undefined)
      : undefined;

    return this.resolveMenu(url, cache, response);
  }

  // -------------------------------
  // Private helpers
  // -------------------------------

  /** キャッシュのロードを試みる。失敗またはデータが空の場合は false を返す。 */
  private async tryLoadCache(cache: ICacheItem): Promise<boolean> {
    try {
      await cache.get();
      const loaded = cache.data != null;
      // get() が例外なく完了しても data が未設定の場合はキャッシュなしと扱う
      if (!loaded) {
        logger.debug("キャッシュは存在するが data が null");
      }
      return loaded;
    } catch (e) {
      logger.debug("キャッシュ読み込み失敗", { error: String(e) });
      return false;
    }
  }

  /**
   * 条件付き GET リクエストを送信する。
   * キャッシュが存在する場合は If-Modified-Since / If-None-Match を付与する。
   */
  private async sendRequest(url: string, cache: ICacheItem | undefined): Promise<HttpResponse> {
    // 変更理由: 文字コードと条件付きGETはbbsmenuの取得仕様としてchlibで決め、
    // この層はアプリのHTTPクライアントへ要求を渡すことに専念する。
    const policy = buildBBSMenuFetchPolicy({
      hasCache: cache != null,
      lastModified: cache?.lastModified,
      etag: cache?.etag,
    });
    const request = new Request("GET", url, {
      mimeType: `text/plain; charset=${policy.charset}`,
    });
    Object.assign(request.headers, policy.headers);

    logger.debug("HTTP通信します", { url });
    return request.send();
  }

  /**
   * レスポンス（または undefined）とキャッシュからメニューを解決する。
   * 200/304/キャッシュ利用の判定はchlibのresolveBBSMenuResponseに任せ、
   * ここではキャッシュの書き戻しと解析だけを行う。
   */
  private async resolveMenu(
    url: string,
    cache: ICacheItem,
    response: HttpResponse | undefined,
  ): Promise<ParsedBBSMenu> {
    const resolution = resolveBBSMenuResponse({ response, cachedBody: cache.data ?? null });
    // 従来どおり、解析してから保存する（解析で例外が出た本文はキャッシュへ残さない）。
    const menu = BBSMenuHtmlParser.parse(resolution.body, url, this.deps.getExcludeTslds());

    if (resolution.kind === "fresh") {
      await cache.put(resolution.body, {
        lastModified: resolution.lastModified,
        etag: resolution.etag,
      });
    } else if (resolution.kind === "not-modified") {
      logger.debug("304 Not Modified: キャッシュを更新します");
      await cache.put(resolution.body);
    }

    return menu;
  }
}
