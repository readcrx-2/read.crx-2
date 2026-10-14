import { useMemo } from "react";
import { container } from "src/service-container/index";
import type { IToastService } from "src/service-container/interfaces";
import { useViewSurface } from "src/view/browser/hooks/use-view-surface";

/**
 * 表示中のWindowへ通知を送るToastサービスを返す。
 *
 * 変更理由: 別窓へportalされたページから共有のcontainer.toastを直接呼ぶと、
 * メイン窓のToastProviderへ通知が流れるため、表示環境を通知の宛先にも引き継ぐ。
 */
export function useToast(): IToastService {
  const { window: targetWindow } = useViewSurface();

  return useMemo<IToastService>(
    () => ({
      notify: (message, options) => container.toast.notify(message, { ...options, targetWindow }),
      success: (message, options) => container.toast.success(message, { ...options, targetWindow }),
      error: (message, options) => container.toast.error(message, { ...options, targetWindow }),
      info: (message, options) => container.toast.info(message, { ...options, targetWindow }),
    }),
    [targetWindow],
  );
}
