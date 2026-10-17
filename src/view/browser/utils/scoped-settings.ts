import { createLogger } from "src/app/logger";
import { normalizeBoardUrl } from "src/core/board/BoardUrlNormalizer";
import { container } from "src/service-container/index";
import { readConfigValue } from "src/view/browser/utils/config-setting";
import { getBoardUrlFromThreadUrl } from "src/view/browser/utils/link-routing";

const logger = createLogger("view/browser");

/**
 * サイト・板ごとに上書きできる設定をまとめて保存するキー。
 * 個別の設定キーを増やしても、スコープ情報の保存先を増やさないために一つのJSONへ集約する。
 */
export const SCOPED_SETTINGS_CONFIG_KEY = "site_board_settings";

export const SCOPED_SETTING_KEYS = [
  "sage_flag",
  "auto_load_second",
  "auto_load_second_board",
  "write_pre_submit_warnings",
  "write_sanitize_urls_on_paste",
] as const;

export type ScopedSettingKey = (typeof SCOPED_SETTING_KEYS)[number];
export type ScopedSettingsOverride = Partial<Record<ScopedSettingKey, string>>;

export interface ScopedSettingsSite {
  overrides: ScopedSettingsOverride;
  boards: Record<string, ScopedSettingsOverride>;
}

export interface ScopedSettingsDocument {
  sites: Record<string, ScopedSettingsSite>;
}

export interface ScopedSettingScope {
  site: string;
  board?: string;
}

export type ScopedSettingSource = "board" | "site" | "global";

export interface ResolvedScopedSetting {
  value: string | null;
  source: ScopedSettingSource;
}

export const SITE_SHARED_SCOPE = "__site__";

// 数値入力はキー入力ごとに保存されるため、保存処理を直列化して
// 一つ前の入力が後の入力を上書きしないようにする。
let scopedWriteQueue: Promise<void> = Promise.resolve();

function createEmptyDocument(): ScopedSettingsDocument {
  return { sites: {} };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isScopedSettingKey(value: string): value is ScopedSettingKey {
  return (SCOPED_SETTING_KEYS as readonly string[]).includes(value);
}

function normalizeOverride(value: unknown): ScopedSettingsOverride {
  if (!isRecord(value)) {
    return {};
  }

  const override: ScopedSettingsOverride = {};
  for (const [key, rawValue] of Object.entries(value)) {
    if (!isScopedSettingKey(key)) {
      continue;
    }
    if (typeof rawValue === "string" || typeof rawValue === "number") {
      override[key] = String(rawValue);
    }
  }
  return override;
}

function normalizeSite(value: unknown): ScopedSettingsSite {
  if (!isRecord(value)) {
    return { overrides: {}, boards: {} };
  }

  const boards: Record<string, ScopedSettingsOverride> = {};
  if (isRecord(value.boards)) {
    for (const [rawBoardKey, rawOverride] of Object.entries(value.boards)) {
      const boardKey = normalizeBoardKey(rawBoardKey) ?? rawBoardKey;
      const override = normalizeOverride(rawOverride);
      if (Object.keys(override).length > 0) {
        boards[boardKey] = { ...boards[boardKey], ...override };
      }
    }
  }

  return {
    overrides: normalizeOverride(value.overrides),
    boards,
  };
}

export function parseScopedSettings(raw: string | null | undefined): ScopedSettingsDocument {
  if (!raw) {
    return createEmptyDocument();
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || !isRecord(parsed.sites)) {
      return createEmptyDocument();
    }

    const sites: Record<string, ScopedSettingsSite> = {};
    for (const [rawSiteKey, rawSite] of Object.entries(parsed.sites)) {
      const siteKey = normalizeSiteKey(rawSiteKey) ?? rawSiteKey.trim().toLowerCase();
      if (!siteKey) {
        continue;
      }
      const site = normalizeSite(rawSite);
      if (Object.keys(site.overrides).length > 0 || Object.keys(site.boards).length > 0) {
        const existing = sites[siteKey];
        sites[siteKey] = existing
          ? {
              overrides: { ...existing.overrides, ...site.overrides },
              boards: { ...existing.boards, ...site.boards },
            }
          : site;
      }
    }
    return { sites };
  } catch (error) {
    // 破損したスコープ設定で通常の設定画面まで壊さず、原因だけをログへ残す。
    logger.error("スコープ設定の読み込みに失敗しました", error);
    return createEmptyDocument();
  }
}

