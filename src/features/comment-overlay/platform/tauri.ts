import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import {
  availableMonitors,
  currentMonitor,
  LogicalPosition,
  LogicalSize,
  PhysicalPosition,
  PhysicalSize,
  Window,
} from "@tauri-apps/api/window";

import {
  cloneCommentOverlayGeometry,
  fallbackCommentOverlayGeometry,
  fitCommentOverlayGeometryToWorkArea,
  loadStoredCommentOverlayGeometry,
  saveStoredCommentOverlayGeometry,
} from "./geometry";
import {
  loadOverlayAttachment,
  saveOverlayAttachment,
  type StoredOverlayAttachment,
} from "./placement";
import type {
  CommentOverlayAttachmentWindow,
  CommentOverlayGeometry,
  CommentOverlayMonitor,
  CommentOverlayWindowPlatform,
} from "./types";

export const COMMENT_OVERLAY_WINDOW_LABEL = "comment-overlay";
export const COMMENT_OVERLAY_VISIBILITY_EVENT_NAME = "chlens://comment-overlay-visibility";

interface PhysicalWindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
  scaleFactor: number;
}

interface LogicalWorkArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface CommentOverlayVisibilityPayload {
  visible: boolean;
}

function isCommentOverlayVisibilityPayload(
  payload: unknown,
): payload is CommentOverlayVisibilityPayload {
  return (
    typeof payload === "object" &&
    payload !== null &&
    "visible" in payload &&
    typeof payload.visible === "boolean"
  );
}

async function getCommentOverlayWindow(): Promise<Window> {
  const overlay = await Window.getByLabel(COMMENT_OVERLAY_WINDOW_LABEL);
  if (!overlay) {
    throw new Error(`Tauri window '${COMMENT_OVERLAY_WINDOW_LABEL}' is not available`);
  }
  return overlay;
}

async function readPhysicalWindowBounds(window: Window): Promise<PhysicalWindowBounds> {
  const [position, size, scaleFactor] = await Promise.all([
    window.outerPosition(),
    window.outerSize(),
    window.scaleFactor(),
  ]);
  return {
    x: position.x,
    y: position.y,
    width: size.width,
    height: size.height,
    scaleFactor,
  };
}

async function readCommentOverlayGeometry(window: Window): Promise<CommentOverlayGeometry> {
  const bounds = await readPhysicalWindowBounds(window);
  // Tauriは外側の境界を物理pixelで返すため、保存値と操作パネルを論理pixelへ統一する。
  return {
    x: bounds.x / bounds.scaleFactor,
    y: bounds.y / bounds.scaleFactor,
    width: bounds.width / bounds.scaleFactor,
    height: bounds.height / bounds.scaleFactor,
  };
}

async function readCommentOverlayMonitors(): Promise<readonly CommentOverlayMonitor[]> {
  const monitors = await availableMonitors();
  return monitors
    .map((monitor, index) => ({
      // 変更理由: モニター名は環境によってnullになるため、操作パネルで常に識別できる
      // 安定したfallback id/nameを生成する。
      id: `monitor-${index + 1}`,
      name: monitor.name ?? `モニター${index + 1}`,
      x: monitor.position.x / monitor.scaleFactor,
      y: monitor.position.y / monitor.scaleFactor,
      width: monitor.size.width / monitor.scaleFactor,
      height: monitor.size.height / monitor.scaleFactor,
      scaleFactor: monitor.scaleFactor,
    }))
    .filter((monitor) => monitor.width > 0 && monitor.height > 0);
}

async function fitGeometryToAvailableMonitor(
  geometry: CommentOverlayGeometry,
): Promise<CommentOverlayGeometry> {
  const monitors = await availableMonitors();
  const workAreas: LogicalWorkArea[] = monitors
    .map((monitor) => ({
      x: monitor.workArea.position.x / monitor.scaleFactor,
      y: monitor.workArea.position.y / monitor.scaleFactor,
      width: monitor.workArea.size.width / monitor.scaleFactor,
      height: monitor.workArea.size.height / monitor.scaleFactor,
    }))
    .filter((workArea) => workArea.width > 0 && workArea.height > 0);
  if (workAreas.length === 0) return fallbackCommentOverlayGeometry(geometry);

  const normalized = fallbackCommentOverlayGeometry(geometry);
  const centerX = normalized.x + normalized.width / 2;
  const centerY = normalized.y + normalized.height / 2;
  const workArea =
    workAreas.find(
      (candidate) =>
        centerX >= candidate.x &&
        centerX <= candidate.x + candidate.width &&
        centerY >= candidate.y &&
        centerY <= candidate.y + candidate.height,
    ) ?? workAreas[0];

  return fitCommentOverlayGeometryToWorkArea(normalized, workArea);
}

