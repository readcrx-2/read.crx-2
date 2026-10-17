import { recordDebugEvent } from "src/app/debug/debug-log";
import { createLogger } from "src/app/logger";
import { extractUrlsFromMessage, toViewerImageUrl } from "src/core/util/url-media";
import type { IRes } from "src/service-container/interfaces";

import type { CommentOverlaySettings } from "../domain";
import {
  collectNewCommentBatch,
  type CommentOverlayEvent,
  type CommentOverlayState,
  type CommentResponse,
  createIdleCommentOverlayState,
  DEFAULT_COMMENT_OVERLAY_SETTINGS,
  latestResponseNumber,
  normalizeCommentOverlaySettings,
  projectCommentResponse,
  startCommentOverlay,
  stopCommentOverlay,
} from "../domain";
import type { CommentOverlayEventBus } from "../domain/events";
import type { CommentOverlayWindowPlatform } from "../platform/types";
import {
  CommentOverlayMultiThreadSession,
  type CommentOverlayMultiThreadSource,
} from "./multi-thread-session";

const logger = createLogger("comment-overlay");

const MAX_RESPONSE_SNAPSHOT_COUNT = 8;
const MAX_RESPONSES_PER_SNAPSHOT = 2_000;

function extractCommentImageUrls(message: string): readonly string[] {
  return extractUrlsFromMessage(message).filter((url) => toViewerImageUrl(url) != null);
}

export interface CommentOverlayControllerSnapshot {
  state: CommentOverlayState;
  visible: boolean;
  error: string | null;
}

export interface CommentOverlayControllerDependencies {
  eventBus: CommentOverlayEventBus;
  platform: CommentOverlayWindowPlatform;
  getSettings?: () => CommentOverlaySettings;
  subscribeSettings?: (listener: () => void) => () => void;
  /** 複数スレ実況時だけ使う、板一覧・候補datの取得境界。 */
  multiThreadSource?: CommentOverlayMultiThreadSource;
}

function toCommentResponse(
  response: IRes,
  ownResponseNumbers?: ReadonlySet<number>,
): CommentResponse {
  const imageUrls = extractCommentImageUrls(response.message);
  return {
    num: response.num,
    name: response.name,
    message: response.message,
    ...(response.date ? { date: response.date } : {}),
    ...(response.id ? { id: response.id } : {}),
    ...(response.ng != null ? { ng: response.ng } : {}),
    ...(response.class ? { class: response.class } : {}),
    ...(imageUrls.length > 0 ? { imageUrls } : {}),
    ...(ownResponseNumbers?.has(response.num) ? { isOwn: true } : {}),
  };
}

function createResetEvent(
  threadUrl: string,
  responses: readonly IRes[],
  settings: CommentOverlaySettings,
  preserveVisibleComments = false,
  ownResponseNumbers?: ReadonlySet<number>,
): CommentOverlayEvent {
  const latest = latestResponseNumber(
    responses.map((response) => toCommentResponse(response, ownResponseNumbers)),
  );
  return {
    version: 1,
    type: "reset",
    settings,
    batch: {
      threadUrl,
      comments: [],
      latestResponseNumber: latest,
    },
    ...(preserveVisibleComments ? { preserveVisibleComments: true } : {}),
  };
}

/**
 * ThreadPageとOverlayの間に置く、実況対象と差分送信だけを担当するcontroller。
 * 取得・NG判定・描画は既存の各層へ残し、同じレスを別経路で二重取得しない境界にする。
 */
export class CommentOverlayController {
  private readonly eventBus: CommentOverlayEventBus;

  private readonly platform: CommentOverlayWindowPlatform;

  private readonly getSettings: () => CommentOverlaySettings;

  private readonly subscribeSettings: ((listener: () => void) => () => void) | null;

  private readonly multiThreadSource: CommentOverlayMultiThreadSource | null;

  private readonly listeners = new Set<() => void>();

  private readonly responseSnapshots = new Map<string, readonly IRes[]>();

  private state: CommentOverlayState = createIdleCommentOverlayState();

  private visible = false;

