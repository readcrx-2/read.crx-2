import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  bottomPanel: null as {
    openWritePanelWithText: (text: string, threadUrl?: string) => void;
    closePanel: () => void;
  } | null,
  openWritePanelWithText: vi.fn(),
  closePanel: vi.fn(),
  appendDraft: vi.fn(),
  selectThread: vi.fn(),
  openWriteWindow: vi.fn(),
  isWindowOpen: false,
  selectedThreadUrl: null as string | null,
  viewWindow: null as Window | null,
}));

vi.mock("src/view/browser/hooks/use-bottom-panel", () => ({
  useOptionalBottomPanel: () => mocks.bottomPanel,
}));

vi.mock("src/view/browser/hooks/use-view-surface", () => ({
  useViewSurface: () => ({
    window: mocks.viewWindow,
    document: mocks.viewWindow?.document ?? document,
  }),
}));

vi.mock("src/features/write/browser/use-write-session", () => ({
  useWriteSessionControls: () => ({
    isWindowOpen: mocks.isWindowOpen,
    selectedThreadUrl: mocks.selectedThreadUrl,
    appendDraft: mocks.appendDraft,
    selectThread: mocks.selectThread,
    openWriteWindow: mocks.openWriteWindow,
  }),
}));

import { useWriteRequest } from "src/features/write/browser/use-write-request";

const THREAD_URL = "https://example.com/test/read.cgi/live/1/";

const Probe: React.FC = () => {
  const requestWrite = useWriteRequest();
  return <button onClick={() => requestWrite(">>10\n", THREAD_URL)}>返信</button>;
};

describe("useWriteRequest", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    mocks.bottomPanel = {
      openWritePanelWithText: mocks.openWritePanelWithText,
      closePanel: mocks.closePanel,
    };
    mocks.viewWindow = window;
    mocks.isWindowOpen = false;
    mocks.selectedThreadUrl = null;
    mocks.openWritePanelWithText.mockReset();
    mocks.closePanel.mockReset();
    mocks.appendDraft.mockReset();
    mocks.selectThread.mockReset();
    mocks.openWriteWindow.mockReset();
  });

  it("メイン窓では現在の下部パネルへ要求を渡す", () => {
    render(<Probe />);

    fireEvent.click(screen.getByRole("button", { name: "返信" }));

    expect(mocks.openWritePanelWithText).toHaveBeenCalledWith(">>10\n", THREAD_URL);
    expect(mocks.openWriteWindow).not.toHaveBeenCalled();
  });

  it("別窓でも下部パネルがあれば、そのパネルへ要求を渡す", () => {
    mocks.viewWindow = {} as Window;

    render(<Probe />);
    fireEvent.click(screen.getByRole("button", { name: "返信" }));

    expect(mocks.openWritePanelWithText).toHaveBeenCalledWith(">>10\n", THREAD_URL);
    expect(mocks.openWriteWindow).not.toHaveBeenCalled();
  });

  it("下部パネルのない表示先では共有書き込み窓へ下書きを渡して開く", () => {
    mocks.bottomPanel = null;
    mocks.viewWindow = {} as Window;

    render(<Probe />);
    fireEvent.click(screen.getByRole("button", { name: "返信" }));

    expect(mocks.selectThread).toHaveBeenCalledWith(THREAD_URL);
    expect(mocks.appendDraft).toHaveBeenCalledWith(THREAD_URL, ">>10\n");
    expect(mocks.openWriteWindow).toHaveBeenCalledOnce();
    expect(mocks.openWritePanelWithText).not.toHaveBeenCalled();
  });

  it("共有書き込み窓が開いている時は下部パネルを閉じる", () => {
    mocks.isWindowOpen = true;

    render(<Probe />);
    fireEvent.click(screen.getByRole("button", { name: "返信" }));

    expect(mocks.closePanel).toHaveBeenCalledOnce();
    expect(mocks.appendDraft).toHaveBeenCalledWith(THREAD_URL, ">>10\n");
    expect(mocks.openWriteWindow).not.toHaveBeenCalled();
  });
});
