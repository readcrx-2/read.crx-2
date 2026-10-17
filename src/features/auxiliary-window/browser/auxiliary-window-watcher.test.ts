import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const loggerMock = vi.hoisted(() => ({ error: vi.fn(), warn: vi.fn(), debug: vi.fn() }));
vi.mock("src/app/logger", () => ({ createLogger: () => loggerMock }));

const mocks = vi.hoisted(() => ({
  createAuxiliaryWindowRoot: vi.fn(),
}));

vi.mock("src/features/auxiliary-window/browser/auxiliary-window-root", () => ({
  createAuxiliaryWindowRoot: mocks.createAuxiliaryWindowRoot,
}));

import { watchAuxiliaryWindow } from "src/features/auxiliary-window/browser/auxiliary-window-watcher";

const OPTIONS = {
  name: "test-window",
  features: "popup",
  title: "テスト",
  shellClassName: "test-shell",
  logLabel: "TestWindow",
};

function createFakeWindow() {
  const target = new EventTarget();
  const fake = {
    closed: false,
    close: vi.fn(() => {
      fake.closed = true;
    }),
    addEventListener: target.addEventListener.bind(target),
    removeEventListener: target.removeEventListener.bind(target),
    dispatch: (type: string) => target.dispatchEvent(new Event(type)),
  };
  return fake;
}

function setup(overrides: { isCurrent?: boolean; options?: typeof OPTIONS | null } = {}) {
  const fake = createFakeWindow();
  const onClosed = vi.fn();
  const onReconnect = vi.fn();
  const watcher = watchAuxiliaryWindow({
    window: fake as unknown as Window,
    sourceDocument: document,
    isCurrent: () => overrides.isCurrent ?? true,
    getReconnectOptions: () => (overrides.options === undefined ? OPTIONS : overrides.options),
    onClosed,
    onReconnect,
  });
  return { fake, watcher, onClosed, onReconnect };
}

describe("watchAuxiliaryWindow", () => {
  afterEach(() => {
    mocks.createAuxiliaryWindowRoot.mockReset();
    vi.restoreAllMocks();
  });

  it("再読み込み中(closed=false)のbeforeunloadでは終了通知しない", () => {
    const { fake, onClosed } = setup();

    fake.dispatch("beforeunload");

    expect(onClosed).not.toHaveBeenCalled();
  });

  it("closedを確認できたbeforeunloadでだけ終了通知する", () => {
    const { fake, onClosed } = setup();
    fake.closed = true;

    fake.dispatch("beforeunload");

    expect(onClosed).toHaveBeenCalledTimes(1);
  });

  it("別のentryへ置き換わった窓のbeforeunloadは無視する", () => {
    const { fake, onClosed } = setup({ isCurrent: false });
    fake.closed = true;

    fake.dispatch("beforeunload");

    expect(onClosed).not.toHaveBeenCalled();
  });

  it("loadでrootを作り直して通知する", () => {
    const root = document.createElement("div");
    mocks.createAuxiliaryWindowRoot.mockReturnValue(root);
    const { fake, onReconnect } = setup();

    fake.dispatch("load");

    expect(mocks.createAuxiliaryWindowRoot).toHaveBeenCalledWith(document, fake, OPTIONS);
    expect(onReconnect).toHaveBeenCalledWith(root);
  });

  it("再接続対象が消えていればloadでrootを作らない", () => {
    const { fake, onReconnect } = setup({ options: null });

    fake.dispatch("load");

    expect(mocks.createAuxiliaryWindowRoot).not.toHaveBeenCalled();
    expect(onReconnect).not.toHaveBeenCalled();
  });

  it("root再作成に失敗したらログへ出して通知しない", () => {
    const error = new Error("失敗");
    mocks.createAuxiliaryWindowRoot.mockImplementation(() => {
      throw error;
    });
    loggerMock.error.mockClear();
    const { fake, onReconnect } = setup();

    fake.dispatch("load");

    expect(onReconnect).not.toHaveBeenCalled();
    expect(loggerMock.error).toHaveBeenCalledWith(
      "[TestWindow] 再読み込み後の別窓を再接続できませんでした",
      error,
    );
  });

  it("unwatch後はイベントに反応せず、窓も閉じない", () => {
    const { fake, watcher, onClosed, onReconnect } = setup();

    watcher.unwatch();
    fake.closed = true;
    fake.dispatch("beforeunload");
    fake.dispatch("load");

    expect(onClosed).not.toHaveBeenCalled();
    expect(onReconnect).not.toHaveBeenCalled();
    expect(fake.close).not.toHaveBeenCalled();
  });

  it("releaseは監視を外して開いている窓を閉じる", () => {
    const { fake, watcher, onClosed } = setup();

    watcher.release();
    fake.dispatch("beforeunload");

    expect(fake.close).toHaveBeenCalledTimes(1);
    expect(onClosed).not.toHaveBeenCalled();
  });

  it("releaseは既に閉じた窓へcloseを重ねない", () => {
    const { fake, watcher } = setup();
    fake.closed = true;

    watcher.release();

    expect(fake.close).not.toHaveBeenCalled();
  });

  it("元の窓が再読み込み・終了するときは別窓も閉じる", () => {
    const { fake, onClosed } = setup();

    window.dispatchEvent(new Event("pagehide"));

    expect(fake.close).toHaveBeenCalledTimes(1);
    // 元の窓が消えるだけなので、別窓側の終了処理（タブを閉じる等）は走らせない。
    expect(onClosed).not.toHaveBeenCalled();
  });

  it("監視を外した後は元の窓のpagehideで別窓を閉じない", () => {
    const { fake, watcher } = setup();

    watcher.unwatch();
    window.dispatchEvent(new Event("pagehide"));

    expect(fake.close).not.toHaveBeenCalled();
  });
});