export function createTauriCommentOverlayPlatform({
  managePlacement = true,
} = {}): CommentOverlayWindowPlatform {
  let targetId: string | null = null;
  let processTarget: StoredOverlayAttachment | null = null;
  let placementRestored: Promise<void> | null = null;
  let attachmentError: string | null = null;
  let attachmentTimer: ReturnType<typeof setTimeout> | null = null;
  let wantedVisible = false;
  let revision = 0;
  let lastBounds = "";
  let targetHidden = false;
  const followTarget = async (expectedRevision: number): Promise<void> => {
    if ((!targetId && !processTarget) || expectedRevision !== revision) return;
    try {
      if (!targetId && processTarget) {
        const windows = await invoke<CommentOverlayAttachmentWindow[]>(
          "list_comment_overlay_windows",
        );
        if (expectedRevision !== revision) return;
        const candidates = windows.filter(
          (window) =>
            window.processPath?.toLowerCase() === processTarget?.processPath.toLowerCase(),
        );
        targetId =
          (candidates.find((window) => window.title === processTarget?.title) ?? candidates[0])
            ?.id ?? null;
      }
      const bounds = targetId
        ? await invoke<CommentOverlayGeometry | null>("read_comment_overlay_target", {
            id: targetId,
          })
        : null;
      const overlay = await getCommentOverlayWindow();
      if (expectedRevision !== revision) return;
      if (bounds) {
        attachmentError = null;
        const serialized = JSON.stringify(bounds);
        if (serialized !== lastBounds) {
          // native側の物理座標をそのまま使い、画面をまたぐ際のDPI換算のずれを防ぐ。
          await overlay.setPosition(new PhysicalPosition(bounds.x, bounds.y));
          if (expectedRevision !== revision) return;
          await overlay.setSize(new PhysicalSize(bounds.width, bounds.height));
          lastBounds = serialized;
        }
        if (expectedRevision !== revision) return;
        if (wantedVisible && targetHidden) await overlay.show();
        targetHidden = false;
      } else {
        if (!targetHidden) await overlay.hide();
        targetHidden = true;
      }
    } catch (error: unknown) {
      if (expectedRevision !== revision) return;
      console.error("[ChLens] コメントOverlayのウィンドウ追従に失敗しました:", error);
      attachmentError = String(error);
      targetId = null;
      lastBounds = "";
      // 対象の終了後もプロセス設定を残し、同じアプリの次のウィンドウを探し直す。
      if (processTarget) {
        try {
          await (await getCommentOverlayWindow()).hide();
        } catch (hideError: unknown) {
          console.error("[ChLens] 追従先終了後のOverlay非表示に失敗しました:", hideError);
        }
        targetHidden = true;
      } else if (wantedVisible && targetHidden) {
        try {
          await (await getCommentOverlayWindow()).show();
        } catch (showError: unknown) {
          console.error("[ChLens] 追従解除後のOverlay再表示に失敗しました:", showError);
        }
      }
      if (!processTarget) targetHidden = false;
    }
    // Overlay自身の表示・非表示と切り離してMain側で直列に更新し、IPCの重複を防ぐ。
    if ((targetId || processTarget) && expectedRevision === revision) {
      attachmentTimer = setTimeout(
        () => {
          void followTarget(expectedRevision);
        },
        targetId ? 100 : 1000,
      );
    }
  };
  const publishWindowVisibility = async (visible: boolean): Promise<void> => {
    // MainとOverlayは別WebViewでplatform instanceも分かれるため、broadcastで状態を共有する。
    await emit(COMMENT_OVERLAY_VISIBILITY_EVENT_NAME, { visible });
  };

  const platform: CommentOverlayWindowPlatform = {
    async setAlwaysOnTop(enabled) {
      await (await getCommentOverlayWindow()).setAlwaysOnTop(enabled);
    },
    attachment: {
      listWindows: () => invoke("list_comment_overlay_windows"),
      getState: () => ({
        targetId,
        error: attachmentError,
        ...(processTarget ? { processPath: processTarget.processPath } : {}),
      }),
      async setTarget(id) {
        await platform.restorePlacement?.();
        const windows = id
          ? await invoke<CommentOverlayAttachmentWindow[]>("list_comment_overlay_windows")
          : [];
        const selected = windows.find((window) => window.id === id);
        const nextProcessTarget = selected?.processPath
          ? { processPath: selected.processPath, title: selected.title }
          : null;
        saveOverlayAttachment(nextProcessTarget);
        const wasFollowing = targetId != null || processTarget != null;
        const nextRevision = ++revision;
        if (attachmentTimer) clearTimeout(attachmentTimer);
        targetId = id;
        processTarget = nextProcessTarget;
        attachmentError = null;
        lastBounds = "";
        if (id) {
          await followTarget(nextRevision);
          if (attachmentError) throw new Error(attachmentError);
        } else {
          const stored = loadStoredCommentOverlayGeometry();
          if (wasFollowing && stored) await applyGeometry(stored);
          if (wantedVisible && targetHidden) await (await getCommentOverlayWindow()).show();
          targetHidden = false;
        }
      },
    },
    async restorePlacement() {
      // 表示窓・過去実況窓にもplatformがあるため、復元と追従ループはMainだけが所有する。
      if (!managePlacement) return;
      placementRestored ??= (async () => {
        await platform.loadGeometry();
        processTarget = loadOverlayAttachment();
        if (processTarget) await followTarget(++revision);
      })().catch((error: unknown) => {
        placementRestored = null;
        throw error;
      });
      await placementRestored;
    },
    async show() {
      await platform.restorePlacement?.();
      wantedVisible = true;
      const overlay = await getCommentOverlayWindow();
      await overlay.unminimize();
      if (!targetHidden) await overlay.show();
      await publishWindowVisibility(true);
    },
    async hide() {
      wantedVisible = false;
      await (await getCommentOverlayWindow()).hide();
      await publishWindowVisibility(false);
    },
    async focus() {
      await platform.restorePlacement?.();
      wantedVisible = true;
      const overlay = await getCommentOverlayWindow();
      await overlay.unminimize();
      await overlay.show();
      await publishWindowVisibility(true);
      await overlay.setFocus();
    },
    async minimize() {
      wantedVisible = false;
      await (await getCommentOverlayWindow()).minimize();
      await publishWindowVisibility(false);
    },
    async toggleMaximize() {
      await (await getCommentOverlayWindow()).toggleMaximize();
    },
    async close() {
      // ウィンドウを破棄せず非表示にすることで、Mainから再表示できる状態を保つ。
      await platform.hide();
    },
    async watchVisibility(listener: (visible: boolean) => void) {
      let revision = 0;
      let disposed = false;
      const synchronize = async (): Promise<void> => {
        const requestedRevision = ++revision;
        try {
          const nativeVisible = await (await getCommentOverlayWindow()).isVisible();
          // 追従先の最小化による一時的な非表示は、実況OFFとしてMainへ戻さない。
          const visible =
            (targetId || processTarget) && targetHidden ? wantedVisible : nativeVisible;
          // 遅れて届いた初期取得や古いeventで、新しいnative表示状態を上書きしない。
          if (!disposed && requestedRevision === revision) listener(visible);
        } catch (error: unknown) {
          console.error("[ChLens] コメントOverlayの表示状態同期に失敗しました:", error);
        }
      };
      const unlisten = await listen<CommentOverlayVisibilityPayload>(
        COMMENT_OVERLAY_VISIBILITY_EVENT_NAME,
        ({ payload }) => {
          if (!isCommentOverlayVisibilityPayload(payload)) {
            console.error("[ChLens] コメントOverlayの表示状態eventを検証できません:", payload);
            return;
          }
          // 過去実況窓での表示操作もMainの追従ループへ引き継ぐ。
          wantedVisible = payload.visible;
          void synchronize();
        },
      );

      void synchronize();
      return () => {
        disposed = true;
        unlisten();
      };
    },
    async getMonitors() {
      return readCommentOverlayMonitors();
    },
    async getHostMonitorId() {
      // 変更理由: 調整窓を開いた直後に、ChLensを表示している画面をプレビューしたい。
      // 座標の比較はDPI倍率の違いでずれるため、native側が判定したモニターを使い、
      // getMonitorsと同じ並び順のidへ対応付ける。
      const [monitors, current] = await Promise.all([availableMonitors(), currentMonitor()]);
      if (!current) return null;
      const index = monitors.findIndex(
        (monitor) =>
          monitor.position.x === current.position.x && monitor.position.y === current.position.y,
      );
      return index < 0 ? null : `monitor-${index + 1}`;
    },
    async captureMonitorPreview(monitor) {
      // nativeの物理座標を使い、負座標や画面ごとのDPI倍率も実際の撮影先へ反映する。
      return invoke<string | null>("capture_comment_overlay_monitor_preview", {
        x: Math.round(monitor.x * monitor.scaleFactor),
        y: Math.round(monitor.y * monitor.scaleFactor),
        width: Math.round(monitor.width * monitor.scaleFactor),
        height: Math.round(monitor.height * monitor.scaleFactor),
      });
    },
    async getGeometry() {
      return readCommentOverlayGeometry(await getCommentOverlayWindow());
    },
    async watchGeometry(listener: (geometry: CommentOverlayGeometry) => void) {
      const overlay = await getCommentOverlayWindow();
      const [unlistenMoved, unlistenResized] = await Promise.all([
        overlay.onMoved(() => {
          void readCommentOverlayGeometry(overlay)
            .then(listener)
            .catch((error: unknown) => {
              console.error("[ChLens] コメントOverlayの移動geometry取得に失敗しました:", error);
            });
        }),
        overlay.onResized(() => {
          void readCommentOverlayGeometry(overlay)
            .then(listener)
            .catch((error: unknown) => {
              console.error("[ChLens] コメントOverlayのリサイズgeometry取得に失敗しました:", error);
            });
        }),
      ]);
      return () => {
        unlistenMoved();
        unlistenResized();
      };
    },
    async setGeometry(geometry: CommentOverlayGeometry) {
      // 手動調整を始めたら追従を解除し、次の更新で元の範囲へ戻されないようにする。
      await platform.attachment?.setTarget(null);
      await applyGeometry(geometry);
    },
    async loadGeometry() {
      const stored = loadStoredCommentOverlayGeometry();
      if (!stored) return null;

      // 自由な縦横比で指定した領域を再起動後も維持し、復元時に16:9へ戻さない。
      let restored = fallbackCommentOverlayGeometry(stored);
      try {
        // 変更理由: モニター構成やタスクバー位置が変わっても、保存済みOverlayを
        // 完全に画面外へ残さず操作パネルから復帰できるよう、復元時だけwork areaへ収める。
        restored = await fitGeometryToAvailableMonitor(restored);
      } catch (error: unknown) {
        console.error("[ChLens] コメントOverlayのwork area取得に失敗しました:", error);
      }
      await applyGeometry(restored);
      if (JSON.stringify(restored) !== JSON.stringify(stored)) {
        saveStoredCommentOverlayGeometry(restored);
      }
      return cloneCommentOverlayGeometry(restored);
    },
    async saveGeometry(geometry: CommentOverlayGeometry) {
      saveStoredCommentOverlayGeometry(geometry);
    },
  };

  async function applyGeometry(geometry: CommentOverlayGeometry): Promise<void> {
    const normalized = fallbackCommentOverlayGeometry(geometry);
    const overlay = await getCommentOverlayWindow();
    await overlay.setPosition(new LogicalPosition(normalized.x, normalized.y));
    await overlay.setSize(new LogicalSize(normalized.width, normalized.height));
  }

  return platform;
}
