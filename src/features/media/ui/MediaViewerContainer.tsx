import { useCallback, useEffect, useRef, useState } from "react";
import type { AuxiliaryWindowOptions } from "src/features/auxiliary-window";
import { type AuxiliaryWindowWatcher, watchAuxiliaryWindow } from "src/features/auxiliary-window";
import { openAuxiliaryWindow } from "src/features/auxiliary-window";
import {
  useViewSurface,
  type ViewSurface,
  ViewSurfaceProvider,
} from "src/view/browser/hooks/use-view-surface";

import { useMediaViewerStore } from "../browser/use-media-viewer-store";
import { MediaViewerContent } from "./MediaViewerContent";

interface MediaViewerContainerProps {
  scopeId: string;
}

interface DetachedMediaViewerWindow {
  window: Window;
  root: HTMLElement;
  watcher: AuxiliaryWindowWatcher;
}

const MEDIA_VIEWER_WINDOW_OPTIONS: AuxiliaryWindowOptions = {
  name: "readcrx-media-viewer",
  features: "popup,width=1180,height=820,resizable=yes",
  title: "画像ビューア - read.crx 2",
  shellClassName: "detached-media-viewer-window",
  logLabel: "MediaViewer",
};

export function MediaViewerContainer({
  scopeId,
}: MediaViewerContainerProps): React.ReactElement | null {
  const sourceSurface = useViewSurface();
  const viewerScopeId = useMediaViewerStore((state) => state.viewerScopeId);
  const [detached, setDetached] = useState<DetachedMediaViewerWindow | null>(null);
  const detachedRef = useRef(detached);
  detachedRef.current = detached;

  const removeDetachedWindow = useCallback((expectedWindow?: Window) => {
    const current = detachedRef.current;
    if (!current || (expectedWindow && current.window !== expectedWindow)) {
      return;
    }
    current.watcher.unwatch();
    detachedRef.current = null;
    setDetached(null);
  }, []);

  const attachToSource = useCallback(() => {
    const current = detachedRef.current;
    if (!current) {
      return;
    }
    removeDetachedWindow(current.window);
    if (!current.window.closed) {
      current.window.close();
    }
  }, [removeDetachedWindow]);

  useEffect(() => {
    if (detached && viewerScopeId !== scopeId) {
      // 単一viewerが別scopeへ移った時、旧scopeの別窓だけを残さない。
      attachToSource();
    }
  }, [attachToSource, detached, scopeId, viewerScopeId]);

  const detach = useCallback(() => {
    const current = detachedRef.current;
    if (current && !current.window.closed) {
      current.window.focus();
      return;
    }

    // popupはユーザー操作の同期中に作り、ブロックを避ける。失敗時は元の表示を維持する。
    const opened = openAuxiliaryWindow(MEDIA_VIEWER_WINDOW_OPTIONS, sourceSurface.window);
    if (!opened) {
      return;
    }

    const entry: DetachedMediaViewerWindow = {
      ...opened,
      watcher: watchAuxiliaryWindow({
        window: opened.window,
        sourceDocument: sourceSurface.document,
        isCurrent: () => detachedRef.current?.window === opened.window,
        // 再読み込みで消えたPortal rootだけを作り直し、controllerと画像状態を保持する。
        getReconnectOptions: () => MEDIA_VIEWER_WINDOW_OPTIONS,
        onClosed: () => {
          useMediaViewerStore.getState().closeViewer(scopeId);
          removeDetachedWindow(opened.window);
        },
        onReconnect: (root) => {
          const latest = detachedRef.current;
          if (latest?.window === opened.window) {
            const next = { ...latest, root };
            detachedRef.current = next;
            setDetached(next);
          }
        },
      }),
    };
    detachedRef.current = entry;
    setDetached(entry);
    opened.window.focus();
  }, [removeDetachedWindow, scopeId, sourceSurface.document, sourceSurface.window]);

  useEffect(() => {
    if (!detached) {
      return;
    }
    // beforeunloadの発火差を補い、OSの×でclosedになった時だけviewerを終了する。
    const monitorId = sourceSurface.window.setInterval(() => {
      if (detached.window.closed && detachedRef.current?.window === detached.window) {
        useMediaViewerStore.getState().closeViewer(scopeId);
        removeDetachedWindow(detached.window);
      }
    }, 250);
    return () => sourceSurface.window.clearInterval(monitorId);
  }, [detached, removeDetachedWindow, scopeId, sourceSurface.window]);

  useEffect(() => {
    return () => {
      const current = detachedRef.current;
      if (!current) {
        return;
      }
      current.watcher.release();
    };
  }, []);

  const surface: ViewSurface = detached
    ? { window: detached.window, document: detached.window.document }
    : sourceSurface;

  return (
    <ViewSurfaceProvider surface={surface}>
      <MediaViewerContent
        scopeId={scopeId}
        isDetached={detached !== null}
        onDetach={detach}
        onAttach={attachToSource}
        portalRoot={detached?.root ?? null}
      />
    </ViewSurfaceProvider>
  );
}
