import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const loggerMock = vi.hoisted(() => ({ error: vi.fn(), warn: vi.fn(), debug: vi.fn() }));
vi.mock("src/app/logger", () => ({ createLogger: () => loggerMock }));

const { fetchTauriBinaryMock, isTauriRuntimeMock } = vi.hoisted(() => ({
  fetchTauriBinaryMock: vi.fn(),
  isTauriRuntimeMock: vi.fn(),
}));

vi.mock("src/app/platform/runtime", () => ({
  isTauriRuntime: isTauriRuntimeMock,
}));

vi.mock("src/app/platform/tauri/HttpClient", () => ({
  fetchTauriBinary: fetchTauriBinaryMock,
}));

import { ExternalImage } from "./ExternalImage";

const imageUrl = "https://images.example.com/photo.jpg";

describe("ExternalImage", () => {
  let createObjectUrl: ReturnType<typeof vi.fn>;
  let revokeObjectUrl: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    cleanup();
    fetchTauriBinaryMock.mockReset();
    isTauriRuntimeMock.mockReset();
    isTauriRuntimeMock.mockReturnValue(false);

    createObjectUrl = vi.fn(() => "blob:tauri-image");
    revokeObjectUrl = vi.fn();
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: createObjectUrl,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: revokeObjectUrl,
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("ブラウザ環境では元のURLをそのまま使う", () => {
    render(<ExternalImage src={imageUrl} alt="テスト画像" />);

    expect(screen.getByRole("img", { name: "テスト画像" })).toHaveAttribute("src", imageUrl);
    expect(fetchTauriBinaryMock).not.toHaveBeenCalled();
  });

  it("Tauri WebViewでの失敗時はHTTPプラグインのblob URLへ切り替える", async () => {
    isTauriRuntimeMock.mockReturnValue(true);
    fetchTauriBinaryMock.mockResolvedValue({
      status: 200,
      headers: { "content-type": "image/jpeg" },
      body: new ArrayBuffer(4),
      url: imageUrl,
    });

    const { unmount } = render(<ExternalImage src={imageUrl} alt="テスト画像" />);
    const image = screen.getByRole("img", { name: "テスト画像" });

    fireEvent.error(image);

    await waitFor(() => expect(image).toHaveAttribute("src", "blob:tauri-image"));
    expect(fetchTauriBinaryMock).toHaveBeenCalledWith(
      imageUrl,
      expect.objectContaining({ timeout: 30_000 }),
    );
    expect(createObjectUrl).toHaveBeenCalledOnce();

    unmount();
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:tauri-image");
  });

  it("Tauri側でも失敗した場合は元のonErrorへ通知する", async () => {
    isTauriRuntimeMock.mockReturnValue(true);
    fetchTauriBinaryMock.mockRejectedValue(new Error("network failure"));
    const onError = vi.fn();
    loggerMock.error.mockClear();

    render(<ExternalImage src={imageUrl} alt="テスト画像" onError={onError} />);
    fireEvent.error(screen.getByRole("img", { name: "テスト画像" }));

    await waitFor(() => expect(onError).toHaveBeenCalledOnce());
    expect(loggerMock.error).toHaveBeenCalledWith(
      "Tauri経由の外部画像取得に失敗しました",
      expect.objectContaining({ url: imageUrl }),
    );
  });
});