  private error: string | null = null;

  private snapshot: CommentOverlayControllerSnapshot = {
    state: this.state,
    visible: this.visible,
    error: this.error,
  };

  private publishQueue: Promise<void> = Promise.resolve();

  private operationQueue: Promise<void> = Promise.resolve();

  private settingsUnsubscribe: (() => void) | null = null;

  private visibilityUnsubscribe: (() => void) | null = null;

  private multiThreadSession: CommentOverlayMultiThreadSession | null = null;

  private activeSourceThreadUrl: string | null = null;

  private systemMessageSequence = 0;

  constructor({
    eventBus,
    platform,
    getSettings,
    subscribeSettings,
    multiThreadSource,
  }: CommentOverlayControllerDependencies) {
    this.eventBus = eventBus;
    this.platform = platform;
    this.subscribeSettings = subscribeSettings ?? null;
    this.multiThreadSource = multiThreadSource ?? null;
    const readSettings = getSettings ?? (() => ({ ...DEFAULT_COMMENT_OVERLAY_SETTINGS }));
    // 設定の保存元が将来増えても、Mainから出るeventは必ず正規化済みの値にする。
    this.getSettings = () => normalizeCommentOverlaySettings(readSettings());
    this.subscribeToVisibility();
  }

  getSnapshot = (): CommentOverlayControllerSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getThreadResponses(threadUrl: string): readonly IRes[] | null {
    return this.responseSnapshots.get(threadUrl) ?? null;
  }

  private rememberThreadResponses(threadUrl: string, responses: readonly IRes[]): void {
    const boundedResponses =
      responses.length > MAX_RESPONSES_PER_SNAPSHOT
        ? responses.slice(-MAX_RESPONSES_PER_SNAPSHOT)
        : responses;
    this.responseSnapshots.delete(threadUrl);
    this.responseSnapshots.set(threadUrl, boundedResponses);

    // 変更理由: スレッドを移動するたびに全レス配列をMapへ残すと、長時間利用で
    // Overlayを表示していなくてもcontroller側のsnapshotが増え続けるため、スレッド数と
    // 1スレッドあたりのレス数を直近だけ保持する。syncThreadの差分計算には呼び出し元の
    // 完全な配列を使うため、実況中の新着判定はこの再開用snapshot制限の影響を受けない。
    while (this.responseSnapshots.size > MAX_RESPONSE_SNAPSHOT_COUNT) {
      const oldestThreadUrl = this.responseSnapshots.keys().next().value;
      if (oldestThreadUrl === undefined) break;
      this.responseSnapshots.delete(oldestThreadUrl);
    }
  }

  /** ThreadPageの確定済みsnapshotを受け取り、実況中だけ新着差分を送信する。 */
  syncThread(
    threadUrl: string,
    responses: readonly IRes[],
    options: { ownResponseNumbers?: ReadonlySet<number> } = {},
  ): void {
    this.rememberThreadResponses(threadUrl, responses);
    if (this.state.status !== "running" || this.state.targetThreadUrl !== threadUrl) {
      return;
    }

    if (this.activeSourceThreadUrl !== threadUrl) {
      // 本流候補へ切り替えている間も表示対象外になった元スレのcursorだけは進める。
      // 設定をOFFへ戻した際、切替中の全レスを一度に再送してqueueを埋めないための
      // baseline更新であり、元スレのコメントをOverlayへ出す処理は再開まで行わない。
      const nextLastResponseNumber = Math.max(
        this.state.cursor?.lastResponseNumber ?? 0,
        latestResponseNumber(
          responses.map((response) => toCommentResponse(response, options.ownResponseNumbers)),
        ),
      );
      if (nextLastResponseNumber !== this.state.cursor?.lastResponseNumber) {
        this.state = {
          ...this.state,
          cursor: this.state.cursor
            ? { ...this.state.cursor, lastResponseNumber: nextLastResponseNumber }
            : null,
        };
        this.notify();
      }
      return;
    }

    const result = collectNewCommentBatch(
      this.state,
      threadUrl,
      responses.map((response) => toCommentResponse(response, options.ownResponseNumbers)),
    );
    this.state = result.state;
    if (this.state.cursor?.lastResponseNumber !== this.snapshot.state.cursor?.lastResponseNumber) {
      this.notify();
    }
    if (result.batch) {
      const batch = {
        ...result.batch,
        comments: result.batch.comments.map((comment) => ({
          ...comment,
          sourceThreadUrl: threadUrl,
        })),
      };
      void this.publish({ version: 1, type: "batch", batch }).catch((error: unknown) => {
        this.reportError("[ChLens] コメントOverlay eventの送信に失敗しました:", error);
      });
    }
  }

