import { decode } from "@toon-format/toon";
import { describe, expect, it, vi } from "vite-plus/test";

import { readDebateInstructions } from "../../scripts/debate-instructions.ts";
import { renderSimpleDebateHtml } from "../../scripts/debate-result.ts";
import {
  buildDebateContext,
  formatDebateMarkdown,
  formatDebateText,
  prepareDebateContext,
  validateDebateResult,
} from "./debate.ts";
import type { BridgeThreadResult, ThreadReadParams } from "./protocol.ts";
import { encodeThreadForMcp } from "./thread-output.ts";

// debate-result.ts は画像出力のために playwright を読み込むが、このテストはHTML生成だけを検証する。
// vmForksプールのjsdom環境には playwright-core が読み込み時に使う TransformStream がないため、起動しない形に置き換える。
vi.mock("playwright", () => ({ chromium: {} }));

const DEBATE_INSTRUCTIONS = readDebateInstructions();

const THREAD = {
  thread: {
    title: "議論テスト",
    url: "https://example.com/test/read.cgi/board/1/",
    totalResponses: 5,
  },
  responses: [
    { num: 1, id: "AAA", date: "10:00", message: "最初の主張", replyTo: "", repliedBy: "2,3" },
    { num: 2, id: "BBB", date: "10:01", message: ">>1 反論", replyTo: "1", repliedBy: "4" },
    { num: 3, id: "AAA", date: "10:02", message: ">>1 補足", replyTo: "1", repliedBy: "" },
    { num: 4, id: "CCC", date: "10:03", message: ">>2 再反論", replyTo: "2", repliedBy: "5" },
    { num: 5, id: "BBB", date: "10:04", message: ">>4 返答", replyTo: "4", repliedBy: "" },
  ],
};

describe("議論判定コンテキスト", () => {
  it("中心レスから返信元と返信先を辿る", () => {
    const context = buildDebateContext(
      THREAD,
      {
        responseNumbers: [2],
      },
      DEBATE_INSTRUCTIONS,
    );

    expect(context.scope).toEqual({ responseNumbers: [2], participantIds: [] });
    expect(context.responses.map((response) => response.num)).toEqual([1, 2, 3, 4, 5]);
    expect(context.responses.find((response) => response.num === 2)?.role).toBe("target");
    expect(context.responses.find((response) => response.num === 1)?.role).toBe("context");
    expect(context.omittedResponses).toBe(0);
    expect(context.toon).toContain("contextDepth: 8");
    expect(context.toon).toContain("debate");
    const payload = decode(context.toon) as { debate: { instructions: string } };
    expect(payload.debate.instructions).toBe(DEBATE_INSTRUCTIONS);
  });

  it("参加者IDを指定すると該当レスをすべて中心にする", () => {
    const context = buildDebateContext(
      THREAD,
      {
        participantIds: ["ID:BBB"],
      },
      DEBATE_INSTRUCTIONS,
    );

    expect(context.scope).toEqual({ responseNumbers: [2, 5], participantIds: ["BBB"] });
    expect(context.responses.map((response) => response.num)).toEqual([1, 2, 3, 4, 5]);
    expect(
      context.responses
        .filter((response) => response.role === "target")
        .map((response) => response.num),
    ).toEqual([2, 5]);
  });
});

// 変更理由: 返信が500件の境界をまたぐ実ログ形式を使い、先頭ページだけで判定する回帰を防ぐ。
const LARGE_THREAD = {
  title: "後半の議論テスト",
  url: "https://example.com/test/read.cgi/board/2/",
  res: Array.from({ length: 1002 }, (_, index) => {
    const num = index + 1;
    const messages: Record<number, string> = {
      499: "境界前の発言",
      700: ">>499 中心の主張",
      701: ">>700 反論",
      1001: ">>701 後続の主張",
      1002: ">>1001 返答",
    };
    return {
      num,
      name: "名無しさん",
      mail: "",
      date: "10:00",
      id: num === 700 || num === 1001 ? "AAA" : "BBB",
      message: messages[num] ?? "無関係な発言",
    };
  }),
};

function createThreadReader() {
  return vi.fn(async (params: ThreadReadParams): Promise<BridgeThreadResult> => ({
    kind: "thread",
    title: LARGE_THREAD.title,
    url: LARGE_THREAD.url,
    source: params.mode ?? "auto",
    ...encodeThreadForMcp(LARGE_THREAD, params, params.mode ?? "auto"),
  }));
}

