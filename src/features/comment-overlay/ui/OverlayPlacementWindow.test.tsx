import { act, cleanup, render, waitFor } from "@testing-library/react";
import { container } from "src/service-container/index";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  restorePlacement: vi.fn(),
  setAlwaysOnTop: vi.fn(),
  open: vi.fn(),
}));

vi.mock("src/features/auxiliary-window/browser/use-auxiliary-window", () => ({
  useAuxiliaryWindow: () => ({ root: null, open: mocks.open }),
}));
vi.mock("src/features/comment-overlay/platform", () => ({
  commentOverlayWindowPlatform: mocks,
}));
vi.mock("src/features/comment-overlay/ui/OverlayPlacementPanel", () => ({
  OverlayPlacementPanel: () => null,
}));
vi.mock("src/view/browser/hooks/use-theme", () => ({ useTheme: () => "dark" }));

import { OverlayPlacementWindowProvider } from "./OverlayPlacementWindow";

describe("表示位置調整窓の設定同期", () => {
  let stored: string | null;
  let listeners: Set<(payload: { key: string }) => void>;

  beforeEach(() => {
    stored = null;
    listeners = new Set();
    mocks.restorePlacement.mockResolvedValue(undefined);
    mocks.setAlwaysOnTop.mockReset();
    mocks.setAlwaysOnTop.mockResolvedValue(undefined);
    container.config = {
      get: (key) => (key === "comment_overlay_always_on_top" ? stored : null),
      set: vi.fn(),
      getAll: () => ({}),
      ready: (callback) => callback(),
    };
    container.message = {
      on: (_type: string, listener: (payload: { key: string }) => void) => {
        listeners.add(listener);
      },
      off: (_type: string, listener: (payload: { key: string }) => void) => {
        listeners.delete(listener);
      },
    } as unknown as typeof container.message;
  });

  afterEach(cleanup);

  it("最前面表示は未設定なら無効にする", async () => {
    render(
      <OverlayPlacementWindowProvider>
        <span>メイン画面</span>
      </OverlayPlacementWindowProvider>,
    );
    await waitFor(() => expect(mocks.setAlwaysOnTop).toHaveBeenLastCalledWith(false));
  });

  it("調整窓を開かずに保存値を復元し、設定変更をその場で反映する", async () => {
    stored = "on";
    render(
      <OverlayPlacementWindowProvider>
        <span>メイン画面</span>
      </OverlayPlacementWindowProvider>,
    );
    await waitFor(() => expect(mocks.setAlwaysOnTop).toHaveBeenLastCalledWith(true));
    act(() => {
      stored = "off";
      for (const listener of listeners) listener({ key: "comment_overlay_always_on_top" });
    });
    await waitFor(() => expect(mocks.setAlwaysOnTop).toHaveBeenLastCalledWith(false));
    expect(mocks.open).not.toHaveBeenCalled();
  });
});
