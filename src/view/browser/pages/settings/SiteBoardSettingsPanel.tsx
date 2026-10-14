import { MoreVertical } from "lucide-react";
import type { ParsedBBSMenu } from "packages/chlib/src/index";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DEFAULT_CONFIG } from "src/app/config-defaults";
import { platformCookieManager } from "src/app/platform/CookieManager";
import { getBoardUrlKey } from "src/core/board/BoardUrlNormalizer";
import {
  OPENED_BOARDS_CONFIG_KEY,
  parseOpenedBoardEntries,
} from "src/core/board/opened-board-entries";
import {
  MAX_BOARD_AUTO_REFRESH_MS,
  MAX_THREAD_AUTO_REFRESH_MS,
  MIN_BOARD_AUTO_REFRESH_MS,
  MIN_THREAD_AUTO_REFRESH_SETTING_MS,
} from "src/features/auto-refresh/browser/auto-refresh-config";
import { container } from "src/service-container/index";
import { Button } from "src/view/browser/ui/Button";
import { Dialog } from "src/view/browser/ui/Dialog";
import { Spinner } from "src/view/browser/ui/Spinner";
import {
  Surface,
  SurfaceBody,
  SurfaceDescription,
  SurfaceHeader,
  SurfaceTitle,
} from "src/view/browser/ui/Surface";
import {
  clearAllSiteScopedSettings,
  clearSiteScopedSettings,
  normalizeBoardKey,
  normalizeSiteKey,
  persistScopedSetting,
  readScopedSettings,
  resolveScopedSetting,
  SCOPED_SETTINGS_CONFIG_KEY,
  type ScopedSettingKey,
  type ScopedSettingScope,
  type ScopedSettingsDocument,
  SITE_SHARED_SCOPE,
} from "src/view/browser/utils/scoped-settings";

interface BoardOption {
  site: string;
  key: string;
  title: string;
}

interface RawBoardOption {
  url: string;
  title: string;
}

const SOURCE_LABELS = {
  board: "この板",
  site: "ドメイン共通",
  global: "全体設定",
} as const;

const SETTING_FIELDS = [
  {
    key: "sage_flag",
    title: "sage",
    description: "メール欄へsageを自動設定して投稿します。",
    kind: "boolean",
    checkboxLabel: "有効にする",
  },
  {
    key: "write_pre_submit_warnings",
    title: "投稿前に確認する",
    description: "個人情報や危害表現が含まれる場合に確認を表示します。",
    kind: "boolean",
    checkboxLabel: "有効にする",
  },
  {
    key: "write_sanitize_urls_on_paste",
    title: "貼り付け時にURLパラメータを除去する",
    description:
      "URLを貼り付けると追跡用パラメータを除去します。Instagramはクエリ全体を除去します。",
    kind: "boolean",
    checkboxLabel: "有効にする",
  },
  {
    key: "auto_load_second",
    title: "スレッドの自動更新間隔",
    description: "スレッドを自動更新する間隔です。",
    kind: "interval",
    min: MIN_THREAD_AUTO_REFRESH_SETTING_MS / 1000,
    max: MAX_THREAD_AUTO_REFRESH_MS / 1000,
  },
  {
    key: "auto_load_second_board",
    title: "板一覧の自動更新間隔",
    description: "板一覧を自動更新する間隔です。",
    kind: "interval",
    min: MIN_BOARD_AUTO_REFRESH_MS / 1000,
    max: MAX_BOARD_AUTO_REFRESH_MS / 1000,
  },
] as const satisfies readonly {
  key: ScopedSettingKey;
  title: string;
  description: string;
  kind: "boolean" | "interval";
  checkboxLabel?: string;
  min?: number;
  max?: number;
}[];

function deriveBoardTitle(boardUrl: string): string {
  try {
    const parsed = new URL(boardUrl);
    const path = parsed.pathname.replace(/^\/+|\/+$/gu, "");
    return path ? `${parsed.hostname}/${path}` : parsed.hostname;
  } catch {
    return boardUrl;
  }
}

