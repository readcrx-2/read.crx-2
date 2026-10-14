import "@testing-library/jest-dom/vitest";

import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { NgStatusProvider, useNgStatus } from "src/features/ng";
import { PopupResCard } from "src/features/popup/ui/PopupResCard";
import type { IRes } from "src/service-container/interfaces";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const ngMocks = vi.hoisted(() => ({
  configValue: "soft-ng",
  configUpdatedCallback: undefined as ((data: { key?: string }) => void) | undefined,
}));

vi.mock("src/service-container/index", () => ({
  container: {
    config: {
      get: (key: string) => (key === "display_ng" ? ngMocks.configValue : null),
      ready: (callback: () => void) => callback(),
    },
    message: {
      on: (_type: string, callback: (data: { key?: string }) => void) => {
        ngMocks.configUpdatedCallback = callback;
      },
      off: () => {},
    },
  },
}));

afterEach(() => {
  cleanup();
  ngMocks.configValue = "soft-ng";
  ngMocks.configUpdatedCallback = undefined;
});

vi.mock("src/view/browser/utils/response-format", async () => {
  const actual = await vi.importActual<typeof import("src/view/browser/utils/response-format")>(
    "src/view/browser/utils/response-format",
  );
  return {
    ...actual,
    decodeResponseHtml: () => ({
      nameHtml: "名無しさん",
      mailHtml: "",
      otherHtml: "",
      messageHtml: "本文",
      isNameAnchor: false,
    }),
  };
});

vi.mock("src/core/util/url-media", async () => {
  const actual =
    await vi.importActual<typeof import("src/core/util/url-media")>("src/core/util/url-media");
  return {
    ...actual,
    extractUrlsFromMessage: () => ["https://example.com/image.jpg"],
    toViewerImageUrl: (rawUrl: string) => rawUrl,
  };
});

const BASE_RES: IRes = {
  num: 10,
  name: "名無しさん",
  mail: "",
  date: "2026/04/20",
  message: "https://example.com/image.jpg",
};

function TemporarilyDisabledNgCard({ res }: { res: IRes }) {
  const { setNgTemporarilyDisabled } = useNgStatus();
  return (
    <>
      <button type="button" onClick={() => setNgTemporarilyDisabled(true)}>
        一時NG解除
      </button>
      <PopupResCard
        res={res}
        messageProtocol="https:"
        anchorPreviewDepth={0}
        onUrlClick={() => {}}
        onUrlContextMenu={() => {}}
        onIdLinkClick={() => {}}
        onAnchorClick={() => {}}
        onAnchorHover={() => {}}
        onAnchorLeave={() => {}}
      />
    </>
  );
}

