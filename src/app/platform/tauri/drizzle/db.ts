import Database from "@tauri-apps/plugin-sql";
import { drizzle } from "drizzle-orm/sqlite-proxy";
import { createLogger } from "src/app/logger";

const logger = createLogger("TauriDrizzle");

interface SqlPluginDatabase {
  execute(query: string, bindValues?: unknown[]): Promise<unknown>;
  select<T>(query: string, bindValues?: unknown[]): Promise<T[]>;
}

type ProxyMethod = "run" | "all" | "get" | "values";

interface TauriDrizzleContext {
  db: ReturnType<typeof drizzle>;
  raw: SqlPluginDatabase;
}

let dbContextPromise: Promise<TauriDrizzleContext> | null = null;
let dbContextError: Error | null = null;

/**
 * 既存テーブルに列を冪等に追加する。
 * 列が既に存在する場合 SQLite は "duplicate column name" エラーを投げるため、握りつぶす。
 */
async function addColumnIfMissing(
  raw: SqlPluginDatabase,
  table: string,
  column: string,
  type: string,
): Promise<void> {
  const cols = await raw.select<{ name: string }>(`PRAGMA table_info(${table})`);
  if (cols.some((col) => col.name === column)) {
    return;
  }
  await raw.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
}

async function runMigrations(raw: SqlPluginDatabase): Promise<void> {
  await raw.execute(`
    CREATE TABLE IF NOT EXISTS cache (
      url TEXT PRIMARY KEY,
      data TEXT,
      parsed_json TEXT,
      last_updated INTEGER NOT NULL,
      last_modified INTEGER,
      etag TEXT,
      res_length INTEGER,
      dat_size INTEGER,
      readcgi_ver INTEGER,
      expired INTEGER,
      title TEXT,
      thread_url TEXT,
      board_url TEXT,
      board_title TEXT,
      kind TEXT
    )
  `);
  // 変更理由: 閲覧ログ機能のメタ列を、既存DBにも後付けで追加する。
  // SQLite は ADD COLUMN IF NOT EXISTS 非対応のため、重複エラーは無視する。
  await addColumnIfMissing(raw, "cache", "title", "TEXT");
  await addColumnIfMissing(raw, "cache", "thread_url", "TEXT");
  await addColumnIfMissing(raw, "cache", "board_url", "TEXT");
  await addColumnIfMissing(raw, "cache", "board_title", "TEXT");
  await addColumnIfMissing(raw, "cache", "kind", "TEXT");
  // 変更理由: 既存Tauri利用者にも確定済みのdat落ち状態を追加移行で保持する。
  await addColumnIfMissing(raw, "cache", "expired", "INTEGER");
  await raw.execute("CREATE INDEX IF NOT EXISTS idx_cache_last_updated ON cache(last_updated)");
  await raw.execute("CREATE INDEX IF NOT EXISTS idx_cache_last_modified ON cache(last_modified)");
  await raw.execute("CREATE INDEX IF NOT EXISTS idx_cache_kind ON cache(kind)");

  await raw.execute(`
    CREATE TABLE IF NOT EXISTS history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url TEXT NOT NULL,
      title TEXT NOT NULL,
      date INTEGER NOT NULL,
      board_title TEXT NOT NULL
    )
  `);
  await raw.execute("CREATE INDEX IF NOT EXISTS idx_history_url ON history(url)");
  await raw.execute("CREATE INDEX IF NOT EXISTS idx_history_title ON history(title)");
  await raw.execute("CREATE INDEX IF NOT EXISTS idx_history_date ON history(date)");

  await raw.execute(`
    CREATE TABLE IF NOT EXISTS read_state (
      url TEXT PRIMARY KEY,
      last INTEGER NOT NULL,
      read INTEGER NOT NULL,
      received INTEGER NOT NULL,
      offset INTEGER,
      date INTEGER,
      board_url TEXT NOT NULL
    )
  `);
  await raw.execute("CREATE INDEX IF NOT EXISTS idx_read_state_board_url ON read_state(board_url)");

  await raw.execute(`
    CREATE TABLE IF NOT EXISTS bbsmenu_cache (
      key TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      last_updated INTEGER NOT NULL
    )
  `);

  await raw.execute(`
    CREATE TABLE IF NOT EXISTS write_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url TEXT NOT NULL,
      res INTEGER NOT NULL,
      title TEXT NOT NULL,
      name TEXT NOT NULL,
      mail TEXT NOT NULL,
      input_name TEXT NOT NULL,
      input_mail TEXT NOT NULL,
      message TEXT NOT NULL,
      date INTEGER NOT NULL
    )
  `);
  await raw.execute("CREATE INDEX IF NOT EXISTS idx_write_history_url ON write_history(url)");
  await raw.execute("CREATE INDEX IF NOT EXISTS idx_write_history_res ON write_history(res)");
  await raw.execute("CREATE INDEX IF NOT EXISTS idx_write_history_title ON write_history(title)");
  await raw.execute("CREATE INDEX IF NOT EXISTS idx_write_history_date ON write_history(date)");
}

