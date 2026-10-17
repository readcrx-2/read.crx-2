const TITLE_DECORATION_PATTERN =
  / ?(?:\[(?:無断)?転載禁止\]|(?:\(c\)|©|�|&copy;|&#169;)(?:2ch\.net|@?bbspink\.com)) ?/g;
const KATAKANA_PATTERN = /[\u30a1-\u30f6]/g;
// 番号後の放送情報などは連番の一部ではないため、括弧書きを残して番号だけを取り出す。
export const EXPLICIT_SEQUENCE_PATTERN =
  /(★|Part\.?)\s*(\d+)((?:\s*(?:【[^】]*】|\[[^\]]*\]|\([^)]*\)))*\s*)$/i;

export function stripTitleDecoration(title: string): string {
  const withoutDecoration = title.replace(TITLE_DECORATION_PATTERN, "");
  const normalizedTitle = withoutDecoration === "" ? title : withoutDecoration;
  return normalizedTitle.replaceAll("<mark>", "").replaceAll("</mark>", "");
}

function stripSequenceDecoration(title: string): string {
  // 全角番号や番号前の空白でも同じ系列として比較し、連番解析とタイトル類似度の解釈を揃える。
  return title
    .normalize("NFKC")
    .replace(/^\s*●\s*/, "")
    .replace(EXPLICIT_SEQUENCE_PATTERN, "$3")
    .trim();
}

export function calculateBaseTitleSimilarity(leftTitle: string, rightTitle: string): number {
  return calculateTitleSimilarity(
    stripSequenceDecoration(leftTitle),
    stripSequenceDecoration(rightTitle),
  );
}

export function hasProgramTitleContinuation(currentTitle: string, candidateTitle: string): boolean {
  const currentBase = normalizeThreadTitle(stripSequenceDecoration(currentTitle));
  const candidateBase = normalizeThreadTitle(stripSequenceDecoration(candidateTitle));
  const currentPrefix = currentBase.match(/^【[^】]+】/)?.[0] ?? "";
  const candidatePrefix = candidateBase.match(/^【[^】]+】/)?.[0] ?? "";
  if (currentPrefix !== candidatePrefix) {
    return false;
  }

  // 番組一覧から単独番組の★2へ変わると全文の類似度が下がるため、最後の番組の継続を別に判定する。
  // 局名だけの一致や終了済みの前番組への誤移動を避け、局の接頭辞と最後の番組名の一致を要求する。
  const programs = currentBase.slice(currentPrefix.length).split(/[→⇒]/);
  const lastProgram = programs.at(-1) ?? "";
  return (
    programs.length > 1 &&
    /[\p{L}\p{N}]/u.test(lastProgram) &&
    lastProgram === candidateBase.slice(candidatePrefix.length)
  );
}

export function hasShortTitleContinuation(currentTitle: string, candidateTitle: string): boolean {
  const currentBase = normalizeThreadTitle(stripSequenceDecoration(currentTitle));
  const candidateBase = normalizeThreadTitle(stripSequenceDecoration(candidateTitle));
  const currentPrefix = currentBase.match(/^【[^】]+】/)?.[0];
  const candidatePrefix = candidateBase.match(/^【[^】]+】/)?.[0];
  if (!currentPrefix || currentPrefix !== candidatePrefix) {
    return false;
  }

  // 長い連番タイトルから番号なしの短い題名へ変わる場合、局名・末尾の告知だけでは継続と判定しない。
  // 接頭辞と告知を除いた本文で、短縮後の全文が順序を保って含まれることを継続の根拠にする。
  const stripNotes = (value: string) => value.replace(/(?:【[^】]*】|\[[^\]]*\]|\([^)]*\))+$/, "");
  const currentTopic = stripNotes(currentBase.slice(currentPrefix.length));
  const candidateTopic = stripNotes(candidateBase.slice(candidatePrefix.length));
  // ごく短い単語・単一文字の反復・長文中のわずかな断片だけでは継続の根拠として弱いため除外する。
  return (
    candidateTopic.length >= 6 &&
    new Set(candidateTopic).size >= 3 &&
    candidateTopic.length < currentTopic.length &&
    candidateTopic.length / currentTopic.length >= 0.2 &&
    countSequenceMatches(currentTopic, candidateTopic) === candidateTopic.length
  );
}

function katakanaToHiragana(character: string): string {
  return String.fromCodePoint((character.codePointAt(0) ?? 0) - 0x60);
}

