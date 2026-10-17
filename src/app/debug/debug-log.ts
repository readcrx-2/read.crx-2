/**
 * 外部CLIから読み取るための、直近ログのリングバッファ。
 *
 * 変更理由: Tauri版で起きた不具合は、利用者が見ていない間に通知なしで状態が変わることがあり、
 * 後から原因を追えなかった。console出力と状態遷移の記録を画面内に保持し、
 * CDP経由で `window.__chlensDebug.logs()` から取り出せるようにする。
 */

export type DebugLogLevel = "error" | "warn" | "info" | "log" | "event";

export interface DebugLogEntry {
  seq: number;
  /** epoch ms。CLIで期間指定するため数値で持つ。 */
  time: number;
  level: DebugLogLevel;
  /** recordDebugEvent で付ける分類。console由来は "console"。 */
  category: string;
  message: string;
  data?: unknown;
  stack?: string;
}

export interface DebugLogQuery {
  limit?: number;
  level?: DebugLogLevel;
  category?: string;
  /** この時刻（epoch ms）以降の記録だけを返す。 */
  since?: number;
}

const MAX_ENTRIES = 1000;
const MAX_STRING_LENGTH = 2000;
// state() はペイン→タブ→ページと入れ子が深いため、ページの中身まで届く深さにする。
const MAX_DEPTH = 8;
// Cookieや認証トークンをCLI出力へ流さないよう、キー名で一律に伏せる。
// "sid" は "inside" などへ誤一致しないよう、キー全体が一致する場合だけ伏せる。
const SENSITIVE_KEY_PATTERN = /cookie|token|password|secret|authorization|^sid$/i;

const entries: DebugLogEntry[] = [];
const listeners = new Set<(entry: DebugLogEntry) => void>();
let nextSeq = 1;

function truncate(value: string): string {
  return value.length > MAX_STRING_LENGTH ? `${value.slice(0, MAX_STRING_LENGTH)}…` : value;
}

/** 循環参照・Error・巨大な値を含んでも JSON 化できる形へ変換する。 */
export function toSerializable(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (value == null || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") return truncate(value);
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "function") return `[Function ${value.name || "anonymous"}]`;
  if (typeof value === "symbol") return value.toString();
  if (value instanceof Error) {
    return {
      name: value.name,
      message: truncate(value.message),
      stack: value.stack ? truncate(value.stack) : undefined,
      cause: value.cause === undefined ? undefined : toSerializable(value.cause, depth + 1, seen),
    };
  }
  if (typeof value !== "object") return "[Unknown]";
  if (seen.has(value)) return "[Circular]";
  if (depth >= MAX_DEPTH) return "[MaxDepth]";
  seen.add(value);

  if (Array.isArray(value)) {
    const items = value.slice(0, 100).map((item) => toSerializable(item, depth + 1, seen));
    return value.length > 100 ? [...items, `…(${value.length - 100} more)`] : items;
  }
  if (value instanceof Map) {
    return toSerializable(Object.fromEntries(value), depth, seen);
  }
  if (value instanceof Set) {
    return toSerializable([...value], depth, seen);
  }
  if (typeof Element !== "undefined" && value instanceof Element) {
    return `[Element ${value.tagName.toLowerCase()}]`;
  }

  const result: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    result[key] = SENSITIVE_KEY_PATTERN.test(key)
      ? "[redacted]"
      : toSerializable(child, depth + 1, seen);
  }
  return result;
}

function formatConsoleArgs(args: readonly unknown[]): string {
  return truncate(
    args
      .map((arg) => {
        if (typeof arg === "string") return arg;
        if (arg instanceof Error) return `${arg.name}: ${arg.message}`;
        try {
          return JSON.stringify(toSerializable(arg));
        } catch {
          return String(arg);
        }
      })
      .join(" "),
  );
}

function pushEntry(entry: Omit<DebugLogEntry, "seq" | "time">): void {
  const recorded: DebugLogEntry = { seq: nextSeq++, time: Date.now(), ...entry };
  entries.push(recorded);
  if (entries.length > MAX_ENTRIES) {
    entries.splice(0, entries.length - MAX_ENTRIES);
  }
  for (const listener of listeners) {
    listener(recorded);
  }
}

/**
 * 記録された1件ごとに呼ばれる購読を登録する。
 *
 * 変更理由: リングバッファは画面を閉じると消える。永続化など、記録の行き先を増やす側が
 * debug-log を書き換えずに済むよう、購読の口だけを用意した。購読側は例外を投げないこと
 * （投げると console の記録経路まで巻き込むため、失敗は購読側で扱う）。
 */
export function subscribeDebugLog(listener: (entry: DebugLogEntry) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * 状態遷移など、consoleへ出すほどではないが原因調査に必要な出来事を記録する。
 * 呼び出し元を追えるよう、既定でスタックトレースを付ける。
 */
export function recordDebugEvent(
  category: string,
  message: string,
  data?: unknown,
  options: { withStack?: boolean } = {},
): void {
  const { withStack = true } = options;
  pushEntry({
    level: "event",
    category,
    message,
    data: data === undefined ? undefined : toSerializable(data),
    // 先頭の "Error" 行と recordDebugEvent 自身の行は調査に不要なので落とす。
    stack: withStack ? new Error().stack?.split("\n").slice(2).join("\n") : undefined,
  });
}

export function queryDebugLogs(query: DebugLogQuery = {}): DebugLogEntry[] {
  const { limit = 200, level, category, since } = query;
  const filtered = entries.filter(
    (entry) =>
      (level == null || entry.level === level) &&
      (category == null || entry.category === category) &&
      (since == null || entry.time >= since),
  );
  return filtered.slice(-Math.max(1, limit));
}

export function clearDebugLogs(): void {
  entries.length = 0;
}

const CAPTURED_CONSOLE_LEVELS = ["error", "warn", "info", "log"] as const;
let consoleCaptureInstalled = false;

/** console出力を元の出力先へ流しつつ、リングバッファにも複製する。 */
export function installConsoleCapture(target: Console = console): void {
  if (consoleCaptureInstalled) return;
  consoleCaptureInstalled = true;

  for (const level of CAPTURED_CONSOLE_LEVELS) {
    const original = target[level].bind(target);
    target[level] = (...args: unknown[]) => {
      original(...args);
      try {
        const error = args.find((arg): arg is Error => arg instanceof Error);
        pushEntry({
          level,
          category: "console",
          message: formatConsoleArgs(args),
          stack: error?.stack ? truncate(error.stack) : undefined,
        });
      } catch (captureError: unknown) {
        // 記録の失敗で本来のログ出力や呼び出し元の処理を止めないよう、元の出力先へだけ報告する。
        original("[ChLens Debug] consoleログの記録に失敗しました:", captureError);
      }
    };
  }
}

export function resetDebugLogForTest(): void {
  entries.length = 0;
  listeners.clear();
  nextSeq = 1;
}
