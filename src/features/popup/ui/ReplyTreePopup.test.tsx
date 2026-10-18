import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type React from "react";
import { ReplyTreePopup } from "src/features/popup/ui/ReplyTreePopup";
import type { IRes } from "src/service-container";
import { container } from "src/service-container/index";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

function createRes(num: number, message: string, id?: string): IRes {
  return {
    num,
    name: `name-${num}`,
    mail: "",
    date: "2026/04/19(日) 12:00:00.000",
    id,
    message,
  };
}

// 返信ツリーはNGレスも含めて本文から索引を再構築するため、疑似索引と同じ参照関係を本文にも持たせる。
const TEST_RES_MAP = new Map<number, IRes>([
  [1, createRes(1, "source message", "source-id")],
  [2, createRes(2, "&gt;&gt;1<br>reply message", "ID:reply-id")],
  [3, createRes(3, "&gt;&gt;2<br>sibling reply message", "id:sibling-id")],
  [4, createRes(4, "&gt;&gt;2<br>nested reply message", "nested-id")],
]);

const TEST_REP_INDEX = new Map<number, Set<number>>([
  [1, new Set([2])],
  [2, new Set([3, 4])],
]);

const BASE_PROPS: React.ComponentProps<typeof ReplyTreePopup> = {
  x: 16,
  y: 16,
  resNum: 1,
  repIndex: TEST_REP_INDEX,
  resMap: TEST_RES_MAP,
  messageProtocol: "https:",
  anchorPreviewDepth: 0,
  onUrlClick: () => {},
  onUrlContextMenu: () => {},
  onRepClick: () => {},
  onAnchorClick: () => {},
  onAnchorHover: () => {},
  onAnchorLeave: () => {},
  onResContextMenu: () => {},
  onIdLinkClick: () => {},
  onClose: () => {},
  threadTitle: "テストスレタイ",
  threadUrl: "https://example.com/test/read.cgi/board/123/",
};

