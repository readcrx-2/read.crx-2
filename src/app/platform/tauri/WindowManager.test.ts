import { describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  unminimize: vi.fn(),
  show: vi.fn(),
  setFocus: vi.fn(),
  labels: [] as string[],
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: vi.fn(),
  Window: class {
    constructor(label: string) {
      mocks.labels.push(label);
    }
    unminimize = mocks.unminimize;
    show = mocks.show;
    setFocus = mocks.setFocus;
  },
}));

import { TauriWindowManager } from "./WindowManager";

describe("Tauriの別窓フォーカス", () => {
  it("同じラベルのOS窓を復元し、表示してからフォーカスする", async () => {
    const popup = { __chlensPopupLabel: "chlens-popup-3" } as unknown as Window;
    await TauriWindowManager.focusPopup!(popup);
    expect(mocks.labels).toEqual(["chlens-popup-3"]);
    expect(mocks.unminimize).toHaveBeenCalledBefore(mocks.show);
    expect(mocks.show).toHaveBeenCalledBefore(mocks.setFocus);
  });

  it("ラベルがないときは別の窓へフォーカスせず失敗を通知する", async () => {
    await expect(TauriWindowManager.focusPopup!({} as Window)).rejects.toThrow(
      "別窓のTauriラベルを取得できませんでした",
    );
  });
});
