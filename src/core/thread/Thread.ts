import {
  ChURL,
  executeThreadFetch,
  getBoardNetwork,
  getThreadArchiveFallbacks,
  getThreadXhrInfo,
  isHtmlThread,
  parseChThread,
  type ParsedThread,
  parseJbbsArchiveThread,
  parseJbbsThread,
  parseMachiThread,
  parseNetThread,
  parsePinkThread,
  parseThread,
  replaceBoardUrlServer,
  type ThreadRes,
  type ThreadResponse,
  toArchiveThreadUrl,
  type XhrInfo,
} from "packages/chlib/src/index";
import { createLogger } from "src/app/logger";
import { platform } from "src/app/platform";
import { chServerMoveDetect } from "src/core/board/ch-server-move-detect";
import { isMissingFromSubject, shouldForceSubjectCheck } from "src/core/board/SubjectPresence";
import type { CorePorts } from "src/core/ports/registry";
import type Cache from "src/core/storage/Cache.js";

const logger = createLogger("core/thread");

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface CachedResCount {
  resCount: number;
}

interface CachedInfoResult {
  status: string;
  cachedInfo?: CachedResCount;
}

interface ThreadFailure {
  response?: ThreadResponse;
  thread?: ParsedThread;
}

/** _prepareCache の戻り値 */
interface PrepareResult {
  hasCache: boolean;
  needFetch: boolean;
}

/** _updateCacheAfterFetch に渡すパラメータ */
interface UpdateCacheParams {
  cache: Cache;
  response: ThreadResponse | undefined;
  thread: ParsedThread;
  deltaFlg: boolean;
  isHtml: boolean;
  readcgiVer: number;
  noChangeFlg: boolean;
  hasCache: boolean;
  expired: boolean;
}

const isLegacySubjectPadding = (res: ThreadRes): boolean =>
  res.id == null &&
  res.name === "あぼーん" &&
  res.mail === "あぼーん" &&
  res.message === "あぼーん" &&
  res.other === "あぼーん";

const stripTrailingSubjectPadding = (thread: ParsedThread): ParsedThread => {
  let end = thread.res.length;
  while (end > 0 && isLegacySubjectPadding(thread.res[end - 1])) {
    end -= 1;
  }

  if (end === thread.res.length) {
    return thread;
  }

  // 変更理由: 以前はsubject.txtとの件数差を埋めた表示用レスまでparsedキャッシュへ保存していた。
  // 古いキャッシュを読み込む際に末尾の補填だけ戻し、差分取得の基準を実データへ戻す。
  return { ...thread, res: thread.res.slice(0, end) };
};

// ---------------------------------------------------------------------------
// Thread class
// ---------------------------------------------------------------------------

/**
 * @class Thread
 * @constructor
 * @param {String} url
 *
 * 設計方針:
 *   - get() はオーケストレーションのみ担当し、具体的な処理は private メソッドへ委譲する。
 *   - 通信・キャッシュ・パース・エラーメッセージ生成の責務をそれぞれ分離し、
 *     単体テストを書きやすくする。
 */
/** スレの取得・解析に必要なサービス。呼び出し側（ThreadService）が渡す。 */
export type ThreadDeps = Pick<
  CorePorts,
  "board" | "bbsMenu" | "bookmark" | "cache" | "config" | "message" | "util"
>;

export default class Thread {
  url: ChURL;
  title: string | null;
  res: ThreadRes[] | null;
  message: string | null;
  tsld: string;
  expired: boolean;
  missingFromSubject: boolean;

