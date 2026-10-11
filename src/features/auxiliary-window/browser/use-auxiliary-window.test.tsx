import "@testing-library/jest-dom/vitest";

import { act, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  openPopup: vi.fn(),
}));

vi.mock("src/app/platform", () => ({
  platform: {
    window: {
      openPopup: mocks.openPopup,
    },
  },
}));

import {
  openAuxiliaryWindow,
  useAuxiliaryWindow,
} from "src/features/auxiliary-window/browser/use-auxiliary-window";

const OPTIONS = {
  name: "test-detached-window",
  features: "popup",
  title: "テスト別窓",
  shellClassName: "test-window-shell",
  logLabel: "TestWindow",
};

/** load/beforeunloadを発火できる別窓の代わり。再読み込みではdocumentを差し替える。 */
function createReloadablePopup(): {
  popup: Window & { closed: boolean };
  reload: () => void;
} {
  const target = new EventTarget();
  const popup = {
    document: document.implementation.createHTMLDocument(),
    closed: false,
    addEventListener: target.addEventListener.bind(target),
    removeEventListener: target.removeEventListener.bind(target),
    focus: vi.fn(),
    close: vi.fn(),
  } as unknown as Window & { closed: boolean };
  return {
    popup,
    reload: () => {
      target.dispatchEvent(new Event("beforeunload"));
      (popup as unknown as { document: Document }).document =
        document.implementation.createHTMLDocument();
      target.dispatchEvent(new Event("load"));
    },
  };
}

function createPopup(): Window {
  return {
    document: document.implementation.createHTMLDocument(),
    closed: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    focus: vi.fn(),
    close: vi.fn(),
  } as unknown as Window;
}

const Probe: React.FC = () => {
  const { root, isOpen, open, close } = useAuxiliaryWindow(OPTIONS);
  return (
    <>
      <output data-testid="open">{String(isOpen)}</output>
      <output data-testid="theme">{root?.dataset.theme ?? ""}</output>
      <output data-testid="root-document">{root?.ownerDocument.title ?? ""}</output>
      <button onClick={() => open()}>別窓を開く</button>
      <button onClick={close}>別窓を閉じる</button>
    </>
  );
};

describe("useAuxiliaryWindow", () => {
  beforeEach(() => {
    mocks.openPopup.mockReset();
    document.body.innerHTML = '<div class="browser-shell" data-theme="dark"></div>';
    const style = document.createElement("style");
    style.textContent = ".test-window { color: red; }";
    document.head.appendChild(style);
  });

  afterEach(() => {
    document.body.innerHTML = "";
    document.head.innerHTML = "";
  });

  it("別窓の表示基盤を作成し、同じ窓を再利用する", () => {
    const popup = createPopup();
    mocks.openPopup.mockReturnValue(popup);
    render(<Probe />);

    fireEvent.click(screen.getByRole("button", { name: "別窓を開く" }));

    expect(mocks.openPopup).toHaveBeenCalledWith("test-detached-window", "popup");
    expect(popup.document.title).toBe("テスト別窓");
    expect(popup.document.querySelector(".test-window-shell")?.getAttribute("data-theme")).toBe(
      "dark",
    );
    expect(popup.document.head.querySelector("style")?.textContent).toContain("color: red");
    expect(screen.getByTestId("open")).toHaveTextContent("true");

    fireEvent.click(screen.getByRole("button", { name: "別窓を開く" }));
    expect(mocks.openPopup).toHaveBeenCalledTimes(1);
    expect(popup.focus).toHaveBeenCalledTimes(2);
  });

  it("閉じる操作で表示状態と別窓を解放する", () => {
    const popup = createPopup();
    mocks.openPopup.mockReturnValue(popup);
    render(<Probe />);

    fireEvent.click(screen.getByRole("button", { name: "別窓を開く" }));
    fireEvent.click(screen.getByRole("button", { name: "別窓を閉じる" }));

    expect(screen.getByTestId("open")).toHaveTextContent("false");
    expect(popup.close).toHaveBeenCalledTimes(1);
  });

  it("別窓を再読み込みしても閉じたと扱わず、表示基盤を作り直す", () => {
    const { popup, reload } = createReloadablePopup();
    mocks.openPopup.mockReturnValue(popup);
    render(<Probe />);
    fireEvent.click(screen.getByRole("button", { name: "別窓を開く" }));

    act(() => reload());

    expect(screen.getByTestId("open")).toHaveTextContent("true");
    expect(popup.document.querySelector(".test-window-shell")).not.toBeNull();
    expect(screen.getByTestId("root-document")).toHaveTextContent("テスト別窓");
  });

  it("OSの×で閉じたことを親窓から確認して解放する", () => {
    vi.useFakeTimers();
    try {
      const { popup } = createReloadablePopup();
      mocks.openPopup.mockReturnValue(popup);
      render(<Probe />);
      fireEvent.click(screen.getByRole("button", { name: "別窓を開く" }));

      popup.closed = true;
      act(() => {
        vi.advanceTimersByTime(250);
      });

      expect(screen.getByTestId("open")).toHaveTextContent("false");
    } finally {
      vi.useRealTimers();
    }
  });

  it("呼び出し元のWindowを使ってポップアップを開く", () => {
    const sourceWindow = createPopup();
    const popup = createPopup();
    mocks.openPopup.mockReturnValue(popup);

    const handle = openAuxiliaryWindow(OPTIONS, sourceWindow);

    expect(handle).not.toBeNull();
    expect(mocks.openPopup).toHaveBeenCalledWith("test-detached-window", "popup", sourceWindow);
    expect(handle?.root.ownerDocument).toBe(popup.document);
  });
});