export function normalizeThreadTitle(title: string): string {
  // 変更理由: 笑いや強調の反復を文字数ぶん加点すると、話題が無関係でも
  // 長い末尾装飾だけで自動移動条件を超える。全角・大文字を揃えた後で除外する。
  return stripTitleDecoration(title)
    .normalize("NFKC")
    .replace(KATAKANA_PATTERN, katakanaToHiragana)
    .replaceAll(" ", "")
    .replaceAll("\u3000", "")
    .toLowerCase()
    .replace(/w{2,}|[!?]{2,}/g, "");
}

interface LongestCommonSubstringResult {
  aIndex: number;
  bIndex: number;
  size: number;
}

function findLongestCommonSubstring(
  left: string,
  right: string,
  leftStart: number,
  leftEnd: number,
  rightStart: number,
  rightEnd: number,
): LongestCommonSubstringResult {
  const previous = new Uint16Array(rightEnd - rightStart + 1);
  let best = { aIndex: leftStart, bIndex: rightStart, size: 0 };

  for (let leftIndex = leftStart; leftIndex < leftEnd; leftIndex += 1) {
    const current = new Uint16Array(rightEnd - rightStart + 1);
    for (let rightIndex = rightStart; rightIndex < rightEnd; rightIndex += 1) {
      if (left[leftIndex] !== right[rightIndex]) {
        continue;
      }

      const offset = rightIndex - rightStart + 1;
      const size = previous[offset - 1] + 1;
      current[offset] = size;
      if (size > best.size) {
        best = {
          aIndex: leftIndex - size + 1,
          bIndex: rightIndex - size + 1,
          size,
        };
      }
    }
    previous.set(current);
  }

  return best;
}

function countSequenceMatches(
  left: string,
  right: string,
  leftStart = 0,
  leftEnd = left.length,
  rightStart = 0,
  rightEnd = right.length,
): number {
  if (leftStart >= leftEnd || rightStart >= rightEnd) {
    return 0;
  }

  const match = findLongestCommonSubstring(left, right, leftStart, leftEnd, rightStart, rightEnd);

  if (match.size === 0) {
    return 0;
  }

  return (
    match.size +
    countSequenceMatches(left, right, leftStart, match.aIndex, rightStart, match.bIndex) +
    countSequenceMatches(
      left,
      right,
      match.aIndex + match.size,
      leftEnd,
      match.bIndex + match.size,
      rightEnd,
    )
  );
}

export function calculateTitleSimilarity(leftTitle: string, rightTitle: string): number {
  const left = normalizeThreadTitle(leftTitle);
  const right = normalizeThreadTitle(rightTitle);

  if (left === "" || right === "") {
    // 装飾を除いて空になったタイトル同士には、同じ話題だという根拠がない。
    return 0;
  }

  const matches = countSequenceMatches(left, right);
  const sequenceSimilarity = (2 * matches) / (left.length + right.length);
  const editSimilarity = calculateEditSimilarity(left, right);

  // 変更理由: LCSだけでは一文字の違いが一致区間を分断し、subject.txtの軽微な
  // 表記揺れを過小評価する。文字の種類を列挙せず、編集距離との高い方を採用する。
  return Math.max(sequenceSimilarity, editSimilarity);
}

function calculateEditSimilarity(left: string, right: string): number {
  const leftCharacters = Array.from(left);
  const rightCharacters = Array.from(right);
  const previous = new Uint16Array(rightCharacters.length + 1);

  for (let rightIndex = 0; rightIndex <= rightCharacters.length; rightIndex += 1) {
    previous[rightIndex] = rightIndex;
  }

  for (let leftIndex = 1; leftIndex <= leftCharacters.length; leftIndex += 1) {
    const current = new Uint16Array(rightCharacters.length + 1);
    current[0] = leftIndex;

    for (let rightIndex = 1; rightIndex <= rightCharacters.length; rightIndex += 1) {
      const substitutionCost =
        leftCharacters[leftIndex - 1] === rightCharacters[rightIndex - 1] ? 0 : 1;
      current[rightIndex] = Math.min(
        previous[rightIndex] + 1,
        current[rightIndex - 1] + 1,
        previous[rightIndex - 1] + substitutionCost,
      );
    }

    previous.set(current);
  }

  const maxLength = Math.max(leftCharacters.length, rightCharacters.length);
  return 1 - previous[rightCharacters.length] / maxLength;
}
