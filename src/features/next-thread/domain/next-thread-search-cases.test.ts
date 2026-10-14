// @vitest-environment node
import {
  type AutoNextThreadMode,
  extractThreadSequenceNumber,
  findMainstreamThreadMatch,
  findNextThreadCandidates,
  findNextThreadMatch,
} from "src/features/next-thread/domain/next-thread-search";
import type { IThread } from "src/service-container/interfaces";
import { describe, expect, it } from "vite-plus/test";

const MODES: AutoNextThreadMode[] = ["balanced", "aggressive"];
const BASE_TIMESTAMP = 1_700_100_000;

// ユーザー指定の再現用スレタイは原文を保ち、各隣接段階が自動移動できるかを個別に確認する。
const PROVIDED_THREAD_TITLES = [
  "【NTV】金曜ロードSHOW！ミライの未来 ★1【地上波初】",
  "【NTV】金曜ロードSHOW！ミライの未来 ★2【地上波初】",
  "【NTV】金曜ロードSHOW！ミライのガイジ ★3【地上波初】",
  "【NTV】金曜ロードSHOW！ミライのガイジ ★4【地上波初】",
  "【NTV】金曜ロードSHOW！ミライのガイジ ★5【地上波初】",
  "【NTV】金曜ロードSHOW！ミライのガイジ ★6【地上波初】",
  "【NTV】金曜ロードSHOW！ミライのガイジ ★7【地上波初】",
  "【NTV】金曜ガイジSHOW！ガイジのガイジ ★8【地上波初】",
  "【NTV】金曜ガイジSHOW！ガイジの害児★9【地上波初】",
  "【ガイジ】金曜ガイジSHOW！ガイジのガイジ★10【ガイジ波初】",
  "【ガイジ】金曜ガイジSHOW！ガイジのガイジ★11【ガイジ波初】",
  "【ガイジ】金曜ガイジSHOW！ガイジのガイジ★12【ガイジ波初】",
  "【ガイジ】金曜ガイジSHOW！ガイジのガイジ★14【ガイジ波初】",
  "【ガイジ】金曜ガイジGAIJI！ガイジのガイジ★15【ガイジ波初】",
  "【ガイジ】ガイジ　ガイジ",
];

const PROVIDED_TRANSITIONS = PROVIDED_THREAD_TITLES.slice(0, -1).map((title, index) => ({
  title,
  nextTitle: PROVIDED_THREAD_TITLES[index + 1],
  index,
  transition: `${index + 1}行目→${index + 2}行目`,
}));

describe.each(MODES)("指定スレタイの隣接遷移（%s）", (mode) => {
  const verifyTransition = ({ title, nextTitle, index }: (typeof PROVIDED_TRANSITIONS)[number]) => {
    const source = thread(title, index);
    const candidate = thread(nextTitle, index + 1);
    // 標準は連番を飛ばさず、積極だけが★12から★14への移動を許容する。
    const expectedUrl = mode === "balanced" && index === 11 ? undefined : candidate.url;
    expect(findNextThreadMatch([candidate], source, { mode })?.thread.url).toBe(expectedUrl);
    expect(
      findNextThreadCandidates([candidate], source, { mode }).map(({ thread }) => thread.url),
    ).toEqual(expectedUrl ? [expectedUrl] : []);
  };
  it.each(PROVIDED_TRANSITIONS)("$transition：$title → $nextTitle", verifyTransition);

  it.each(PROVIDED_TRANSITIONS)(
    "複数候補がある$transitionでも後続スレを飛ばさない",
    ({ title, index }) => {
      const source = thread(title, index);
      const candidates = PROVIDED_THREAD_TITLES.map((title, offset) => thread(title, offset));
      const expectedUrl =
        mode === "balanced" && index === 11 ? undefined : candidates[index + 1].url;
      for (const ordered of [candidates, [...candidates].reverse()]) {
        expect(findNextThreadMatch(ordered, source, { mode })?.thread.url).toBe(expectedUrl);
      }
    },
  );
});

function thread(title: string, offset: number, overrides: Partial<IThread> = {}): IThread {
  return {
    title,
    url: `https://example.com/test/read.cgi/live/${BASE_TIMESTAMP + offset}/`,
    resCount: 20,
    createdAt: (BASE_TIMESTAMP + offset) * 1000,
    ng: undefined,
    highlight: undefined,
    isNet: null,
    readState: undefined,
    ...overrides,
  };
}

