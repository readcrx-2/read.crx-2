import "@testing-library/jest-dom/vitest";

import { fireEvent, render } from "@testing-library/react";
import { useState } from "react";
import { ResBody } from "src/features/thread/ui/ResBody";
import { ViewSurfaceProvider } from "src/view/browser/hooks/use-view-surface";
import { RESPECT_DEFAULT_EXTERNAL } from "src/view/browser/utils/link-routing";
import { describe, expect, it, vi } from "vite-plus/test";

const ANCHOR_HTML = '<a class="anchor">&gt;&gt;5</a>';
const URL_HTML = '<a href="https://example.com/thread/1">link</a>';
const INTERNAL_URL_HTML =
  '<a href="https://egg.5ch.net/test/read.cgi/software/1000000004/">internal</a>';
const ID_LINK_HTML = '<a href="javascript:undefined;" class="anchor_id">id:ABC123(4)</a>';

describe("ResBody anchor behavior", () => {
  it("同じHTMLの再描画では本文のテキスト選択を保持する", () => {
    const { container, rerender } = render(
      <ResBody
        messageHtml="選択する本文"
        anchorPreviewDepth={0}
        onUrlClick={() => {}}
        onUrlContextMenu={() => {}}
        onIdLinkClick={() => {}}
        onAnchorClick={() => {}}
        onAnchorHover={() => {}}
        onAnchorLeave={() => {}}
      />,
    );

    const body = container.querySelector(".res__body") as HTMLDivElement;
    const textNode = body.firstChild;
    const selection = body.ownerDocument.getSelection();
    const range = body.ownerDocument.createRange();
    range.selectNodeContents(body);
    selection?.removeAllRanges();
    selection?.addRange(range);

    expect(selection?.toString()).toBe("選択する本文");

    rerender(
      <ResBody
        messageHtml="選択する本文"
        ngResNums={new Set()}
        resMap={new Map()}
        anchorPreviewDepth={0}
        onUrlClick={() => {}}
        onUrlContextMenu={() => {}}
        onIdLinkClick={() => {}}
        onAnchorClick={() => {}}
        onAnchorHover={() => {}}
        onAnchorLeave={() => {}}
      />,
    );

    expect(body.firstChild).toBe(textNode);
    expect(selection?.toString()).toBe("選択する本文");
  });

  it("rerender後も同じアンカーhoverで onAnchorHover を再発火しない", () => {
    const onAnchorHover = vi.fn();
    const rect: DOMRect = {
      x: 10,
      y: 20,
      left: 10,
      top: 20,
      right: 50,
      bottom: 30,
      width: 40,
      height: 10,
      toJSON: () => ({}),
    } as DOMRect;
    const getBoundingClientRectSpy = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementation(() => rect);

    function Harness() {
      const [tick, setTick] = useState(0);

      return (
        <div data-testid={`tick-${tick}`}>
          <ResBody
            messageHtml={ANCHOR_HTML}
            anchorPreviewDepth={0}
            onUrlClick={() => {}}
            onUrlContextMenu={() => {}}
            onIdLinkClick={() => {}}
            onAnchorClick={() => {}}
            onAnchorHover={(targets, anchorRect, label, depth) => {
              onAnchorHover(targets, anchorRect, label, depth);
              // popup state更新のような親再描画が起きても、同一hover扱いで止まるべき。
              setTick((value) => value + 1);
            }}
            onAnchorLeave={() => {}}
          />
        </div>
      );
    }

    const { container } = render(<Harness />);

    const firstAnchor = container.querySelector("a.anchor") as HTMLAnchorElement;
    fireEvent.mouseOver(firstAnchor);
    expect(onAnchorHover).toHaveBeenCalledTimes(1);

    const secondAnchor = container.querySelector("a.anchor") as HTMLAnchorElement;
    fireEvent.mouseOver(secondAnchor);
    expect(onAnchorHover).toHaveBeenCalledTimes(1);

    getBoundingClientRectSpy.mockRestore();
  });

  it("アンカークリック時に先頭の参照先へジャンプする", () => {
    const onAnchorClick = vi.fn();
    const { container } = render(
      <ResBody
        messageHtml={ANCHOR_HTML}
        anchorPreviewDepth={0}
        onUrlClick={() => {}}
        onUrlContextMenu={() => {}}
        onIdLinkClick={() => {}}
        onAnchorClick={onAnchorClick}
        onAnchorHover={() => {}}
        onAnchorLeave={() => {}}
      />,
    );

    const anchor = container.querySelector("a.anchor") as HTMLAnchorElement;
    fireEvent.click(anchor);

    expect(onAnchorClick).toHaveBeenCalledOnce();
    expect(onAnchorClick).toHaveBeenCalledWith(5);
  });

  it("別窓のDOMでもアンカーのhoverとクリックを処理する", () => {
    const iframe = document.createElement("iframe");
    document.body.appendChild(iframe);
    const viewDocument = iframe.contentDocument;
    const viewWindow = iframe.contentWindow;
    if (!viewDocument || !viewWindow) {
      iframe.remove();
      throw new Error("別窓テスト用のiframeを初期化できませんでした");
    }

    const onAnchorClick = vi.fn();
    const onAnchorHover = vi.fn();
    const { container, unmount } = render(
      <ViewSurfaceProvider surface={{ document: viewDocument, window: viewWindow }}>
        <ResBody
          messageHtml={ANCHOR_HTML}
          anchorPreviewDepth={0}
          onUrlClick={() => {}}
          onUrlContextMenu={() => {}}
          onIdLinkClick={() => {}}
          onAnchorClick={onAnchorClick}
          onAnchorHover={onAnchorHover}
          onAnchorLeave={() => {}}
        />
      </ViewSurfaceProvider>,
      { container: viewDocument.body },
    );

    const anchor = container.querySelector("a.anchor") as HTMLAnchorElement;
    fireEvent.mouseOver(anchor);
    fireEvent.click(anchor);

    expect(onAnchorHover).toHaveBeenCalledWith([5], expect.any(Object), ">>5", 0);
    expect(onAnchorClick).toHaveBeenCalledWith(5);

    unmount();
    iframe.remove();
  });

  it("WindowProxyにDOM constructorがなくてもアンカー操作を処理する", () => {
    const iframe = document.createElement("iframe");
    document.body.appendChild(iframe);
    const viewDocument = iframe.contentDocument;
    if (!viewDocument) {
      iframe.remove();
      throw new Error("別窓テスト用のiframeを初期化できませんでした");
    }

    const onAnchorClick = vi.fn();
    const onAnchorHover = vi.fn();
    // 別窓のWindowProxyでconstructorが公開されない場合を再現し、
    // イベント元のnodeTypeだけで本文アンカーを復元できる契約を固定する。
    const proxyWithoutConstructors = { document: viewDocument } as unknown as Window;
    const { container, unmount } = render(
      <ViewSurfaceProvider surface={{ document: viewDocument, window: proxyWithoutConstructors }}>
        <ResBody
          messageHtml={ANCHOR_HTML}
          anchorPreviewDepth={0}
          onUrlClick={() => {}}
          onUrlContextMenu={() => {}}
          onIdLinkClick={() => {}}
          onAnchorClick={onAnchorClick}
          onAnchorHover={onAnchorHover}
          onAnchorLeave={() => {}}
        />
      </ViewSurfaceProvider>,
      { container: viewDocument.body },
    );

    const anchor = container.querySelector("a.anchor") as HTMLAnchorElement;
    fireEvent.mouseOver(anchor);
    fireEvent.click(anchor);

    expect(onAnchorHover).toHaveBeenCalledWith([5], expect.any(Object), ">>5", 0);
    expect(onAnchorClick).toHaveBeenCalledWith(5);

    unmount();
    iframe.remove();
  });

  it("NGレスへのアンカークリック時も対象レスへジャンプする", () => {
    const onAnchorClick = vi.fn();
    const onAnchorHover = vi.fn();
    const { container } = render(
      <ResBody
        messageHtml={ANCHOR_HTML}
        anchorPreviewDepth={0}
        ngResNums={new Set([5])}
        onUrlClick={() => {}}
        onUrlContextMenu={() => {}}
        onIdLinkClick={() => {}}
        onAnchorClick={onAnchorClick}
        onAnchorHover={onAnchorHover}
        onAnchorLeave={() => {}}
      />,
    );

    const anchor = container.querySelector("a.anchor") as HTMLAnchorElement;
    expect(anchor).toHaveClass("anchor--ng-target");
    fireEvent.click(anchor);

    expect(onAnchorClick).toHaveBeenCalledOnce();
    expect(onAnchorClick).toHaveBeenCalledWith(5);
    expect(onAnchorHover).not.toHaveBeenCalled();
  });

  it("存在しない参照先を強調し、部分欠損とNGのクラスを併用する", () => {
    const onAnchorClick = vi.fn();
    const onAnchorHover = vi.fn();
    const resMap = new Map<number, unknown>([[5, {}]]);
    const { container, rerender } = render(
      <ResBody
        messageHtml={'<a class="anchor">&gt;&gt;5, 9999</a>'}
        anchorPreviewDepth={0}
        ngResNums={new Set([5])}
        resMap={resMap}
        onUrlClick={() => {}}
        onUrlContextMenu={() => {}}
        onIdLinkClick={() => {}}
        onAnchorClick={onAnchorClick}
        onAnchorHover={onAnchorHover}
        onAnchorLeave={() => {}}
      />,
    );

    const anchor = container.querySelector("a.anchor") as HTMLAnchorElement;
    expect(anchor).toHaveClass("anchor--missing-target", "anchor--ng-target");

    fireEvent.click(anchor);
    fireEvent.mouseOver(anchor);

    expect(onAnchorClick).toHaveBeenCalledWith(5);
    expect(onAnchorHover).toHaveBeenCalledWith([5, 9999], expect.any(Object), ">>5, 9999", 0);

    rerender(
      <ResBody
        messageHtml={'<a class="anchor">&gt;&gt;5, 9999</a>'}
        anchorPreviewDepth={0}
        resMap={
          new Map<number, unknown>([
            [5, {}],
            [9999, {}],
          ])
        }
        onUrlClick={() => {}}
        onUrlContextMenu={() => {}}
        onIdLinkClick={() => {}}
        onAnchorClick={onAnchorClick}
        onAnchorHover={onAnchorHover}
        onAnchorLeave={() => {}}
      />,
    );

    expect(container.querySelector("a.anchor")).not.toHaveClass("anchor--missing-target");
  });

  it("通常リンクのミドルクリックを一度だけ新規タブ扱いで開く", () => {
    const onUrlClick = vi.fn(() => true);
    const { container } = render(
      <ResBody
        messageHtml={URL_HTML}
        anchorPreviewDepth={0}
        onUrlClick={onUrlClick}
        onUrlContextMenu={() => {}}
        onIdLinkClick={() => {}}
        onAnchorClick={() => {}}
        onAnchorHover={() => {}}
        onAnchorLeave={() => {}}
      />,
    );

    const anchor = container.querySelector("a") as HTMLAnchorElement;
    fireEvent.mouseDown(anchor, { button: 1 });
    fireEvent(
      anchor,
      new MouseEvent("auxclick", {
        button: 1,
        bubbles: true,
        cancelable: true,
      }),
    );

    expect(onUrlClick).toHaveBeenCalledOnce();
    expect(onUrlClick).toHaveBeenCalledWith(
      "https://example.com/thread/1",
      1,
      RESPECT_DEFAULT_EXTERNAL,
    );
  });

  it("auxclick が来ない環境でも middle mousedown だけで新規タブ扱いで開く", () => {
    const onUrlClick = vi.fn(() => true);
    const { container } = render(
      <ResBody
        messageHtml={URL_HTML}
        anchorPreviewDepth={0}
        onUrlClick={onUrlClick}
        onUrlContextMenu={() => {}}
        onIdLinkClick={() => {}}
        onAnchorClick={() => {}}
        onAnchorHover={() => {}}
        onAnchorLeave={() => {}}
      />,
    );

    const anchor = container.querySelector("a") as HTMLAnchorElement;
    fireEvent.mouseDown(anchor, { button: 1 });

    expect(onUrlClick).toHaveBeenCalledOnce();
    expect(onUrlClick).toHaveBeenCalledWith(
      "https://example.com/thread/1",
      1,
      RESPECT_DEFAULT_EXTERNAL,
    );
  });

  it("middle click 直後の mouseleave ではアンカープレビューを閉じない", () => {
    const onAnchorLeave = vi.fn();
    const { container } = render(
      <ResBody
        messageHtml={URL_HTML}
        anchorPreviewDepth={0}
        onUrlClick={() => {}}
        onUrlContextMenu={() => {}}
        onIdLinkClick={() => {}}
        onAnchorClick={() => {}}
        onAnchorHover={() => {}}
        onAnchorLeave={onAnchorLeave}
      />,
    );

    const root = container.querySelector(".res__body") as HTMLDivElement;
    const anchor = container.querySelector("a") as HTMLAnchorElement;

    fireEvent.mouseDown(anchor, { button: 1 });
    fireEvent.mouseLeave(root);

    expect(onAnchorLeave).not.toHaveBeenCalled();

    fireEvent.mouseLeave(root);
    expect(onAnchorLeave).toHaveBeenCalledOnce();
  });

  it("anchor_id クリックで ID ポップアップ用の値を渡す", () => {
    const onIdLinkClick = vi.fn();
    const { container } = render(
      <ResBody
        messageHtml={ID_LINK_HTML}
        anchorPreviewDepth={0}
        onUrlClick={() => {}}
        onUrlContextMenu={() => {}}
        onIdLinkClick={onIdLinkClick}
        onAnchorClick={() => {}}
        onAnchorHover={() => {}}
        onAnchorLeave={() => {}}
      />,
    );

    const anchor = container.querySelector("a.anchor_id") as HTMLAnchorElement;
    fireEvent.click(anchor);

    expect(onIdLinkClick).toHaveBeenCalledOnce();
    expect(onIdLinkClick.mock.calls[0][0]).toBe("ID:ABC123");
  });

  it("非5ch互換URLの左クリックはブラウザ既定処理を維持する", () => {
    const onUrlClick = vi.fn(() => false);
    const { container } = render(
      <ResBody
        messageHtml={URL_HTML}
        anchorPreviewDepth={0}
        onUrlClick={onUrlClick}
        onUrlContextMenu={() => false}
        onIdLinkClick={() => {}}
        onAnchorClick={() => {}}
        onAnchorHover={() => {}}
        onAnchorLeave={() => {}}
      />,
    );

    const anchor = container.querySelector("a") as HTMLAnchorElement;
    const clickEvent = new MouseEvent("click", {
      button: 0,
      bubbles: true,
      cancelable: true,
    });

    anchor.dispatchEvent(clickEvent);

    expect(onUrlClick).toHaveBeenCalledWith(
      "https://example.com/thread/1",
      0,
      RESPECT_DEFAULT_EXTERNAL,
    );
    expect(clickEvent.defaultPrevented).toBe(false);
  });

  it("非5ch互換URLの中クリックはブラウザ既定処理を維持する", () => {
    const onUrlClick = vi.fn(() => false);
    const { container } = render(
      <ResBody
        messageHtml={URL_HTML}
        anchorPreviewDepth={0}
        onUrlClick={onUrlClick}
        onUrlContextMenu={() => false}
        onIdLinkClick={() => {}}
        onAnchorClick={() => {}}
        onAnchorHover={() => {}}
        onAnchorLeave={() => {}}
      />,
    );

    const anchor = container.querySelector("a") as HTMLAnchorElement;
    const downEvent = new MouseEvent("mousedown", {
      button: 1,
      bubbles: true,
      cancelable: true,
    });
    const auxEvent = new MouseEvent("auxclick", {
      button: 1,
      bubbles: true,
      cancelable: true,
    });

    anchor.dispatchEvent(downEvent);
    anchor.dispatchEvent(auxEvent);

    expect(onUrlClick).toHaveBeenCalledWith(
      "https://example.com/thread/1",
      1,
      RESPECT_DEFAULT_EXTERNAL,
    );
    expect(downEvent.defaultPrevented).toBe(false);
    expect(auxEvent.defaultPrevented).toBe(false);
  });

  it("非5ch互換URLの右クリックはブラウザ既定メニューを維持する", () => {
    const onUrlContextMenu = vi.fn(() => false);
    const { container } = render(
      <ResBody
        messageHtml={URL_HTML}
        anchorPreviewDepth={0}
        onUrlClick={() => false}
        onUrlContextMenu={onUrlContextMenu}
        onIdLinkClick={() => {}}
        onAnchorClick={() => {}}
        onAnchorHover={() => {}}
        onAnchorLeave={() => {}}
      />,
    );

    const anchor = container.querySelector("a") as HTMLAnchorElement;
    const contextMenuEvent = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
    });

    anchor.dispatchEvent(contextMenuEvent);

    expect(onUrlContextMenu).not.toHaveBeenCalled();
    expect(contextMenuEvent.defaultPrevented).toBe(false);
  });

  it("5ch互換URLでも右クリックはブラウザ既定メニューを維持する", () => {
    const onUrlContextMenu = vi.fn(() => true);
    const { container } = render(
      <ResBody
        messageHtml={INTERNAL_URL_HTML}
        anchorPreviewDepth={0}
        onUrlClick={() => true}
        onUrlContextMenu={onUrlContextMenu}
        onIdLinkClick={() => {}}
        onAnchorClick={() => {}}
        onAnchorHover={() => {}}
        onAnchorLeave={() => {}}
      />,
    );

    const anchor = container.querySelector("a") as HTMLAnchorElement;
    const contextMenuEvent = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
    });

    anchor.dispatchEvent(contextMenuEvent);

    expect(onUrlContextMenu).not.toHaveBeenCalled();
    expect(contextMenuEvent.defaultPrevented).toBe(false);
  });

  it("検索語を本文の一致箇所だけ強調し、アンカー操作を維持する", () => {
    const onAnchorClick = vi.fn();
    const { container } = render(
      <ResBody
        messageHtml='<a class="anchor">&gt;&gt;5 見つかる</a> 見つかる'
        searchQuery="見つかる"
        anchorPreviewDepth={0}
        onUrlClick={() => {}}
        onUrlContextMenu={() => {}}
        onIdLinkClick={() => {}}
        onAnchorClick={onAnchorClick}
        onAnchorHover={() => {}}
        onAnchorLeave={() => {}}
      />,
    );

    expect(container.querySelectorAll("mark.res__search-match")).toHaveLength(2);
    const anchor = container.querySelector("a.anchor") as HTMLAnchorElement;
    fireEvent.click(anchor.querySelector("mark") as HTMLElement);

    expect(onAnchorClick).toHaveBeenCalledWith(5);
  });
});
