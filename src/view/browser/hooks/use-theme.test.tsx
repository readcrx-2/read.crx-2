import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => {
  const readyCallbacks: Array<() => void> = [];
  return {
    readyCallbacks,
    configGet: vi.fn(() => "system"),
    configReady: vi.fn((callback: () => void) => {
      readyCallbacks.push(callback);
    }),
    messageOn: vi.fn(),
    messageOff: vi.fn(),
  };
});

vi.mock("src/service-container/index", () => ({
  container: {
    config: {
      get: mocks.configGet,
      ready: mocks.configReady,
    },
    message: {
      on: mocks.messageOn,
      off: mocks.messageOff,
    },
  },
}));

import { useTheme } from "src/view/browser/hooks/use-theme";

describe("useTheme", () => {
  beforeEach(() => {
    mocks.configGet.mockReset();
    mocks.configGet.mockReturnValue("system");
    mocks.configReady.mockClear();
    mocks.messageOn.mockClear();
    mocks.messageOff.mockClear();
    mocks.readyCallbacks.length = 0;
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    document.documentElement.removeAttribute("data-theme");
    document.querySelector('meta[name="color-scheme"]')?.remove();
  });

  it("設定の非同期読み込み完了後に保存済みのダークテーマを反映する", () => {
    const { result } = renderHook(() => useTheme());

    expect(result.current).toBe("light");
    expect(mocks.configReady).toHaveBeenCalledTimes(1);

    mocks.configGet.mockReturnValue("dark");
    act(() => {
      for (const callback of mocks.readyCallbacks) {
        callback();
      }
    });

    expect(result.current).toBe("dark");
  });

  it("ライトへ変更したら起動時のルート配色も更新する", () => {
    mocks.configGet.mockReturnValue("dark");
    const meta = document.createElement("meta");
    meta.name = "color-scheme";
    meta.content = "dark";
    document.head.append(meta);
    const { result } = renderHook(() => useTheme());
    expect(document.documentElement.dataset.theme).toBe("dark");

    const handleConfigUpdated = mocks.messageOn.mock.calls.find(
      ([type]) => type === "config_updated",
    )?.[1] as (event: { key: string; val: string }) => void;
    act(() => handleConfigUpdated({ key: "theme_id", val: "default" }));

    expect(result.current).toBe("light");
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(meta.content).toBe("light");
  });
});
