import "@testing-library/jest-dom/vitest";

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import type { Page, Tab } from "src/view/browser/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const storage = { value: null as string | null };
const tabState = {
  panes: [] as Array<{ id: string; tabs: Tab[] }>,
  activePaneId: "pane-a",
};
let viewPage: Page = { type: "boardList", title: "ホーム" };

vi.mock("src/app/Store2Storage", () => ({
  getStore2String: () => storage.value,
  setStore2String: (_key: string, value: string) => {
    storage.value = value;
    return Promise.resolve();
  },
}));

vi.mock("src/app/platform", () => ({
  platform: {
    window: {
      openPopup: vi.fn(() => null),
    },
  },
}));

vi.mock("src/view/browser/state/tabs/use-tab-store", () => ({
  useTabPanes: () => tabState,
  useTabStore: () => ({ viewPage }),
}));

import {
  useWriteSession,
  useWriteSessionControls,
  WriteSessionProvider,
} from "src/features/write/browser/use-write-session";

function makeThreadTab(id: string, threadUrl: string, title: string): Tab {
  return {
    id,
    history: [{ type: "thread", title, threadUrl }],
    currentIndex: 0,
    pinned: false,
    reloadKey: 0,
    autoRefreshEnabled: false,
    autoRefreshPageKey: null,
  };
}

const Probe: React.FC = () => {
  const { targets, selectedThreadUrl, getDraft, selectThread, setDraft } = useWriteSession();
  const secondUrl = "https://example.com/test/read.cgi/software/2/";

  return (
    <>
      <output data-testid="selected">{selectedThreadUrl}</output>
      <output data-testid="targets">{targets.map((target) => target.title).join(",")}</output>
      <output data-testid="draft">{getDraft(secondUrl)}</output>
      <button onClick={() => selectThread(secondUrl)}>スレ2を選ぶ</button>
      <button onClick={() => setDraft(secondUrl, "下書き")}>下書きを入力</button>
    </>
  );
};

let controlsRenderCount = 0;

const ControlsProbe: React.FC = () => {
  useWriteSessionControls();
  controlsRenderCount += 1;
  return null;
};

describe("WriteSessionProvider", () => {
  beforeEach(() => {
    storage.value = null;
    controlsRenderCount = 0;
    viewPage = { type: "boardList", title: "ホーム" };
    tabState.panes = [
      {
        id: "pane-a",
        tabs: [
          makeThreadTab("tab-1", "https://example.com/test/read.cgi/software/1/", "スレ1"),
          makeThreadTab("tab-2", "https://example.com/test/read.cgi/software/2/", "スレ2"),
        ],
      },
      {
        id: "pane-b",
        tabs: [
          makeThreadTab("tab-duplicate", "https://example.com/test/read.cgi/software/1/", "重複"),
        ],
      },
    ];
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("全ペインのスレを重複なく投稿先候補にする", () => {
    render(
      <WriteSessionProvider>
        <Probe />
      </WriteSessionProvider>,
    );

    expect(screen.getByTestId("targets")).toHaveTextContent("スレ1,スレ2");
  });

  it("選択したスレの下書きは実行中だけ保持し、ストレージへ保存しない", async () => {
    render(
      <WriteSessionProvider>
        <Probe />
      </WriteSessionProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "スレ2を選ぶ" }));
    fireEvent.click(screen.getByRole("button", { name: "下書きを入力" }));

    await waitFor(() => {
      expect(screen.getByTestId("selected")).toHaveTextContent(
        "https://example.com/test/read.cgi/software/2/",
      );
      expect(screen.getByTestId("draft")).toHaveTextContent("下書き");
    });
    expect(storage.value).not.toContain("下書き");
    expect(storage.value).toContain("selectedThreadUrl");
  });

  it("下書き入力では投稿先操作を使う部品を再描画しない", async () => {
    render(
      <WriteSessionProvider>
        <ControlsProbe />
        <Probe />
      </WriteSessionProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("selected")).toHaveTextContent("software/1/"));
    const renderCountAfterSelection = controlsRenderCount;
    fireEvent.click(screen.getByRole("button", { name: "下書きを入力" }));
    expect(controlsRenderCount).toBe(renderCountAfterSelection);
  });

  it("旧形式に保存された下書きも復元しない", async () => {
    storage.value = JSON.stringify({
      selectedThreadUrl: "https://example.com/test/read.cgi/software/2/",
      drafts: {
        "https://example.com/test/read.cgi/software/2/": "古い下書き",
      },
    });

    render(
      <WriteSessionProvider>
        <Probe />
      </WriteSessionProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("selected")).toHaveTextContent(
        "https://example.com/test/read.cgi/software/2/",
      );
    });
    expect(screen.getByTestId("draft")).toHaveTextContent("");
    expect(storage.value).not.toContain("古い下書き");
  });
});