function readOpenedBoards(): RawBoardOption[] {
  // 変更理由: 保存形式の解釈は core/OpenedBoards に集約し、取得確認済みの独自ホストの板も
  // ホーム・板一覧と同じ判断で設定の選択肢へ含める。
  return parseOpenedBoardEntries(container.config.get(OPENED_BOARDS_CONFIG_KEY)).map((entry) => ({
    url: entry.url,
    title: entry.title ? entry.title : entry.url,
  }));
}

function readBBSMenuBoards(menu: readonly ParsedBBSMenu[]): RawBoardOption[] {
  return menu.flatMap((source) =>
    source.categories.flatMap((category) =>
      category.boards.map((board) => ({ url: board.url, title: board.name })),
    ),
  );
}

function readScopeBoards(document: ScopedSettingsDocument): RawBoardOption[] {
  return Object.values(document.sites).flatMap((site) =>
    Object.keys(site.boards).map((url) => ({ url, title: deriveBoardTitle(url) })),
  );
}

export function mergeBoardOptions(sources: readonly RawBoardOption[]): BoardOption[] {
  const boards = new Map<string, BoardOption>();
  for (const source of sources) {
    const key = normalizeBoardKey(source.url);
    const comparisonKey = getBoardUrlKey(source.url);
    const site = normalizeSiteKey(source.url);
    if (!key || !comparisonKey || !site || boards.has(comparisonKey)) {
      continue;
    }
    // 変更理由: 設定データ・BBSMENU・開いた板でURL表記が異なっても、
    // プロトコルを含まない板識別子で同じ選択肢へまとめる。
    boards.set(comparisonKey, {
      key,
      site,
      title: source.title.trim() || deriveBoardTitle(key),
    });
  }
  return Array.from(boards.values()).sort((left, right) =>
    left.title.localeCompare(right.title, "ja"),
  );
}

function toIntervalSeconds(rawValue: string | null, fallback: number, min: number, max: number) {
  const parsed = Number.parseInt(rawValue ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.round(parsed / 1000)));
}

function getOverride(
  document: ScopedSettingsDocument,
  scope: ScopedSettingScope,
  key: ScopedSettingKey,
): string | undefined {
  const site = document.sites[scope.site];
  if (!site) {
    return undefined;
  }
  const override = scope.board ? site.boards[scope.board] : site.overrides;
  return override && Object.prototype.hasOwnProperty.call(override, key)
    ? override[key]
    : undefined;
}

function getDefaultValue(key: ScopedSettingKey): string {
  const raw = container.config.get(key) ?? DEFAULT_CONFIG[key];
  if (key === "sage_flag") {
    return raw === "on" ? "on" : "off";
  }
  if (key === "write_pre_submit_warnings" || key === "write_sanitize_urls_on_paste") {
    // 変更理由: これらの確認・除去設定はONを既定とし、保存値がない場合も同じ表示にする。
    return raw === "off" ? "off" : "on";
  }
  return Number.parseInt(raw, 10) > 0 ? raw : DEFAULT_CONFIG[key];
}

function readGlobalSettingValues(): Record<ScopedSettingKey, string> {
  return Object.fromEntries(
    SETTING_FIELDS.map((field) => [field.key, getDefaultValue(field.key)]),
  ) as Record<ScopedSettingKey, string>;
}

function getScopeUrl(site: string, board: string): string {
  return board === SITE_SHARED_SCOPE ? `https://${site}/` : board;
}