describe("ReplyTreePopup", () => {
  const writeText = vi.fn<(text: string) => Promise<void>>();
  const writeClipboard = vi.fn<() => Promise<void>>();
  const clipboardItemCtor = vi.fn();
  class ClipboardItemMock {
    public readonly items: Record<string, Blob>;

    constructor(items: Record<string, Blob>) {
      this.items = items;
      clipboardItemCtor(items);
    }
  }
  const canvasContextStub = {
    beginPath: vi.fn(),
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    fillText: vi.fn(),
    lineTo: vi.fn(),
    measureText: vi.fn((text: string) => ({ width: text.length * 7 })),
    moveTo: vi.fn(),
    scale: vi.fn(),
    stroke: vi.fn(),
    strokeRect: vi.fn(),
    fillStyle: "",
    font: "",
    lineWidth: 1,
    strokeStyle: "",
  };

  beforeEach(() => {
    // コピー後の通知まで実行されるため、テストでも通知サービスを登録する。
    container.toast = { notify: vi.fn(), success: vi.fn(), error: vi.fn(), info: vi.fn() };
    writeText.mockResolvedValue();
    writeClipboard.mockResolvedValue();
    canvasContextStub.fillText.mockClear();
    container.config = {
      get: vi.fn(() => "default"),
      set: vi.fn(),
      getAll: () => ({}),
      ready: (callback: () => void) => callback(),
    };
    container.message = {
      on: vi.fn(),
      off: vi.fn(),
      send: vi.fn(),
    };
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback): number => {
      callback(0);
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", () => {});
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        write: writeClipboard,
        writeText,
      },
    });
    vi.stubGlobal("ClipboardItem", ClipboardItemMock);
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
      () => canvasContextStub as unknown as CanvasRenderingContext2D,
    );
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback: BlobCallback) => {
      callback(new Blob(["png"], { type: "image/png" }));
    });
  });

  afterEach(() => {
    cleanup();
    writeText.mockReset();
    writeClipboard.mockReset();
    clipboardItemCtor.mockReset();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("参照元レスと返信レスを分けて表示する", () => {
    render(<ReplyTreePopup {...BASE_PROPS} />);

    expect(screen.getByText("参照元レス")).toBeInTheDocument();
    expect(screen.getByText("返信レス")).toBeInTheDocument();
    expect(screen.getByText("source message")).toBeInTheDocument();
    expect(screen.getByText("reply message")).toBeInTheDocument();
    expect(screen.getByText("sibling reply message")).toBeInTheDocument();
    expect(screen.getByText("nested reply message")).toBeInTheDocument();

    const sourceSection = screen.getByText("参照元レス").closest("section") as HTMLElement;
    const sourceCard = within(sourceSection).getByText("source message").closest("article");
    expect(sourceCard).toHaveClass("res--highlighted-persistent");
  });

  it("ライブチャットで入場が完了していない返信はツリーと返信数へ先出ししない", () => {
    const { rerender } = render(
      <ReplyTreePopup {...BASE_PROPS} replySourceNums={new Set([1, 2])} />,
    );
    expect(screen.getByText("reply message")).toBeInTheDocument();
    expect(screen.queryByText("sibling reply message")).not.toBeInTheDocument();
    expect(screen.queryByText("nested reply message")).not.toBeInTheDocument();
    expect(screen.queryByText("返信(2)")).not.toBeInTheDocument();
    rerender(<ReplyTreePopup {...BASE_PROPS} replySourceNums={new Set([1, 2, 3])} />);
    expect(screen.getByText("sibling reply message")).toBeInTheDocument();
    expect(screen.queryByText("nested reply message")).not.toBeInTheDocument();
  });

  it("入れ子の返信にも自分のレスと自分への返信の印を付ける", () => {
    // 2階層目以降の再帰描画でも、1階層目と同じ判定集合を引き継ぐことを確かめる。
    render(
      <ReplyTreePopup {...BASE_PROPS} ownResNums={new Set([4])} replyToOwnResNums={new Set([3])} />,
    );

    const cardOf = (num: number) => screen.getByText(`name-${num}`).closest(".reply-tree-node");
    expect(cardOf(4)?.querySelector(".res__badge--own")).not.toBeNull();
    expect(cardOf(3)?.querySelector(".res__badge--reply-to-own")).not.toBeNull();
  });

  it("2階層目以降の枝だけを字下げ用のクラスで描画する", () => {
    render(<ReplyTreePopup {...BASE_PROPS} />);

    const branchOf = (num: number) => screen.getByText(`name-${num}`).closest(".reply-tree");
    expect(branchOf(2)).not.toHaveClass("reply-tree--nested");
    expect(branchOf(3)).toHaveClass("reply-tree--nested");
    expect(branchOf(4)).toBe(branchOf(3));
  });

  it("子ツリーのないレスにはこのレス以降のメニューを表示しない", () => {
    render(<ReplyTreePopup {...BASE_PROPS} />);

    const subTreeMenuButtons = screen.getAllByRole("button", {
      name: "サブツリーメニュー",
    });
    expect(subTreeMenuButtons).toHaveLength(3);

    fireEvent.click(subTreeMenuButtons.at(-1)!);
    expect(
      screen.queryByRole("button", { name: "このレス以降のツリーをコピー" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "このレス以降のツリーを画像としてコピー" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "ツリー先頭からこのレスまでコピー" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "ツリー先頭からこのレスまでコピー" }).querySelector("svg"),
    ).toHaveClass("lucide-corner-right-up");
    expect(
      screen
        .getByRole("button", { name: "ツリー先頭からこのレスまで画像としてコピー" })
        .querySelector("svg"),
    ).toHaveClass("lucide-image-up");
  });

  it("返信ツリー専用メニューからレスを一括コピーできる", async () => {
    render(<ReplyTreePopup {...BASE_PROPS} />);

    fireEvent.click(screen.getByRole("button", { name: "返信ツリーメニュー" }));
    expect(
      screen.getByRole("button", { name: "返信ツリーを一括コピー" }).querySelector("svg"),
    ).toHaveClass("lucide-corner-down-right");
    fireEvent.click(screen.getByRole("button", { name: "返信ツリーを一括コピー" }));

    expect(writeText).toHaveBeenCalledOnce();
    expect(writeText.mock.calls[0]?.[0]).not.toContain("[参照元レス]");
    expect(writeText.mock.calls[0]?.[0]).toContain("1 name-1");
    expect(writeText.mock.calls[0]?.[0]).toContain("1 name-1 ID:source-id");
    expect(writeText.mock.calls[0]?.[0]).toContain("source message");
    expect(writeText.mock.calls[0]?.[0]).toContain("[返信レス]");
    expect(writeText.mock.calls[0]?.[0]).toContain("2 name-2");
    expect(writeText.mock.calls[0]?.[0]).toContain("2 name-2 ID:reply-id");
    expect(writeText.mock.calls[0]?.[0]).toContain("4 name-4");
    expect(writeText.mock.calls[0]?.[0]).toContain("4 name-4 ID:nested-id");
    expect(writeText.mock.calls[0]?.[0]).toContain("3 name-3 ID:sibling-id");
    // 末尾にスレタイとURLが付加されることを検証する。
    expect(writeText.mock.calls[0]?.[0]).toContain("テストスレタイ");
    expect(writeText.mock.calls[0]?.[0]).toContain("https://example.com/test/read.cgi/board/123/");
  });

  it("返信ツリーメニューからピン留めを切り替えられる", () => {
    const onTogglePinned = vi.fn();
    const { rerender } = render(
      <ReplyTreePopup {...BASE_PROPS} pinned={false} onTogglePinned={onTogglePinned} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "返信ツリーメニュー" }));
    const pinButton = screen.getByRole("button", { name: "ピン留め" });
    expect(pinButton.querySelector("svg")).toHaveClass("lucide-pin");
    fireEvent.click(pinButton);
    expect(onTogglePinned).toHaveBeenCalledOnce();

    rerender(<ReplyTreePopup {...BASE_PROPS} pinned onTogglePinned={onTogglePinned} />);
    fireEvent.click(screen.getByRole("button", { name: "返信ツリーメニュー" }));
    const contextMenu = document.querySelector(".context-menu") as HTMLElement;
    expect(
      within(contextMenu).getByRole("button", { name: "ピン留めを解除" }).querySelector("svg"),
    ).toHaveClass("lucide-pin-off");
  });

  it("ピン留め中はヘッダーから解除でき、解除後はピンアイコンを隠す", () => {
    const onTogglePinned = vi.fn();
    const { rerender } = render(
      <ReplyTreePopup {...BASE_PROPS} pinned={false} onTogglePinned={onTogglePinned} />,
    );

    expect(screen.queryByRole("button", { name: "ピン留めを解除" })).not.toBeInTheDocument();

    rerender(<ReplyTreePopup {...BASE_PROPS} pinned onTogglePinned={onTogglePinned} />);
    const unpinButton = screen.getByRole("button", { name: "ピン留めを解除" });
    expect(unpinButton).toHaveAttribute("title", "ピン留めを解除");
    expect(unpinButton.querySelector("svg")).toHaveClass("lucide-pin-off");

    fireEvent.click(unpinButton);
    expect(onTogglePinned).toHaveBeenCalledOnce();

    rerender(<ReplyTreePopup {...BASE_PROPS} pinned={false} onTogglePinned={onTogglePinned} />);
    expect(screen.queryByRole("button", { name: "ピン留めを解除" })).not.toBeInTheDocument();
  });

  it("ピン留め中はマウス離脱や外側クリックで閉じない", () => {
    const onClose = vi.fn();
    const { container: rendered } = render(
      <ReplyTreePopup {...BASE_PROPS} pinned onClose={onClose} />,
    );
    const popup = rendered.querySelector(".res-popup") as HTMLElement;

    fireEvent.mouseLeave(popup, { relatedTarget: document.body });
    fireEvent.mouseDown(document.body);

    expect(onClose).not.toHaveBeenCalled();
  });

  it("返信ツリー専用メニューから画像としてコピーできる", async () => {
    render(<ReplyTreePopup {...BASE_PROPS} />);

    fireEvent.click(screen.getByRole("button", { name: "返信ツリーメニュー" }));
    fireEvent.click(screen.getByRole("button", { name: "返信ツリーを画像としてコピー" }));

    await waitFor(() => {
      expect(writeClipboard).toHaveBeenCalledOnce();
    });
    expect(clipboardItemCtor).toHaveBeenCalledOnce();
    const drawnTexts = canvasContextStub.fillText.mock.calls.map(([text]) => text);
    expect(drawnTexts).toContain("1 name-1 ID:source-id");
    expect(drawnTexts).toContain("2 name-2 ID:reply-id");
    expect(drawnTexts).toContain("3 name-3 ID:sibling-id");
    expect(drawnTexts).toContain("4 name-4 ID:nested-id");
  });

  it("選択レスまでの一本筋をツリー先頭から下へコピーできる", () => {
    render(<ReplyTreePopup {...BASE_PROPS} />);

    const subTreeMenuButtons = screen.getAllByRole("button", {
      name: "サブツリーメニュー",
    });
    fireEvent.click(subTreeMenuButtons[0]!);
    expect(
      screen.getByRole("button", { name: "このレス以降のツリーをコピー" }).querySelector("svg"),
    ).toHaveClass("lucide-corner-down-right");
    expect(
      screen
        .getByRole("button", { name: "このレス以降のツリーを画像としてコピー" })
        .querySelector("svg"),
    ).toHaveClass("lucide-image-down");
    fireEvent.click(
      screen.getByRole("button", {
        name: "ツリー先頭からこのレスまでコピー",
      }),
    );

    expect(writeText).toHaveBeenCalledOnce();
    const copiedText = (writeText.mock.calls as unknown as Array<[string]>)[0]?.[0];
    expect(copiedText).toBeDefined();
    if (!copiedText) {
      throw new Error("コピーされたテキストがありません");
    }
    expect(copiedText).not.toContain("[参照元レス]");
    expect(copiedText).toContain("[返信レス]");
    expect(copiedText.indexOf("1 name-1")).toBeLessThan(copiedText.indexOf("2 name-2"));
    expect(copiedText).not.toContain("3 name-3");
    expect(copiedText).not.toContain("4 name-4");
    expect(copiedText).toContain("テストスレタイ");
    expect(copiedText).toContain("https://example.com/test/read.cgi/board/123/");
  });

  it("ツリー先頭から選択レスまでの一本筋を画像としてコピーできる", async () => {
    render(<ReplyTreePopup {...BASE_PROPS} />);

    const subTreeMenuButtons = screen.getAllByRole("button", {
      name: "サブツリーメニュー",
    });
    fireEvent.click(subTreeMenuButtons[0]!);
    fireEvent.click(
      screen.getByRole("button", {
        name: "ツリー先頭からこのレスまで画像としてコピー",
      }),
    );

    await waitFor(() => {
      expect(writeClipboard).toHaveBeenCalledOnce();
    });
    expect(clipboardItemCtor).toHaveBeenCalledOnce();
    expect(canvasContextStub.fillText).toHaveBeenCalledWith(
      ">>2 までの返信経路",
      expect.any(Number),
      expect.any(Number),
    );
    expect(canvasContextStub.fillText).toHaveBeenCalledWith(
      "返信レス（上から下）",
      expect.any(Number),
      expect.any(Number),
    );
    const drawnTexts = canvasContextStub.fillText.mock.calls.map(([text]) => text);
    const indexOfDrawnText = (prefix: string) =>
      drawnTexts.findIndex((text) => text.startsWith(prefix));
    expect(indexOfDrawnText("1 name-1")).toBeLessThan(indexOfDrawnText("2 name-2"));
    expect(indexOfDrawnText("3 name-3")).toBe(-1);
    expect(indexOfDrawnText("4 name-4")).toBe(-1);
  });

  it("返信ツリーメニューは outside click で閉じる", () => {
    render(<ReplyTreePopup {...BASE_PROPS} />);

    fireEvent.click(screen.getByRole("button", { name: "返信ツリーメニュー" }));
    expect(screen.getByRole("button", { name: "返信ツリーを一括コピー" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "返信ツリーを画像としてコピー" }),
    ).toBeInTheDocument();

    fireEvent.mouseDown(document.body);

    expect(
      screen.queryByRole("button", { name: "返信ツリーを一括コピー" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "返信ツリーを画像としてコピー" }),
    ).not.toBeInTheDocument();
  });

  it("参照元レスの返信リンクは無効化されていてクリックしても開かない", () => {
    const onRepClick = vi.fn();
    render(<ReplyTreePopup {...BASE_PROPS} onRepClick={onRepClick} />);

    const sourceSection = screen.getByText("参照元レス").closest("section") as HTMLElement;
    const sourceReplyLink = within(sourceSection).getByText("返信(1)");

    expect(sourceReplyLink).toHaveAttribute("aria-disabled", "true");

    fireEvent.click(sourceReplyLink);

    expect(onRepClick).not.toHaveBeenCalled();
  });
});