describe("PopupResCard", () => {
  it("ポップアップ内でも自分レスと自分への返信バッヂを表示する", () => {
    const { container } = render(
      <PopupResCard
        res={BASE_RES}
        messageProtocol="https:"
        anchorPreviewDepth={0}
        isOwn
        isReplyToOwn
        onUrlClick={() => {}}
        onUrlContextMenu={() => {}}
        onIdLinkClick={() => {}}
        onAnchorClick={() => {}}
        onAnchorHover={() => {}}
        onAnchorLeave={() => {}}
      />,
    );

    expect(container.querySelector(".res__badge--own")).toHaveTextContent("自分");
    expect(container.querySelector(".res__badge--reply-to-own")).toHaveTextContent("返信");
  });

  it("返信数に応じてレス番号と返信ラベルへ同じ強調色クラスを適用する", () => {
    const repIndex = new Map<number, Set<number>>([[10, new Set([1, 2, 3])]]);

    const { container, rerender } = render(
      <PopupResCard
        res={BASE_RES}
        messageProtocol="https:"
        anchorPreviewDepth={0}
        repIndex={repIndex}
        onUrlClick={() => {}}
        onUrlContextMenu={() => {}}
        onIdLinkClick={() => {}}
        onAnchorClick={() => {}}
        onAnchorHover={() => {}}
        onAnchorLeave={() => {}}
        onRepClick={() => {}}
      />,
    );

    expect(container.querySelector(".res__num")).toHaveClass("res__num--warm");
    expect(container.querySelector(".res__rep")).toHaveClass("res__rep--warm");

    const hotRepIndex = new Map<number, Set<number>>([[10, new Set([1, 2, 3, 4, 5])]]);

    rerender(
      <PopupResCard
        res={BASE_RES}
        messageProtocol="https:"
        anchorPreviewDepth={0}
        repIndex={hotRepIndex}
        onUrlClick={() => {}}
        onUrlContextMenu={() => {}}
        onIdLinkClick={() => {}}
        onAnchorClick={() => {}}
        onAnchorHover={() => {}}
        onAnchorLeave={() => {}}
        onRepClick={() => {}}
      />,
    );

    expect(container.querySelector(".res__num")).toHaveClass("res__num--hot");
    expect(container.querySelector(".res__rep")).toHaveClass("res__rep--hot");
  });

  it("soft-ngではポップアップのNGレスを表示・再非表示・再表示できる", () => {
    const ngRes = { ...BASE_RES, ng: { type: "word" } } as IRes;
    const { container, getByRole } = render(
      <PopupResCard
        res={ngRes}
        messageProtocol="https:"
        anchorPreviewDepth={0}
        onUrlClick={() => {}}
        onUrlContextMenu={() => {}}
        onIdLinkClick={() => {}}
        onAnchorClick={() => {}}
        onAnchorHover={() => {}}
        onAnchorLeave={() => {}}
      />,
    );

    expect(container.querySelector(".res__body")).not.toBeInTheDocument();
    fireEvent.click(getByRole("button", { name: "クリックして内容を表示" }));
    expect(container.querySelector(".res__body")).toBeInTheDocument();

    fireEvent.click(getByRole("button", { name: "レス10をNG表示に戻す" }));

    expect(getByRole("button", { name: "クリックして内容を表示" })).toBeInTheDocument();
    expect(container.querySelector(".res__body")).not.toBeInTheDocument();

    fireEvent.click(getByRole("button", { name: "クリックして内容を表示" }));
    expect(container.querySelector(".res__body")).toBeInTheDocument();
  });

  it("hard-ngではNGレスのポップアップを描画しない", () => {
    ngMocks.configValue = "hard-ng";
    const ngRes = { ...BASE_RES, ng: { type: "word" } } as IRes;

    const { container } = render(
      <NgStatusProvider>
        <PopupResCard
          res={ngRes}
          messageProtocol="https:"
          anchorPreviewDepth={0}
          onUrlClick={() => {}}
          onUrlContextMenu={() => {}}
          onIdLinkClick={() => {}}
          onAnchorClick={() => {}}
          onAnchorHover={() => {}}
          onAnchorLeave={() => {}}
        />
      </NgStatusProvider>,
    );

    expect(container.querySelector(".res")).not.toBeInTheDocument();
  });

  it("highlight-ngではNGレスの本文を表示し、強調クラスを付ける", () => {
    ngMocks.configValue = "highlight-ng";
    const ngRes = { ...BASE_RES, ng: { type: "word" } } as IRes;

    const { container } = render(
      <NgStatusProvider>
        <PopupResCard
          res={ngRes}
          messageProtocol="https:"
          anchorPreviewDepth={0}
          onUrlClick={() => {}}
          onUrlContextMenu={() => {}}
          onIdLinkClick={() => {}}
          onAnchorClick={() => {}}
          onAnchorHover={() => {}}
          onAnchorLeave={() => {}}
        />
      </NgStatusProvider>,
    );

    expect(container.querySelector(".res")).toHaveClass("res--ng-highlight");
    expect(container.querySelector(".res__body")).toBeInTheDocument();
  });

  it("display_ng変更通知で既存ポップアップの表示方式を更新する", () => {
    const ngRes = { ...BASE_RES, ng: { type: "word" } } as IRes;
    const { container } = render(
      <NgStatusProvider>
        <PopupResCard
          res={ngRes}
          messageProtocol="https:"
          anchorPreviewDepth={0}
          onUrlClick={() => {}}
          onUrlContextMenu={() => {}}
          onIdLinkClick={() => {}}
          onAnchorClick={() => {}}
          onAnchorHover={() => {}}
          onAnchorLeave={() => {}}
        />
      </NgStatusProvider>,
    );

    expect(container.querySelector(".res__body")).not.toBeInTheDocument();

    ngMocks.configValue = "hard-ng";
    act(() => {
      ngMocks.configUpdatedCallback?.({ key: "display_ng" });
    });

    expect(container.querySelector(".res")).not.toBeInTheDocument();
  });

  it("一時NG解除中もNGバッジを残す", () => {
    const ngRes = { ...BASE_RES, ng: { type: "word" } } as IRes;
    const { container, getByRole } = render(
      <NgStatusProvider>
        <TemporarilyDisabledNgCard res={ngRes} />
      </NgStatusProvider>,
    );

    fireEvent.click(getByRole("button", { name: "一時NG解除" }));

    expect(container.querySelector(".res__body")).toBeInTheDocument();
    expect(container.querySelector(".res__badge--ng")).toHaveTextContent("NG");
  });

  it("サムネイルのミドルクリックで新規タブ扱いを1回だけ発火する", () => {
    const onUrlClick = vi.fn();
    const onLinkMiddleClickStart = vi.fn();

    const { container } = render(
      <PopupResCard
        res={BASE_RES}
        messageProtocol="https:"
        anchorPreviewDepth={0}
        onUrlClick={onUrlClick}
        onUrlContextMenu={() => {}}
        onLinkMiddleClickStart={onLinkMiddleClickStart}
        onIdLinkClick={() => {}}
        onAnchorClick={() => {}}
        onAnchorHover={() => {}}
        onAnchorLeave={() => {}}
      />,
    );

    const thumb = container.querySelector("a.res__thumb") as HTMLAnchorElement;
    fireEvent.mouseDown(thumb, { button: 1 });
    fireEvent(
      thumb,
      new MouseEvent("auxclick", {
        button: 1,
        bubbles: true,
        cancelable: true,
      }),
    );

    expect(onUrlClick).toHaveBeenCalledTimes(1);
    expect(onUrlClick).toHaveBeenCalledWith(
      "https://example.com/image.jpg",
      ["https://example.com/image.jpg"],
      1,
    );
    expect(onLinkMiddleClickStart).toHaveBeenCalled();
  });

  it("サムネイル右クリックでは既定コンテキストメニューを維持する", () => {
    const onContextMenu = vi.fn();

    const { container } = render(
      <PopupResCard
        res={BASE_RES}
        messageProtocol="https:"
        anchorPreviewDepth={0}
        onUrlClick={() => {}}
        onUrlContextMenu={() => {}}
        onIdLinkClick={() => {}}
        onAnchorClick={() => {}}
        onAnchorHover={() => {}}
        onAnchorLeave={() => {}}
        onContextMenu={onContextMenu}
      />,
    );

    const thumb = container.querySelector("a.res__thumb") as HTMLAnchorElement;
    const contextMenuEvent = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
    });

    thumb.dispatchEvent(contextMenuEvent);

    expect(onContextMenu).not.toHaveBeenCalled();
    expect(contextMenuEvent.defaultPrevented).toBe(false);
  });

  it("ルート起点ボタン押下で先頭ツリー展開ハンドラを呼ぶ", () => {
    const onOpenRootReplyTree = vi.fn();
    const repIndex = new Map<number, Set<number>>([[10, new Set([1, 2])]]);

    const { getByRole } = render(
      <PopupResCard
        res={BASE_RES}
        messageProtocol="https:"
        anchorPreviewDepth={0}
        repIndex={repIndex}
        onUrlClick={() => {}}
        onUrlContextMenu={() => {}}
        onIdLinkClick={() => {}}
        onAnchorClick={() => {}}
        onAnchorHover={() => {}}
        onAnchorLeave={() => {}}
        onRepClick={() => {}}
        onOpenRootReplyTree={onOpenRootReplyTree}
      />,
    );

    fireEvent.click(getByRole("button", { name: "ツリー先頭から" }));
    expect(onOpenRootReplyTree).toHaveBeenCalledWith(10, expect.any(Object));
  });
});
