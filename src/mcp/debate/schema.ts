const SIMPLE_METRIC_SCHEMA = {
  type: "object",
  required: ["score", "reason"],
  properties: {
    score: {
      type: ["number", "null"],
      minimum: 0,
      maximum: 5,
      description:
        "今回の発言を評価する主観的な点数。0.5刻みを目安とし、材料不足ならnullとしてreasonに評価不能の理由を明記する。人物全体の能力ではない。",
    },
    reason: {
      type: "string",
      maxLength: 120,
      description:
        "具体的な発言や応答を取り上げ、なぜその点数になるかを説明する。60～100字を目安に、主語・対象・評価理由を残す。字数合わせの水増しはしない。",
    },
  },
} as const;

const SIMPLE_SIDE_SCHEMA = {
  type: "object",
  required: ["label", "participants", "claims", "metrics"],
  properties: {
    label: { type: "string" },
    participants: { type: "array", items: { type: "string" } },
    claims: {
      type: "array",
      description:
        "最初に争点への立場を示し、続けて前提・理由・相手への反論を整理する。3～6項目を目安とするが、実際にない主張は補わない。",
      items: {
        type: "string",
        description:
          "原文で省略された主語や目的語を文脈の範囲で補い、何についての主張か単独でも分かる文にする。レス番号だけで発言内容を代用しない。",
      },
    },
    metrics: {
      type: "object",
      required: ["logic", "reading", "evidence"],
      properties: {
        logic: SIMPLE_METRIC_SCHEMA,
        reading: SIMPLE_METRIC_SCHEMA,
        evidence: SIMPLE_METRIC_SCHEMA,
      },
    },
  },
} as const;

// 変更理由: 構造が不明なために判定根拠が削られないよう、検証側が要求するレス番号・役割・説明を生成側にも公開する。
const EVIDENCE_SCHEMA = {
  type: "object",
  required: ["responseNumbers", "role", "note"],
  properties: {
    responseNumbers: { type: "array", items: { type: "integer", minimum: 1 } },
    role: { type: "string", enum: ["support", "challenge", "context"] },
    note: {
      type: "string",
      description: "どの主張を支持・反証するか、または解釈に必要な文脈を説明する。",
    },
  },
} as const;

const POSITION_SCHEMA = {
  type: "object",
  required: ["participantIds", "claim", "evidence"],
  properties: {
    participantIds: { type: "array", items: { type: "string" } },
    claim: {
      type: "string",
      description: "本人の主張か第三者への批判かを明確にし、解釈が分かれる場合は断定しない。",
    },
    evidence: { type: "array", items: EVIDENCE_SCHEMA },
  },
} as const;

export const DEBATE_RESULT_SCHEMA = {
  type: "object",
  required: [
    "schemaVersion",
    "thread",
    "scope",
    "summary",
    "conclusion",
    "issues",
    "participants",
    "research",
    "simpleView",
  ],
  properties: {
    schemaVersion: { type: "integer", const: 1 },
    thread: {
      type: "object",
      required: ["title", "url"],
      properties: {
        title: { type: "string" },
        url: { type: "string" },
        analyzedAt: { type: "string" },
      },
    },
    scope: {
      type: "object",
      required: ["responseNumbers", "participantIds"],
      properties: {
        responseNumbers: { type: "array", items: { type: "integer", minimum: 1 } },
        participantIds: { type: "array", items: { type: "string" } },
      },
    },
    summary: { type: "string" },
    conclusion: { type: "string" },
    issues: {
      type: "array",
      items: {
        type: "object",
        required: ["id", "topic", "status", "conclusion", "positions", "evidence"],
        properties: {
          id: { type: "string" },
          topic: { type: "string" },
          status: {
            type: "string",
            enum: ["resolved", "mixed", "unresolved", "insufficient-evidence"],
          },
          conclusion: { type: "string" },
          positions: { type: "array", items: POSITION_SCHEMA },
          evidence: { type: "array", items: EVIDENCE_SCHEMA },
        },
      },
    },
    participants: {
      type: "array",
      items: {
        type: "object",
        required: ["id", "responseNumbers", "position", "strengths", "weaknesses"],
        properties: {
          id: { type: "string" },
          responseNumbers: { type: "array", items: { type: "integer", minimum: 1 } },
          position: { type: "string" },
          strengths: { type: "array", items: { type: "string" } },
          weaknesses: { type: "array", items: { type: "string" } },
          score: {
            type: "object",
            required: ["logic", "reading", "evidence"],
            properties: {
              logic: { type: "number", minimum: 0, maximum: 5 },
              reading: { type: "number", minimum: 0, maximum: 5 },
              evidence: { type: "number", minimum: 0, maximum: 5 },
            },
          },
        },
      },
    },
    // 変更理由: 外部調査は判定を左右する事実に絞り、出典説明で結果が膨らみすぎないよう文字数も制限する。
    research: {
      type: "array",
      maxItems: 2,
      description: "結論に影響する事実だけを最大2件まで外部調査した結果",
      items: {
        type: "object",
        required: ["claim", "status", "finding", "sources"],
        properties: {
          claim: { type: "string", maxLength: 160 },
          status: { type: "string", enum: ["supported", "contradicted", "inconclusive"] },
          finding: { type: "string", maxLength: 240 },
          sources: {
            type: "array",
            maxItems: 2,
            items: {
              type: "object",
              required: ["title", "url"],
              properties: {
                title: { type: "string", maxLength: 120 },
                url: { type: "string", maxLength: 2048 },
              },
            },
          },
        },
      },
    },
    simpleView: {
      type: "object",
      required: ["topic", "blue", "red", "blueAdvantage", "verdictReason"],
      properties: {
        topic: {
          type: "string",
          description:
            "何について、どの発言や判断が争われているか分かる見出し。抽象的な一般論に置き換えず、実際の対立を示す。専門的な略語やレス番号だけに依存しない。",
        },
        blue: SIMPLE_SIDE_SCHEMA,
        red: SIMPLE_SIDE_SCHEMA,
        blueAdvantage: {
          type: ["number", "null"],
          minimum: 0,
          maximum: 1,
          description:
            "中心争点での主観的な優勢度。勝率や事実の確率ではない。0.1刻みを目安とし、判定不能ならnullとしてverdictReasonに判定保留と理由を明記する。0.5は材料に基づく互角に限る。",
        },
        verdictReason: {
          type: "string",
          description:
            "結論、決め手となった応酬、相手の反論が成立する範囲、未確認事項をつなげて説明する。必要に応じて3～5文を使い、単なる点数の言い換えにしない。",
        },
      },
    },
    caveats: { type: "array", items: { type: "string" } },
  },
} as const;
