import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

vi.mock("src/app/platform", () => ({
  platform: {
    window: {
      setTitle: vi.fn().mockResolvedValue(undefined),
    },
  },
}));

vi.mock("src/core/history/History", () => ({
  add: vi.fn().mockResolvedValue(undefined),
  remove: vi.fn().mockResolvedValue(undefined),
}));

// webextension-polyfill は拡張機能環境以外では import 時に例外を投げるため最小モックに差し替える。
vi.mock("webextension-polyfill", () => ({
  default: {
    runtime: {
      onMessage: {
        addListener: vi.fn(),
        removeListener: vi.fn(),
      },
    },
  },
}));

function createMemoryStorage(): Storage {
  const items = new Map<string, string>();
  return {
    get length() {
      return items.size;
    },
    clear() {
      items.clear();
    },
    getItem(key: string) {
      return items.get(key) ?? null;
    },
    key(index: number) {
      return Array.from(items.keys())[index] ?? null;
    },
    removeItem(key: string) {
      items.delete(key);
    },
    setItem(key: string, value: string) {
      items.set(key, value);
    },
  };
}

const SESSION_KEY = "chlens_browser_session";

describe("ペイン（横分割）", () => {
  beforeEach(() => {
    const localStorageMock = createMemoryStorage();
    vi.stubGlobal("localStorage", localStorageMock);
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: localStorageMock,
    });
    localStorage.removeItem(SESSION_KEY);
    // ペイン操作は明示的に開いた通常タブを使い、ホームだけの初期表示と分けて検証する。
    localStorage.setItem(
      SESSION_KEY,
      JSON.stringify({
        panes: [
          {
            id: "initial-pane",
            activeTabId: "initial-settings",
            tabs: [
              {
                id: "initial-settings",
                history: [{ type: "settings", title: "設定" }],
                currentIndex: 0,
                pinned: false,
                reloadKey: 0,
              },
            ],
          },
        ],
        activePaneId: "initial-pane",
        closedTabs: [],
      }),
    );
  });

  afterEach(() => {
    cleanup();
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  // 各ペインの状態を読み出す共通ハーネス。useTabPanes でグローバルな panes を観測する。
  async function setup() {
    vi.resetModules();
    const { TabProvider, PaneProvider, useTabPanes, useTabStore, useTabDispatch } =
      await import("src/view/browser/state/tabs/use-tab-store");

    // グローバルな dispatch（paneId 注入なし）= アクティブペインに作用。
    function GlobalControls() {
      const dispatch = useTabDispatch();
      return <button onClick={() => dispatch({ type: "SPLIT_PANE" })}>分割（アクティブ）</button>;
    }

    // 指定ペインに束縛した操作群。
    function PaneControls({ paneId }: { paneId: string }) {
      return (
        <PaneProvider paneId={paneId}>
          <PaneControlsInner paneId={paneId} />
        </PaneProvider>
      );
    }

    function PaneControlsInner({ paneId }: { paneId: string }) {
      const { state, dispatch } = useTabStore();
      return (
        <div data-testid={`panebox-${paneId}`}>
          <button onClick={() => dispatch({ type: "SPLIT_PANE" })}>{`split-${paneId}`}</button>
          <button onClick={() => dispatch({ type: "CLOSE_PANE" })}>{`close-${paneId}`}</button>
          <button onClick={() => dispatch({ type: "SWAP_PANE_TABS" })}>{`swap-${paneId}`}</button>
          <button
            onClick={() =>
              dispatch({
                type: "OPEN_IN_NEW_TAB_FORCE",
                page: { type: "settings", title: "設定" },
                focus: true,
              })
            }
          >{`addtab-${paneId}`}</button>
          <button onClick={() => dispatch({ type: "CLOSE_TAB", tabId: state.selectedTabId })}>
            {`closetab-${paneId}`}
          </button>
          <button
            onClick={() =>
              dispatch({
                type: "OPEN_IN_RIGHT_PANE",
                tabId: state.selectedTabId,
              })
            }
          >
            {`toright-${paneId}`}
          </button>
          <output data-testid={`tabcount-${paneId}`}>{state.tabs.length}</output>
          <output data-testid={`selected-tab-${paneId}`}>{state.selectedTabId}</output>
        </div>
      );
    }

    function Observer() {
      const { panes, activePaneId } = useTabPanes();
      return (
        <>
          <output data-testid="pane-count">{panes.length}</output>
          <output data-testid="pane-ids">{panes.map((p) => p.id).join(",")}</output>
          <output data-testid="active-pane-index">
            {panes.findIndex((p) => p.id === activePaneId)}
          </output>
          {panes.map((pane) => (
            <PaneControls key={pane.id} paneId={pane.id} />
          ))}
        </>
      );
    }

    render(
      <TabProvider>
        <GlobalControls />
        <Observer />
      </TabProvider>,
    );

    const paneIds = () => {
      const raw = screen.getByTestId("pane-ids").textContent ?? "";
      return raw === "" ? [] : raw.split(",");
    };

    return { paneIds };
  }

  it("初期状態はペイン1つ", async () => {
    await setup();
    expect(screen.getByTestId("pane-count")).toHaveTextContent("1");
    expect(screen.getByTestId("active-pane-index")).toHaveTextContent("0");
  });

  it("SPLIT_PANE で右隣にペインを追加し、新ペインをアクティブにする", async () => {
    const { paneIds } = await setup();
    const [first] = paneIds();

    fireEvent.click(screen.getByText(`split-${first}`));

    expect(screen.getByTestId("pane-count")).toHaveTextContent("2");
    // 新ペインは末尾（右隣）に挿入され、アクティブになる。
    expect(screen.getByTestId("active-pane-index")).toHaveTextContent("1");
  });

  it("ペインは最大2つまでで、2ペイン時の SPLIT_PANE は無視される", async () => {
    const { paneIds } = await setup();
    const [first] = paneIds();

    fireEvent.click(screen.getByText(`split-${first}`));
    expect(screen.getByTestId("pane-count")).toHaveTextContent("2");

    // 2ペイン目から更に分割しても増えない（2ペイン固定）。
    const ids = paneIds();
    fireEvent.click(screen.getByText(`split-${ids[1]}`));
    expect(screen.getByTestId("pane-count")).toHaveTextContent("2");
  });

  it("各ペインのタブ操作は独立している", async () => {
    const { paneIds } = await setup();
    const [first] = paneIds();

    fireEvent.click(screen.getByText(`split-${first}`));
    const ids = paneIds();
    const second = ids[1];

    // 2ペイン目だけタブを増やす
    fireEvent.click(screen.getByText(`addtab-${second}`));

    expect(screen.getByTestId(`tabcount-${first}`)).toHaveTextContent("1");
    expect(screen.getByTestId(`tabcount-${second}`)).toHaveTextContent("2");
  });

  it("CLOSE_PANE で1ペインに戻れ、最後の1ペインは閉じられない", async () => {
    const { paneIds } = await setup();
    const [first] = paneIds();

    fireEvent.click(screen.getByText(`split-${first}`));
    expect(screen.getByTestId("pane-count")).toHaveTextContent("2");

    const ids = paneIds();
    fireEvent.click(screen.getByText(`addtab-${ids[1]}`));
    fireEvent.click(screen.getByText(`close-${ids[1]}`));
    expect(screen.getByTestId("pane-count")).toHaveTextContent("1");
    // ホームも通常タブとして統合し、左右の1+2枚をそのまま保つ。
    expect(screen.getByTestId(`tabcount-${first}`)).toHaveTextContent("3");

    // 残り1ペインは閉じられない
    const remaining = paneIds();
    fireEvent.click(screen.getByText(`close-${remaining[0]}`));
    expect(screen.getByTestId("pane-count")).toHaveTextContent("1");
  });

  it("2ペインで最後のタブを閉じると、そのペインを閉じて1ペインへ戻る", async () => {
    const { paneIds } = await setup();
    const [left] = paneIds();
    fireEvent.click(screen.getByText(`split-${left}`));
    const [, right] = paneIds();

    // ホーム一枚だけのペインも、最後のタブを閉じれば終了できる。
    fireEvent.click(screen.getByText(`closetab-${right}`));

    expect(screen.getByTestId("pane-count")).toHaveTextContent("1");
    expect(paneIds()).toEqual([left]);
  });

  it("SWAP_PANE_TABS で各ペインの選択中タブを入れ替える", async () => {
    const { paneIds } = await setup();
    const [first] = paneIds();

    fireEvent.click(screen.getByText(`split-${first}`));
    const [left, right] = paneIds();
    // 右側へタブを追加し、選択中のタブ同士を交換する。
    fireEvent.click(screen.getByText(`addtab-${right}`));
    const leftTabBefore = screen.getByTestId(`selected-tab-${left}`).textContent;
    const rightTabBefore = screen.getByTestId(`selected-tab-${right}`).textContent;

    fireEvent.click(screen.getByText(`swap-${right}`));

    expect(screen.getByTestId(`selected-tab-${left}`)).toHaveTextContent(rightTabBefore ?? "");
    expect(screen.getByTestId(`selected-tab-${right}`)).toHaveTextContent(leftTabBefore ?? "");
  });

  it("OPEN_IN_RIGHT_PANE は右ペインが無ければ新規作成してタブを移す", async () => {
    const { paneIds } = await setup();
    const [first] = paneIds();

    // 1タブ目を増やしておく（移動後も元ペインを空にしない検証）
    fireEvent.click(screen.getByText(`addtab-${first}`));
    expect(screen.getByTestId(`tabcount-${first}`)).toHaveTextContent("2");

    fireEvent.click(screen.getByText(`toright-${first}`));

    // ペインが2つになり、元ペインのタブが1つ減り、右ペインに移っている。
    expect(screen.getByTestId("pane-count")).toHaveTextContent("2");
    expect(screen.getByTestId(`tabcount-${first}`)).toHaveTextContent("1");
    const ids = paneIds();
    expect(screen.getByTestId(`tabcount-${ids[1]}`)).toHaveTextContent("1");
    // 移動先ペインがアクティブになる
    expect(screen.getByTestId("active-pane-index")).toHaveTextContent("1");
  });

  it("旧形状セッション（panes 無し）は単一ペインへ移行する", async () => {
    localStorage.setItem(
      SESSION_KEY,
      JSON.stringify({
        tabs: [
          {
            id: "legacy-tab",
            history: [{ type: "boardList", title: "ホーム" }],
            currentIndex: 0,
            pinned: false,
            reloadKey: 0,
            autoRefreshEnabled: false,
            autoRefreshPageKey: null,
          },
        ],
        activeTabId: "legacy-tab",
        closedTabs: [],
      }),
    );

    await setup();

    expect(screen.getByTestId("pane-count")).toHaveTextContent("1");
    expect(screen.getByTestId("active-pane-index")).toHaveTextContent("0");
  });
});
