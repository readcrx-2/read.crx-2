import type { DebateParticipantScore, DebateResult } from "./types.ts";

function responseLink(url: string, num: number): string {
  return `${url.replace(/\/+$/, "")}/${num}`;
}

function formatScore(score: DebateParticipantScore | undefined): string {
  if (!score) return "採点なし";
  return `論理 ${score.logic.toFixed(1)} / 読解 ${score.reading.toFixed(1)} / 根拠 ${score.evidence.toFixed(1)}`;
}

export function formatDebateText(result: DebateResult): string {
  const lines = [
    `議論判定: ${result.thread.title}`,
    `スレッド: ${result.thread.url}`,
    "",
    `要約: ${result.summary}`,
    `結論: ${result.conclusion}`,
    "",
    "争点別判定:",
  ];
  for (const issue of result.issues) {
    lines.push(`- ${issue.topic} [${issue.status}] ${issue.conclusion}`);
    for (const position of issue.positions) {
      lines.push(`  - ${position.participantIds.join(", ") || "参加者不明"}: ${position.claim}`);
    }
  }
  lines.push("", "参加者別評価:");
  for (const participant of result.participants) {
    lines.push(`- ${participant.id}: ${participant.position} (${formatScore(participant.score)})`);
    if (participant.strengths.length > 0)
      lines.push(`  - 有効点: ${participant.strengths.join(" / ")}`);
    if (participant.weaknesses.length > 0)
      lines.push(`  - 弱点: ${participant.weaknesses.join(" / ")}`);
  }
  if (result.research.length > 0) {
    lines.push("", "外部調査:");
    for (const item of result.research) {
      lines.push(`- ${item.claim} [${item.status}]: ${item.finding}`);
      for (const source of item.sources) lines.push(`  - ${source.title}: ${source.url}`);
    }
  }
  if (result.caveats && result.caveats.length > 0) {
    lines.push("", "留意点:", ...result.caveats.map((caveat) => `- ${caveat}`));
  }
  return lines.join("\n");
}

function escapeMarkdown(value: string): string {
  return value.replace(/[\\`*_{}[\]()#+.!|>~-]/g, "\\$&");
}

export function formatDebateMarkdown(result: DebateResult): string {
  const lines = [
    `# 議論判定: ${escapeMarkdown(result.thread.title)}`,
    "",
    `- スレッド: [開く](${result.thread.url})`,
    `- 判定形式: 争点別判定`,
    "",
    "## 要約",
    "",
    result.summary,
    "",
    "## 結論",
    "",
    result.conclusion,
    "",
    "## 争点別判定",
    "",
  ];
  for (const issue of result.issues) {
    lines.push(`### ${escapeMarkdown(issue.topic)}（${issue.status}）`, "", issue.conclusion, "");
    for (const position of issue.positions) {
      lines.push(
        `- **${escapeMarkdown(position.participantIds.join(", ") || "参加者不明")}**: ${position.claim}`,
      );
      for (const evidence of position.evidence) {
        lines.push(
          `  - ${evidence.role}: ${evidence.note} ` +
            evidence.responseNumbers
              .map((num) => `[レス${num}](${responseLink(result.thread.url, num)})`)
              .join(", "),
        );
      }
    }
    for (const evidence of issue.evidence) {
      lines.push(
        `- 根拠（${evidence.role}）: ${evidence.note} ` +
          evidence.responseNumbers
            .map((num) => `[レス${num}](${responseLink(result.thread.url, num)})`)
            .join(", "),
      );
    }
    lines.push("");
  }
  lines.push("## 参加者別評価", "");
  for (const participant of result.participants) {
    lines.push(`### ${escapeMarkdown(participant.id)}`, "", participant.position, "");
    lines.push(
      `- 対象レス: ${participant.responseNumbers.map((num) => `[${num}](${responseLink(result.thread.url, num)})`).join(", ")}`,
    );
    lines.push(`- 点数: ${formatScore(participant.score)}`);
    if (participant.strengths.length > 0)
      lines.push(`- 有効点: ${participant.strengths.join(" / ")}`);
    if (participant.weaknesses.length > 0)
      lines.push(`- 弱点: ${participant.weaknesses.join(" / ")}`);
    lines.push("");
  }
  if (result.research.length > 0) {
    const statusLabels = {
      supported: "おおむね裏付けあり",
      contradicted: "反証あり",
      inconclusive: "確認できず",
    } as const;
    lines.push("## 外部調査", "");
    for (const item of result.research) {
      lines.push(
        `### ${escapeMarkdown(item.claim)}（${statusLabels[item.status]}）`,
        "",
        item.finding,
        "",
      );
      for (const source of item.sources) {
        lines.push(`- [${escapeMarkdown(source.title)}](${source.url})`);
      }
      lines.push("");
    }
  }
  if (result.caveats && result.caveats.length > 0) {
    lines.push("## 留意点", "", ...result.caveats.map((caveat) => `- ${caveat}`), "");
  }
  return lines.join("\n");
}