  start(
    threadUrl: string,
    responses?: readonly IRes[],
    options: {
      preserveVisibleComments?: boolean;
      ownResponseNumbers?: ReadonlySet<number>;
    } = {},
  ): Promise<void> {
    return this.enqueueOperation(() => this.startSession(threadUrl, responses, options));
  }

  private async startSession(
    threadUrl: string,
    responses: readonly IRes[] | undefined,
    options: { preserveVisibleComments?: boolean; ownResponseNumbers?: ReadonlySet<number> },
  ): Promise<void> {
    const snapshot = responses ?? this.getThreadResponses(threadUrl) ?? [];
    // 変更理由: 前回の一時的な送信失敗を、再試行できた開始状態へ持ち越さない。
    this.error = null;
    this.stopMultiThreadSession();
    this.activeSourceThreadUrl = threadUrl;
    this.rememberThreadResponses(threadUrl, snapshot);
    this.state = startCommentOverlay(
      threadUrl,
      snapshot.map((response) => toCommentResponse(response, options.ownResponseNumbers)),
    );
    this.notify();

    try {
      await this.applyVisibility(true);
      // 通常開始は表示履歴を切り替えるが、次スレ移動だけは画面上を流れている
      // 前スレのコメントを最後まで見せるため、呼び出し側の意図をeventへ残す。
      await this.publish(
        createResetEvent(
          threadUrl,
          snapshot,
          this.getSettings(),
          options.preserveVisibleComments === true,
          options.ownResponseNumbers,
        ),
      );
      this.subscribeToSettings();
      this.startMultiThreadSession(threadUrl);
    } catch (error: unknown) {
      this.unsubscribeFromSettings();
      this.state = stopCommentOverlay(this.state);
      if (this.visible) {
        try {
          // reset送信に失敗した場合も、表示だけが残って操作不能にならないよう戻す。
          await this.applyVisibility(false);
        } catch (rollbackError: unknown) {
          logger.error("コメント実況の開始失敗後のOverlay非表示に失敗しました:", rollbackError);
        }
      }
      this.reportError("[ChLens] コメント実況の開始に失敗しました:", error);
      throw error;
    }
  }

  stop(): Promise<void> {
    return this.enqueueOperation(() => this.stopSession());
  }

  private async stopSession(): Promise<void> {
    this.stopMultiThreadSession();
    this.activeSourceThreadUrl = null;
    this.unsubscribeFromSettings();
    this.error = null;
    this.state = stopCommentOverlay(this.state);
    this.notify();
    try {
      await this.applyVisibility(false);
    } catch (error: unknown) {
      this.reportError("[ChLens] コメント実況Overlayの停止に失敗しました:", error);
      throw error;
    }
  }

  setVisible(visible: boolean): Promise<void> {
    return this.enqueueOperation(() => this.applyVisibility(visible));
  }

  private enqueueOperation(operation: () => Promise<void>): Promise<void> {
    // 表示IPCやreset送信の途中で次の開始・停止が割り込むと、古いhideが新しいshowを
    // 打ち消す。セッション全体を受付順に実行し、失敗後も次の操作を再試行できるようにする。
    const next = this.operationQueue.then(operation);
    this.operationQueue = next.catch(() => undefined);
    return next;
  }

