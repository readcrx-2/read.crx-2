import { createContext, type ReactNode, useContext, useMemo } from "react";

export interface TabViewScope {
  /** 表示対象タブが所属するペイン。操作の暗黙スコープにも使う。 */
  paneId: string;
  /** この表示領域が描画するタブ。メイン画面では指定しない。 */
  tabId: string;
}

const TabViewScopeContext = createContext<TabViewScope | null>(null);

/**
 * タブ本体を表示している領域の対象を固定する。
 *
 * 変更理由: 別窓は元ペインのselectedTabを変更せずに同じタブを表示するため、
 * 共通のタイトルバーやステータス項目が「表示中のタブ」を参照できる境界が必要になる。
 */
export const TabViewScopeProvider: React.FC<{
  scope: TabViewScope;
  children: ReactNode;
}> = ({ scope, children }) => {
  const value = useMemo(
    () => ({ paneId: scope.paneId, tabId: scope.tabId }),
    [scope.paneId, scope.tabId],
  );
  return <TabViewScopeContext.Provider value={value}>{children}</TabViewScopeContext.Provider>;
};

export function useTabViewScope(): TabViewScope | null {
  return useContext(TabViewScopeContext);
}