export function readScopedSettings(): ScopedSettingsDocument {
  return parseScopedSettings(readConfigValue(SCOPED_SETTINGS_CONFIG_KEY));
}

function normalizeHostname(raw: string): string | null {
  const trimmed = raw.trim().toLowerCase().replace(/\.+$/u, "");
  if (!trimmed) {
    return null;
  }

  try {
    const parsed = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
    return parsed.hostname.toLowerCase().replace(/\.+$/u, "") || null;
  } catch {
    return null;
  }
}

/** URLまたはホスト名から、設定ストアで使うサイトキーを作る。 */
export function normalizeSiteKey(raw: string): string | null {
  return normalizeHostname(raw);
}

/**
 * 板URLをクエリ・フラグメント・末尾スラッシュの揺れがないキーへ変換する。
 * 既知の掲示板は共通の板URL正規化も通し、サイト・板設定の参照先を統一する。
 */
export function normalizeBoardKey(raw: string): string | null {
  const normalizedBoardUrl = normalizeBoardUrl(raw);
  if (normalizedBoardUrl !== null) {
    const canonicalUrl = new URL(normalizedBoardUrl);
    // 変更理由: 同じ板のHTTP/HTTPS表記を別設定として保存すると、
    // サイト・板設定の選択肢と上書き先が二重化するため、論理キーだけHTTPSへ統一する。
    canonicalUrl.protocol = "https:";
    return canonicalUrl.href;
  }

  try {
    const parsed = new URL(raw);
    if (!parsed.hostname) {
      return null;
    }
    parsed.search = "";
    parsed.hash = "";
    parsed.pathname = `${parsed.pathname.replace(/\/+$/u, "")}/`;
    // 変更理由: 既知ホスト以外の手入力板URLも、HTTP/HTTPSの揺れで
    // 同じ設定が二重登録されないよう論理キーのプロトコルを統一する。
    parsed.protocol = "https:";
    return parsed.href;
  } catch {
    return null;
  }
}

export function getScopeFromUrl(rawUrl: string): ScopedSettingScope | null {
  const site = normalizeSiteKey(rawUrl);
  if (!site) {
    return null;
  }

  const boardUrl = getBoardUrlFromThreadUrl(rawUrl);
  const board = normalizeBoardKey(boardUrl);
  return { site, board: board ?? undefined };
}

function isOwnOverride(
  override: ScopedSettingsOverride | undefined,
  key: ScopedSettingKey,
): override is ScopedSettingsOverride {
  return override != null && Object.prototype.hasOwnProperty.call(override, key);
}

/** 指定URLで実際に使われる値と、その値の由来を返す。 */
export function resolveScopedSetting(
  key: ScopedSettingKey,
  rawUrl: string | undefined,
): ResolvedScopedSetting {
  const globalValue = readConfigValue(key);
  if (!rawUrl) {
    return { value: globalValue, source: "global" };
  }

  const scope = getScopeFromUrl(rawUrl);
  if (!scope) {
    return { value: globalValue, source: "global" };
  }

  const site = readScopedSettings().sites[scope.site];
  if (scope.board && site && isOwnOverride(site.boards[scope.board], key)) {
    return { value: site.boards[scope.board][key] ?? null, source: "board" };
  }
  if (site && isOwnOverride(site.overrides, key)) {
    return { value: site.overrides[key] ?? null, source: "site" };
  }
  return { value: globalValue, source: "global" };
}

export function readScopedConfigValue(key: ScopedSettingKey, rawUrl?: string): string | null {
  return resolveScopedSetting(key, rawUrl).value;
}

function hasAnyOverrides(site: ScopedSettingsSite): boolean {
  return Object.keys(site.overrides).length > 0 || Object.keys(site.boards).length > 0;
}