  private async applyVisibility(visible: boolean): Promise<void> {
    // 別WebViewからの通知と実ウィンドウには遅延があるため、キャッシュ一致でも省略しない。
    // ONを押せば必ずnative showが実行され、状態がずれた後にも再表示できるようにする。
    recordDebugEvent("comment-overlay", "Overlayの表示切り替えを開始します", {
      requestedVisible: visible,
      previousVisible: this.visible,
    });

    try {
      if (visible) {
        await this.platform.show();
      } else {
        await this.platform.hide();
      }
    } catch (error: unknown) {
      this.reportError(
        `[ChLens] コメントOverlayの${visible ? "表示" : "非表示"}に失敗しました:`,
        error,
      );
      throw error;
    }

    this.visible = visible;
    this.error = null;
    this.notify();
    recordDebugEvent("comment-overlay", "Overlayの表示切り替えが完了しました", { visible });
  }

  async updateSettings(): Promise<void> {
    if (this.state.status !== "running" || this.state.targetThreadUrl == null) return;

    try {
      await this.publish({
        version: 1,
        type: "settings",
        settings: this.getSettings(),
      });
    } catch (error: unknown) {
      this.reportError("[ChLens] コメントOverlay設定の送信に失敗しました:", error);
      throw error;
    }
  }

  async publishSystemMessage(threadUrl: string, message: string): Promise<void> {
    const text = message.trim();
    if (
      !text ||
      this.state.status !== "running" ||
      this.state.targetThreadUrl == null ||
      this.state.targetThreadUrl !== threadUrl ||
      !this.visible
    ) {
      return;
    }

    this.systemMessageSequence += 1;
    try {
      await this.publish({
        version: 1,
        type: "system",
        threadUrl: this.state.targetThreadUrl,
        comment: {
          responseNumber: 0,
          text,
          author: "ChLens",
          isSystem: true,
          systemId: `${threadUrl}:${this.systemMessageSequence}`,
          sourceThreadUrl: threadUrl,
        },
      });
    } catch (error: unknown) {
      this.reportError("[ChLens] コメント実況の通知コメント送信に失敗しました:", error);
      throw error;
    }
  }

  private notify(): void {
    this.snapshot = {
      state: this.state,
      visible: this.visible,
      error: this.error,
    };
    for (const listener of this.listeners) listener();
  }

  private reportError(message: string, error: unknown): void {
    logger.error(message, error);
    this.error = message;
    this.notify();
  }

  private subscribeToSettings(): void {
    if (this.subscribeSettings == null || this.settingsUnsubscribe != null) return;

    try {
      this.settingsUnsubscribe = this.subscribeSettings(() => {
        void this.handleSettingsUpdated();
      });
    } catch (error: unknown) {
      logger.error("コメントOverlay設定の変更監視登録に失敗しました:", error);
    }
  }

  private async handleSettingsUpdated(): Promise<void> {
    try {
      await this.updateSettings();
      if (this.state.status !== "running" || this.state.targetThreadUrl == null) return;

      if (this.getSettings().fetchAllCandidateThreads === true) {
        if (this.multiThreadSession == null) {
          this.startMultiThreadSession(this.state.targetThreadUrl);
        }
      } else if (this.multiThreadSession != null) {
        this.stopMultiThreadSession(true);
      }
    } catch (error: unknown) {
      // 設定反映の失敗は実況を停止せず、送信失敗の詳細だけを既存経路へ渡す。
      logger.error("コメントOverlay設定の反映に失敗しました:", error);
    }
  }

