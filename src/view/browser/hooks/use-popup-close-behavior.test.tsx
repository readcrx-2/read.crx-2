import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { usePopupCloseBehavior } from "src/view/browser/hooks/use-popup-close-behavior";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function PopupCloseGuardHarness({ onClose }: { onClose: () => void }) {
  const { armMouseLeaveCloseSuppression, handleMouseDownCapture, handleMouseLeave } =
    usePopupCloseBehavior({
      closeOnOutsideClick: false,
      onClose,
    });

  return (
    <div
      data-testid="popup"
      onMouseDownCapture={handleMouseDownCapture}
      onMouseLeave={handleMouseLeave}
    >
      <button type="button" onClick={armMouseLeaveCloseSuppression}>
        arm guard
      </button>
      <a href="https://example.com" data-testid="popup-link">
        popup link
      </a>
    </div>
  );
}

function PopupMouseDownHarness({ onPopupMouseDown }: { onPopupMouseDown: () => void }) {
  const { handleMouseDownCapture } = usePopupCloseBehavior({
    closeOnMouseLeave: false,
    closeOnOutsideClick: false,
    onClose: () => undefined,
    onPopupMouseDown,
  });

  return (
    <div data-testid="popup" onMouseDownCapture={handleMouseDownCapture}>
      <div data-testid="plain-area">plain area</div>
      <a href="https://example.com" data-testid="popup-link">
        popup link
      </a>
    </div>
  );
}

describe("usePopupCloseBehavior", () => {
  it("middle click 直後の mouseleave close を抑止する", () => {
    const onClose = vi.fn();

    render(<PopupCloseGuardHarness onClose={onClose} />);

    fireEvent.click(screen.getByRole("button", { name: "arm guard" }));
    fireEvent.mouseLeave(screen.getByTestId("popup"), {
      relatedTarget: null,
    });

    expect(onClose).not.toHaveBeenCalled();
  });

  it("middle click 後は遅延した最初の mouseleave も1回は抑止する", () => {
    const onClose = vi.fn();

    vi.useFakeTimers();
    render(<PopupCloseGuardHarness onClose={onClose} />);

    fireEvent.click(screen.getByRole("button", { name: "arm guard" }));
    vi.advanceTimersByTime(1000);
    fireEvent.mouseLeave(screen.getByTestId("popup"), {
      relatedTarget: null,
    });

    expect(onClose).not.toHaveBeenCalled();
  });

  it("リンクの左クリック操作直後の mouseleave close も抑止する", () => {
    const onClose = vi.fn();

    render(<PopupCloseGuardHarness onClose={onClose} />);

    fireEvent.mouseDown(screen.getByTestId("popup-link"), { button: 0 });
    fireEvent.mouseLeave(screen.getByTestId("popup"), {
      relatedTarget: null,
    });

    expect(onClose).not.toHaveBeenCalled();
  });

  it("popup内リンクの mousedown では枝閉じ用 onPopupMouseDown を呼ばない", () => {
    const onPopupMouseDown = vi.fn();

    render(<PopupMouseDownHarness onPopupMouseDown={onPopupMouseDown} />);

    fireEvent.mouseDown(screen.getByTestId("popup-link"), { button: 0 });

    expect(onPopupMouseDown).not.toHaveBeenCalled();
  });

  it("popup本体の通常領域 mousedown では枝閉じ用 onPopupMouseDown を呼ぶ", () => {
    const onPopupMouseDown = vi.fn();

    render(<PopupMouseDownHarness onPopupMouseDown={onPopupMouseDown} />);

    fireEvent.mouseDown(screen.getByTestId("plain-area"), { button: 0 });

    expect(onPopupMouseDown).toHaveBeenCalledOnce();
  });
});
