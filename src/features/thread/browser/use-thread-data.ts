import {
  type Dispatch,
  type RefObject,
  type SetStateAction,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { evaluateThreadNg } from "src/core/ng/ThreadNgEvaluator";
import {
  useIsNgTemporarilyDisabled,
  useNgDisplayMode,
} from "src/features/ng/browser/use-ng-status";
import type { ThreadRefreshController } from "src/features/thread/browser/use-thread-refresh-controller";
import { container } from "src/service-container/index";
import type { IRes, IThreadDetail } from "src/service-container/interfaces";
import { useToast } from "src/view/browser/hooks/use-toast";
import { tabActions } from "src/view/browser/state/tabs/tab-store-actions";
import { useTabDispatch, useTabViewState } from "src/view/browser/state/tabs/use-tab-store";
import type {
  ThreadFilter,
  ThreadPage as ThreadPageType,
  ThreadSearchTarget,
} from "src/view/browser/types";
import {
  captureRootSelection,
  restoreRootSelection,
  type RootSelectionSnapshot,
} from "src/view/browser/utils/dom-selection";
import {
  consumeManualRefresh,
  getManualRefreshScopeKey,
} from "src/view/browser/utils/manual-refresh";
import { normalizePopularReplyThreshold } from "src/view/browser/utils/popular-filter";
import { getImportedSikiThread, isSikiLogThreadUrl } from "src/view/browser/utils/siki-log";
import {
  getThreadResponseCache,
  setThreadResponseCache,
} from "src/view/browser/utils/thread-data-cache";
import { deriveThreadData } from "src/view/browser/utils/thread-data-derived";
import { buildIndexes } from "src/view/browser/utils/thread-index";
import { stripTrailingSyntheticAbobunResponses } from "src/view/browser/utils/thread-response-cache";

interface FetchThreadOptions {
  /** 自動更新由来の取得では、dat落ち確認のsubject.txt取得を間引く */
  throttleSubjectCheck?: boolean;
}

interface ThreadData {
  responses: IRes[];
  visibleResponses: IRes[];
  loading: boolean;
  isInitialLoading: boolean;
  isCacheResolved: boolean;
  error: string | null;
  expired: boolean;
  missingFromSubject: boolean;
  indexes: ReturnType<typeof buildIndexes>;
  filteredResponses: IRes[];
  filter: ThreadFilter;
  setFilter: Dispatch<SetStateAction<ThreadFilter>>;
  searchTarget: ThreadSearchTarget;
  setSearchTarget: Dispatch<SetStateAction<ThreadSearchTarget>>;
  searchQuery: string;
  setSearchQuery: Dispatch<SetStateAction<string>>;
  showSearch: boolean;
  setShowSearch: Dispatch<SetStateAction<boolean>>;
  fetchThread: (forceUpdate?: boolean, options?: FetchThreadOptions) => Promise<void>;
  idPositions: Map<number, number>;
  setResponses: Dispatch<SetStateAction<IRes[]>>;
  messageProtocol: string;
}

/** 取得順が揺れても、画面に残すべきsnapshotの末尾を正しく比較する。 */
function latestResponseNumber(responses: readonly IRes[]): number {
  return responses.reduce(
    (latest, response) => (Number.isFinite(response.num) ? Math.max(latest, response.num) : latest),
    0,
  );
}

export function useThreadData(
  tabId: string,
  page: ThreadPageType,
  rootRef: RefObject<HTMLDivElement | null>,
  refreshController: ThreadRefreshController,
): ThreadData {
  const isNgTemporarilyDisabled = useIsNgTemporarilyDisabled();
  const ngDisplayMode = useNgDisplayMode();
  const dispatch = useTabDispatch();
  const toast = useToast();
  const manualRefreshBaselineRef = useRef<number | null>(null);
  useEffect(
    () => () => {
      // 変更理由: スレ移動やタブ終了後に、前のスレの手動更新通知を出さない。
      manualRefreshBaselineRef.current = null;
    },
    [page.threadUrl],
  );
  const { beginRequest, isLatestRequest, refreshKey, isInternalRefreshKey } = refreshController;
  const { state: persistedViewState, update: updateViewState } = useTabViewState(tabId, page);
  const [responses, setResponsesState] = useState<IRes[]>([]);
  const [cacheResolvedThreadUrl, setCacheResolvedThreadUrl] = useState<string | null>(null);
  const responsesRef = useRef<IRes[]>([]);
  const selectionSnapshotRef = useRef<RootSelectionSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const [missingFromSubject, setMissingFromSubject] = useState(false);
  const [filter, setFilter] = useState<ThreadFilter>(() => persistedViewState.filter ?? "all");
  // ステータスバーからも変更する値なので、本文側のローカルstateではなくviewStateを正本にする。
  const popularReplyThreshold = normalizePopularReplyThreshold(
    persistedViewState.popularReplyThreshold,
  );
  const [searchTarget, setSearchTarget] = useState<ThreadSearchTarget>(() => {
    const persistedSearchTarget = persistedViewState.searchTarget;
    // 変更理由: 旧版は既定の「すべて」も自動保存していたため、移行前の値だけ本文へ直し、以後の明示選択は尊重する。
    if (persistedSearchTarget === "all" && !persistedViewState.searchTargetDefaultMigrated) {
      return "body";
    }
    return persistedSearchTarget === "body" ||
      persistedSearchTarget === "name" ||
      persistedSearchTarget === "id"
      ? persistedSearchTarget
      : "body";
  });
  const [searchQuery, setSearchQuery] = useState(() => persistedViewState.searchQuery ?? "");
  const [showSearch, setShowSearch] = useState(false);
  const titleUpdatedRef = useRef(false);
  const fetchedThreadUrlRef = useRef(page.threadUrl);

  useEffect(() => {
    updateViewState({
      filter,
      searchQuery,
      searchTarget,
      searchTargetDefaultMigrated: true,
    });
  }, [filter, searchQuery, searchTarget, updateViewState]);

  const setResponses = useCallback<Dispatch<SetStateAction<IRes[]>>>(
    (nextResponses) => {
      // 変更理由: 自動更新の通信完了時にレス本文が再描画されても、
      // 本文または同じ thread-page 配下のポップアップで行った文字選択を失わせない。
      const snapshot = captureRootSelection(rootRef.current);
      if (snapshot) {
        selectionSnapshotRef.current = snapshot;
      }
      setResponsesState((currentResponses) => {
        const resolvedResponses =
          typeof nextResponses === "function" ? nextResponses(currentResponses) : nextResponses;
        responsesRef.current = resolvedResponses;
        return resolvedResponses;
      });
    },
    [rootRef],
  );

  useLayoutEffect(() => {
    const snapshot = selectionSnapshotRef.current;
    if (!snapshot) {
      return;
    }
    selectionSnapshotRef.current = null;
    restoreRootSelection(rootRef.current, snapshot);
  }, [responses, rootRef]);

  const messageProtocol = useMemo(() => {
    try {
      return new window.URL(page.threadUrl).protocol;
    } catch {
      return "https:";
    }
  }, [page.threadUrl]);
  const manualRefreshScopeKey = getManualRefreshScopeKey(tabId, page);
  const isCacheResolved =
    cacheResolvedThreadUrl === page.threadUrl || isSikiLogThreadUrl(page.threadUrl);

  // 外部からの「ChLensで開く」も通常の遷移も、キャッシュ確認中から読み込みを示す。
  // 通信が先に完了してもキャッシュ確認が残っていれば待機中とし、本文があれば表示を優先する。
  const isInitialLoading = responses.length === 0 && (loading || !isCacheResolved);

  const fetchThread = useCallback(
    async (forceUpdate = false, { throttleSubjectCheck = false }: FetchThreadOptions = {}) => {
      const requestId = beginRequest();
      const isCurrentRequest = () => isLatestRequest(requestId);
      const isDifferentThread = fetchedThreadUrlRef.current !== page.threadUrl;
      fetchedThreadUrlRef.current = page.threadUrl;

      if (isDifferentThread) manualRefreshBaselineRef.current = null;
      if (consumeManualRefresh(manualRefreshScopeKey)) {
        manualRefreshBaselineRef.current = isDifferentThread ? 0 : responsesRef.current.length;
      }
      const finishManualRefresh = (responseCount: number, failure?: string) => {
        if (!isCurrentRequest() || manualRefreshBaselineRef.current === null) return;
        const newCount = Math.max(0, responseCount - manualRefreshBaselineRef.current);
        manualRefreshBaselineRef.current = null;
        // 変更理由: loadingがtrueのままの再取得や即時完了でも通知を落とさないよう、
        // 最新の取得結果が確定した場所で一度だけ通知する。自動更新が先着した0件も知らせる。
        if (failure) toast.error(failure);
        else toast.info(`新規レス${newCount}件`);
      };

      setLoading(true);
      // 変更理由: 同じスレの更新中に通知を消すと、通信中だけ dat 落ちやエラー表示が
      // 点滅する。別スレへ移動した場合だけ前スレの状態を破棄し、更新結果が確定するまで
      // 同じスレの既存状態を表示し続ける。
      if (isDifferentThread) {
        setError(null);
        setExpired(false);
        setMissingFromSubject(false);
      }
      titleUpdatedRef.current = false;

      const importedSikiThread = getImportedSikiThread(page.threadUrl);
      if (importedSikiThread) {
        // 変更理由: Sikiログには再取得先の通信がないため、登録済み本文を使い、
        // 通常スレと同じ検索・NG・アンカー処理へそのまま流す。
        // 通常スレと同じく、自動NG（連鎖・ID無し等）を含む判定を全レスへ一括適用する。
        const importedNgResults = evaluateThreadNg(
          importedSikiThread.responses,
          {
            title: importedSikiThread.title,
            url: page.threadUrl,
          },
          // corePorts は core の中の受け渡し口なので、画面からは同じ実体のサービスコンテナを渡す。
          container,
        );
        setResponses(
          importedSikiThread.responses.map((response) => ({
            ...response,
            ng: importedNgResults.get(response.num),
          })),
        );
        if (importedSikiThread.title && importedSikiThread.title !== page.title) {
          dispatch(tabActions.updateTitleForTab(tabId, importedSikiThread.title));
        }
        setError(null);
        setLoading(false);
        finishManualRefresh(importedSikiThread.responses.length);
        return;
      }

      if (isSikiLogThreadUrl(page.threadUrl)) {
        // セッション復元後はメモリ上の本文登録が存在しないため、誤って同じURLへ
        // 通信しない。利用者が元のJSONを再度選べば新しい登録として開き直せる。
        const message = "Sikiログの本文が見つかりません。JSONファイルを再度開いてください";
        setResponses([]);
        setError(message);
        setLoading(false);
        finishManualRefresh(0, message);
        console.error("[useThreadData] Sikiログの本文登録が見つかりません", {
          threadUrl: page.threadUrl,
        });
        return;
      }

      try {
        const result = await container.thread.getThread(page.threadUrl, {
          forceUpdate,
          throttleSubjectCheck,
          onCache: (cached: IThreadDetail) => {
            // 変更理由: 更新を短時間に連続実行すると、先に開始した取得が後から完了する
            // ことがある。古い取得結果でレス・タイトル・loading状態を巻き戻さないため、
            // 最新リクエストのキャッシュ通知だけを画面へ反映する。
            if (!isCurrentRequest()) {
              return;
            }
            const cachedResponses = cached.res
              ? stripTrailingSyntheticAbobunResponses(cached.res)
              : [];
            if (cachedResponses.length > 0) {
              setResponses((currentResponses) => {
                // 変更理由: 手動更新では表示中のレスより古いキャッシュが先に届くため、
                // 取得中にキャッシュへ戻すとレス一覧の高さとスクロール位置が一瞬巻き戻る。
                // 初回表示など現在のレスがない場合だけキャッシュを中間表示に使う。
                if (forceUpdate && currentResponses.length > 0) {
                  return currentResponses;
                }
                return cachedResponses;
              });
            }
            if (cached.title && !titleUpdatedRef.current) {
              dispatch(tabActions.updateTitleForTab(tabId, cached.title));
              titleUpdatedRef.current = true;
            }
            // 自動更新では cache 描画のあとに本体レスポンスが続くことがある。
            // ここで loading を下ろすと「更新完了」と誤認して保留中スクロールを捨てるため、
            // 完了判定は最終 result / finally に寄せる。
          },
        });

        // 変更理由: 投稿直後の再取得と手動更新が重なった場合も、最新の取得結果を
        // 優先して表示し、古いレス数で自動スクロール判定を確定させないようにする。
        if (!isCurrentRequest()) {
          return;
        }
        const currentResponses = responsesRef.current;
        const shouldKeepCurrentSnapshot =
          forceUpdate &&
          currentResponses.length > result.res.length &&
          latestResponseNumber(currentResponses) >= latestResponseNumber(result.res);
        const acceptedResponses = shouldKeepCurrentSnapshot ? currentResponses : result.res;
        // 変更理由: forceUpdate中にサーバー・キャッシュの解析結果が一時的に
        // 短くなると、レス一覧の巻き戻しと高さの変動が連続して自動追従が
        // ガクつき、アイドル停止判定まで誤って進むため、同じスレの表示とcacheを
        // すでに見えている新しいsnapshotへ揃える。
        setResponses(acceptedResponses);
        void setThreadResponseCache(page.threadUrl, acceptedResponses);
        setExpired(result.expired ?? false);
        setMissingFromSubject(result.missingFromSubject ?? false);
        setError(result.message || null);
        finishManualRefresh(
          acceptedResponses.length,
          result.res.length === 0 ? result.message : undefined,
        );
        if (result.title && !titleUpdatedRef.current) {
          dispatch(tabActions.updateTitleForTab(tabId, result.title));
        }
      } catch (e) {
        console.error("[useThreadData] スレッドの取得に失敗しました", {
          threadUrl: page.threadUrl,
          error: e,
        });
        if (!isCurrentRequest()) {
          return;
        }
        const message = e instanceof Error ? e.message : "スレッドの取得に失敗しました";
        setError(message);
        finishManualRefresh(responsesRef.current.length, message);
      } finally {
        // 変更理由: 古いリクエストの finally で loading を下ろすと、最新リクエストが
        // 通信中でも自動スクロール側が「更新完了」と誤認して保留状態を消費してしまう。
        if (isCurrentRequest()) {
          setLoading(false);
        }
      }
    },
    [
      dispatch,
      beginRequest,
      isLatestRequest,
      manualRefreshScopeKey,
      page.threadUrl,
      page.title,
      setResponses,
      tabId,
      toast,
    ],
  );

  // 変更理由: IDBキャッシュから前回のレスを復元し、新しいデータの取得中は古い結果を表示し続ける。
  useEffect(() => {
    if (fetchedThreadUrlRef.current !== page.threadUrl) {
      // 変更理由: ページ移動直後に前スレの本文を新しいスレのキャッシュとして見せない。
      setResponses([]);
    }
    if (isSikiLogThreadUrl(page.threadUrl)) {
      return;
    }
    let isCurrentThread = true;
    void getThreadResponseCache(page.threadUrl).then((cached) => {
      if (!isCurrentThread) return;
      if (cached && cached.length > 0) {
        // 変更理由: キャッシュ確認中に取得結果が先着しても、古い本文で新しい表示を上書きしない。
        setResponses((current) => (current.length === 0 ? cached : current));
      }
      // キャッシュがない場合だけ初回ローディングを見せ、キャッシュがあれば本文表示を優先する。
      setCacheResolvedThreadUrl(page.threadUrl);
    });
    return () => {
      isCurrentThread = false;
    };
  }, [page.threadUrl, setResponses]);

  useEffect(() => {
    // 初回表示は通常キャッシュを利用し、RELOAD経由の更新世代だけsubject.txtも再確認する。
    // 変更理由: 自動更新は数秒おきに走るため、dat落ち確認のsubject.txt取得を間引く。
    // 手動更新は利用者が最新状態を求めた操作なので、従来どおり毎回確認する。
    void fetchThread(refreshKey > 0, { throttleSubjectCheck: isInternalRefreshKey() });
  }, [fetchThread, isInternalRefreshKey, refreshKey]);

  useEffect(() => {
    // NG設定が更新された通知を受け取ったら、現在表示中のレスに対して判定を再実行する。
    // これにより、設定画面での変更が即座にスレッド表示へ反映される。
    const handleNgChanged = () => {
      setResponses((prev) => {
        // 返信数NGや連鎖NGは表示対象だけで数えると他のNGルールとの適用順に依存するため、
        // NG判定前の全レスを対象に、自動NGを含めて再判定する。
        const ngResults = evaluateThreadNg(
          prev,
          { title: page.title, url: page.threadUrl },
          container,
        );
        // 判定結果が無いレスは undefined にして、ResItem 側で非NGとして扱わせる。
        return prev.map((res) => ({ ...res, ng: ngResults.get(res.num) }));
      });
    };

    container.message.on("ng_changed", handleNgChanged);
    return () => {
      container.message.off("ng_changed", handleNgChanged);
    };
  }, [page.title, page.threadUrl, setResponses]);

  const { visibleResponses, indexes, filteredResponses, idPositions } = useMemo(
    () =>
      deriveThreadData({
        responses,
        filter,
        popularReplyThreshold,
        searchQuery,
        searchTarget,
        isNgTemporarilyDisabled,
        ngDisplayMode,
      }),
    [
      filter,
      isNgTemporarilyDisabled,
      ngDisplayMode,
      popularReplyThreshold,
      responses,
      searchQuery,
      searchTarget,
    ],
  );

  return {
    responses,
    visibleResponses,
    loading,
    isInitialLoading,
    isCacheResolved,
    error,
    expired,
    missingFromSubject,
    indexes,
    filteredResponses,
    filter,
    setFilter,
    searchTarget,
    setSearchTarget,
    searchQuery,
    setSearchQuery,
    showSearch,
    setShowSearch,
    fetchThread,
    idPositions,
    setResponses,
    messageProtocol,
  };
}