describe("番号後に括弧書きがある連番", () => {
  it.each([
    ["架空の月面探検隊 ★10【初放送】", 10, true],
    ["架空の月面探検隊 ★１０［第2章］", 10, true],
    ["架空の月面探検隊 Part.10 (新)【第2026回】", 10, false],
    ["架空の月面探検隊 Part 10【初放送】【字幕】", 10, false],
  ])("%sでは括弧内の数字を連番と取り違えない", (title, number, isStar) => {
    expect(extractThreadSequenceNumber(title)).toEqual({
      value: number,
      hasNumber: true,
      isStar,
      isExplicitSequence: true,
    });
  });

  it.each(MODES)("%sでは括弧書きが変わっても連番を認識し逆行しない", (mode) => {
    const source = thread("架空の月面探検隊 ★10【第2章】", 0);
    const next = thread("架空の月面探検隊 ★11【第3章】", 1);
    const previous = thread("架空の月面探検隊 ★9【第2026回】", 2);
    expect(findNextThreadMatch([previous, next], source, { mode })?.thread.url).toBe(next.url);
    expect(findNextThreadMatch([previous], source, { mode })).toBeNull();
  });
});

describe.each(MODES)("番号なしへの題名短縮（%s）", (mode) => {
  const source = thread("【架空局】月面探検隊SHOW！星の冒険星の冒険★15【新放送】", 0);

  it("話題を残した番号なしの短縮タイトルへ移動する", () => {
    const candidate = thread("【架空局】星の冒険 星の冒険", 1);
    const match = findNextThreadMatch([candidate], source, { mode });
    expect(match?.thread.url).toBe(candidate.url);
    expect(match?.reasons).toContain("short-title-continuation");
  });

  it.each([
    "【架空別局】星の冒険 星の冒険",
    "【架空局】別の話題を実況",
    "【架空局】冒険",
    "【架空局】星星星星星星",
    "【架空局】星の冒険と別事件",
    "【架空局】新放送 新放送",
    "【架空局】星の冒険 ★14",
  ])("接頭辞だけの一致・弱い断片・逆行する%sへ移動しない", (title) => {
    const candidate = thread(title, 1);
    expect(findNextThreadMatch([candidate], source, { mode })).toBeNull();
    expect(findNextThreadCandidates([candidate], source, { mode })).toEqual([]);
  });

  it("短縮候補があっても本文で案内された次の連番を優先する", () => {
    const short = thread("【架空局】星の冒険 星の冒険", 2);
    const next = thread("【架空局】月面探検隊SHOW！星の冒険星の冒険★16【新放送】", 1);
    expect(
      findNextThreadMatch([short, next], source, {
        mode,
        responseMessages: [`次スレ ${next.url}`],
      })?.thread.url,
    ).toBe(next.url);
  });
});

interface ContinuationCase {
  name: string;
  current: string;
  next: string;
  modes: readonly AutoNextThreadMode[];
}

