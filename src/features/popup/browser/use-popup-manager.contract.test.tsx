import "@testing-library/jest-dom/vitest";

import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import type { RefObject } from "react";
import { useRef } from "react";
import { usePopupCore, useThreadPopupManager } from "src/features/popup/browser/use-popup-manager";
import type { IRes } from "src/service-container/interfaces";
import { usePopupCloseBehavior } from "src/view/browser/hooks/use-popup-close-behavior";
import { ANCHOR_PREVIEW_HIDE_DELAY_MS } from "src/view/browser/utils/constants";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

function createRes(num: number): IRes {
  return {
    num,
    name: `res-${num}`,
    mail: "",
    date: "2026/04/18(土) 12:00:00.000",
    message: `message-${num}`,
  };
}

const TEST_RES_MAP = new Map<number, IRes>([
  [1, createRes(1)],
  [2, createRes(2)],
  [3, createRes(3)],
]);

const createTreePopup = (parentId?: string) => ({
  type: "tree" as const,
  x: 0,
  y: 0,
  payload: { resNum: 1, anchorPreviewDepth: 0 },
  ...(parentId == null ? {} : { parentId }),
});

function createAnchorRect(left = 100, bottom = 120): DOMRect {
  return { left, bottom } as DOMRect;
}

interface PopupContractHarnessProps {
  closeDisabled?: boolean;
  outsideClickIgnoreRefs?: Array<RefObject<HTMLElement | null>>;
  onClose: () => void;
  onPopupMouseDown: () => void;
}

