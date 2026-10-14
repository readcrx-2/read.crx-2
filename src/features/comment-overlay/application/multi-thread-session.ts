import {
  mapWithConcurrency,
  MAX_CONCURRENT_BATCH_REQUESTS,
} from "src/core/util/map-with-concurrency";
import {
  calculateTitleSimilarity,
  extractThreadSequenceNumber,
  findMainstreamThreadMatch,
} from "src/features/next-thread/browser/next-thread-search";
import type { IBoardResult, IRes, IThread, IThreadDetail } from "src/service-container/interfaces";
import { getBoardUrlFromThreadUrl } from "src/view/browser/utils/link-routing";

const CANDIDATE_MIN_SIMILARITY = 0.3;
const CANDIDATE_POLL_INTERVAL_MS = 10_000;
const MAINSTREAM_GRACE_PERIOD_MS = 15_000;
const MAINSTREAM_WATCH_DURATION_MS = 60_000;
const INITIAL_CANDIDATE_COMMENT_COUNT = 5;

export interface CommentOverlayMultiThreadSource {
  getThreads(boardUrl: string): Promise<IBoardResult>;
  getThread(threadUrl: string): Promise<IThreadDetail>;
}

export interface CommentOverlayMultiThreadSessionOptions {
  threadUrl: string;
  threadTitle?: string;
  source: CommentOverlayMultiThreadSource;
  onBatch: (sourceThreadUrl: string, responses: readonly IRes[]) => void;
  onMainstream: (thread: IThread) => void;
  onFinished: (keepSourceThreadUrl: string) => void;
}

interface CandidateState {
  thread: IThread;
  initialized: boolean;
  lastResponseNumber: number;
}

interface BoardSnapshot {
  threads: readonly IThread[];
  observedAt: number;
}

/**
 * 現在スレと同じ番組の候補を、EdgeLiveViewerと同じ最低類似度で列挙する。
 * board取得は同じ板URLに限定されるが、ここでもスレURLを比較して別板混入を防ぐ。
 */
export function findCommentOverlayCandidateThreads(
  threads: readonly IThread[],
  currentThread: Pick<IThread, "url" | "title">,
): readonly IThread[] {
  const currentSequence = extractThreadSequenceNumber(currentThread.title);
  const currentIsMarked = currentThread.title.trimStart().startsWith("●");

  return threads
    .filter((thread) => {
      if (thread.url === currentThread.url || thread.resCount >= 1_000) return false;
      const currentBoardUrl = getBoardUrlFromThreadUrl(currentThread.url);
      const candidateBoardUrl = getBoardUrlFromThreadUrl(thread.url);
      if (
        currentBoardUrl !== currentThread.url &&
        candidateBoardUrl !== thread.url &&
        currentBoardUrl !== candidateBoardUrl
      ) {
        return false;
      }

      const similarity = calculateTitleSimilarity(
        stripSequenceDecoration(currentThread.title),
        stripSequenceDecoration(thread.title),
      );
      if (similarity < CANDIDATE_MIN_SIMILARITY) return false;

      // ●付きスレは同じ印の系列だけを候補にする。別番組の●スレまで
      // Overlayへ混ぜないため、EdgeLiveViewerの候補判定と同じ境界を置く。
      if (currentIsMarked && !thread.title.trimStart().startsWith("●")) return false;

      // 数字だけが違う同名スレは対象にする一方、明示的な連番が大きく離れた
      // 古いスレまで実況へ混ぜない。EdgeLiveViewerの次スレ候補と同じく、
      // 現在番号の近傍（分裂した同番号を含む）だけを取得対象にする。
      const candidateSequence = extractThreadSequenceNumber(thread.title);
      if (currentSequence.hasNumber !== candidateSequence.hasNumber) {
        // 片方だけに数字がある場合は、日付や番組内の別番号をスレ番号と
        // 誤認しやすい。現在スレに番号があるときは番号なし候補を除外し、
        // 番号がないときだけPart.1/2相当の初期候補を許可する。
        return !currentSequence.hasNumber && candidateSequence.value <= 2;
      }
      if (
        currentSequence.hasNumber &&
        candidateSequence.hasNumber &&
        Math.abs(candidateSequence.value - currentSequence.value) > 1
      ) {
        return false;
      }
      return true;
    })
    .sort((left, right) => {
      const similarityDifference =
        calculateTitleSimilarity(
          stripSequenceDecoration(currentThread.title),
          stripSequenceDecoration(right.title),
        ) -
        calculateTitleSimilarity(
          stripSequenceDecoration(currentThread.title),
          stripSequenceDecoration(left.title),
        );
      if (similarityDifference !== 0) return similarityDifference;
      if (right.resCount !== left.resCount) return right.resCount - left.resCount;
      return right.createdAt - left.createdAt;
    });
}

function stripSequenceDecoration(title: string): string {
  return title
    .replace(/^\s*●\s*/, "")
    .replace(/(?:★\d+|Part\.?\s*\d+)\s*$/i, "")
    .trim();
}

/**
 * 本流判定中だけ候補スレのdatを並行取得し、判定後は本流だけを継続するセッション。
 * ブラウザのThreadPageを増やさず、コメントOverlayの取得責務に閉じ込める。
 */
export class CommentOverlayMultiThreadSession {
  private readonly boardUrl: string;
  private readonly startedAt = Date.now();
  private readonly candidateStates = new Map<string, CandidateState>();
  private targetTitle: string;
  private activeSourceThreadUrl: string;
  private previousBoardSnapshot: BoardSnapshot | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private finished = false;
  private promoted = false;

  constructor(private readonly options: CommentOverlayMultiThreadSessionOptions) {
    this.boardUrl = getBoardUrlFromThreadUrl(options.threadUrl);
    this.targetTitle = options.threadTitle?.trim() ?? "";
    this.activeSourceThreadUrl = options.threadUrl;
  }

