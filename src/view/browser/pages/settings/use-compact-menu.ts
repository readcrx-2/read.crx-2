import { useCallback, useEffect, useRef, useState } from "react";

/** 狭い画面で、ホットゾーンにカーソルを置いたときだけ開く項目メニューの開閉を管理する。 */
export function useCompactMenu(isCompact: boolean) {
  const [isCompactMenuOpen, setIsCompactMenuOpen] = useState(false);
  const compactMenuCloseTimerRef = useRef<number | null>(null);

  const clearCompactMenuCloseTimer = useCallback(() => {
    if (compactMenuCloseTimerRef.current != null) {
      window.clearTimeout(compactMenuCloseTimerRef.current);
      compactMenuCloseTimerRef.current = null;
    }
  }, []);

  const openCompactMenu = useCallback(() => {
    clearCompactMenuCloseTimer();
    setIsCompactMenuOpen(true);
  }, [clearCompactMenuCloseTimer]);

  const closeCompactMenu = useCallback(() => {
    clearCompactMenuCloseTimer();
    setIsCompactMenuOpen(false);
  }, [clearCompactMenuCloseTimer]);

  const scheduleCompactMenuClose = useCallback(() => {
    clearCompactMenuCloseTimer();
    // 変更理由: ホットゾーンからメニュー本体へカーソルを移動する短時間で閉じないよう遅延を設ける。
    compactMenuCloseTimerRef.current = window.setTimeout(() => {
      compactMenuCloseTimerRef.current = null;
      setIsCompactMenuOpen(false);
    }, 120);
  }, [clearCompactMenuCloseTimer]);

  useEffect(() => clearCompactMenuCloseTimer, [clearCompactMenuCloseTimer]);

  useEffect(() => {
    if (!isCompact) {
      clearCompactMenuCloseTimer();
      setIsCompactMenuOpen(false);
    }
  }, [clearCompactMenuCloseTimer, isCompact]);

  return {
    isCompactMenuOpen,
    openCompactMenu,
    closeCompactMenu,
    scheduleCompactMenuClose,
  };
}