describe("議論用ログのページ取得", () => {
  it("後半の中心レスと全ページにまたがる返信を取得し、続きのURLとキャッシュを固定する", async () => {
    const readThread = createThreadReader();
    const context = await prepareDebateContext(
      { responseNumbers: [700], mode: "refresh" },
      readThread,
      DEBATE_INSTRUCTIONS,
    );

    expect(context.responses.map((response) => response.num)).toEqual([499, 700, 701, 1001, 1002]);
    expect(readThread.mock.calls.map(([params]) => params)).toEqual([
      { url: undefined, mode: "refresh" },
      { url: LARGE_THREAD.url, mode: "cache", start: 501 },
      { url: LARGE_THREAD.url, mode: "cache", start: 1001 },
    ]);
  });

  it("同じIDの後半の発言も中心レスに含める", async () => {
    const context = await prepareDebateContext(
      { participantIds: ["AAA"] },
      createThreadReader(),
      DEBATE_INSTRUCTIONS,
    );
    expect(context.scope.responseNumbers).toEqual([700, 1001]);
  });

  it("先頭ページを繰り返す応答では部分ログを判定せずエラーにする", async () => {
    const firstPage = await createThreadReader()({});
    const readThread = vi.fn(async (_params: ThreadReadParams) => firstPage);
    await expect(
      prepareDebateContext({ responseNumbers: [499] }, readThread, DEBATE_INSTRUCTIONS),
    ).rejects.toThrow("議論用ログの続き");
    expect(readThread).toHaveBeenCalledTimes(2);
  });

  it("追加ページの取得エラーを呼び出し元に伝える", async () => {
    const firstPage = await createThreadReader()({});
    const readThread = vi
      .fn<(params: ThreadReadParams) => Promise<BridgeThreadResult>>()
      .mockResolvedValueOnce(firstPage)
      .mockRejectedValueOnce(new Error("キャッシュを取得できません"));
    await expect(
      prepareDebateContext({ responseNumbers: [499] }, readThread, DEBATE_INSTRUCTIONS),
    ).rejects.toThrow("キャッシュを取得できません");
  });

  it("追加ページのレス数が変わった場合は異なる時点のログを混ぜない", async () => {
    const firstPage = await createThreadReader()({});
    const changedThread = { ...LARGE_THREAD, res: LARGE_THREAD.res.slice(0, -1) };
    const secondPage: BridgeThreadResult = {
      kind: "thread",
      title: LARGE_THREAD.title,
      url: LARGE_THREAD.url,
      source: "cache",
      ...encodeThreadForMcp(changedThread, { start: 501 }, "cache"),
    };
    const readThread = vi
      .fn<(params: ThreadReadParams) => Promise<BridgeThreadResult>>()
      .mockResolvedValueOnce(firstPage)
      .mockResolvedValueOnce(secondPage);
    await expect(
      prepareDebateContext({ responseNumbers: [700] }, readThread, DEBATE_INSTRUCTIONS),
    ).rejects.toThrow("レス数が変わりました");
  });
});

const RESULT = {
  schemaVersion: 1,
  thread: { title: "議論テスト", url: "https://example.com/test/read.cgi/board/1/" },
  scope: { responseNumbers: [1, 2], participantIds: ["AAA", "BBB"] },
  summary: "二つの主張が対立している。",
  conclusion: "根拠が示された側に分がある。",
  issues: [
    {
      id: "issue-1",
      topic: "根拠の有無",
      status: "mixed",
      conclusion: "一部のみ確認できる。",
      positions: [
        {
          participantIds: ["AAA"],
          claim: "根拠がある",
          evidence: [{ responseNumbers: [1], role: "support", note: "具体例" }],
        },
      ],
      evidence: [{ responseNumbers: [2], role: "challenge", note: "反例" }],
    },
  ],
  participants: [
    {
      id: "AAA",
      responseNumbers: [1],
      position: "根拠を提示する側",
      strengths: ["具体例"],
      weaknesses: ["反例への応答がない"],
      score: { logic: 3.5, reading: 3, evidence: 4 },
    },
  ],
  research: [],
  simpleView: {
    topic: "根拠の有無",
    blue: {
      label: "根拠を示す側",
      participants: ["AAA"],
      claims: ["根拠がある"],
      metrics: {
        logic: { score: 3, reason: "主張の筋道が通っている。" },
        reading: { score: 3, reason: "反論の趣旨を捉えている。" },
        evidence: { score: 4, reason: "具体例を挙げている。" },
      },
    },
    red: {
      label: "反論する側",
      participants: ["BBB"],
      claims: ["反例がある"],
      metrics: {
        logic: { score: 3, reason: "反論は一貫している。" },
        reading: { score: 3, reason: "相手の主張を捉えている。" },
        evidence: { score: 2, reason: "裏付けは限定的。" },
      },
    },
    blueAdvantage: 0.58,
    verdictReason: "具体例を示した側が少し優勢。",
  },
};

