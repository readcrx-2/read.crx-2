import { Toast as RadixToast } from "radix-ui";
import type { CSSProperties } from "react";
import { useCallback, useSyncExternalStore } from "react";
import { TOAST_DISPLAY_DURATION_MS, toastStore } from "src/service-container/toast-store";
import { useViewSurface } from "src/view/browser/hooks/use-view-surface";

interface ToastProviderProps {
  topOffset: string;
  rightOffset: string;
  duration?: number;
}

/** Radix Toastと外部発火用ストアを接続する、browser view共通の通知UI。 */
export function ToastProvider({
  topOffset,
  rightOffset,
  duration = TOAST_DISPLAY_DURATION_MS,
}: ToastProviderProps) {
  const { window: targetWindow } = useViewSurface();
  const records = useSyncExternalStore(
    useCallback((listener) => toastStore.subscribe(listener, targetWindow), [targetWindow]),
    useCallback(() => toastStore.getSnapshot(targetWindow), [targetWindow]),
    useCallback(() => toastStore.getSnapshot(targetWindow), [targetWindow]),
  );
  const viewportStyle = {
    "--cmp-toast-offset-top": topOffset,
    "--cmp-toast-offset-right": rightOffset,
  } as CSSProperties;

  return (
    <RadixToast.Provider duration={duration} label="通知">
      {records.map((record) => (
        <RadixToast.Root
          key={record.id}
          className="browser-toast"
          data-kind={record.kind}
          onOpenChange={(open) => {
            if (!open) {
              toastStore.dismiss(record.id, targetWindow);
            }
          }}
          style={
            record.backgroundColor
              ? ({ "--cmp-toast-background": record.backgroundColor } as CSSProperties)
              : undefined
          }
        >
          <RadixToast.Title className="browser-toast__title">{record.message}</RadixToast.Title>
          <RadixToast.Close className="browser-toast__close" aria-label="通知を閉じる">
            ×
          </RadixToast.Close>
        </RadixToast.Root>
      ))}
      <RadixToast.Viewport className="browser-toast-viewport" style={viewportStyle} />
    </RadixToast.Provider>
  );
}