function cloneDocument(document: ScopedSettingsDocument): ScopedSettingsDocument {
  return {
    sites: Object.fromEntries(
      Object.entries(document.sites).map(([siteKey, site]) => [
        siteKey,
        {
          overrides: { ...site.overrides },
          boards: Object.fromEntries(
            Object.entries(site.boards).map(([boardKey, override]) => [boardKey, { ...override }]),
          ),
        },
      ]),
    ),
  };
}

/** サイトまたは板の上書きを保存し、通常のconfig_updated通知も発火させる。 */
export async function persistScopedSetting(
  scope: ScopedSettingScope,
  key: ScopedSettingKey,
  value: string | undefined,
): Promise<void> {
  const write = scopedWriteQueue.then(async () => {
    const siteKey = normalizeSiteKey(scope.site);
    if (!siteKey) {
      throw new Error("サイトの識別子が不正です");
    }

    const boardKey = scope.board ? normalizeBoardKey(scope.board) : null;
    const document = cloneDocument(readScopedSettings());
    const site = document.sites[siteKey] ?? { overrides: {}, boards: {} };
    document.sites[siteKey] = site;
    const target = boardKey
      ? (site.boards[boardKey] ?? (site.boards[boardKey] = {}))
      : site.overrides;

    if (value === undefined) {
      delete target[key];
    } else {
      target[key] = value;
    }

    for (const [keyToClean, override] of Object.entries(site.boards)) {
      if (Object.keys(override).length === 0) {
        delete site.boards[keyToClean];
      }
    }
    if (!hasAnyOverrides(site)) {
      delete document.sites[siteKey];
    }

    try {
      await container.config.set(SCOPED_SETTINGS_CONFIG_KEY, JSON.stringify(document));
    } catch (error) {
      logger.error("スコープ設定の保存に失敗しました", error);
      throw error;
    }
  });
  scopedWriteQueue = write.catch(() => undefined);
  await write;
}

/** 指定サイトのサイト共通・板別上書きをまとめて削除する。 */
export async function clearSiteScopedSettings(site: string): Promise<void> {
  const write = scopedWriteQueue.then(async () => {
    const siteKey = normalizeSiteKey(site);
    if (!siteKey) {
      throw new Error("サイトの識別子が不正です");
    }

    const document = cloneDocument(readScopedSettings());
    if (!Object.prototype.hasOwnProperty.call(document.sites, siteKey)) {
      return;
    }

    // 変更理由: 選択サイトだけを消して別サイト・全体設定を保ち、進行中の保存による設定の復活も防ぐ。
    delete document.sites[siteKey];
    try {
      await container.config.set(SCOPED_SETTINGS_CONFIG_KEY, JSON.stringify(document));
    } catch (error) {
      logger.error("サイト設定の削除に失敗しました", error);
      throw error;
    }
  });
  scopedWriteQueue = write.catch(() => undefined);
  await write;
}

/** すべてのサイト・板の上書きを削除し、全体設定だけを残す。 */
export async function clearAllSiteScopedSettings(): Promise<void> {
  const write = scopedWriteQueue.then(async () => {
    const document = readScopedSettings();
    if (Object.keys(document.sites).length === 0) {
      return;
    }

    // 変更理由: スコープ設定だけを空にし、通常の全体設定は維持したまま全サイトを既定値へ戻す。
    try {
      await container.config.set(SCOPED_SETTINGS_CONFIG_KEY, JSON.stringify({ sites: {} }));
    } catch (error) {
      logger.error("すべてのサイト設定の削除に失敗しました", error);
      throw error;
    }
  });
  scopedWriteQueue = write.catch(() => undefined);
  await write;
}

/** URLを板スコープとして扱い、書き込みパネルなどから変更する。 */
export async function persistScopedSettingForUrl(
  key: ScopedSettingKey,
  rawUrl: string | undefined,
  value: string,
): Promise<void> {
  const scope = rawUrl ? getScopeFromUrl(rawUrl) : null;
  if (!scope) {
    await container.config.set(key, value);
    return;
  }
  await persistScopedSetting(scope, key, value);
}
