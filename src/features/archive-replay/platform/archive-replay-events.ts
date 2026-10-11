import { isTauriRuntime } from "src/app/platform/runtime";
import { defineTauriEventChannel } from "src/app/platform/tauri/typed-event";
import type { CommentCandidate } from "src/features/comment-overlay/domain/comment-types";
import { COMMENT_OVERLAY_WINDOW_LABEL } from "src/features/comment-overlay/platform";

import { ARCHIVE_REPLAY_WINDOW_LABEL, openArchiveReplayWindow } from "./archive-replay-window";

/*
 * 過去実況窓が他の窓とやり取りするeventを、ここに集める。
 *
 * - シーク要求: Main → 過去実況窓（ThreadViewのレス位置へ移動）
 * - 現在スレ通知: 過去実況窓 → Main（専用ThreadViewタブを同期）
 * - Overlay通知: 過去実況窓 → コメントOverlay（コメントと再生状態）
 *
 * 変更理由: 以前は窓の表示制御とevent定義が別々のファイルに混在し、型ガードも
 * eventごとに手書きしていた。契約（名前・送り先・検証）をここへまとめ、送受信は
 * defineTauriEventChannelを通して同じ検証を必ず通す。
 */

const LOG_LABEL = "ArchiveReplay";

export const ARCHIVE_REPLAY_MAIN_WINDOW_LABEL = "main";
export const ARCHIVE_REPLAY_SEEK_EVENT_NAME = "chlens://archive-replay-seek";
export const ARCHIVE_REPLAY_MAIN_THREAD_EVENT_NAME = "chlens://archive-replay-main-thread";
export const ARCHIVE_REPLAY_OVERLAY_EVENT_NAME = "chlens://archive-replay-overlay";

// ---------------------------------------------------------------------------
// 契約（payloadの型と検証）
// ---------------------------------------------------------------------------

export interface ArchiveReplaySeekRequest {
  threadUrl: string;
  responseNumber: number;
}

export interface ArchiveReplayMainThreadRequest {
  version: 1;
  sessionId: string;
  generation: number;
  threadUrl: string;
  responseNumber: number;
  title: string;
  /** 同期補正を差し引いたログ上の時刻。古い通知との互換性のため省略可能。 */
  playbackAt?: number;
}

export type ArchiveReplayOverlayEvent =
  | {
      version: 1;
      type: "reset";
      sessionId: string;
    }
  | {
      version: 1;
      type: "comment";
      sessionId: string;
      comment: CommentCandidate;
    }
  | {
      version: 1;
      type: "playback";
      sessionId: string;
      playing: boolean;
    }
  | {
      version: 1;
      type: "stop";
      sessionId: string;
    };

