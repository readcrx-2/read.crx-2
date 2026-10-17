import { createLogger } from "src/app/logger";
import type { IRes } from "src/service-container/interfaces";
import type { ThreadPage } from "src/view/browser/types";
import { parseInternalBrowserPage } from "src/view/browser/utils/link-routing";

const logger = createLogger("view/browser");

const SIKI_LOG_QUERY_KEY = "read_crx_siki";

interface SikiLogEntry {
  body?: unknown;
  id?: unknown;
  mail?: unknown;
  mname?: unknown;
  num?: unknown;
  timestamp?: unknown;
  title?: unknown;
}

interface SikiLogDocument {
  location?: unknown;
  title?: unknown;
  thread_array?: unknown;
}

export interface ParsedSikiLog {
  title: string;
  threadUrl: string;
  responses: IRes[];
}

export interface ImportedSikiThread {
  title: string;
  responses: IRes[];
}

const importedSikiThreads = new Map<string, ImportedSikiThread>();
let importSequence = 0;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asSikiLogEntry(value: unknown): SikiLogEntry | null {
  return isRecord(value) ? value : null;
}

function getString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function getNonEmptyString(value: unknown): string | null {
  const string = getString(value);
  return string?.trim() ? string.trim() : null;
}

function getPositiveInteger(value: unknown): number | null {
  const number =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim() !== ""
        ? Number(value)
        : Number.NaN;
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

function stripMarkup(value: string): string {
  return value.replace(/<[^>]*>/g, "").trim();
}

function normalizeSikiBody(value: string): string {
  // Sikiの独自anchor要素は本文表示へ残すと、既存のレスアンカー処理が認識できない。
  // 内部テキスト（>>番号）は保持し、既存のMessageProcessorへ解析を委譲する。
  return value.replace(/<anchor\b[^>]*>/gi, "").replace(/<\/anchor\s*>/gi, "");
}

function formatSikiTimestamp(value: unknown): string {
  const rawTimestamp = getPositiveInteger(value);
  if (rawTimestamp === null) {
    return getNonEmptyString(value) ?? "";
  }

  // Sikiのtimestampは通常ミリ秒だが、古いログの秒単位も同じ入口で扱う。
  const timestamp = rawTimestamp < 1_000_000_000_000 ? rawTimestamp * 1_000 : rawTimestamp;
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const parts = new Intl.DateTimeFormat("ja-JP", {
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "2-digit",
    second: "2-digit",
    timeZone: "Asia/Tokyo",
    weekday: "short",
    year: "numeric",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value: part }) => [type, part]));
  return `${values.year}/${values.month}/${values.day}(${values.weekday}) ${values.hour}:${values.minute}:${values.second}`;
}

function getThreadPage(location: string): ThreadPage {
  const page = parseInternalBrowserPage(location);
  if (!page || page.type !== "thread") {
    throw new Error("SikiログのlocationからスレッドURLを判定できません");
  }
  return page;
}

export function parseSikiLogDocument(value: unknown, sourceName = "Sikiログ"): ParsedSikiLog {
  if (!isRecord(value)) {
    throw new Error(`${sourceName}のJSONルートがオブジェクトではありません`);
  }

  const document = value as SikiLogDocument;
  const location = getNonEmptyString(document.location);
  if (!location) {
    throw new Error(`${sourceName}にスレッドのlocationがありません`);
  }

  const rawEntries = document.thread_array;
  if (!Array.isArray(rawEntries)) {
    throw new Error(`${sourceName}にthread_arrayがありません`);
  }

  const page = getThreadPage(location);
  const responses: IRes[] = [];
  let nextFallbackNumber = 1;

  for (const rawEntry of rawEntries) {
    const entry = asSikiLogEntry(rawEntry);
    const body = getString(entry?.body);
    if (!entry || body === null || body.trim() === "") {
      // ページング途中のSikiログには本文未取得の要素が混ざるため、取得済み本文だけを表示する。
      continue;
    }

    const number = getPositiveInteger(entry.num) ?? nextFallbackNumber;
    nextFallbackNumber = Math.max(nextFallbackNumber, number + 1);
    const date = formatSikiTimestamp(entry.timestamp);
    const id = getNonEmptyString(entry.id);
    const name = stripMarkup(getNonEmptyString(entry.mname) ?? "") || "名無し";

    responses.push({
      num: number,
      name,
      mail: getNonEmptyString(entry.mail) ?? "",
      date,
      ...(id ? { id } : {}),
      message: normalizeSikiBody(body),
      other: date,
    });
  }

  if (responses.length === 0) {
    throw new Error(`${sourceName}に表示できる本文がありません`);
  }

  const title = getNonEmptyString(document.title) ?? page.title;
  return {
    title,
    threadUrl: page.threadUrl,
    responses,
  };
}

export async function parseSikiLogFile(file: Pick<File, "name" | "text">): Promise<ParsedSikiLog> {
  let value: unknown;
  try {
    value = JSON.parse(await file.text()) as unknown;
  } catch (error) {
    logger.error("[Sikiログ] JSONの読み込みに失敗しました", { fileName: file.name, error });
    throw new Error(`${file.name}は有効なJSONではありません`, { cause: error });
  }

  return parseSikiLogDocument(value, file.name);
}

export function selectSikiLogFile(): Promise<File | null> {
  if (typeof document === "undefined" || !document.body) {
    return Promise.reject(new Error("ファイル選択を開ける画面がありません"));
  }

  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json,application/json";
  input.hidden = true;

  return new Promise<File | null>((resolve) => {
    let settled = false;
    const settle = (file: File | null): void => {
      if (settled) {
        return;
      }
      settled = true;
      input.remove();
      resolve(file);
    };

    input.addEventListener("change", () => settle(input.files?.[0] ?? null), { once: true });
    // cancelイベントは、ファイルを選ばずOSの選択画面を閉じた場合にも発火する。
    input.addEventListener("cancel", () => settle(null), { once: true });
    document.body.append(input);
    input.click();
  });
}

export function registerSikiLogThread(parsed: ParsedSikiLog): ThreadPage {
  const importedUrl = new URL(parsed.threadUrl);
  // 同じスレの別ファイルも個別タブで開けるよう、既存URLと衝突しない識別子をクエリへ付ける。
  importedUrl.searchParams.set(SIKI_LOG_QUERY_KEY, String(++importSequence));
  const page: ThreadPage = {
    type: "thread",
    title: parsed.title,
    threadUrl: importedUrl.href,
  };

  importedSikiThreads.set(page.threadUrl, {
    title: parsed.title,
    responses: parsed.responses.map((response) => ({ ...response })),
  });
  return page;
}

export function isSikiLogThreadUrl(threadUrl: string): boolean {
  try {
    return new URL(threadUrl).searchParams.has(SIKI_LOG_QUERY_KEY);
  } catch {
    return false;
  }
}

export function getImportedSikiThread(threadUrl: string): ImportedSikiThread | null {
  const imported = importedSikiThreads.get(threadUrl);
  if (!imported) {
    return null;
  }

  return {
    title: imported.title,
    responses: imported.responses.map((response) => ({ ...response })),
  };
}
