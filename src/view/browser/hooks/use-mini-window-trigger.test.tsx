import "@testing-library/jest-dom/vitest";

import { act, cleanup, renderHook } from "@testing-library/react";
import { useMiniWindowTrigger } from "src/view/browser/hooks/use-mini-window-trigger";
import { afterEach, describe, expect, it } from "vite-plus/test";

afterEach(() => {
  cleanup();
});

function attachTrigger(result: { current: ReturnType<typeof useMiniWindowTrigger> }): void {
  const button = document.createElement("button");
  button.getBoundingClientRect = () => new DOMRect(10, 20, 30, 40);
  result.current.triggerRef.current = button;
}

describe("useMiniWindowTrigger", () => {
  it("トグルでトリガー位置を測って開閉する", () => {
    const { result } = renderHook(() => useMiniWindowTrigger());
    attachTrigger(result);

    act(() => result.current.toggle());
    expect(result.current.anchor).toMatchObject({ left: 10, top: 20 });

    act(() => result.current.toggle());
    expect(result.current.anchor).toBeNull();
  });

  it("resetKeyが変わると開いていたミニウィンドウを閉じる", () => {
    const { result, rerender } = renderHook(({ key }) => useMiniWindowTrigger(key), {
      initialProps: { key: "thread-a" },
    });
    attachTrigger(result);

    act(() => result.current.toggle());
    expect(result.current.anchor).not.toBeNull();

    rerender({ key: "thread-b" });
    expect(result.current.anchor).toBeNull();
  });
});