  private startMultiThreadSession(threadUrl: string): void {
    if (
      this.multiThreadSource == null ||
      this.state.status !== "running" ||
      this.state.targetThreadUrl !== threadUrl ||
      this.getSettings().fetchAllCandidateThreads !== true
    ) {
      return;
    }

    this.stopMultiThreadSession();
    const session = new CommentOverlayMultiThreadSession({
      threadUrl,
      source: this.multiThreadSource,
      onBatch: (sourceThreadUrl, responses) => {
        if (this.multiThreadSession !== session) return;
        this.consumeMultiThreadBatch(threadUrl, sourceThreadUrl, responses);
      },
      onMainstream: (thread) => {
        if (this.multiThreadSession !== session) return;
        this.activeSourceThreadUrl = thread.url;
        void this.publish({
          version: 1,
          type: "source-filter",
          threadUrl,
          keepSourceThreadUrl: thread.url,
        }).catch((error: unknown) => {
          this.reportError("[ChLens] 本流スレ切り替えのOverlay通知に失敗しました:", error);
        });
      },
      onFinished: (keepSourceThreadUrl) => {
        if (this.multiThreadSession !== session) return;
        this.multiThreadSession = null;
        if (this.state.status !== "running") return;
        void this.publish({
          version: 1,
          type: "source-filter",
          threadUrl,
          keepSourceThreadUrl,
        }).catch((error: unknown) => {
          this.reportError("[ChLens] 候補スレ整理のOverlay通知に失敗しました:", error);
        });
      },
    });
    this.multiThreadSession = session;
    session.start();
  }

  private consumeMultiThreadBatch(
    threadUrl: string,
    sourceThreadUrl: string,
    responses: readonly IRes[],
  ): void {
    if (
      this.state.status !== "running" ||
      this.state.targetThreadUrl !== threadUrl ||
      this.multiThreadSession == null
    ) {
      return;
    }

    const comments = responses
      .map((response) => toCommentResponse(response))
      .map((response) => projectCommentResponse(response))
      .filter((comment): comment is NonNullable<ReturnType<typeof projectCommentResponse>> => {
        return comment !== null;
      })
      .map((comment) => ({ ...comment, sourceThreadUrl }));
    if (comments.length === 0) return;

    const latestResponseNumber = responses.reduce(
      (latest, response) => Math.max(latest, Number.isFinite(response.num) ? response.num : latest),
      0,
    );
    void this.publish({
      version: 1,
      type: "batch",
      batch: {
        threadUrl,
        comments,
        latestResponseNumber,
      },
    }).catch((error: unknown) => {
      this.reportError("[ChLens] 候補スレのコメント送信に失敗しました:", error);
    });
  }

  private stopMultiThreadSession(restoreTargetSource = false): void {
    const session = this.multiThreadSession;
    this.multiThreadSession = null;
    session?.stop();

    const targetThreadUrl = this.state.targetThreadUrl;
    if (
      restoreTargetSource &&
      this.state.status === "running" &&
      targetThreadUrl != null &&
      this.activeSourceThreadUrl !== targetThreadUrl
    ) {
      this.activeSourceThreadUrl = targetThreadUrl;
      void this.publish({
        version: 1,
        type: "source-filter",
        threadUrl: targetThreadUrl,
        keepSourceThreadUrl: targetThreadUrl,
      }).catch((error: unknown) => {
        this.reportError("[ChLens] 分裂スレ取得停止のOverlay通知に失敗しました:", error);
      });
    }
  }

  private subscribeToVisibility(): void {
    if (this.visibilityUnsubscribe != null) return;

    void this.platform
      .watchVisibility((visible) => {
        if (this.visible === visible) return;

        // MainとOverlayは別WebViewなので、Overlayの閉じる操作後もMain側の
        // ステータスバーから正しく再表示できるよう、native状態をcontrollerへ戻す。
        this.visible = visible;
        this.notify();
      })
      .then((unsubscribe) => {
        this.visibilityUnsubscribe = unsubscribe;
      })
      .catch((error: unknown) => {
        logger.error("コメントOverlayの表示状態監視開始に失敗しました:", error);
      });
  }

  private unsubscribeFromSettings(): void {
    const unsubscribe = this.settingsUnsubscribe;
    this.settingsUnsubscribe = null;
    if (unsubscribe == null) return;

    try {
      unsubscribe();
    } catch (error: unknown) {
      logger.error("コメントOverlay設定の変更監視解除に失敗しました:", error);
    }
  }

  private publish(event: CommentOverlayEvent): Promise<void> {
    const next = this.publishQueue.then(() => this.eventBus.publish(event));
    // 送信失敗後も次の新着eventを送れるよう、内部queueだけは解決状態へ戻す。
    this.publishQueue = next.catch(() => undefined);
    return next;
  }
}