function isRecord(payload: unknown): payload is Record<string, unknown> {
  return typeof payload === "object" && payload !== null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

export function isArchiveReplaySeekRequest(payload: unknown): payload is ArchiveReplaySeekRequest {
  return (
    isRecord(payload) &&
    isNonEmptyString(payload.threadUrl) &&
    isPositiveInteger(payload.responseNumber)
  );
}

export function isArchiveReplayMainThreadRequest(
  payload: unknown,
): payload is ArchiveReplayMainThreadRequest {
  if (!isRecord(payload)) return false;
  const { version, sessionId, generation, threadUrl, responseNumber, title, playbackAt } = payload;
  return (
    version === 1 &&
    isNonEmptyString(sessionId) &&
    typeof generation === "number" &&
    Number.isInteger(generation) &&
    generation >= 0 &&
    isNonEmptyString(threadUrl) &&
    isPositiveInteger(responseNumber) &&
    isNonEmptyString(title) &&
    (playbackAt === undefined || (typeof playbackAt === "number" && Number.isFinite(playbackAt)))
  );
}

export function isArchiveReplayOverlayEvent(
  payload: unknown,
): payload is ArchiveReplayOverlayEvent {
  if (!isRecord(payload)) return false;
  if (payload.version !== 1 || typeof payload.sessionId !== "string") return false;
  switch (payload.type) {
    case "reset":
    case "stop":
      return true;
    case "playback":
      return typeof payload.playing === "boolean";
    case "comment":
      return payload.comment != null;
    default:
      return false;
  }
}

// ---------------------------------------------------------------------------
// channel定義
// ---------------------------------------------------------------------------

const seekChannel = defineTauriEventChannel({
  name: ARCHIVE_REPLAY_SEEK_EVENT_NAME,
  target: ARCHIVE_REPLAY_WINDOW_LABEL,
  logLabel: LOG_LABEL,
  isPayload: isArchiveReplaySeekRequest,
});

const mainThreadChannel = defineTauriEventChannel({
  name: ARCHIVE_REPLAY_MAIN_THREAD_EVENT_NAME,
  target: ARCHIVE_REPLAY_MAIN_WINDOW_LABEL,
  logLabel: LOG_LABEL,
  isPayload: isArchiveReplayMainThreadRequest,
});

/** Mainのlive実況とは別のevent名で、過去実況窓から表示専用Overlayへ通知する。 */
const overlayChannel = defineTauriEventChannel({
  name: ARCHIVE_REPLAY_OVERLAY_EVENT_NAME,
  target: COMMENT_OVERLAY_WINDOW_LABEL,
  logLabel: LOG_LABEL,
  isPayload: isArchiveReplayOverlayEvent,
});

function assertTauriRuntime(feature: string): void {
  if (!isTauriRuntime()) {
    throw new Error(`${feature}はTauri版でのみ利用できます`);
  }
}

// ---------------------------------------------------------------------------
// シーク要求（Main → 過去実況窓）
// ---------------------------------------------------------------------------

/** ThreadViewのレス位置を、再生窓のロード済みタイムラインへ通知する。 */
export async function requestArchiveReplaySeek(request: ArchiveReplaySeekRequest): Promise<void> {
  assertTauriRuntime("過去実況再生窓");
  if (!isArchiveReplaySeekRequest(request)) {
    throw new TypeError("過去実況のシーク要求が不正です");
  }
  // 右クリック直後でも窓が背後に隠れないよう、通知前に表示とフォーカスを確定する。
  await openArchiveReplayWindow();
  await seekChannel.emit(request);
}

export async function subscribeArchiveReplaySeekRequests(
  listener: (request: ArchiveReplaySeekRequest) => void,
): Promise<() => void> {
  if (!isTauriRuntime()) return () => {};
  return seekChannel.listen(listener);
}

// ---------------------------------------------------------------------------
// 現在スレ通知（過去実況窓 → Main）
// ---------------------------------------------------------------------------

/** 再生窓の現在スレを、Mainの専用ThreadViewへ通知する。 */
export async function requestArchiveReplayMainThread(
  request: ArchiveReplayMainThreadRequest,
): Promise<void> {
  assertTauriRuntime("過去実況のMain同期");
  await mainThreadChannel.emit(request);
}

/** Main側で再生窓からの現在スレ通知を購読する。 */
export async function subscribeArchiveReplayMainThreadRequests(
  listener: (request: ArchiveReplayMainThreadRequest) => void,
): Promise<() => void> {
  if (!isTauriRuntime()) return () => {};
  return mainThreadChannel.listen(listener);
}

// ---------------------------------------------------------------------------
// Overlay通知（過去実況窓 → コメントOverlay）
// ---------------------------------------------------------------------------

export interface ArchiveReplayOverlayEventBus {
  publish(event: ArchiveReplayOverlayEvent): Promise<void>;
  subscribe(listener: (event: ArchiveReplayOverlayEvent) => void): Promise<() => void>;
}

export class TauriArchiveReplayOverlayEventBus implements ArchiveReplayOverlayEventBus {
  async publish(event: ArchiveReplayOverlayEvent): Promise<void> {
    await overlayChannel.emit(event);
  }

  async subscribe(listener: (event: ArchiveReplayOverlayEvent) => void): Promise<() => void> {
    return overlayChannel.listen(listener);
  }
}

/** Storybook・単体テストではnative eventを起動せず、同じ契約を同期的に検証する。 */
export class MemoryArchiveReplayOverlayEventBus implements ArchiveReplayOverlayEventBus {
  readonly events: ArchiveReplayOverlayEvent[] = [];
  private readonly listeners = new Set<(event: ArchiveReplayOverlayEvent) => void>();

  async publish(event: ArchiveReplayOverlayEvent): Promise<void> {
    this.events.push(event);
    for (const listener of this.listeners) listener(event);
  }

  async subscribe(listener: (event: ArchiveReplayOverlayEvent) => void): Promise<() => void> {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

export function createArchiveReplayOverlayEventBus(): ArchiveReplayOverlayEventBus {
  return isTauriRuntime()
    ? new TauriArchiveReplayOverlayEventBus()
    : new MemoryArchiveReplayOverlayEventBus();
}
