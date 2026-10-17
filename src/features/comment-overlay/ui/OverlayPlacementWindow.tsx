import "./OverlayPlacementWindow.css";

import React, { createContext, useContext, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import {
  type AuxiliaryWindowOptions,
  useAuxiliaryWindow,
} from "src/features/auxiliary-window/browser/use-auxiliary-window";
import { commentOverlayWindowPlatform } from "src/features/comment-overlay/platform";
import { OverlayPlacementPanel } from "src/features/comment-overlay/ui/OverlayPlacementPanel";
import { useTheme } from "src/view/browser/hooks/use-theme";
import { ViewSurfaceProvider } from "src/view/browser/hooks/use-view-surface";

const OVERLAY_PLACEMENT_WINDOW_OPTIONS: AuxiliaryWindowOptions = {
  name: "chlens-comment-overlay-placement",
  features: "popup,width=760,height=720,resizable=yes",
  title: "コメントの表示位置 - read.crx 2",
  shellClassName: "overlay-placement-window-shell",
  logLabel: "OverlayPlacementWindow",
};

/** 別窓のrootはDOM要素なので、テーマ属性の更新は外部DOMへの同期として扱う。 */
function applyShellTheme(shell: HTMLElement, theme: string): void {
  shell.dataset.theme = theme;
}

type OpenOverlayPlacementWindow = (sourceWindow?: Window) => boolean;

const OverlayPlacementWindowContext = createContext<OpenOverlayPlacementWindow>(() => false);

/** 実況のステータス項目から、表示位置の調整窓を開く関数を受け取る。 */
export function useOpenOverlayPlacementWindow(): OpenOverlayPlacementWindow {
  return useContext(OverlayPlacementWindowContext);
}

/**
 * コメントOverlayの表示位置を調整する別窓を、アプリ全体で一つだけ管理する。
 *
 * 変更理由: 実況のステータス項目はペインや切り離したタブごとに描画されるため、
 * 各項目が別窓を持つと同名の窓へ複数のReactツリーがポータルされる。窓は最上位で一つにし、
 * 項目からは開く操作だけを呼ぶ。モニタープレビューはステータスバーの小窓やモーダルより
 * 広い領域で見たいので、メイン画面と並べて使える別窓にしている。
 */
export const OverlayPlacementWindowProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { root, open } = useAuxiliaryWindow(OVERLAY_PLACEMENT_WINDOW_OPTIONS);
  const theme = useTheme();

  useEffect(() => {
    void commentOverlayWindowPlatform.restorePlacement?.().catch((error: unknown) => {
      console.error("[ChLens] コメントOverlayの配置設定の復元に失敗しました:", error);
    });
  }, []);

  // メイン窓でテーマを切り替えたときも、開いている調整窓の色を追従させる。
  useEffect(() => {
    if (root) applyShellTheme(root, theme);
  }, [root, theme]);

  const placementWindow = root?.ownerDocument.defaultView ?? null;
  const viewSurface = useMemo(
    () =>
      placementWindow ? { window: placementWindow, document: placementWindow.document } : null,
    [placementWindow],
  );

  return (
    <OverlayPlacementWindowContext.Provider value={open}>
      {children}
      {root &&
        viewSurface &&
        createPortal(
          <ViewSurfaceProvider surface={viewSurface}>
            <main className="overlay-placement-window">
              {/* 窓のタイトルバーに名前と閉じる操作があるため、本文に見出しや閉じるボタンは置かない。 */}
              <OverlayPlacementPanel platform={commentOverlayWindowPlatform} />
            </main>
          </ViewSurfaceProvider>,
          root,
        )}
    </OverlayPlacementWindowContext.Provider>
  );
};
