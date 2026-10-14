import "@testing-library/jest-dom/vitest";

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NgStatusProvider } from "src/features/ng";
import { ResItem, type ResItemProps } from "src/features/thread/ui/ResItem";
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
      // res__link クラス付きのアンカーを含めることで、
      // 右クリックのコンテキストメニュー委譲テストで a.res__link セレクタが解決できるようにする。
      messageHtml: '<a href="https://example.com/page" class="res__link">リンク</a>',
      isNameAnchor: false,
    }),
  };
});

vi.mock("src/core/util/url-media", async () => {
  const actual =
    await vi.importActual<typeof import("src/core/util/url-media")>("src/core/util/url-media");
  return {
    ...actual,
    extractUrlsFromMessage: () => ["https://example.com/page", "https://example.com/image.jpg"],
    toViewerImageUrl: (rawUrl: string) => (rawUrl.endsWith(".jpg") ? rawUrl : null),
  };
});

const BASE_RES: IRes = {
  num: 1,
  name: "名無しさん",
  mail: "",
  date: "2026/04/22",
  message: "本文",
};

describe("ResItem", () => {
  it("レス自身の入場アニメーションが完了したときだけ表示完了を通知する", () => {
    const onEntryDisplayed = vi.fn();
    const { container } = renderNgRes(BASE_RES, { animateEntry: true, onEntryDisplayed });
    const article = container.querySelector("article")!;
    const body = container.querySelector(".res__body")!;
    const endAnimation = (target: Element, animationName: string) => {
      // jsdomにAnimationEventがない場合はReactがWebKit名へ切り替えるため、同じイベント名を使う。
      const event = new Event("AnimationEvent" in window ? "animationend" : "webkitAnimationEnd", {
        bubbles: true,
      });
      Object.defineProperty(event, "animationName", { value: animationName });
      fireEvent(target, event);
    };
    expect(onEntryDisplayed).not.toHaveBeenCalled();
    endAnimation(body, "live-chat-enter");
    endAnimation(article, "別のアニメーション");
    expect(onEntryDisplayed).not.toHaveBeenCalled();
    endAnimation(article, "live-chat-enter");
    expect(onEntryDisplayed).toHaveBeenCalledWith(1);
    expect(onEntryDisplayed).toHaveBeenCalledOnce();
  });

  it("入場しないNGプレースホルダーも描画後に表示完了を通知する", () => {
    const onEntryDisplayed = vi.fn();
    renderNgRes({ ...BASE_RES, ng: { type: "Body" } }, { animateEntry: true, onEntryDisplayed });
    expect(screen.getByRole("button", { name: "レス1の内容を表示" })).toBeInTheDocument();
    expect(onEntryDisplayed).toHaveBeenCalledWith(1);
  });

  it("soft-ngではNGレスを表示・再非表示・再表示できる", () => {
    const ngRes: IRes = {
      ...BASE_RES,
      ng: { type: "Body", ruleDescription: 'hide:\n  when body contains "本文"' },
    };
    const { container } = renderNgRes(ngRes);

    const placeholder = screen.getByRole("button", { name: "レス1の内容を表示" });
    expect(placeholder).toHaveAttribute("data-res-num", "1");
    expect(container.querySelector(".res__body")).not.toBeInTheDocument();

    fireEvent.click(placeholder);

    expect(container.querySelector(".res__body")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "レス1をNG表示に戻す" }));

    expect(screen.getByRole("button", { name: "レス1の内容を表示" })).toBeInTheDocument();
    expect(container.querySelector(".res__body")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "レス1の内容を表示" }));
    expect(container.querySelector(".res__body")).toBeInTheDocument();
  });

  it("hard-ngではNGレスをDOMへ描画しない", () => {
    ngMocks.configValue = "hard-ng";
    const ngRes: IRes = { ...BASE_RES, ng: { type: "Body" } };

    const { container } = renderNgRes(ngRes);

    expect(container.querySelector("[data-res-num='1']")).not.toBeInTheDocument();
  });

  it("highlight-ngではNGレスの本文を表示し、強調クラスを付ける", () => {
    ngMocks.configValue = "highlight-ng";
    const ngRes: IRes = { ...BASE_RES, ng: { type: "Body" } };

    const { container } = renderNgRes(ngRes);

    expect(container.querySelector("[data-res-num='1']")).toHaveClass("res--ng-highlight");
    expect(container.querySelector(".res__body")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "レス1の内容を表示" })).not.toBeInTheDocument();
  });

  it("設定をhard-ngへ変更すると表示中のNGレスを隠す", () => {
    const ngRes: IRes = { ...BASE_RES, ng: { type: "Body" } };
    const { container } = renderNgRes(ngRes);

    fireEvent.click(screen.getByRole("button", { name: "レス1の内容を表示" }));
    expect(container.querySelector(".res__body")).toBeInTheDocument();

    ngMocks.configValue = "hard-ng";
    // モックした設定通知を使い、設定画面の保存結果が既存レスへ反映される経路を確認する。
    act(() => {
      ngMocks.configUpdatedCallback?.({ key: "display_ng" });
    });
    expect(container.querySelector("[data-res-num='1']")).not.toBeInTheDocument();
  });

  it("NGでないレスは表示方式に関係なく通常表示する", () => {
    ngMocks.configValue = "hard-ng";
    const { container } = renderNgRes(BASE_RES);

    expect(container.querySelector("[data-res-num='1']")).toBeInTheDocument();
  });

  it("検索対象に選んだ欄だけをハイライトする", () => {
    const props = {
      res: { ...BASE_RES, id: "リンク" },
      idPos: 0,
      idCount: 0,
      repCount: 0,
      isOwn: false,
      isReplyToOwn: false,
      isImageBlurred: false,
      imageBlurRadius: 4,
      miniAa: false,
      messageProtocol: "https:",
      onIdClick: () => {},
      onRepClick: () => {},
      onUrlClick: () => true,
      onUrlContextMenu: () => true,
      onAnchorClick: () => {},
      onAnchorHover: () => {},
      onAnchorLeave: () => {},
      onContextMenu: () => {},
      searchQuery: "リンク",
    };
    const { container, rerender } = render(<ResItem {...props} searchTarget="body" />);

    expect(container.querySelector(".res__body mark")).toHaveTextContent("リンク");
    expect(container.querySelector(".res__id mark")).not.toBeInTheDocument();

    rerender(<ResItem {...props} searchTarget="id" />);

    expect(container.querySelector(".res__body mark")).not.toBeInTheDocument();
    expect(container.querySelector(".res__id mark")).toHaveTextContent("リンク");

    rerender(<ResItem {...props} searchQuery="名無しさん" searchTarget="name" />);

    expect(container.querySelector(".res__name mark")).toHaveTextContent("名無しさん");
    expect(container.querySelector(".res__body mark")).not.toBeInTheDocument();
  });

  it("返信数に応じてレス番号と返信ラベルに同じ強調色クラスを付与する", () => {
    const { rerender } = render(
      <ResItem
        res={BASE_RES}
        idPos={0}
        idCount={0}
        repCount={3}
        isOwn={false}
        isReplyToOwn={false}
        isImageBlurred={false}
        imageBlurRadius={4}
        miniAa={false}
        messageProtocol="https:"
        onIdClick={() => {}}
        onRepClick={() => {}}
        onUrlClick={() => true}
        onUrlContextMenu={() => true}
        onAnchorClick={() => {}}
        onAnchorHover={() => {}}
        onAnchorLeave={() => {}}
        onContextMenu={() => {}}
      />,
    );

    expect(containerQueryByClass("res__num")).toHaveClass("res__num--warm");
    expect(screen.getByText("返信(3)")).toHaveClass("res__rep--warm");

    rerender(
      <ResItem
        res={BASE_RES}
        idPos={0}
        idCount={0}
        repCount={5}
        isOwn={false}
        isReplyToOwn={false}
        isImageBlurred={false}
        imageBlurRadius={4}
        miniAa={false}
        messageProtocol="https:"
        onIdClick={() => {}}
        onRepClick={() => {}}
        onUrlClick={() => true}
        onUrlContextMenu={() => true}
        onAnchorClick={() => {}}
        onAnchorHover={() => {}}
        onAnchorLeave={() => {}}
        onContextMenu={() => {}}
      />,
    );

    expect(containerQueryByClass("res__num")).toHaveClass("res__num--hot");
    expect(screen.getByText("返信(5)")).toHaveClass("res__rep--hot");
  });

  it("リンクと画像の右クリックでは既定コンテキストメニューを維持する", () => {
    const onContextMenu = vi.fn();

    const { container } = render(
      <ResItem
        res={BASE_RES}
        idPos={0}
        idCount={0}
        repCount={0}
        isOwn={false}
        isReplyToOwn={false}
        isImageBlurred={false}
        imageBlurRadius={4}
        miniAa={false}
        messageProtocol="https:"
        onIdClick={() => {}}
        onRepClick={() => {}}
        onUrlClick={() => true}
        onUrlContextMenu={() => true}
        onAnchorClick={() => {}}
        onAnchorHover={() => {}}
        onAnchorLeave={() => {}}
        onContextMenu={onContextMenu}
      />,
    );

    const link = container.querySelector("a.res__link") as HTMLAnchorElement;
    const thumb = container.querySelector("a.res__thumb") as HTMLAnchorElement;
    const linkEvent = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
    });
    const thumbEvent = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
    });

    link.dispatchEvent(linkEvent);
    thumb.dispatchEvent(thumbEvent);

    expect(onContextMenu).not.toHaveBeenCalled();
    expect(linkEvent.defaultPrevented).toBe(false);
    expect(thumbEvent.defaultPrevented).toBe(false);
  });

  it("状態クラスはNG、自分、自分宛て返信の優先順位で解決する", () => {
    const { container, rerender } = render(
      <ResItem
        res={BASE_RES}
        idPos={0}
        idCount={0}
        repCount={0}
        isOwn={false}
        isReplyToOwn
        isImageBlurred={false}
        imageBlurRadius={4}
        miniAa={false}
        messageProtocol="https:"
        onIdClick={() => {}}
        onRepClick={() => {}}
        onUrlClick={() => true}
        onUrlContextMenu={() => true}
        onAnchorClick={() => {}}
        onAnchorHover={() => {}}
        onAnchorLeave={() => {}}
        onContextMenu={() => {}}
      />,
    );

    const article = container.querySelector("[data-res-num='1']");
    expect(article).toHaveClass("res--state-reply-to-own");
    expect(container.querySelector(".res__name")).toHaveClass("res__name--state-reply-to-own");

    rerender(
      <ResItem
        res={BASE_RES}
        idPos={0}
        idCount={0}
        repCount={0}
        isOwn
        isReplyToOwn
        isImageBlurred={false}
        imageBlurRadius={4}
        miniAa={false}
        messageProtocol="https:"
        onIdClick={() => {}}
        onRepClick={() => {}}
        onUrlClick={() => true}
        onUrlContextMenu={() => true}
        onAnchorClick={() => {}}
        onAnchorHover={() => {}}
        onAnchorLeave={() => {}}
        onContextMenu={() => {}}
      />,
    );

    expect(article).toHaveClass("res--own");
    expect(article).toHaveClass("res--reply-to-own");
    expect(article).toHaveClass("res--state-own");
    expect(container.querySelector(".res__name")).toHaveClass("res__name--own");
    expect(container.querySelector(".res__name")).toHaveClass("res__name--reply-to-own");
    expect(container.querySelector(".res__name")).toHaveClass("res__name--state-own");
    expect(screen.getByText("自分")).toBeInTheDocument();
    expect(screen.getByText("返信")).toBeInTheDocument();

    const ngRes: IRes = {
      ...BASE_RES,
      ng: { type: "Body", ruleDescription: "hide body contains" },
    };
    rerender(
      <ResItem
        res={ngRes}
        idPos={0}
        idCount={0}
        repCount={0}
        isOwn
        isReplyToOwn
        isImageBlurred={false}
        imageBlurRadius={4}
        miniAa={false}
        messageProtocol="https:"
        onIdClick={() => {}}
        onRepClick={() => {}}
        onUrlClick={() => true}
        onUrlContextMenu={() => true}
        onAnchorClick={() => {}}
        onAnchorHover={() => {}}
        onAnchorLeave={() => {}}
        onContextMenu={() => {}}
      />,
    );

    // NG化では通常レスがplaceholderへ置き換わるため、rerender後のDOMを再取得して検証する。
    const ngArticle = container.querySelector("[data-res-num='1']");
    expect(ngArticle).toHaveClass("res--state-ng");
    fireEvent.click(ngArticle!);
    expect(container.querySelector(".res__name")).toHaveClass("res__name--state-ng");
    expect(container.querySelector(".res__badge--ng")).toHaveTextContent("NG");
  });

  it("検索語を一致した本文・名前・IDへそれぞれ表示する", () => {
    const searchableRes: IRes = { ...BASE_RES, id: "ABC123" };
    const { container, rerender } = render(
      <ResItem
        res={searchableRes}
        idPos={0}
        idCount={0}
        repCount={0}
        isOwn={false}
        isReplyToOwn={false}
        isImageBlurred={false}
        imageBlurRadius={4}
        miniAa={false}
        messageProtocol="https:"
        searchQuery="リンク"
        onIdClick={() => {}}
        onRepClick={() => {}}
        onUrlClick={() => true}
        onUrlContextMenu={() => true}
        onAnchorClick={() => {}}
        onAnchorHover={() => {}}
        onAnchorLeave={() => {}}
        onContextMenu={() => {}}
      />,
    );

    expect(container.querySelector(".res__body mark")?.textContent).toBe("リンク");

    rerender(
      <ResItem
        res={searchableRes}
        idPos={0}
        idCount={0}
        repCount={0}
        isOwn={false}
        isReplyToOwn={false}
        isImageBlurred={false}
        imageBlurRadius={4}
        miniAa={false}
        messageProtocol="https:"
        searchQuery="名無しさん"
        onIdClick={() => {}}
        onRepClick={() => {}}
        onUrlClick={() => true}
        onUrlContextMenu={() => true}
        onAnchorClick={() => {}}
        onAnchorHover={() => {}}
        onAnchorLeave={() => {}}
        onContextMenu={() => {}}
      />,
    );

    expect(container.querySelector(".res__name mark")?.textContent).toBe("名無しさん");

    rerender(
      <ResItem
        res={searchableRes}
        idPos={0}
        idCount={0}
        repCount={0}
        isOwn={false}
        isReplyToOwn={false}
        isImageBlurred={false}
        imageBlurRadius={4}
        miniAa={false}
        messageProtocol="https:"
        searchQuery="ABC"
        onIdClick={() => {}}
        onRepClick={() => {}}
        onUrlClick={() => true}
        onUrlContextMenu={() => true}
        onAnchorClick={() => {}}
        onAnchorHover={() => {}}
        onAnchorLeave={() => {}}
        onContextMenu={() => {}}
      />,
    );

    expect(container.querySelector(".res__id mark")?.textContent).toBe("ABC");
  });
});

function containerQueryByClass(className: string): HTMLElement {
  const el = document.querySelector(`.${className}`);
  if (!(el instanceof HTMLElement)) {
    throw new Error(`Element not found: .${className}`);
  }
  return el;
}

function renderNgRes(
  res: IRes,
  entryProps: Pick<ResItemProps, "animateEntry" | "onEntryDisplayed"> = {},
) {
  return render(
    <NgStatusProvider>
      <ResItem
        {...entryProps}
        res={res}
        idPos={0}
        idCount={0}
        repCount={0}
        isOwn={false}
        isReplyToOwn={false}
        isImageBlurred={false}
        imageBlurRadius={4}
        miniAa={false}
        messageProtocol="https:"
        onIdClick={() => {}}
        onRepClick={() => {}}
        onUrlClick={() => true}
        onUrlContextMenu={() => true}
        onAnchorClick={() => {}}
        onAnchorHover={() => {}}
        onAnchorLeave={() => {}}
        onContextMenu={() => {}}
      />
    </NgStatusProvider>,
  );
}
