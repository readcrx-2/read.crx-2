import "@testing-library/jest-dom/vitest";

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import type { CommentOverlayWindowPlatform } from "../platform/types";
import { OverlayPlacementPanel } from "./OverlayPlacementPanel";

function createPlatform(targetId: string | null): {
  platform: CommentOverlayWindowPlatform;
  setTarget: (id: string | null) => Promise<void>;
} {
  let currentTarget = targetId;
  const setTarget = vi.fn(async (id: string | null) => {
    currentTarget = id;
  });
  const platform = {
    attachment: {
      listWindows: vi.fn().mockResolvedValue([{ id: "player", title: "動画プレイヤー" }]),
      getState: () => ({ targetId: currentTarget, error: null }),
      setTarget,
    },
    getMonitors: vi.fn().mockResolvedValue([
      {
        id: "monitor-1",
        name: "メインモニター",
        x: 0,
        y: 0,
        width: 1920,
        height: 1080,
        scaleFactor: 1,
      },
      {
        id: "monitor-2",
        name: "サブモニター",
        x: 1920,
        y: 0,
        width: 2560,
        height: 1440,
        scaleFactor: 1,
      },
    ]),
    getHostMonitorId: vi.fn().mockResolvedValue("monitor-1"),
    getGeometry: vi.fn().mockResolvedValue({ x: 100, y: 100, width: 800, height: 600 }),
    watchGeometry: vi.fn().mockResolvedValue(() => {}),
    setGeometry: vi.fn().mockResolvedValue(undefined),
    saveGeometry: vi.fn().mockResolvedValue(undefined),
  } as unknown as CommentOverlayWindowPlatform;
  return { platform, setTarget };
}

describe("OverlayPlacementPanel", () => {
  afterEach(() => {
    cleanup();
  });

  it("追従中は追従モードで開き、縦横比固定と範囲操作を出さない", async () => {
    const { platform } = createPlatform("player");
    render(<OverlayPlacementPanel platform={platform} />);

    expect(screen.getByRole("radio", { name: "ウィンドウに追従" })).toBeChecked();
    expect(screen.getByLabelText("追従先ウィンドウ")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: /縦横比を固定/ })).toBeNull();
    await waitFor(() => expect(screen.getByText("800 × 600")).toBeInTheDocument());
  });

  it("範囲指定へ切り替えると追従を解除してから縦横比固定を出す", async () => {
    const { platform, setTarget } = createPlatform("player");
    render(<OverlayPlacementPanel platform={platform} />);

    fireEvent.click(screen.getByRole("radio", { name: "範囲を指定" }));

    await waitFor(() => expect(screen.getByRole("radio", { name: "範囲を指定" })).toBeChecked());
    expect(setTarget).toHaveBeenCalledExactlyOnceWith(null);
    expect(screen.getByRole("checkbox", { name: /縦横比を固定/ })).toBeInTheDocument();
    expect(screen.queryByLabelText("追従先ウィンドウ")).toBeNull();
  });

  it("追従モードへ切り替えただけでは追従先を設定しない", () => {
    const { platform, setTarget } = createPlatform(null);
    render(<OverlayPlacementPanel platform={platform} />);

    expect(screen.getByRole("radio", { name: "範囲を指定" })).toBeChecked();
    fireEvent.click(screen.getByRole("radio", { name: "ウィンドウに追従" }));

    expect(screen.getByLabelText("追従先ウィンドウ")).toHaveValue("");
    expect(screen.queryByRole("checkbox", { name: /縦横比を固定/ })).toBeNull();
    expect(setTarget).not.toHaveBeenCalled();
  });

  it("最初はOverlayの位置ではなく、ChLensのあるモニターをプレビューする", async () => {
    const { platform } = createPlatform(null);
    // Overlay（100, 100）はメインモニターにあるが、ChLensはサブモニターにある。
    platform.getHostMonitorId = vi.fn().mockResolvedValue("monitor-2");
    render(<OverlayPlacementPanel platform={platform} />);

    await waitFor(() =>
      expect(screen.getByRole("img", { name: "サブモニターのプレビュー" })).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: "前のディスプレイをプレビュー" }));
    expect(screen.getByRole("img", { name: "メインモニターのプレビュー" })).toBeInTheDocument();
  });

  it("配置の復元完了を待って追従モードと保存範囲を表示する", async () => {
    const { platform, setTarget } = createPlatform(null);
    platform.restorePlacement = async () => {
      await setTarget("player");
    };
    render(<OverlayPlacementPanel platform={platform} />);
    await waitFor(() =>
      expect(screen.getByRole("radio", { name: "ウィンドウに追従" })).toBeChecked(),
    );
    expect(screen.getByLabelText("追従先ウィンドウ")).toHaveValue("player");
  });

  it("調整直後に窓を閉じても最後の範囲を保存して反映する", async () => {
    const { platform } = createPlatform(null);
    const saveGeometry = vi.spyOn(platform, "saveGeometry");
    const setGeometry = vi.spyOn(platform, "setGeometry");
    const { unmount } = render(<OverlayPlacementPanel platform={platform} />);
    await waitFor(() => expect(screen.getByText("800 × 600")).toBeInTheDocument());
    fireEvent.doubleClick(screen.getByTestId("overlay-control-panel-desktop"));
    const expected = { x: 0, y: 0, width: 1920, height: 1080 };
    expect(saveGeometry).toHaveBeenLastCalledWith(expected);
    await act(async () => unmount());
    expect(setGeometry).toHaveBeenLastCalledWith(expected);
  });
});
