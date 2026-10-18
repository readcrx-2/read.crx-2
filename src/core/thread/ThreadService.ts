import { toCanonicalThread } from "packages/chlib/src/index";
import type { ThreadRes } from "packages/chlib/src/parser/ThreadParser";
import { createLogger } from "src/app/logger";
import { evaluateThreadNg } from "src/core/ng/ThreadNgEvaluator";
import type { CorePorts } from "src/core/ports/registry";
import type { IRes, IThreadDetail, IThreadService } from "src/core/ports/thread";
import type { ReplaceStrTxt } from "src/core/thread/ReplaceStrTxt";
import Thread from "src/core/thread/Thread";
import { toViewRes } from "src/core/thread/to-view-res";

const logger = createLogger("core/thread");

// 移行理由: 取得集約と置換処理の既存契約を保ちつつ、要求状態と返却モデルを明示的な型で管理する。
interface GetThreadOptions {
  forceUpdate?: boolean;
  throttleSubjectCheck?: boolean;
  onCache?: (thread: IThreadDetail) => void;
}

interface PendingRequest {
  started: boolean;
  forceUpdate: boolean;
  manualForceUpdate: boolean;
  callbacks: Set<(thread: IThreadDetail) => void>;
  lastCacheResult?: IThreadDetail;
  promise: Promise<IThreadDetail>;
}

/** 自動更新ではない強制取得か。 */
const isManualForceUpdate = (options: GetThreadOptions): boolean =>
  options.forceUpdate === true && options.throttleSubjectCheck !== true;

/** スレ取得の集約と判定に必要なサービス。呼び出し側が渡す（C-2）。 */
export type ThreadServiceDeps = Pick<
  CorePorts,
  "board" | "bbsMenu" | "bookmark" | "cache" | "config" | "message" | "ng" | "util"
> & { replaceStr: Pick<ReplaceStrTxt, "replace"> };

class ThreadServiceImpl implements IThreadService {
  private pendingRequests = new Map<string, PendingRequest>();

  constructor(private readonly deps: ThreadServiceDeps) {}

  async getThread(url: string, options: GetThreadOptions = {}): Promise<IThreadDetail> {
    const existingRequest = this.pendingRequests.get(url);
    if (
      existingRequest &&
      (!existingRequest.started ||
        !options.forceUpdate ||
        (existingRequest.forceUpdate &&
          // 開始済みの自動更新へ手動更新を合流させると、subject.txtを確認できない。
          (existingRequest.manualForceUpdate || !isManualForceUpdate(options))))
    ) {
      // 変更理由: スレ本文と勢い表示は同じ更新世代で同一URLを要求するため、
      // 通信開始前なら強いforceUpdateへまとめ、開始後も条件を弱めない要求だけを共有する。
      existingRequest.forceUpdate ||= options.forceUpdate === true;
      // 自動更新と手動更新が合流した場合は、利用者の操作を優先してsubject.txtを確認する。
      existingRequest.manualForceUpdate ||= isManualForceUpdate(options);
      if (options.onCache) {
        existingRequest.callbacks.add(options.onCache);
        if (existingRequest.lastCacheResult) {
          try {
            options.onCache(existingRequest.lastCacheResult);
          } catch (error) {
            // 遅れて合流した表示先の例外でも、共有中の取得結果は他の利用者へ返し続ける。
            logger.error("キャッシュ通知に失敗しました:", error);
          }
        }
      }
      return existingRequest.promise;
    }

    const request: PendingRequest = {
      started: false,
      forceUpdate: options.forceUpdate === true,
      manualForceUpdate: isManualForceUpdate(options),
      callbacks: new Set(options.onCache ? [options.onCache] : []),
      // 同じReact effect処理内の要求をmicrotaskまで集め、後から来たforceUpdateも
      // 最初の通信へ反映して、呼び出し順により二重取得へ戻らないようにする。
      // 変更理由: nullを一時値としてPromise型へキャストすると、型契約と実値が矛盾する。
      // Promiseのコールバックはmicrotaskで実行されるため、生成時から完全なPromiseを保持できる。
      promise: Promise.resolve()
        .then(async () => {
          request.started = true;
          return await this._fetchThread(url, request);
        })
        .finally(() => {
          // 開始済みの通常取得と後発の強制取得が並行した場合、後発の管理情報を消さない。
          if (this.pendingRequests.get(url) === request) {
            this.pendingRequests.delete(url);
          }
        }),
    };
    this.pendingRequests.set(url, request);
    return request.promise;
  }

  private async _fetchThread(url: string, request: PendingRequest): Promise<IThreadDetail> {
    const thread = new Thread(url, this.deps);
    const progress = (): void => {
      const result = this._formatResult(thread);
      request.lastCacheResult = result;
      for (const callback of request.callbacks) {
        try {
          callback(result);
        } catch (error) {
          // 一つの表示先の例外で他の購読先やスレ取得自体を止めない。
          logger.error("キャッシュ通知に失敗しました:", error);
        }
      }
    };

    try {
      await thread.get(request.forceUpdate, progress, {
        throttleSubjectCheck: !request.manualForceUpdate,
      });
      return this._formatResult(thread);
    } catch (error) {
      // 変更理由: 取得失敗時もキャッシュ結果を返す従来動作を保ちつつ、原因を追跡可能にする。
      logger.error("thread fetch failed:", error);
      const result = this._formatResult(thread);
      result.message = thread.message || "スレッドの取得に失敗しました";
      return result;
    }
  }

  private _formatResult(thread: Thread): IThreadDetail {
    // Threadのキャッシュ形式はHTML差分合成が使うため維持し、NG判定前に共有モデルへ正規化する。
    const title = thread.title || "";
    const url = thread.url.url.href;
    // 置換ルールは名前・日付からのID/Slip抽出より前に適用する（旧ThreadModelと同じ順序）。
    // 変更理由: 旧経路の置換適用がThreadModelと共に使われなくなり、置換設定が無効化されていたため。
    const replacedRes = (thread.res ?? []).map((response: ThreadRes) => ({
      ...response,
      ...this.deps.replaceStr.replace(url, title, response),
    }));
    const canonicalThread = toCanonicalThread({
      title: thread.title || undefined,
      res: replacedRes,
    });
    const parsedResponses = canonicalThread.posts.map(toViewRes);
    // 自動NG（連鎖・ID無し等）は、全レスを見渡せるこの時点で一括して行う。
    const ngResults = evaluateThreadNg(parsedResponses, { title, url }, this.deps);

    return {
      url,
      // 取得失敗時は旧実装どおりnullになり得るため、サービス契約側でもnullableとして扱う。
      title: thread.title,
      // 返信数や連鎖NGは後続レスにも依存するため、全レスの索引を作ってから判定結果を載せる。
      res: parsedResponses.map((response: IRes) => ({
        ...response,
        ng: ngResults.get(response.num),
      })),
      expired: !!thread.expired,
      missingFromSubject: !!thread.missingFromSubject,
    };
  }
}

/** 取得集約の状態を持つ、スレ取得サービスを作る。状態は作成したインスタンスごとに分かれる。 */
export function createThreadService(deps: ThreadServiceDeps): IThreadService {
  return new ThreadServiceImpl(deps);
}
