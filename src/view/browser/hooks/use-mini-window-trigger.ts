import { useCallback, useEffect, useRef, useState } from "react";

interface UseMiniWindowTriggerResult {
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  /** 開いている間だけ値を持つ。MiniWindowの `anchor` へそのまま渡す。 */
  anchor: DOMRect | null;
  toggle: () => void;
  close: () => void;
}

/**
 * ステータスバー項目からMiniWindowを開閉するための状態をまとめる。
 * `resetKey` が変わったら閉じ、表示対象が切り替わった後に古い対象向けの操作が残らないようにする。
 */
export function useMiniWindowTrigger(resetKey?: unknown): UseMiniWindowTriggerResult {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    setIsOpen(false);
  }, [resetKey]);

  const toggle = useCallback(() => {
    // 開くたびに位置を測り直し、ステータスバー項目の並びが変わっても真上に出す。
    if (triggerRef.current) {
      setAnchorRect(triggerRef.current.getBoundingClientRect());
    }
    setIsOpen((current) => !current);
  }, []);

  const close = useCallback(() => setIsOpen(false), []);

  return { triggerRef, anchor: isOpen ? anchorRect : null, toggle, close };
}
