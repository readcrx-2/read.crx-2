import React, { useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { useWriteSessionControls } from "src/features/write/browser/use-write-session";
import { WritePanelContent } from "src/features/write/ui/WritePanelContent";
import { StatusBar, StatusBarProvider } from "src/view/browser/components/StatusBar";
import { useTheme } from "src/view/browser/hooks/use-theme";
import { ViewSurfaceProvider } from "src/view/browser/hooks/use-view-surface";
import { ToastProvider } from "src/view/browser/ui/Toast";

/**
 * 名前付きブラウザ窓へ書き込みUIを一度だけポータルする。
 *
 * 変更理由: 書き込み欄を各ペインの子として描画すると、ペイン数に応じて投稿状態も
 * 複製される。表示場所だけを別窓へ移し、状態はWriteSessionProviderへ集約する。
 */
export const WriteWindowHost: React.FC = () => {
  const { writeWindowRoot, closeWriteWindow } = useWriteSessionControls();
  const theme = useTheme();

  // テーマ設定はメイン窓の変更後も書き込み窓へ反映し、窓を開き直すまで色が古いままに
  // ならないようにする。root生成時の初期値だけに依存すると切替後にずれる。
  useEffect(() => {
    if (!writeWindowRoot) {
      return;
    }
    writeWindowRoot.dataset.theme = theme;
  }, [theme, writeWindowRoot]);

  const writeWindow = writeWindowRoot?.ownerDocument.defaultView ?? null;
  const viewSurface = useMemo(
    () => (writeWindow ? { window: writeWindow, document: writeWindow.document } : null),
    [writeWindow],
  );

  if (!writeWindowRoot || !viewSurface) {
    return null;
  }

  return createPortal(
    <ViewSurfaceProvider surface={viewSurface}>
      <StatusBarProvider>
        {/* 別窓側にも通知UIと状態バーを置き、操作結果をメイン窓へ流さない。 */}
        <ToastProvider topOffset="16px" rightOffset="16px" />
        <main className="write-window">
          <div className="write-window__content">
            <WritePanelContent
              standalone
              onClose={closeWriteWindow}
              portalContainer={writeWindowRoot}
            />
          </div>
          <StatusBar />
        </main>
      </StatusBarProvider>
    </ViewSurfaceProvider>,
    writeWindowRoot,
  );
};
