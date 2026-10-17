import { ChURL, createSikiGuardRequestUrl } from "packages/chlib/src/index";
import { createLogger } from "src/app/logger";
import { Request } from "src/core/network/HTTP.ts";
import Cache from "src/core/storage/Cache.js";

const logger = createLogger("core/thread");

interface SikiGuardCacheError {
  idMap?: Map<string, Set<string>>;
}

// 移行理由: SikiGuardの通信・キャッシュ・返却値の既存契約を保ったまま、データ形状を型で固定する。
export default class SikiGuard {
  url: ChURL;
  idMap: Map<string, Set<string>>;
  message: string | null;

  constructor(url: string) {
    this.url = new ChURL(url);
    this.idMap = new Map();
    this.message = null;
  }

  async get(): Promise<void> {
    let response: Awaited<ReturnType<Request["send"]>> | undefined;
    let idMap: Map<string, Set<string>> | undefined;
    let hasCache = false;

    const requestUrl = createSikiGuardRequestUrl(this.url.href);
    if (requestUrl == null) {
      this.idMap = new Map();
      return;
    }

    const cache = new Cache(requestUrl);
    let needFetch = false;
    try {
      await cache.get();
      hasCache = true;
      // lastUpdated が null のときは従来 NaN 比較で「期限切れ」扱いになる。
      if (cache.lastUpdated == null || !(Date.now() - cache.lastUpdated < 1000 * 60 * 30)) {
        throw new Error("キャッシュの期限が切れているため通信します");
      }
    } catch {
      needFetch = true;
    }

    try {
      if (needFetch) {
        const request = new Request("GET", requestUrl, { preventCache: true });
        if (hasCache) {
          if (cache.lastModified != null) {
            request.headers["If-Modified-Since"] = new Date(cache.lastModified).toUTCString();
          }
          if (cache.etag != null) {
            request.headers["If-None-Match"] = cache.etag;
          }
        }
        response = await request.send();
      }

      const responseStatus = response?.status;
      if (response != null && responseStatus === 200) {
        idMap = SikiGuard.parse(response.body);
      } else if (hasCache) {
        // cache.data は型上 null になり得る。空文字の解析結果は旧実装と同じ空Mapになる。
        idMap = SikiGuard.parse(cache.data ?? "");
      } else if (responseStatus === 404) {
        // NG対象がない場合404が返ってくる。
        idMap = new Map();
      }

      if (idMap == null) {
        throw { response };
      }
      // 等価比較を使い、undefined でも安全に旧判定の意図を保つ。
      if (!(responseStatus === 200 || responseStatus === 404) && (response != null || !hasCache)) {
        throw { response, idMap };
      }

      this.idMap = idMap;
      if (response != null && response.status === 200) {
        cache.data = response.body;
        cache.lastUpdated = Date.now();

        const lastModified = new Date(response.headers["Last-Modified"] || "dummy").getTime();
        if (Number.isFinite(lastModified)) {
          cache.lastModified = lastModified;
        }

        const etag = response.headers["ETag"];
        if (etag) {
          cache.etag = etag;
        }
        void cache.put();
      }
    } catch (error: unknown) {
      logger.error("読み込みに失敗しました:", error);
      // 旧実装は失敗時にエラー理由を公開しないため、呼び出し側との契約を保つ。
      const caught =
        typeof error === "object" && error !== null ? (error as SikiGuardCacheError) : {};
      idMap = caught.idMap;
      this.message = "Siki Guardの読み込みに失敗しました。";

      if (hasCache && idMap != null) {
        this.message += "キャッシュに残っていたデータを使用します。";
      }
      if (idMap != null) {
        this.idMap = idMap;
      }
      return Promise.reject();
    }
  }

  static async get(
    url: string,
  ): Promise<
    | { status: "success"; data: Map<string, Set<string>> }
    | { status: "error"; message: string | null; data: Map<string, Set<string>> }
  > {
    const board = new SikiGuard(url);
    try {
      await board.get();
      return { status: "success", data: board.idMap };
    } catch {
      // 変更理由: インスタンス側の get が失敗原因を詳細にログ出力してから理由なしで reject するため、
      // ここで再度ログを出すと中身が undefined の重複ログになり、通信失敗も「解析失敗」と誤表示していた。
      return {
        status: "error",
        message: board.message != null ? board.message : null,
        data: board.idMap !== null ? board.idMap : new Map(),
      };
    }
  }

  static parse(text: string): Map<string, Set<string>> {
    try {
      // JSON.parse は any を返すため、結果形状を限定して型を追跡可能にする。
      const { result } = JSON.parse(text) as { result: Record<string, string[]> };
      const idMap = new Map<string, Set<string>>();
      Object.keys(result).forEach((key) => {
        idMap.set(
          `20${key.slice(0, 2)}/${key.slice(2, 4)}/${key.slice(4)}`,
          new Set(result[key].map((id) => `ID:${id}`)),
        );
      });
      return idMap;
    } catch {
      // 不正なキャッシュや応答は旧実装と同じく空のNG一覧として扱う。
      return new Map();
    }
  }
}
