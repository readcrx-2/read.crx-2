// @vitest-environment node
import type { IRes } from "src/service-container/interfaces";
import {
  buildBlurredResSet,
  buildReplyToWrittenResSet,
  buildWrittenResSet,
  compileImageBlurPattern,
  countNewRepliesToWrittenResponses,
} from "src/view/browser/utils/thread-emphasis";
import { describe, expect, it } from "vite-plus/test";

function createRes(num: number, message: string, extra: Partial<IRes> = {}): IRes {
  return {
    num,
    name: "名無しさん",
    mail: "",
    date: "2026/05/04",
    message,
    ...extra,
  };
}

describe("thread-emphasis", () => {
  it("書込履歴から自分のレス番号集合を組み立てる", () => {
    expect(
      Array.from(buildWrittenResSet([{ res: 3 }, { writtenRes: "9" }, { res: 0 }])).sort(
        (a, b) => a - b,
      ),
    ).toEqual([3, 9]);
  });

  it("自分のレスへの返信集合を repIndex から導出する", () => {
    const replyToWritten = buildReplyToWrittenResSet(
      new Set([5, 10]),
      new Map<number, Set<number>>([
        [5, new Set([7, 8])],
        [10, new Set([11])],
      ]),
    );

    expect(Array.from(replyToWritten).sort((a, b) => a - b)).toEqual([7, 8, 11]);
  });

  it("新着範囲から自分以外による自分のレスへの返信だけを数える", () => {
    const count = countNewRepliesToWrittenResponses(
      [{ num: 10 }, { num: 11 }, { num: 12 }, { num: 13 }, { num: 14 }],
      new Set([10, 13]),
      new Set([11, 13, 14]),
      10,
      4,
    );

    expect(count).toBe(2);
  });

  it("NGではないグロ返信だけを返信先サムネぼかし対象にする", () => {
    const harmfulPattern = compileImageBlurPattern("グロ");
    const blurredResNums = buildBlurredResSet(
      [
        createRes(1, "画像付きレス"),
        createRes(2, ">>1 <b>グロ</b>"),
        createRes(3, ">>1 グロ", { ng: { type: "word" }, class: ["ng"] }),
      ],
      new Map<number, Set<number>>([[1, new Set([2, 3])]]),
      harmfulPattern,
    );

    expect(Array.from(blurredResNums)).toEqual([1]);
  });
});
