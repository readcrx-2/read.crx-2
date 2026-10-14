// @vitest-environment node
import { evaluateThreadNg } from "src/core/ng/ThreadNgEvaluator";
import type { INGResult } from "src/core/ports/ng";
import type { IRes } from "src/core/ports/thread";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  config: new Map<string, string>(),
  isNGThread: vi.fn(),
}));

vi.mock("src/service-container/index", () => ({
  container: {
    config: { get: (key: string) => mocks.config.get(key) ?? null },
    ng: { isNGThread: mocks.isNGThread },
  },
}));

const context = { title: "title", url: "https://example.com/test/read.cgi/board/1/" };

const res = (num: number, patch: Partial<IRes> = {}): IRes => ({
  num,
  name: "",
  mail: "",
  date: "",
  message: `本文${num}`,
  ...patch,
});

describe("evaluateThreadNg", () => {
  beforeEach(() => {
    mocks.config.clear();
    mocks.isNGThread.mockReset();
    mocks.isNGThread.mockReturnValue(null);
  });

  it("NG対象がなければ空の結果を返し、入力のレスを変更しない", () => {
    const input = [res(1), res(2)];
    const snapshot = structuredClone(input);

    expect(evaluateThreadNg(input, context).size).toBe(0);
    expect(input).toEqual(snapshot);
  });

  it("全レスの返信索引を使って返信数をルール判定へ渡す", () => {
    mocks.isNGThread.mockImplementation((r: { replyCount?: number }) =>
      (r.replyCount ?? 0) >= 2 ? ({ type: "ReplyCount" } as INGResult) : null,
    );

    const results = evaluateThreadNg(
      [res(1), res(2, { message: "&gt;&gt;1" }), res(3, { message: "&gt;&gt;1" })],
      context,
    );

    expect(results.get(1)).toEqual({ type: "ReplyCount" });
    expect(results.has(2)).toBe(false);
  });

  it("1レス目にIDがあるスレでID無しのレスをNothingIDにする", () => {
    mocks.config.set("nothing_id_ng", "on");
    mocks.config.set("how_to_judgment_id", "first_res");

    const results = evaluateThreadNg([res(1, { id: "abc" }), res(2)], context);

    expect(results.has(1)).toBe(false);
    expect(results.get(2)).toEqual({ type: "NothingID" });
  });

  it("NGになったレスと同じIDの前後のレスを連鎖NGにする", () => {
    mocks.config.set("chain_ng_id", "on");
    mocks.isNGThread.mockImplementation((r: { num: number }) =>
      r.num === 2 ? ({ type: "Word" } as INGResult) : null,
    );

    const results = evaluateThreadNg(
      [res(1, { id: "abc" }), res(2, { id: "abc" }), res(3, { id: "def" }), res(4, { id: "abc" })],
      context,
    );

    expect([...results.keys()].sort()).toEqual([1, 2, 4]);
    expect(results.get(1)).toEqual({ type: "ChainID" });
    expect(results.get(4)).toEqual({ type: "ChainID" });
  });

  it("安価の連鎖NGは後続の返信だけに広がり、さらにその返信へ伝播する", () => {
    mocks.config.set("chain_ng", "on");
    mocks.isNGThread.mockImplementation((r: { num: number }) =>
      r.num === 2 ? ({ type: "Word" } as INGResult) : null,
    );

    const results = evaluateThreadNg(
      [
        res(1),
        res(2),
        res(3, { message: "&gt;&gt;2" }),
        res(4, { message: "&gt;&gt;3" }),
        res(5, { message: "&gt;&gt;1" }),
      ],
      context,
    );

    expect(results.get(3)).toEqual({ type: "Chain" });
    expect(results.get(4)).toEqual({ type: "Chain" });
    expect(results.has(1)).toBe(false);
    expect(results.has(5)).toBe(false);
  });

  it("2chの1000超過以降のレスは判定しない", () => {
    mocks.isNGThread.mockReturnValue({ type: "Word" });

    const results = evaluateThreadNg(
      [res(1), res(2, { other: "Over 1000 Thread" }), res(3)],
      context,
    );

    expect([...results.keys()]).toEqual([1]);
  });
});
