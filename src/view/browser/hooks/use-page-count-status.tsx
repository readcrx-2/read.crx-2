import React, {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

export type PageCountKind = "thread" | "threadList";
export type PageCountValue = {
  kind: PageCountKind;
  count: number | null;
  /** 絞り込み中だけ設定する、表示中の件数。未設定なら絞り込みなしとして扱う。 */
  filteredCount?: number | null;
};

interface PageCountStatusContextValue {
  getPageCount: (key: string) => PageCountValue | undefined;
  setPageCount: (key: string, value: PageCountValue | null) => void;
}

const defaultPageCountStatus: PageCountStatusContextValue = {
  getPageCount: () => undefined,
  setPageCount: () => {},
};

const PageCountStatusContext = createContext<PageCountStatusContextValue>(defaultPageCountStatus);

export const PageCountStatusProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [countsByPage, setCountsByPage] = useState<Record<string, PageCountValue>>({});

  const getPageCount = useCallback((key: string) => countsByPage[key], [countsByPage]);
  const setPageCount = useCallback((key: string, value: PageCountValue | null) => {
    setCountsByPage((current) => {
      if (value == null) {
        if (!(key in current)) {
          return current;
        }
        const next = { ...current };
        delete next[key];
        return next;
      }

      const previous = current[key];
      if (
        previous?.kind === value.kind &&
        previous.count === value.count &&
        previous.filteredCount === value.filteredCount
      ) {
        return current;
      }
      return { ...current, [key]: value };
    });
  }, []);

  const contextValue = useMemo(
    () => ({ getPageCount, setPageCount }),
    [getPageCount, setPageCount],
  );

  return (
    <PageCountStatusContext.Provider value={contextValue}>
      {children}
    </PageCountStatusContext.Provider>
  );
};

export function usePageCountStatus(): PageCountStatusContextValue {
  return useContext(PageCountStatusContext);
}

export function getThreadPageCountKey(tabId: string, threadUrl: string): string {
  return `thread:${tabId}:${threadUrl}`;
}

export function getThreadListPageCountKey(tabId: string, boardUrl: string): string {
  return `thread-list:${tabId}:${boardUrl}`;
}