/**
 * 開くSQLiteの接続文字列を返す。
 *
 * E2E用ビルドで保存先が差し替えられているときは、普段使いのDBを読み書きしないよう
 * その絶対パスで開く。tauri-plugin-sql は相対パスだけをアプリの設定フォルダーへ結合する。
 */
async function resolveConnectionString(): Promise<string> {
  const { invoke } = await import("@tauri-apps/api/core");
  const overrideDir = await invoke<string | null>("data_dir_override");
  if (overrideDir == null) return "sqlite:chlens.db";
  logger.warn(`E2E用の保存先のSQLiteを開きます: ${overrideDir}`);
  return `sqlite:${overrideDir}/chlens.db`;
}

async function createContext(): Promise<TauriDrizzleContext> {
  logger.debug("SQLite contextの初期化開始");
  const connectionString = await resolveConnectionString();

  // Why: Tauri plugin が完全に初期化されるまで待機。prodビルドでは
  // タイミングの問題が起きるため、最大3回までリトライ
  const maxRetries = 3;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // 初回は50ms、その後は累積待機
      const waitMs = attempt === 1 ? 50 : 100 * attempt;
      await new Promise((resolve) => setTimeout(resolve, waitMs));

      logger.debug(`Database.load試行 (${attempt}/${maxRetries})`);
      const raw = (await Database.load(connectionString)) as SqlPluginDatabase;
      logger.debug("Database.load成功");

      await runMigrations(raw);

      const db = drizzle(async (query, params, method) => {
        const bindValues = (params ?? []) as unknown[];
        if ((method as ProxyMethod) === "run") {
          await raw.execute(query, bindValues);
          return { rows: [] };
        }

        const rows = await raw.select<Record<string, unknown>>(query, bindValues);
        // Drizzle sqlite-proxy は rows を unknown[][] (配列の配列) として期待する。
        // Tauri SQL は名前付きオブジェクトで返すため、Object.values で変換する。
        // Object.values の順序は SQLite が返すカラム順と一致する。
        return { rows: rows.map((row) => Object.values(row)) };
      });

      logger.debug("SQLite context初期化完了");
      return { db, raw };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      logger.warn(`Database.load失敗 (試行 ${attempt}/${maxRetries}): ${lastError.message}`);

      if (attempt === maxRetries) {
        const message = `Database.load全リトライ失敗 (${attempt}回試行): ${lastError.message}`;
        logger.error(message);
        throw new Error(message, { cause: err });
      }
    }
  }

  // 到達しないはずだが、念のため
  throw lastError || new Error("SQLite初期化失敗（予期しないエラー）");
}

export async function getTauriDrizzleContext(): Promise<TauriDrizzleContext> {
  // Why: 前回の初期化で失敗していた場合、キャッシュされたエラーを再スロー
  if (dbContextError != null) {
    logger.debug("前回のSQLite初期化エラーを再スロー", dbContextError);
    throw dbContextError;
  }

  if (dbContextPromise == null) {
    dbContextPromise = createContext().catch((err) => {
      // Why: エラーを保存して、次回呼び出し時に同じエラーを再スロー（重複初期化を防止）
      dbContextError = err instanceof Error ? err : new Error(String(err));
      throw dbContextError;
    });
  }
  return dbContextPromise;
}