describe("議論判定結果", () => {
  it("結果を検証し、テキストとMarkdownにレスリンクを含める", () => {
    const result = validateDebateResult(RESULT);
    expect(formatDebateText(result)).toContain("根拠の有無");
    expect(formatDebateMarkdown(result)).toContain("https://example.com/test/read.cgi/board/1/1");
  });

  it("必須フィールドがない結果を拒否する", () => {
    expect(() => validateDebateResult({ ...RESULT, conclusion: "" })).toThrow("conclusion");
  });

  it("評価不能と判定保留のnullを維持して検証する", () => {
    const metric = { score: null, reason: "評価材料不足のため評価不能。" };
    const result = validateDebateResult({
      ...RESULT,
      simpleView: {
        ...RESULT.simpleView,
        blueAdvantage: null,
        verdictReason: "判定保留。後続の根拠が不足している。",
        blue: {
          ...RESULT.simpleView.blue,
          metrics: { logic: metric, reading: metric, evidence: metric },
        },
        red: {
          ...RESULT.simpleView.red,
          metrics: { logic: metric, reading: metric, evidence: metric },
        },
      },
    });
    expect(result.simpleView.blueAdvantage).toBeNull();
    expect(result.simpleView.blue.metrics.logic.score).toBeNull();
    const document = new DOMParser().parseFromString(renderSimpleDebateHtml(result), "text/html");
    expect(document.querySelector(".pending-verdict")?.textContent).toContain("判定保留");
    expect(document.querySelector(".gauge")).toBeNull();
    expect(document.querySelector(".rates")).toBeNull();
    expect(document.querySelectorAll(".dot-meter")).toHaveLength(0);
    expect([...document.querySelectorAll(".score-number")].map((node) => node.textContent)).toEqual(
      Array(6).fill("評価不能"),
    );
  });

  it("材料に基づく互角と中間点は従来どおり数値で表示する", () => {
    const result = validateDebateResult({
      ...RESULT,
      simpleView: { ...RESULT.simpleView, blueAdvantage: 0.5 },
    });
    result.simpleView.blue.metrics.logic.score = 2.5;
    const document = new DOMParser().parseFromString(renderSimpleDebateHtml(result), "text/html");
    expect(document.querySelector(".pending-verdict")).toBeNull();
    expect(document.querySelector(".blue-rate")?.textContent).toBe("50%");
    expect(document.querySelector(".gauge-blue")?.getAttribute("style")).toBe("width:50%");
    expect(document.querySelectorAll(".dot-meter")).toHaveLength(6);
    expect(document.querySelector(".score-number")?.textContent).toBe("2.5/5.0");
  });

  it.each([undefined, -1, 6, Number.NaN, "2.5"])(
    "null以外の不正な評価値（%s）を拒否する",
    (score) => {
      expect(() =>
        validateDebateResult({
          ...RESULT,
          simpleView: {
            ...RESULT.simpleView,
            blue: {
              ...RESULT.simpleView.blue,
              metrics: {
                ...RESULT.simpleView.blue.metrics,
                logic: { score, reason: "評価理由。" },
              },
            },
          },
        }),
      ).toThrow("score");
    },
  );

  it.each([undefined, -0.1, 1.1, Number.NaN, "0.5"])(
    "null以外の不正な優勢度（%s）を拒否する",
    (blueAdvantage) => {
      expect(() =>
        validateDebateResult({ ...RESULT, simpleView: { ...RESULT.simpleView, blueAdvantage } }),
      ).toThrow("blueAdvantage");
    },
  );
});
