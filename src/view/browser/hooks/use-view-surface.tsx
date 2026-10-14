import { createContext, type ReactNode, useContext, useMemo } from "react";

export interface ViewSurface {
  window: Window;
  document: Document;
}

// 既存のメイン画面はProviderなしでも動くよう、現在の表示環境を既定値にする。
const defaultViewSurface: ViewSurface = {
  window: globalThis.window,
  document: globalThis.document,
};

const ViewSurfaceContext = createContext<ViewSurface>(defaultViewSurface);

/**
 * ページが操作するWindow/Documentを取得する。
 *
 * 変更理由: ページ内でグローバルのwindow/documentを直接参照すると、同じタブ本体を
 * 別窓へ描画したときにイベント登録先や選択範囲が元の窓へ戻るため、表示環境を注入可能にする。
 */
export function useViewSurface(): ViewSurface {
  return useContext(ViewSurfaceContext);
}

export const ViewSurfaceProvider: React.FC<{ surface: ViewSurface; children: ReactNode }> = ({
  surface,
  children,
}) => {
  const value = useMemo(() => surface, [surface]);
  return <ViewSurfaceContext.Provider value={value}>{children}</ViewSurfaceContext.Provider>;
};