// 実在する番組・スレを残さず、表記揺れとモードごとの許容範囲を独立した事例で検証する。
const CONTINUATIONS: ContinuationCase[] = [
  { name: "星番号", current: "架空の月面探検隊 ★1", next: "架空の月面探検隊 ★2", modes: MODES },
  {
    name: "Part番号",
    current: "架空の月面探検隊 Part1",
    next: "架空の月面探検隊 Part2",
    modes: MODES,
  },
  {
    name: "Partのドット",
    current: "架空の月面探検隊 Part.9",
    next: "架空の月面探検隊 Part.10",
    modes: MODES,
  },
  {
    name: "番号形式の切替",
    current: "架空の月面探検隊 ★1",
    next: "架空の月面探検隊 Part.2",
    modes: MODES,
  },
  {
    name: "全角の星番号",
    current: "架空の月面探検隊 ★１",
    next: "架空の月面探検隊 ★２",
    modes: MODES,
  },
  {
    name: "全角のPart表記",
    current: "架空の月面探検隊 Ｐａｒｔ．１",
    next: "架空の月面探検隊 Ｐａｒｔ．２",
    modes: MODES,
  },
  {
    name: "星と数字の空白",
    current: "架空の月面探検隊 ★ 1",
    next: "架空の月面探検隊 ★ 2",
    modes: MODES,
  },
  {
    name: "Partと数字の空白",
    current: "架空の月面探検隊 Part 1",
    next: "架空の月面探検隊 Part 2",
    modes: MODES,
  },
  {
    name: "Partのドット後の空白",
    current: "架空の月面探検隊 Part. 1",
    next: "架空の月面探検隊 Part. 2",
    modes: MODES,
  },
  {
    name: "初回番号の省略",
    current: "架空の月面探検隊",
    next: "架空の月面探検隊 ★2",
    modes: MODES,
  },
  {
    name: "かなの表記揺れ",
    current: "架空のツキノ探検隊 ★1",
    next: "架空のつきの探検隊 ★2",
    modes: MODES,
  },
  {
    name: "括弧と空白の表記揺れ",
    current: "架空の月面探検隊（新） ★1",
    next: "架空の月面探検隊 (新) ★2",
    modes: MODES,
  },
  {
    name: "同じタイトルの後継",
    current: "架空の月面探検隊",
    next: "架空の月面探検隊",
    modes: MODES,
  },
  {
    name: "反復する笑いの長さ",
    current: "架空の月面探検隊ｗｗｗ ★1",
    next: "架空の月面探検隊ww ★2",
    modes: MODES,
  },
  {
    name: "絵文字を含むタイトル",
    current: "架空の月面探検隊🌙 ★1",
    next: "架空の月面探検隊🌙 ★2",
    modes: MODES,
  },
  {
    name: "番組一覧の短縮",
    current: "【架空局】朝の冒険団→森の仲間たち→月の探検隊(新)",
    next: "【架空局】月の探検隊(新) ★2",
    modes: ["aggressive"],
  },
  {
    name: "二重矢印とPartへの切替",
    current: "【架空局】朝の冒険団⇒森の仲間たち⇒月の探検隊(新)",
    next: "【架空局】月の探検隊(新) Part.2",
    modes: ["aggressive"],
  },
  {
    name: "局名のない番組一覧",
    current: "朝の冒険団→森の仲間たち→月の探検隊(新)",
    next: "月の探検隊(新) ★2",
    modes: ["aggressive"],
  },
  {
    name: "長い番組一覧の短縮",
    current:
      "【架空局】朝の冒険団→森の仲間たち→銀河の守り隊→雲の配達人→海底の楽団→砂漠の旅行記→月の探検隊(新)",
    next: "【架空局】月の探検隊(新) ★2",
    modes: ["aggressive"],
  },
  {
    name: "番号なしの反省会",
    current: "架空の月面探検隊",
    next: "架空の月面探検隊 反省会",
    modes: ["aggressive"],
  },
  {
    name: "番号付きから反省会",
    current: "架空の月面探検隊 ★12",
    next: "架空の月面探検隊 ★反省会",
    modes: ["aggressive"],
  },
  {
    name: "二つ先の番号",
    current: "架空の月面探検隊 ★1",
    next: "架空の月面探検隊 ★3",
    modes: ["aggressive"],
  },
];