  start(): void {
    if (this.running || this.finished) return;
    this.running = true;
    void this.tick();
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    this.clearTimer();
    this.finish(this.activeSourceThreadUrl);
  }

  private async tick(): Promise<void> {
    if (!this.running || this.finished) return;

    if (this.promoted) {
      const promotedState = this.candidateStates.get(this.activeSourceThreadUrl);
      if (promotedState) await this.fetchCandidate(promotedState);
      this.scheduleNextTick();
      return;
    }

    const elapsed = Date.now() - this.startedAt;
    if (elapsed >= MAINSTREAM_GRACE_PERIOD_MS + MAINSTREAM_WATCH_DURATION_MS) {
      this.finish(this.activeSourceThreadUrl);
      return;
    }

    try {
      const result = await this.options.source.getThreads(this.boardUrl);
      if (!this.running) return;

      const currentThread = result.threads.find((thread) => thread.url === this.options.threadUrl);
      if (currentThread && !this.targetTitle) this.targetTitle = currentThread.title;

      const currentForCandidates: Pick<IThread, "url" | "title"> = {
        url: this.options.threadUrl,
        title: this.targetTitle || currentThread?.title || "",
      };
      const candidates = this.targetTitle
        ? findCommentOverlayCandidateThreads(result.threads, currentForCandidates)
        : [];

      for (const thread of candidates) {
        if (!this.candidateStates.has(thread.url)) {
          this.candidateStates.set(thread.url, {
            thread,
            initialized: false,
            lastResponseNumber: 0,
          });
        } else {
          this.candidateStates.get(thread.url)!.thread = thread;
        }
      }

      // 先に候補の新着を送ることで、同じtickで本流が決まっても、判定中に届いた
      // コメントはOverlayへ流れる。source-filterはその後のqueueだけを整理する。
      await mapWithConcurrency(
        [...this.candidateStates.values()],
        MAX_CONCURRENT_BATCH_REQUESTS,
        (state) => this.fetchCandidate(state),
      );
      if (!this.running) return;

      const now = Date.now();
      const previous = this.previousBoardSnapshot;
      this.previousBoardSnapshot = { threads: result.threads, observedAt: now };
      if (now - this.startedAt < MAINSTREAM_GRACE_PERIOD_MS || previous == null) {
        this.scheduleNextTick();
        return;
      }

      const currentThreadForMatch = result.threads.find(
        (thread) => thread.url === this.activeSourceThreadUrl,
      );
      if (currentThreadForMatch) {
        // 本流判定は、実際に候補datを取得できたスレッドだけに限定する。
        // 共通の検索関数は板一覧全体を受け取れるため、取得対象外の古いスレを
        // 勢いだけで昇格させると、昇格後にコメントを流せない状態になる。
        const fetchedThreads = result.threads.filter(
          (thread) =>
            thread.url === this.activeSourceThreadUrl || this.candidateStates.has(thread.url),
        );
        const match = findMainstreamThreadMatch(fetchedThreads, {
          originalThreadUrl: this.options.threadUrl,
          originalThreadTitle: this.targetTitle,
          currentThreadUrl: this.activeSourceThreadUrl,
          // EdgeLiveViewerは候補の類似度を広く取り、本流の勢い差で最終決定する。
          mode: "aggressive",
          previousThreads: previous.threads,
          previousObservedAt: previous.observedAt,
          now,
        });
        if (match) this.promote(match.thread);
      }
    } catch (error: unknown) {
      // 候補取得は補助機能のためOverlay自体を止めず、次の周期で再試行する。
      // エラー内容は原因追跡できるよう必ずログへ残す。
      console.error("[ChLens] コメントOverlayの候補スレ取得に失敗しました:", error);
    }

    if (this.running) this.scheduleNextTick();
  }

  private async fetchCandidate(state: CandidateState): Promise<void> {
    if (!this.running || this.finished) return;

    try {
      const result = await this.options.source.getThread(state.thread.url);
      if (!this.running || this.finished) return;

      const responses = [...result.res].sort((left, right) => left.num - right.num);
      const latestResponseNumber = responses.reduce(
        (latest, response) =>
          Math.max(latest, Number.isFinite(response.num) ? response.num : latest),
        state.lastResponseNumber,
      );
      const additions = state.initialized
        ? responses.filter((response) => response.num > state.lastResponseNumber)
        : responses.slice(-INITIAL_CANDIDATE_COMMENT_COUNT);
      state.initialized = true;
      state.lastResponseNumber = latestResponseNumber;
      if (additions.length > 0) this.options.onBatch(state.thread.url, additions);
    } catch (error: unknown) {
      console.error(
        `[ChLens] コメントOverlayの候補スレ取得に失敗しました: ${state.thread.url}`,
        error,
      );
    }
  }

  private promote(thread: IThread): void {
    if (thread.url === this.activeSourceThreadUrl || this.finished || !this.running) return;

    this.promoted = true;
    this.activeSourceThreadUrl = thread.url;
    const promotedState = this.candidateStates.get(thread.url);
    this.candidateStates.clear();
    if (promotedState) this.candidateStates.set(thread.url, promotedState);
    this.options.onMainstream(thread);
  }

  private finish(keepSourceThreadUrl: string): void {
    if (this.finished) return;
    this.finished = true;
    this.running = false;
    this.clearTimer();
    this.options.onFinished(keepSourceThreadUrl);
  }

  private scheduleNextTick(): void {
    if (!this.running || this.finished || this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.tick();
    }, CANDIDATE_POLL_INTERVAL_MS);
  }

  private clearTimer(): void {
    if (!this.timer) return;
    clearTimeout(this.timer);
    this.timer = null;
  }
}