function PopupContractHarness({
  closeDisabled,
  outsideClickIgnoreRefs,
  onClose,
  onPopupMouseDown,
}: PopupContractHarnessProps) {
  const popupRef = useRef<HTMLDivElement>(null);
  const { handleAuxClickCapture, handleMouseDownCapture, handleMouseEnter, handleMouseLeave } =
    usePopupCloseBehavior({
      popupRef,
      outsideClickIgnoreRefs,
      popupId: "popup-contract",
      closeDisabled,
      onClose,
      onPopupMouseDown,
    });

  return (
    <div>
      <div
        ref={popupRef}
        data-testid="popup"
        data-popup="true"
        data-popup-id="popup-contract"
        onAuxClickCapture={handleAuxClickCapture}
        onMouseDownCapture={handleMouseDownCapture}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        popup
      </div>
    </div>
  );
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("usePopupCore Phase 0 contracts", () => {
  it("同一scopeを複数mountしている間はstateを共有し、最後のunmountで破棄する", () => {
    const first = renderHook(() => usePopupCore("contract-shared-scope"));
    const second = renderHook(() => usePopupCore("contract-shared-scope"));

    act(() => {
      first.result.current.addPopup(createTreePopup());
    });

    expect(first.result.current.popups).toHaveLength(1);
    expect(second.result.current.popups).toHaveLength(1);

    first.unmount();
    expect(second.result.current.popups).toHaveLength(1);

    second.unmount();
    // 最後の参照が外れたscopeは、次回mount時に古いpopupを持ち越さない。
    const fresh = renderHook(() => usePopupCore("contract-shared-scope"));
    expect(fresh.result.current.popups).toHaveLength(0);
    fresh.unmount();
  });

  it("scopeId変更時に旧scopeを解放して新scopeへ切り替える", () => {
    const { result, rerender, unmount } = renderHook(
      ({ scopeId }: { scopeId: string }) => usePopupCore(scopeId),
      { initialProps: { scopeId: "contract-old-scope" } },
    );

    act(() => {
      result.current.addPopup(createTreePopup());
    });
    expect(result.current.popups).toHaveLength(1);

    rerender({ scopeId: "contract-new-scope" });
    expect(result.current.popups).toHaveLength(0);

    act(() => {
      result.current.addPopup(createTreePopup());
    });
    expect(result.current.popups).toHaveLength(1);

    // 旧scopeへ戻っても、切替前のpopupが復活してはいけない。
    rerender({ scopeId: "contract-old-scope" });
    expect(result.current.popups).toHaveLength(0);
    unmount();
  });

  it("親popupの削除は子孫だけをcascade closeし、存在しないIDでは変化しない", () => {
    const { result, unmount } = renderHook(() => usePopupCore("contract-graph-cascade"));
    let rootId = "";
    let childId = "";
    let grandchildId = "";
    let unrelatedId = "";

    act(() => {
      rootId = result.current.addPopup(createTreePopup());
      childId = result.current.addPopup({
        type: "id",
        x: 0,
        y: 0,
        payload: { items: [createRes(2)], title: "ID" },
        parentId: rootId,
      });
      grandchildId = result.current.addPopup({
        type: "contextMenu",
        x: 0,
        y: 0,
        payload: { items: [] },
        parentId: childId,
      });
      unrelatedId = result.current.addPopup(createTreePopup());
    });

    expect(result.current.popups.map((item) => item.id)).toEqual([
      rootId,
      childId,
      grandchildId,
      unrelatedId,
    ]);

    act(() => {
      result.current.closePopupById("missing-popup");
    });
    expect(result.current.popups.map((item) => item.id)).toEqual([
      rootId,
      childId,
      grandchildId,
      unrelatedId,
    ]);

    act(() => {
      result.current.closePopupById(rootId);
    });
    expect(result.current.popups.map((item) => item.id)).toEqual([unrelatedId]);
    unmount();
  });

  it("壊れたparentIdや循環があっても子孫判定とcascade closeが終了する", () => {
    const { result, unmount } = renderHook(() => usePopupCore("contract-graph-cycle"));
    let firstId = "";
    let secondId = "";

    act(() => {
      // 先に将来生成されるIDをparentIdへ入れ、意図的に循環した不正グラフを作る。
      firstId = result.current.addPopup({
        ...createTreePopup("contextMenu-2"),
      });
      secondId = result.current.addPopup({
        type: "contextMenu",
        x: 0,
        y: 0,
        payload: { items: [] },
        parentId: firstId,
      });
    });

    expect(secondId).toBe("contextMenu-2");
    expect(result.current.isPopupDescendantOf(firstId, secondId)).toBe(true);
    expect(result.current.isPopupDescendantOf(secondId, firstId)).toBe(true);
    expect(result.current.isPopupDescendantOf(firstId, "missing-ancestor")).toBe(false);

    act(() => {
      result.current.closePopupById(firstId);
    });
    expect(result.current.popups).toHaveLength(0);
    unmount();
  });
});

describe("useThreadPopupManager Phase 0 contracts", () => {
  const createThreadPopupHook = (scopeId: string) => {
    const rootRef = { current: null } as RefObject<HTMLDivElement | null>;
    return renderHook(() =>
      useThreadPopupManager({
        scopeId,
        rootRef,
        resMap: TEST_RES_MAP,
      }),
    );
  };

  it("同じanchor previewの再表示を抑止し、depth指定で下位previewだけを削除する", () => {
    const { result, unmount } = createThreadPopupHook("contract-anchor-depth");
    const anchorRect = createAnchorRect();

    act(() => {
      result.current.showAnchorPreview([1], anchorRect, ">>1", 0);
    });
    const rootPreviewId = result.current.anchorPreviews[0]?.id;
    expect(rootPreviewId).toBeDefined();

    act(() => {
      result.current.showAnchorPreview([1], anchorRect, ">>1", 0);
    });
    expect(result.current.anchorPreviews).toHaveLength(1);
    expect(result.current.anchorPreviews[0]?.id).toBe(rootPreviewId);

    act(() => {
      result.current.showAnchorPreview([2], anchorRect, ">>2", 1);
      result.current.showAnchorPreview([3], anchorRect, ">>3", 2);
    });
    expect(result.current.anchorPreviews.map((item) => item.payload.depth)).toEqual([0, 1, 2]);

    act(() => {
      result.current.hideAnchorPreviewImmediately(1);
    });
    expect(result.current.anchorPreviews.map((item) => item.payload.depth)).toEqual([0]);
    unmount();
  });

  it("anchor previewのhide timerを再設定でき、unmount時にcleanupする", () => {
    vi.useFakeTimers();
    const { result, unmount } = createThreadPopupHook("contract-anchor-timer");
    const anchorRect = createAnchorRect();

    act(() => {
      result.current.showAnchorPreview([1], anchorRect, ">>1", 0);
      result.current.hideAnchorPreview();
    });
    expect(result.current.anchorPreviews).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(1);

    act(() => {
      result.current.showAnchorPreview([2], anchorRect, ">>2", 0);
      vi.advanceTimersByTime(ANCHOR_PREVIEW_HIDE_DELAY_MS);
    });
    expect(result.current.anchorPreviews).toHaveLength(1);
    expect(result.current.anchorPreviews[0]?.payload.label).toBe(">>2");
    expect(vi.getTimerCount()).toBe(0);

    act(() => {
      result.current.hideAnchorPreview();
    });
    expect(result.current.anchorPreviews).toHaveLength(1);
    act(() => {
      vi.advanceTimersByTime(ANCHOR_PREVIEW_HIDE_DELAY_MS);
    });
    expect(result.current.anchorPreviews).toHaveLength(0);

    act(() => {
      result.current.showAnchorPreview([3], anchorRect, ">>3", 0);
      result.current.hideAnchorPreview();
    });
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("sourcePopupIdの祖先anchorを残したまま、新しいanchor previewを追加する", () => {
    const { result, unmount } = createThreadPopupHook("contract-anchor-ancestor");
    const anchorRect = createAnchorRect();

    act(() => {
      result.current.showAnchorPreview([1], anchorRect, ">>1", 0);
    });
    const rootPreview = result.current.anchorPreviews[0];
    if (!rootPreview) {
      throw new Error("root anchor preview was not created");
    }

    let sourcePopupId = "";
    act(() => {
      sourcePopupId = result.current.addIdPopup(
        0,
        0,
        [createRes(2)],
        "ID:contract",
        rootPreview.id,
      );
      result.current.showAnchorPreview([3], anchorRect, ">>3", 0, sourcePopupId);
    });

    // 「anchor → ID → anchor」の親anchorを消すと、ID popupまでcascade closeされるため、
    // sourcePopupIdの祖先にあたるanchorは新しいpreviewへ切り替えても残す。
    expect(result.current.anchorPreviews).toHaveLength(2);
    expect(result.current.anchorPreviews.some((item) => item.id === rootPreview.id)).toBe(true);
    const childPreview = result.current.anchorPreviews.find((item) => item.id !== rootPreview.id);
    expect(childPreview?.parentId).toBe(sourcePopupId);
    unmount();
  });
});

describe("usePopupCloseBehavior Phase 0 contracts", () => {
  it("right clickでは枝閉じ用onPopupMouseDownを呼ばない", () => {
    const onClose = vi.fn();
    const onPopupMouseDown = vi.fn();
    render(<PopupContractHarness onClose={onClose} onPopupMouseDown={onPopupMouseDown} />);

    fireEvent.mouseDown(screen.getByTestId("popup"), { button: 2 });

    expect(onPopupMouseDown).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("outsideClickIgnoreRefs内のmousedownでは閉じず、外側では閉じる", () => {
    const onClose = vi.fn();
    const onPopupMouseDown = vi.fn();
    function TriggerHarness() {
      const triggerRef = useRef<HTMLButtonElement>(null);
      return (
        <>
          <button ref={triggerRef} data-testid="ignored-trigger" type="button">
            trigger
          </button>
          <PopupContractHarness
            outsideClickIgnoreRefs={[triggerRef]}
            onClose={onClose}
            onPopupMouseDown={onPopupMouseDown}
          />
        </>
      );
    }

    render(<TriggerHarness />);

    fireEvent.mouseDown(screen.getByTestId("ignored-trigger"));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.mouseDown(document.body);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("closeDisabled解除時は実DOMの:hoverがtrueなら閉じない", () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <PopupContractHarness closeDisabled onClose={onClose} onPopupMouseDown={() => {}} />,
    );
    const popup = screen.getByTestId("popup");
    const originalMatches = popup.matches.bind(popup);
    Object.defineProperty(popup, "matches", {
      configurable: true,
      value: (selector: string) => {
        if (selector === ":hover") {
          return true;
        }
        return originalMatches(selector);
      },
    });

    rerender(
      <PopupContractHarness closeDisabled={false} onClose={onClose} onPopupMouseDown={() => {}} />,
    );

    expect(onClose).not.toHaveBeenCalled();
  });
});
