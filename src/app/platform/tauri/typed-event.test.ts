import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  emitTo: vi.fn(),
  listen: vi.fn(),
}));

vi.mock("@tauri-apps/api/event", () => ({
  emitTo: mocks.emitTo,
  listen: mocks.listen,
}));

import { defineTauriEventChannel } from "src/app/platform/tauri/typed-event";

interface Ping {
  count: number;
}

const isPing = (payload: unknown): payload is Ping =>
  typeof payload === "object" &&
  payload !== null &&
  typeof (payload as { count?: unknown }).count === "number";

function createChannel() {
  return defineTauriEventChannel({
    name: "chlens://test-ping",
    target: "target-window",
    logLabel: "Test",
    isPayload: isPing,
  });
}

describe("defineTauriEventChannel", () => {
  beforeEach(() => {
    mocks.emitTo.mockReset();
    mocks.emitTo.mockResolvedValue(undefined);
    mocks.listen.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("検証を通ったpayloadだけを送り先の窓へ送る", async () => {
    const channel = createChannel();

    await channel.emit({ count: 1 });

    expect(mocks.emitTo).toHaveBeenCalledExactlyOnceWith("target-window", "chlens://test-ping", {
      count: 1,
    });
  });

  it("不正なpayloadは送らずにTypeErrorで知らせる", async () => {
    const channel = createChannel();

    await expect(channel.emit({ count: "1" } as unknown as Ping)).rejects.toThrow(TypeError);
    expect(mocks.emitTo).not.toHaveBeenCalled();
  });

  it("受信したpayloadを検証し、不正なものはログに残して購読者へ渡さない", async () => {
    const unlisten = vi.fn();
    let handler: ((event: { payload: unknown }) => void) | undefined;
    mocks.listen.mockImplementation(async (_name, callback) => {
      handler = callback;
      return unlisten;
    });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const listener = vi.fn();
    const channel = createChannel();

    const dispose = await channel.listen(listener);
    handler?.({ payload: { count: 2 } });
    handler?.({ payload: { count: "broken" } });

    expect(mocks.listen).toHaveBeenCalledWith("chlens://test-ping", expect.any(Function));
    expect(listener).toHaveBeenCalledExactlyOnceWith({ count: 2 });
    expect(consoleError).toHaveBeenCalledOnce();
    expect(dispose).toBe(unlisten);
  });
});