export function SiteBoardSettingsPanel() {
  const [document, setDocument] = useState<ScopedSettingsDocument>(() => readScopedSettings());
  const [menuBoards, setMenuBoards] = useState<RawBoardOption[]>([]);
  const [manualBoards, setManualBoards] = useState<RawBoardOption[]>([]);
  const [selectedSite, setSelectedSite] = useState("");
  const [selectedBoard, setSelectedBoard] = useState(SITE_SHARED_SCOPE);
  const [manualBoardUrl, setManualBoardUrl] = useState("");
  const [isAddBoardDialogOpen, setIsAddBoardDialogOpen] = useState(false);
  const [isSiteActionsDialogOpen, setIsSiteActionsDialogOpen] = useState(false);
  const [dialogPortalContainer, setDialogPortalContainer] = useState<HTMLElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<ScopedSettingKey | null>(null);
  const [isClearingCookies, setIsClearingCookies] = useState(false);
  const [isClearingSiteSettings, setIsClearingSiteSettings] = useState(false);
  const [isCheckingCookies, setIsCheckingCookies] = useState(false);
  const [hasSiteCookies, setHasSiteCookies] = useState(false);
  const [globalValues, setGlobalValues] =
    useState<Record<ScopedSettingKey, string>>(readGlobalSettingValues);

  useEffect(() => {
    setDialogPortalContainer(globalThis.document.querySelector<HTMLElement>(".browser-shell"));
  }, []);

  useEffect(() => {
    const sync = () => setDocument(readScopedSettings());
    const handleConfigUpdated = ({ key }: { key?: string }) => {
      if (key === SCOPED_SETTINGS_CONFIG_KEY) {
        sync();
      }
      if (SETTING_FIELDS.some((field) => field.key === key)) {
        setGlobalValues(readGlobalSettingValues());
      }
    };
    container.message.on("config_updated", handleConfigUpdated);
    return () => {
      container.message.off("config_updated", handleConfigUpdated);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadBoards = async () => {
      setLoading(true);
      try {
        const result = await container.bbsMenu.get(false);
        if (!cancelled && result.status === "success") {
          setMenuBoards(readBBSMenuBoards(result.menu ?? []));
        }
      } catch (error) {
        console.error("[SiteBoardSettings] BBSMENUから板一覧を取得できませんでした", error);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };
    void loadBoards();
    return () => {
      cancelled = true;
    };
  }, []);

  const boards = useMemo(
    () =>
      mergeBoardOptions([
        ...menuBoards,
        ...manualBoards,
        ...readOpenedBoards(),
        ...readScopeBoards(document),
      ]),
    [document, manualBoards, menuBoards],
  );

  const sites = useMemo(() => {
    const keys = new Set(boards.map((board) => board.site));
    for (const site of Object.keys(document.sites)) {
      keys.add(site);
    }
    return Array.from(keys).sort((left, right) => left.localeCompare(right));
  }, [boards, document.sites]);

  useEffect(() => {
    if (!selectedSite || sites.includes(selectedSite)) {
      return;
    }
    // 変更理由: 選択中のドメインが候補から消えた場合は先頭へ勝手に移さず、「すべて」に戻す。
    setSelectedSite("");
  }, [selectedSite, sites]);

  const siteBoards = useMemo(
    () => boards.filter((board) => board.site === selectedSite),
    [boards, selectedSite],
  );

  useEffect(() => {
    if (
      selectedBoard === SITE_SHARED_SCOPE ||
      siteBoards.some((board) => board.key === selectedBoard)
    ) {
      return;
    }
    setSelectedBoard(SITE_SHARED_SCOPE);
  }, [selectedBoard, siteBoards]);

  useEffect(() => {
    let cancelled = false;
    setHasSiteCookies(false);
    setIsCheckingCookies(true);
    const checking = selectedSite
      ? platformCookieManager.hasSiteCookies(selectedSite)
      : platformCookieManager.hasAnyCookies();
    void checking
      .then((hasCookies) => {
        if (!cancelled) {
          setHasSiteCookies(hasCookies);
        }
      })
      .catch((error: unknown) => {
        console.error("[SiteBoardSettings] ドメインCookieの確認に失敗しました", error);
        if (!cancelled) {
          setHasSiteCookies(false);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsCheckingCookies(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedSite]);

  const scope = useMemo<ScopedSettingScope | null>(() => {
    if (!selectedSite) {
      return null;
    }
    return {
      site: selectedSite,
      board: selectedBoard === SITE_SHARED_SCOPE ? undefined : selectedBoard,
    };
  }, [selectedBoard, selectedSite]);

  const saveOverride = useCallback(
    async (key: ScopedSettingKey, value: string | undefined) => {
      if (!scope) {
        return;
      }
      setSavingKey(key);
      try {
        await persistScopedSetting(scope, key, value);
        setDocument(readScopedSettings());
      } catch (error) {
        container.toast.error(
          error instanceof Error ? error.message : "スコープ設定の保存に失敗しました",
        );
      } finally {
        setSavingKey((current) => (current === key ? null : current));
      }
    },
    [scope],
  );

  const saveGlobalSetting = useCallback(async (key: ScopedSettingKey, value: string) => {
    setSavingKey(key);
    try {
      // 変更理由: 「すべて」は個別スコープではなく、継承元となる全体設定を編集する範囲として扱う。
      await container.config.set(key, value);
      setGlobalValues((current) => ({ ...current, [key]: value }));
    } catch (error) {
      console.error(`[SiteBoardSettings] 全体設定 ${key} の保存に失敗しました`, error);
      container.toast.error(
        error instanceof Error ? error.message : "全体設定の保存に失敗しました",
      );
    } finally {
      setSavingKey((current) => (current === key ? null : current));
    }
  }, []);

  const clearSiteCookies = useCallback(async () => {
    if (isClearingCookies) {
      return;
    }
    const clearAll = selectedSite === "";
    const targetLabel = clearAll ? "すべてのドメイン" : `「${selectedSite}」`;
    if (
      !window.confirm(
        `${targetLabel}のCookieを削除します。保存した名前・メール欄は削除されません。よろしいっすか？`,
      )
    ) {
      return;
    }

    setIsClearingCookies(true);
    try {
      if (clearAll) {
        await platformCookieManager.clearAllCookies();
      } else {
        await platformCookieManager.clearSiteCookies(selectedSite);
      }
      setHasSiteCookies(false);
      container.toast.success(`${targetLabel}のCookieを削除しました`);
      setIsSiteActionsDialogOpen(false);
    } catch (error) {
      console.error("[SiteBoardSettings] Cookieの削除に失敗しました", error);
      container.toast.error(error instanceof Error ? error.message : "Cookieの削除に失敗しました");
    } finally {
      setIsClearingCookies(false);
    }
  }, [isClearingCookies, selectedSite]);

  const clearSiteSettings = useCallback(async () => {
    if (isClearingSiteSettings) {
      return;
    }
    const clearAll = selectedSite === "";
    const targetLabel = clearAll ? "すべてのドメインと各板" : `ドメイン「${selectedSite}」`;
    // 変更理由: ドメイン共通と各板の設定が一緒に消えることを確認時にも明示する。
    if (
      !window.confirm(
        `${targetLabel}の設定を削除します。削除後は「全体設定」の値が適用されます。よろしいっすか？`,
      )
    ) {
      return;
    }

    setIsClearingSiteSettings(true);
    try {
      if (clearAll) {
        await clearAllSiteScopedSettings();
      } else {
        await clearSiteScopedSettings(selectedSite);
      }
      setDocument(readScopedSettings());
      container.toast.success(`${targetLabel}の設定を削除しました`);
      setIsSiteActionsDialogOpen(false);
    } catch (error) {
      container.toast.error(error instanceof Error ? error.message : "設定の削除に失敗しました");
    } finally {
      setIsClearingSiteSettings(false);
    }
  }, [isClearingSiteSettings, selectedSite]);

  const addManualBoard = useCallback((): boolean => {
    const board = normalizeBoardKey(manualBoardUrl);
    const comparisonKey = getBoardUrlKey(manualBoardUrl);
    const site = normalizeSiteKey(manualBoardUrl);
    if (!board || !comparisonKey || !site) {
      container.toast.error("板URLを確認してください");
      return false;
    }

    const existingBoard = boards.find(
      (candidate) => getBoardUrlKey(candidate.key) === comparisonKey,
    );
    if (existingBoard) {
      // 変更理由: BBSMENUや過去の設定に同じ板がある場合は候補を増やさず、
      // 既存の正規化済み候補を選択して二重登録を防ぐ。
      setSelectedSite(existingBoard.site);
      setSelectedBoard(existingBoard.key);
      setManualBoardUrl("");
      setIsAddBoardDialogOpen(false);
      return true;
    }

    setManualBoards((current) => [...current, { url: board, title: deriveBoardTitle(board) }]);
    setSelectedSite(site);
    setSelectedBoard(board);
    setManualBoardUrl("");
    setIsAddBoardDialogOpen(false);
    return true;
  }, [boards, manualBoardUrl]);

  if (!selectedSite && loading) {
    return (
      <Surface variant="flat">
        <SurfaceBody className="settings-page__site-board-loading">
          <Spinner size="sm" />
          <span>ドメインと板の一覧を読み込み中...</span>
        </SurfaceBody>
      </Surface>
    );
  }

  return (
    <Surface variant="flat">
      <SurfaceHeader>
        <SurfaceTitle>ドメイン共通と、以下各板の設定</SurfaceTitle>
        <SurfaceDescription>
          ドメインの「すべて」は全ドメインの一括操作に使います。特定のドメインを選ぶとドメイン共通や板別の設定を編集できます。ドメイン共通の設定はすべての板に適用され、必要な板だけ個別に上書きできます。
        </SurfaceDescription>
      </SurfaceHeader>
      <SurfaceBody>
        <div className="settings-page__site-board-selectors">
          <div className="settings-page__site-board-field">
            <div className="settings-page__site-board-field-heading">
              <label htmlFor="site-board-site-select">ドメイン</label>
              {/* 変更理由: ドメイン単位の削除操作を選択欄の近くに置き、対象を分かりやすくする。 */}
              <Button
                className="settings-page__site-board-actions-trigger"
                variant="subtle"
                aria-label={selectedSite ? "ドメインの操作を開く" : "すべてのドメインの操作を開く"}
                aria-haspopup="dialog"
                onClick={() => setIsSiteActionsDialogOpen(true)}
              >
                <MoreVertical size={18} aria-hidden="true" />
              </Button>
            </div>
            <select
              id="site-board-site-select"
              value={selectedSite}
              onChange={(event) => {
                setSelectedSite(event.currentTarget.value);
                setSelectedBoard(SITE_SHARED_SCOPE);
              }}
            >
              <option value="">すべて</option>
              {sites.map((site) => (
                <option key={site} value={site}>
                  {site}
                </option>
              ))}
            </select>
          </div>
          <div className="settings-page__site-board-field">
            <div className="settings-page__site-board-field-heading">
              {/* 変更理由: ここでは板だけでなくドメイン共通の設定も選ぶため、選択肢の役割を示す。 */}
              <label htmlFor="site-board-board-select">設定対象</label>
              <Button
                className="settings-page__site-board-add-button"
                variant="subtle"
                onClick={() => setIsAddBoardDialogOpen(true)}
              >
                ＋ 板を追加
              </Button>
            </div>
            <select
              id="site-board-board-select"
              value={selectedBoard}
              disabled={!selectedSite}
              onChange={(event) => setSelectedBoard(event.currentTarget.value)}
            >
              <option value={SITE_SHARED_SCOPE}>ドメイン共通（すべての板）</option>
              {siteBoards.map((board) => (
                <option key={board.key} value={board.key}>
                  {board.title}
                </option>
              ))}
            </select>
          </div>
        </div>

        <Dialog.Root
          open={isAddBoardDialogOpen}
          onOpenChange={(open) => {
            setIsAddBoardDialogOpen(open);
            if (!open) {
              setManualBoardUrl("");
            }
          }}
        >
          <Dialog.Portal container={dialogPortalContainer ?? undefined}>
            <Dialog.Overlay className="browser-dialog-overlay" />
            <Dialog.Content
              className="browser-dialog-content settings-page__site-board-add-dialog"
              aria-describedby="site-board-add-dialog-description"
            >
              <Dialog.Title className="browser-dialog-title">板を追加</Dialog.Title>
              <Dialog.Description
                id="site-board-add-dialog-description"
                className="browser-dialog-description"
              >
                BBSMENUにない板を設定対象へ追加します。URLからドメインと板を判定します。
              </Dialog.Description>
              <label className="settings-page__site-board-field">
                <span>板URL</span>
                <input
                  autoFocus
                  type="url"
                  value={manualBoardUrl}
                  placeholder="https://example.com/board/"
                  onChange={(event) => setManualBoardUrl(event.currentTarget.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      addManualBoard();
                    }
                  }}
                />
              </label>
              <div className="settings-page__site-board-add-dialog-actions">
                <Dialog.Close asChild>
                  <Button variant="subtle">キャンセル</Button>
                </Dialog.Close>
                <Button variant="light" onClick={addManualBoard} disabled={!manualBoardUrl.trim()}>
                  追加
                </Button>
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>

        <Dialog.Root open={isSiteActionsDialogOpen} onOpenChange={setIsSiteActionsDialogOpen}>
          <Dialog.Portal container={dialogPortalContainer ?? undefined}>
            <Dialog.Overlay className="browser-dialog-overlay" />
            <Dialog.Content
              className="browser-dialog-content settings-page__site-actions-dialog"
              aria-describedby="site-actions-dialog-description"
            >
              <Dialog.Title className="browser-dialog-title">
                {selectedSite ? "このドメインのデータをクリア" : "すべてのドメインのデータをクリア"}
              </Dialog.Title>
              <Dialog.Description
                id="site-actions-dialog-description"
                className="browser-dialog-description"
              >
                対象: <strong>{selectedSite || "すべてのドメイン"}</strong>
              </Dialog.Description>
              {/* 変更理由: 削除対象の説明と操作を縦に並べ、各ボタンが消す内容を明確にする。 */}
              <div className="settings-page__site-actions-list">
                <section className="settings-page__site-action">
                  <h3>{selectedSite ? "このドメインのCookie" : "すべてのCookie"}</h3>
                  <p>
                    {selectedSite
                      ? "このドメインの書き込み確認に使うCookieを削除します。保存した名前・メール欄は残ります。"
                      : "すべてのCookieを削除します。保存した名前・メール欄は残ります。"}
                  </p>
                  <div className="settings-page__site-action-controls">
                    {!isCheckingCookies && !hasSiteCookies && (
                      <span className="settings-page__site-action-status">
                        削除するCookieはありません
                      </span>
                    )}
                    <Button
                      className="settings-page__site-action-button"
                      variant="danger"
                      loading={isClearingCookies || isCheckingCookies}
                      disabled={!hasSiteCookies || isClearingSiteSettings}
                      onClick={() => void clearSiteCookies()}
                    >
                      {selectedSite ? "このドメインのCookieをクリア" : "すべてのCookieをクリア"}
                    </Button>
                  </div>
                </section>
                <section className="settings-page__site-action">
                  <h3>{selectedSite ? "ドメイン共通の設定" : "ドメイン・板別の設定"}</h3>
                  <p>
                    {selectedSite
                      ? "このドメイン共通の設定と各板で指定した上書き設定を削除します。削除後は「全体設定」の値が適用されます。"
                      : "すべてのドメイン共通設定と各板の上書き設定を削除します。削除後は「全体設定」の値が適用されます。"}
                  </p>
                  <div className="settings-page__site-action-controls">
                    {!(selectedSite
                      ? document.sites[selectedSite]
                      : Object.keys(document.sites).length > 0) && (
                      <span className="settings-page__site-action-status">
                        削除する個別設定はありません
                      </span>
                    )}
                    <Button
                      className="settings-page__site-action-button"
                      variant="danger"
                      loading={isClearingSiteSettings}
                      disabled={
                        !(selectedSite
                          ? document.sites[selectedSite]
                          : Object.keys(document.sites).length > 0) || isClearingCookies
                      }
                      onClick={() => void clearSiteSettings()}
                    >
                      {selectedSite
                        ? "このドメインの設定をクリア"
                        : "すべてのドメインの設定をクリア"}
                    </Button>
                  </div>
                </section>
              </div>
              <div className="settings-page__site-actions-dialog-footer">
                <Dialog.Close asChild>
                  <Button variant="subtle">閉じる</Button>
                </Dialog.Close>
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>

        {!scope && (
          <div className="settings-page__site-board-settings">
            <p className="settings-page__site-board-empty">
              ここで編集した値は全体設定として保存され、個別設定がないドメイン・板に適用されます。
            </p>
            {SETTING_FIELDS.map((field) => {
              const value = globalValues[field.key];
              const intervalValue =
                field.kind === "interval"
                  ? toIntervalSeconds(value, 20, field.min ?? 1, field.max ?? 300)
                  : 0;
              return (
                <div key={field.key} className="settings-page__site-board-setting">
                  <div className="settings-page__site-board-setting-header">
                    <div>
                      <h4>{field.title}</h4>
                      <p>{field.description}</p>
                    </div>
                    <span className="settings-page__site-board-source">
                      {savingKey === field.key ? "保存中..." : "全体設定"}
                    </span>
                  </div>
                  {field.kind === "boolean" ? (
                    <label className="settings-page__site-board-checkbox">
                      <input
                        type="checkbox"
                        checked={value === "on"}
                        onChange={(event) =>
                          void saveGlobalSetting(
                            field.key,
                            event.currentTarget.checked ? "on" : "off",
                          )
                        }
                      />
                      {field.checkboxLabel}
                    </label>
                  ) : (
                    <label className="settings-page__site-board-interval">
                      <input
                        type="number"
                        min={field.min}
                        max={field.max}
                        step={1}
                        value={intervalValue}
                        onChange={(event) => {
                          const nextValue = Number(event.currentTarget.value);
                          if (!Number.isFinite(nextValue)) return;
                          const clamped = Math.max(
                            field.min ?? 1,
                            Math.min(field.max ?? 300, nextValue),
                          );
                          void saveGlobalSetting(field.key, String(Math.round(clamped) * 1000));
                        }}
                      />
                      <span>秒</span>
                    </label>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {scope && (
          <div className="settings-page__site-board-settings">
            {SETTING_FIELDS.map((field) => {
              const resolved = resolveScopedSetting(
                field.key,
                getScopeUrl(scope.site, scope.board ?? SITE_SHARED_SCOPE),
              );
              const override = getOverride(document, scope, field.key);
              const isCustom = override !== undefined;
              const fallbackValue = resolved.value ?? getDefaultValue(field.key);
              const intervalValue =
                field.kind === "interval"
                  ? toIntervalSeconds(fallbackValue, 20, field.min ?? 1, field.max ?? 300)
                  : 0;
              const effectiveValueLabel =
                field.kind === "boolean"
                  ? fallbackValue === "on"
                    ? "ON"
                    : "OFF"
                  : `${intervalValue}秒`;

              return (
                <div key={field.key} className="settings-page__site-board-setting">
                  <div className="settings-page__site-board-setting-header">
                    <div>
                      <h4>{field.title}</h4>
                      <p>{field.description}</p>
                    </div>
                    <span className="settings-page__site-board-source">
                      {savingKey === field.key
                        ? "保存中..."
                        : `現在: ${SOURCE_LABELS[resolved.source]}（${effectiveValueLabel}）`}
                    </span>
                  </div>
                  <select
                    value={isCustom ? "custom" : "inherit"}
                    onChange={(event) => {
                      if (event.currentTarget.value === "inherit") {
                        void saveOverride(field.key, undefined);
                        return;
                      }
                      const value =
                        field.kind === "boolean"
                          ? fallbackValue === "on"
                            ? "on"
                            : "off"
                          : String(intervalValue * 1000);
                      void saveOverride(field.key, value);
                    }}
                  >
                    <option value="inherit">
                      {scope.board ? "ドメイン共通の設定を使う" : "全体設定を使う"}
                    </option>
                    <option value="custom">
                      {scope.board ? "この板だけに指定する" : "ドメイン内で共通に指定する"}
                    </option>
                  </select>

                  {isCustom && field.kind === "boolean" && (
                    <label className="settings-page__site-board-checkbox">
                      <input
                        type="checkbox"
                        checked={override === "on"}
                        onChange={(event) =>
                          void saveOverride(field.key, event.currentTarget.checked ? "on" : "off")
                        }
                      />
                      {field.checkboxLabel}
                    </label>
                  )}

                  {isCustom && field.kind === "interval" && (
                    <label className="settings-page__site-board-interval">
                      <input
                        type="number"
                        min={field.min}
                        max={field.max}
                        step={1}
                        value={toIntervalSeconds(
                          override ?? null,
                          intervalValue,
                          field.min ?? 1,
                          field.max ?? 300,
                        )}
                        onChange={(event) => {
                          const nextValue = Number(event.currentTarget.value);
                          if (!Number.isFinite(nextValue)) {
                            return;
                          }
                          const clamped = Math.max(
                            field.min ?? 1,
                            Math.min(field.max ?? 300, nextValue),
                          );
                          void saveOverride(field.key, String(Math.round(clamped) * 1000));
                        }}
                      />
                      <span>秒</span>
                    </label>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </SurfaceBody>
    </Surface>
  );
}