describe.each(MODES)("自動次スレ判定の広範なケース（%s）", (mode) => {
  it.each(CONTINUATIONS)("$nameの継続をモードの許容範囲で評価する", ({ current, next, modes }) => {
    const source = thread(current, 0);
    const candidate = thread(next, 1);
    const expectedUrl = modes.includes(mode) ? candidate.url : undefined;
    expect(findNextThreadMatch([candidate], source, { mode })?.thread.url).toBe(expectedUrl);
    expect(
      findNextThreadCandidates([candidate], source, { mode }).map(({ thread }) => thread.url),
    ).toEqual(expectedUrl ? [expectedUrl] : []);
  });

  it.each([
    { name: "同じスレ", offset: 0, overrides: {} },
    { name: "元スレより古い", offset: -1, overrides: {} },
    {
      name: "別板",
      offset: 1,
      overrides: { url: `https://example.com/test/read.cgi/other/${BASE_TIMESTAMP + 1}/` },
    },
    {
      name: "別ホスト",
      offset: 1,
      overrides: { url: `https://example.org/test/read.cgi/live/${BASE_TIMESTAMP + 1}/` },
    },
    { name: "1000到達", offset: 1, overrides: { resCount: 1000 } },
    { name: "1000超過", offset: 1, overrides: { resCount: 1001 } },
  ])("本文で案内されても$nameの候補へ移動しない", ({ offset, overrides }) => {
    const source = thread("架空の月面探検隊 ★1", 0);
    const candidate = thread("架空の月面探検隊 ★2", offset, overrides);
    const options = { mode, responseMessages: [`次スレはこちら ${candidate.url}`] };
    expect(findNextThreadMatch([candidate], source, options)).toBeNull();
    expect(findNextThreadCandidates([candidate], source, options)).toEqual([]);
  });

  it.each([
    "★4",
    "★5",
    "★9",
    "Part.4",
    "★４",
    "★５",
    "★９",
    "★ 4",
    "★ 9",
    "Ｐａｒｔ．４",
    "Part 4",
    "Part. 4",
  ])("明示案内なしでは同じ番号や逆行する%sへ戻らない", (number) => {
    const source = thread("架空の月面探検隊 ★5", 0);
    const candidate = thread(`架空の月面探検隊 ${number}`, 1);
    // ★9は積極モードでも許容する番号飛びの範囲を超える。
    expect(findNextThreadMatch([candidate], source, { mode })).toBeNull();
  });

  it("999レスの候補は満了扱いせず評価する", () => {
    const source = thread("架空の月面探検隊 ★1", 0);
    const candidate = thread("架空の月面探検隊 ★2", 1, { resCount: 999 });
    expect(findNextThreadMatch([candidate], source, { mode })?.thread.url).toBe(candidate.url);
  });

  it("完全に題名が変わっても同じ板の本文案内を根拠に移動する", () => {
    const source = thread("架空の月面探検隊 ★1", 0);
    const candidate = thread("雲の配達人の臨時集会", 1);
    expect(
      findNextThreadMatch([candidate], source, {
        mode,
        responseMessages: [`次スレ ${candidate.url}`],
      })?.thread.url,
    ).toBe(candidate.url);
  });

  it("一覧の並び順や別話題のレス数に関係なく同じ系列の次番号を選ぶ", () => {
    const source = thread("架空の月面探検隊 ★1", 0);
    const expected = thread("架空の月面探検隊 ★2", 1, { resCount: 1 });
    const unrelated = thread("別世界の架空雑談広場", 2, { resCount: 900 });
    for (const candidates of [
      [expected, unrelated],
      [unrelated, expected],
    ]) {
      expect(findNextThreadMatch(candidates, source, { mode })?.thread.url).toBe(expected.url);
    }
  });
});

describe("移動後の本流監視の移動先制約", () => {
  const now = (BASE_TIMESTAMP + 100) * 1000;
  const original = thread("架空の月面探検隊 ★1", 0, { resCount: 1000 });
  const current = thread("架空の月面探検隊 ★2", 1, { resCount: 20 });

  it.each(MODES)("%sでは勢いのある同じ板の候補へ移動する", (mode) => {
    const candidate = thread("架空の月面探検隊 ★2", 2, { resCount: 100 });
    expect(
      findMainstreamThreadMatch([current, candidate], {
        originalThreadUrl: original.url,
        originalThreadTitle: original.title,
        currentThreadUrl: current.url,
        mode,
        now,
      })?.thread.url,
    ).toBe(candidate.url);
  });

  it("元スレより後なら現在の移動先より先に立った本流候補も評価する", () => {
    const laterCurrent = thread("架空の月面探検隊 ★2", 3, { resCount: 20 });
    const candidate = thread("架空の月面探検隊 ★2", 2, { resCount: 100 });
    expect(
      findMainstreamThreadMatch([laterCurrent, candidate], {
        originalThreadUrl: original.url,
        originalThreadTitle: original.title,
        currentThreadUrl: laterCurrent.url,
        mode: "balanced",
        now,
      })?.thread.url,
    ).toBe(candidate.url);
  });

  it.each([
    {
      name: "別板",
      overrides: { url: `https://example.com/test/read.cgi/other/${BASE_TIMESTAMP + 2}/` },
    },
    {
      name: "別ホスト",
      overrides: { url: `https://example.org/test/read.cgi/live/${BASE_TIMESTAMP + 2}/` },
    },
    {
      name: "元スレより古い",
      overrides: { url: `https://example.com/test/read.cgi/live/${BASE_TIMESTAMP - 1}/` },
    },
    { name: "満了", overrides: { resCount: 1000 } },
  ])("勢いが高くても$nameの候補へ移動しない", ({ overrides }) => {
    const candidate = thread("架空の月面探検隊 ★2", 2, { resCount: 900, ...overrides });
    for (const mode of MODES) {
      expect(
        findMainstreamThreadMatch([current, candidate], {
          originalThreadUrl: original.url,
          originalThreadTitle: original.title,
          currentThreadUrl: current.url,
          mode,
          now,
        }),
      ).toBeNull();
    }
  });
});