  constructor(
    url: string | ChURL,
    private readonly deps: ThreadDeps,
  ) {
    this.url = url instanceof ChURL ? url : new ChURL(url);
    this.title = null;
    this.res = null;
    this.message = null;
    this.tsld = this.url.getTsld();
    this.expired = false;
    this.missingFromSubject = false;
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  async get(
    forceUpdate?: boolean,
    progress: () => void = () => {},
    { throttleSubjectCheck = false }: { throttleSubjectCheck?: boolean } = {},
  ): Promise<void> {
    const format2chnet = this.deps.config.get("format_2chnet") as string | null | undefined;
    const xhrInfo = getThreadXhrInfo(this.url, format2chnet);

    if (!xhrInfo) {
      this.message = "対応していないURLです";
      return Promise.reject();
    }

    const { path: xhrBasePath, charset: xhrCharset } = xhrInfo;
    const isHtml = isHtmlThread(this.url, format2chnet);
    const cache = this.deps.cache.getCache(xhrBasePath) as Cache;

    const { hasCache, needFetch } = await this._prepareCache(
      cache,
      format2chnet,
      forceUpdate,
      progress,
    );

    let response: ThreadResponse | undefined;
    let thread: ParsedThread | undefined;
    let deltaFlg = false;
    let readcgiVer = 5;
    let noChangeFlg: boolean;
    let failed = false;
    let cachedInfoResult: CachedInfoResult | undefined;
    const cacheParsed = this._getCachedParsedThread(cache);
    // 新着判定の基準。キャッシュがない初回取得は比較対象がないため0件として扱う。
    const previousResCount = hasCache ? (cacheParsed?.res.length ?? cache.resLength ?? 0) : 0;
    // Bookmark.expiredも既存データとして残っているため、古いキャッシュからも復元する。
    this.expired = this.expired || this.deps.bookmark.get(this.url.url.href)?.expired === true;

    try {
      // --- フェッチ ---
      // 変更理由: 取得計画・通信・差分合成をMCPと同じ実行器に通し、
      // 呼び出し元ごとに挙動がずれるのを防ぐ。キャッシュ保存だけはアプリ側に残す。
      const executed = await executeThreadFetch(
        {
          tsld: this.tsld,
          isArchive: this.url.isArchive,
          isHtml,
          hasCache,
          basePath: xhrBasePath,
          cacheResLength: cache.resLength,
          cacheReadcgiVer: cache.readcgiVer,
          charset: xhrCharset,
          lastModified: cache.lastModified,
          etag: cache.etag,
          bbsType: this.url.bbsType,
          cacheData: cache.data,
          cacheParsed,
          url: this.url,
          format2chnet,
          parseThreadFn: parseThread,
        },
        needFetch
          ? {
              fetch: async (path, charset, headers) =>
                platform.http.fetch(path, {
                  method: "GET",
                  mimeType: `text/plain; charset=${charset}`,
                  headers: { ...headers },
                }),
            }
          : undefined,
        // 変更理由: 現行URLやキャッシュが使える場合は余計な通信をせず、通常取得が
        // HTTP・通信・解析のいずれかで失敗したときだけ過去ログ候補を試す。
        needFetch
          ? getThreadArchiveFallbacks(this.url).map(({ url, charset }) => ({
              path: url,
              charset,
            }))
          : [],
      );
      response = executed.response;
      deltaFlg = executed.plan.deltaFlg;
      readcgiVer = executed.plan.readcgiVer;
      const responseIsHtml = isHtml || executed.usedFallback === true;

      // --- レスポンス解析 ---
      const resolved = executed;
      thread = resolved.thread;
      noChangeFlg = resolved.noChangeFlg;

      if (!thread) {
        throw { response };
      }
      if (resolved.rejected) {
        throw { response, thread };
      }

      // --- あぼーん補填・インスタンスへの反映 ---
      // 変更理由: 本文でdat落ちを確定できた場合は、不要なsubject通信を始めない。
      cachedInfoResult =
        this.expired || response?.status === 203 || thread.expired === true
          ? { status: "none" }
          : await this._fetchCachedResCount(
              shouldForceSubjectCheck({
                threadUrl: this.url.url.href,
                forceUpdate: forceUpdate === true,
                throttle: throttleSubjectCheck,
                hasNewResponses: !noChangeFlg && thread.res.length > previousResCount,
              }),
            );
      const displayThread = this._padAbobunIfNeeded(thread, cachedInfoResult);
      const hadCachedExpiration = this.expired;
      this._applyThreadToSelf(displayThread);
      // 変更理由: datが200で取得できてもsubject消失後の過去ログである場合があるため、
      // 一度確認したexpiredは本文応答だけでは解除せず、再表示と強制更新をまたいで保持する。
      this.expired = this.expired || hadCachedExpiration || this.missingFromSubject;
      this.message = "";

      // 通常更新は画面返却を待たせないが、expired状態だけは再表示時のsubject省略に必要なので保存を待つ。
      const cacheUpdate = this._updateCacheAfterFetch({
        cache,
        response,
        thread,
        deltaFlg,
        isHtml: responseIsHtml,
        readcgiVer,
        noChangeFlg,
        hasCache,
        expired: this.expired,
      });
      const logCacheUpdateFailure = (error: unknown) => {
        logger.error("スレッドキャッシュの更新に失敗しました:", error);
      };
      if (this.expired) {
        // 変更理由: 次のThreadインスタンスがsubject照合を省けるよう、expired記録だけは返却前に永続化する。
        await cacheUpdate.catch(logCacheUpdateFailure);
      } else {
        void cacheUpdate.catch(logCacheUpdateFailure);
      }
    } catch (error: unknown) {
      const failure = typeof error === "object" && error != null ? (error as ThreadFailure) : {};
      response = failure.response;
      thread = failure.thread;

      const hasExplicitExpiration =
        response?.status === 203 || thread?.expired === true || this.expired;
      // 変更理由: 明示的な失効応答を優先し、subject.txtは未確定時だけ追加確認する。
      cachedInfoResult ??= hasExplicitExpiration
        ? { status: "none" }
        : await this._fetchCachedResCount(
            shouldForceSubjectCheck({
              threadUrl: this.url.url.href,
              forceUpdate: forceUpdate === true,
              throttle: throttleSubjectCheck,
              hasNewResponses: false,
            }),
          );
      this.missingFromSubject = isMissingFromSubject(cachedInfoResult.status);

      if (thread) {
        this.title = thread.title ?? null;
        this.res = thread.res;
      }
      this.message = await this._buildDomainErrorMessage({
        response,
        hasCache,
        thread,
      });
      // 変更理由: _buildDomainErrorMessage 内で thread.expired = true が設定される場合
      // （5ch.io の 203 など）があるため、インスタンス側にも伝播させる。
      // また、HTTP 203 はサーバーが明示的に dat 落ちを通知するステータスなので、
      // thread の有無にかかわらず expired とする。
      if (thread?.expired === true || response?.status === 203 || this.missingFromSubject) {
        this.expired = true;
      }
      failed = true;
    } finally {
      // 変更理由: 本文取得失敗時にも確認済み状態を残し、次回subject照合を省けるようにする。
      if (failed && this.expired) {
        this._markCacheExpired(cache);
        try {
          await cache.put();
        } catch (error: unknown) {
          logger.error("dat落ち状態のキャッシュ保存に失敗しました:", error);
        }
      }
      // ブックマーク更新は成否に関わらず実行する
      if (thread != null) {
        this.deps.bookmark.updateResCount(this.url.url.href, thread.res.length);
      }
      // サーバーシグナル(203) に加え、スレ一覧不在による dat 落ち判定でも expired 更新を行う
      if (response?.status === 203 || this.expired) {
        this.deps.bookmark.updateExpired(this.url.url.href, true);
      }
    }

    if (failed) {
      return Promise.reject();
    }
  }

  // -------------------------------------------------------------------------
  // Private: キャッシュ・フェッチ
  // -------------------------------------------------------------------------

  /**
   * 板スレ一覧からキャッシュされたレス数を取得する。
   * 本文取得で失効が確定せず、保存済み失効状態もない場合だけ呼び出す。
   */
  private async _fetchCachedResCount(forceUpdate: boolean): Promise<CachedInfoResult> {
    try {
      // getCachedResCount は文字列URLを受け取る契約。ChURL は toString() を持たないため、
      // インスタンスをそのまま渡すと "[object Object]" が URL として解釈され常に失敗していた。
      const cachedInfo = (await this.deps.board.getCachedResCount(this.url.url.href, {
        forceUpdate,
      })) as CachedResCount;
      return { status: "success", cachedInfo };
    } catch (error: unknown) {
      if (error instanceof Error && error.message === "板のスレ一覧にそのスレが存在しません") {
        return { status: "not_found" };
      }
      return { status: "none" };
    }
  }

  /**
   * キャッシュを読み込み、必要に応じてプログレスコールバックで中間表示する。
   *
   * - キャッシュが存在し有効期限内 → needFetch = false（通信スキップ）
   * - キャッシュが存在するが期限切れ → まず現キャッシュを表示してから needFetch = true
   * - キャッシュなし → hasCache = false, needFetch = true
   */
  private async _prepareCache(
    cache: Cache,
    format2chnet: string | null | undefined,
    forceUpdate: boolean | undefined,
    progress: () => void,
  ): Promise<PrepareResult> {
    this.expired = this.deps.bookmark.get(this.url.url.href)?.expired === true;
    try {
      await cache.get();
      const cachedParsed = cache.parsed as Partial<ParsedThread> | null;
      // 旧キャッシュにparsed.expiredが残っていれば新しい列と同じ状態として復元する。
      this.expired = this.expired || cache.expired === true || cachedParsed?.expired === true;
      const hasCachedThreadData =
        cache.data != null || (cachedParsed != null && Array.isArray(cachedParsed.res));
      if (!hasCachedThreadData) {
        // 変更理由: expiredメタだけのレコードを本文キャッシュと誤認すると、通信を省いて空表示になる。
        return { hasCache: false, needFetch: true };
      }
      const isFresh = !forceUpdate && Date.now() - (cache.lastUpdated ?? 0) <= 1000 * 3;
      if (isFresh) {
        return { hasCache: true, needFetch: false };
      }
      // キャッシュはあるが期限切れ: 現在のキャッシュをまず表示する
      await this.deps.util.defer();
      const tmp =
        cache.parsed != null
          ? this._getCachedParsedThread(cache)
          : parseThread(this.url, cache.data ?? "", { format2chnet });
      if (tmp != null) {
        this.res = tmp.res;
        this.title = tmp.title ?? null;
        progress();
      }
      return { hasCache: true, needFetch: true };
    } catch {
      return { hasCache: false, needFetch: true };
    }
  }

  // -------------------------------------------------------------------------
  // Private: スレッドへの後処理
  // -------------------------------------------------------------------------

  /** 古いparsedキャッシュから表示専用の末尾あぼーん補填を取り除く */
  private _getCachedParsedThread(cache: Cache): ParsedThread | undefined {
    if (cache.parsed == null || typeof cache.parsed !== "object") {
      return undefined;
    }

    const parsed = cache.parsed as ParsedThread;
    if (!Array.isArray(parsed.res)) {
      return undefined;
    }

    const normalized = stripTrailingSubjectPadding(parsed);
    if (normalized !== parsed) {
      cache.parsed = normalized;
      // 以前の補填件数をそのまま使うと、次のHTML差分取得の開始位置までずれる。
      cache.resLength = normalized.res.length;
    }
    return normalized;
  }

  /**
   * 板スレ一覧のレス数と突き合わせ、不足分をあぼーんで補填する。
   *
   * 変更理由: 件数差の補填とスレッド消失は別の判定なので、ここではsubject不在の
   * 信号だけを保持し、expiredの永続化は一覧の確認状態も含めて呼び出し側で判断する。
   */
  private _padAbobunIfNeeded(thread: ParsedThread, result: CachedInfoResult): ParsedThread {
    let displayThread = thread;
    // 変更理由: 末尾レスの削除をsubject.txtの件数で補う対策は、レス番号を本文から
    // 復元するしたらば・まちBBS向けのものだった。2ch系ではsubject.txtが本文より先に
    // 更新されることがあり、自動更新の途中で未取得の実レスを「あぼーん」と誤表示する。
    const supportsSubjectPadding = this.url.bbsType === "jbbs" || this.url.bbsType === "machi";
    if (supportsSubjectPadding && (result.status === "success" || result.status === "sucess")) {
      const missingCount = (result.cachedInfo?.resCount ?? 0) - thread.res.length;
      if (missingCount > 0) {
        // 変更理由: subject.txtの件数は表示補助情報であり、補填レスを本体キャッシュへ混ぜると
        // 次回読み込みで一瞬だけ誤った「あぼーん」が表示されるため、表示用の配列だけ複製する。
        displayThread = {
          ...thread,
          res: [
            ...thread.res,
            ...Array.from({ length: missingCount }, () => ({
              name: "あぼーん",
              mail: "あぼーん",
              message: "あぼーん",
              other: "あぼーん",
            })),
          ],
        };
      }
    }
    // 変更理由: subject.txt 不在を expired と同一視すると、コアの dat 落ち判定が
    // 不正確になるため、画面側が自動更新停止の要否を選べる独立した状態として保持する。
    this.missingFromSubject = isMissingFromSubject(result.status);
    return displayThread;
  }

  /** パース済みスレッドの内容をインスタンスフィールドに反映する */
  private _applyThreadToSelf(thread: ParsedThread): void {
    this.title = thread.title ?? null;
    this.res = thread.res;
    // 変更理由: `!= null` はプロパティの存在チェックであり、`expired: false` でも
    // true と判定されてしまう。明示的に true が設定されている場合のみ dat 落ちとみなす。
    this.expired = thread.expired === true;
  }

  // -------------------------------------------------------------------------
  // Private: キャッシュ更新
  // -------------------------------------------------------------------------

  /**
   * フェッチ成功後のキャッシュ更新を行う。
   * 通常時はfire-and-forgetで呼ぶが、expiredを確定したときは永続化完了を待つ。
   */
  private async _updateCacheAfterFetch({
    cache,
    response,
    thread,
    deltaFlg,
    isHtml,
    readcgiVer,
    noChangeFlg,
    hasCache,
    expired,
  }: UpdateCacheParams): Promise<void> {
    if (response?.status === 200 || (readcgiVer >= 6 && response?.status === 500)) {
      cache.lastUpdated = Date.now();
      cache.expired = expired;

      if (isHtml && response) {
        const detectedVer = this._extractReadcgiVer(response.body);
        readcgiVer = detectedVer ?? readcgiVer;

        if (thread.expired) {
          this.deps.bookmark.updateExpired(this.url.url.href, true);
        }
      }

      if (deltaFlg) {
        if (isHtml && !noChangeFlg) {
          cache.parsed = thread;
          cache.readcgiVer = readcgiVer;
        } else if (!noChangeFlg && response) {
          cache.data = (cache.data ?? "") + response.body;
        }
      } else {
        if (isHtml) {
          cache.parsed = thread;
          cache.readcgiVer = readcgiVer;
        } else if (response) {
          cache.data = response.body;
        }
      }

      cache.resLength = thread.res.length;

      if (response) {
        const lastModified = new Date(response.headers?.["Last-Modified"] || "dummy").getTime();
        if (Number.isFinite(lastModified)) {
          cache.lastModified = lastModified;
        }
        const etag = response.headers?.["ETag"];
        if (etag) {
          cache.etag = etag;
        }
      }

      // 変更理由: 閲覧ログとして恒久保存できるよう、スレのメタ情報を付与する。
      this._applyLogMetadata(cache, thread);
      await cache.put();
      this._notifyLogUpdated();
    } else if (hasCache && response?.status === 304) {
      cache.lastUpdated = Date.now();
      cache.expired = expired;
      // 304(変化なし)でもログのメタを最新化しておく（kind 未設定の旧キャッシュ救済）。
      this._applyLogMetadata(cache, thread);
      await cache.put();
      this._notifyLogUpdated();
    }
  }

  /**
   * キャッシュにログ用のメタ情報（スレタイ・板URL・種別）を付与する。
   * 閲覧したスレは常にログとして恒久保存する（kind="thread"）。
   */
  private _applyLogMetadata(cache: Cache, thread: ParsedThread): void {
    cache.title = thread.title ?? cache.title ?? "";
    // url(キャッシュキー)は dat パスのため、スレ再表示用の URL を別途保存する。
    cache.threadUrl = this.url.url.href;
    try {
      cache.boardUrl = this.url.toBoard().url.href;
    } catch {
      // toBoard() はスレURL以外で例外。その場合は板URLを空のままにする。
    }
    cache.kind = "thread";
  }

  /** 本文がなくても初回の明示失効を保存できるメタレコードを用意する。 */
  private _markCacheExpired(cache: Cache): void {
    cache.expired = true;
    const parsedThread = cache.parsed as Partial<ParsedThread> | null;
    const hasThreadData =
      cache.data != null || (parsedThread != null && Array.isArray(parsedThread.res));
    if (!hasThreadData) {
      // 変更理由: 本文なしの状態レコードは閲覧ログに出さず、Thread.getでは必ず本文を再取得する。
      cache.data = null;
      cache.parsed = null;
      cache.kind = "thread_state";
      cache.lastUpdated = Date.now();
      cache.threadUrl = this.url.url.href;
      cache.title = this.title ?? "";
      try {
        cache.boardUrl = this.url.toBoard().url.href;
      } catch {
        // 板URLを組み立てられない場合も、expiredの状態自体は保存する。
      }
    } else if (cache.lastUpdated == null) {
      cache.lastUpdated = Date.now();
    }
  }

  /** ログ一覧へ更新を通知する（一覧側で再読込させる）。 */
  private _notifyLogUpdated(): void {
    this.deps.message.send("log_updated", { url: this.url.url.href });
  }

  /**
   * レスポンスボディから read.cgi のバージョン番号を抽出する。
   * 見つからない場合は null を返す。
   */
  private _extractReadcgiVer(body: string): number | null {
    const marker = '<div class="footer push">read.cgi ver ';
    const idx = body.indexOf(marker);
    if (idx === -1) return null;
    const ver = parseInt(body.substr(idx + marker.length, 2));
    return Number.isNaN(ver) ? null : ver;
  }

  // -------------------------------------------------------------------------
  // Private: エラーメッセージ生成
  // -------------------------------------------------------------------------

  /**
   * ドメイン別のエラーメッセージを生成するエントリポイント。
   * tsld によってドメイン固有の処理に振り分ける。
   */
  private async _buildDomainErrorMessage({
    response,
    hasCache,
    thread,
  }: {
    response: ThreadResponse | undefined;
    hasCache: boolean;
    thread: ParsedThread | undefined;
  }): Promise<string> {
    // 変更理由: ホスト名ごとの通信仕様をURL文字列比較で分岐せず、chlibの分類を使う。
    if (getBoardNetwork(this.url.url) === "5ch" && response) {
      return this._build5chioErrorMessage({ response, hasCache, thread });
    }
    if (getBoardNetwork(this.url.url) === "shitaraba" && !this.url.isArchive) {
      return this._buildShitarabaErrorMessage(response);
    }
    return this._buildDefaultErrorMessage({ hasCache, thread });
  }

  /**
   * 5ch.io 向けエラーメッセージ。
   * サーバー移転検出を試み、移転先 URL をメッセージに含める。
   */
  private async _build5chioErrorMessage({
    response,
    hasCache,
    thread,
  }: {
    response: ThreadResponse;
    hasCache: boolean;
    thread: ParsedThread | undefined;
  }): Promise<string> {
    let message = "";
    try {
      const newBoardURL = await chServerMoveDetect(this.url.toBoard(), this.deps);
      const movedUrl = replaceBoardUrlServer(this.url, newBoardURL);
      if (movedUrl === null) throw new Error("移転先のスレッドURLを作成できませんでした");
      const newUrl = new ChURL(movedUrl);
      // 変更理由: 旧表示URLは移転先ホストだけを差し替え、元の通信schemeを維持していた。
      newUrl.protocol = this.url.protocol;
      const href = this.deps.util.escapeHtml(this.deps.util.safeHref(newUrl.href));
      const label = this.deps.util.escapeHtml(newUrl.href);
      message += `スレッドの読み込みに失敗しました。\nサーバーが移転している可能性が有ります\n(<a href="${href}" class="open_in_rcrx">${label}</a>)`;
    } catch {
      if (response.status === 203) {
        message += "dat落ちしたスレッドです。";
        if (thread) thread.expired = true;
      } else {
        message += "スレッドの読み込みに失敗しました。";
      }
    }
    if (hasCache && !thread) {
      message += "キャッシュに残っていたデータを表示します。";
    }
    return message;
  }

  /**
   * したらば向けエラーメッセージ。
   * レスポンスの error ヘッダーによって詳細なメッセージを付加する。
   */
  private _buildShitarabaErrorMessage(response: ThreadResponse | undefined): string {
    let message = "スレッドの読み込みに失敗しました。";
    const errorHeader = response?.headers?.error;
    if (errorHeader == null) return message;

    switch (errorHeader) {
      case "BBS NOT FOUND":
        message += "\nURLの掲示板番号が間違っています。";
        break;
      case "KEY NOT FOUND":
        message += "\nURLのスレッド番号が間違っています。";
        break;
      case "THREAD NOT FOUND":
        message +=
          "\n該当するスレッドは存在しません。\nURLが間違っているか過去ログに移動せずに削除されています。";
        break;
      case "STORAGE IN": {
        // 変更理由: 過去ログURLのパス形式はchlibで一元管理し、表示側は変換結果だけを使う。
        const newUrl = toArchiveThreadUrl(this.url.url.href) ?? this.url.url.href;
        const href = this.deps.util.escapeHtml(this.deps.util.safeHref(newUrl));
        const label = this.deps.util.escapeHtml(newUrl);
        message += `\n過去ログが存在します\n(<a href="${href}" class="open_in_rcrx">${label}</a>)`;
        break;
      }
    }
    return message;
  }

  /** デフォルトのエラーメッセージ（ドメイン固有処理なし） */
  private _buildDefaultErrorMessage({
    hasCache,
    thread,
  }: {
    hasCache: boolean;
    thread: ParsedThread | undefined;
  }): string {
    let message = "スレッドの読み込みに失敗しました。";
    if (hasCache && !thread) {
      message += "キャッシュに残っていたデータを表示します。";
    }
    return message;
  }

  // -------------------------------------------------------------------------
  // Static helpers (変更なし)
  // -------------------------------------------------------------------------

  static _getXhrInfo(url: ChURL, deps: ThreadDeps): XhrInfo | null {
    return getThreadXhrInfo(url, deps.config.get("format_2chnet"));
  }

  static parse(
    url: ChURL,
    text: string,
    deps: ThreadDeps,
    resLength?: number,
  ): ParsedThread | null {
    return parseThread(url, text, {
      format2chnet: deps.config.get("format_2chnet"),
      resLength,
    });
  }

  static _parseNet(text: string): ParsedThread | null {
    return parseNetThread(text);
  }

  static _parseCh(text: string): ParsedThread | null {
    return parseChThread(text);
  }

  static _parseMachi(text: string): ParsedThread | null {
    return parseMachiThread(text);
  }

  static _parseJbbs(text: string): ParsedThread | null {
    return parseJbbsThread(text);
  }

  static _parseJbbsArchive(text: string): ParsedThread | null {
    return parseJbbsArchiveThread(text);
  }

  static _parsePink(text: string, resLength?: number): ParsedThread | null {
    return parsePinkThread(text, resLength);
  }
}
