import { AlertTriangle, ChevronDown, RefreshCw } from "lucide-react";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NG_DSL_EXAMPLES, NGDslHelpSnippet, NGEditor } from "src/features/ng/ui/NGEditor";
import {
  REPLACEMENT_DSL_EXAMPLE,
  REPLACEMENT_LINE_EXAMPLE,
  ReplacementDslHelpSnippet,
  ReplacementEditor,
} from "src/features/replacement/ui/ReplacementEditor";
import { container } from "src/service-container/index";
import { useMediaQuery } from "src/view/browser/hooks/use-media-query";
import {
  groupSectionItems,
  isSettingsSectionId,
  NG_PRIMARY_FIELD_KEYS,
  readAllSettings,
  SETTINGS_SECTION_GROUPS,
  SETTINGS_SECTION_MAP,
  SETTINGS_SECTIONS,
} from "src/view/browser/pages/settings/settings-sections";
import type {
  SettingsFieldDefinition,
  SettingsFormState,
  SettingsFormValue,
  SettingsSectionFormData,
  SettingsSectionItem,
} from "src/view/browser/pages/settings/settings-types";
import {
  isSettingsDividerItem,
  isSettingsFieldItem,
} from "src/view/browser/pages/settings/settings-types";
import { SettingsSupplementaryPanels } from "src/view/browser/pages/settings/SettingsSupplementaryPanels";
import { useCompactMenu } from "src/view/browser/pages/settings/use-compact-menu";
import { useSettingsAutoSave } from "src/view/browser/pages/settings/use-settings-auto-save";
import { useSettingsMaintenanceActions } from "src/view/browser/pages/settings/use-settings-maintenance";
import { useTabViewState } from "src/view/browser/state/tabs/use-tab-store";
import type {
  SettingsPage as SettingsPageType,
  SettingsPageUiState,
  SettingsSectionId,
} from "src/view/browser/types";
import { Alert } from "src/view/browser/ui/Alert";
import { Button } from "src/view/browser/ui/Button";
import { ChoiceControl, SettingRow, SwitchControl } from "src/view/browser/ui/FormControls";
import { Spinner } from "src/view/browser/ui/Spinner";
import {
  Surface,
  SurfaceBody,
  SurfaceDescription,
  SurfaceHeader,
} from "src/view/browser/ui/Surface";
import { Tooltip } from "src/view/browser/ui/Tooltip";

function toStringValue(value: SettingsFormValue): string {
  return typeof value === "string" ? value : "";
}

function toNumberValue(value: SettingsFormValue): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function toBooleanValue(value: SettingsFormValue): boolean {
  return value === true;
}

// 統合してなくなったカテゴリの古い保存値とページリンクを、移った先のカテゴリへ案内する。
// サムネイルは表示へ、「その他」の中心だった bbsmenu は板へ移した。
const LEGACY_SECTION_IDS: Readonly<Record<string, SettingsSectionId>> = {
  thumbnail: "display",
  other: "site-board",
};

function findSectionId(sectionId?: string): SettingsSectionId | undefined {
  if (!sectionId) return undefined;
  return isSettingsSectionId(sectionId) ? sectionId : LEGACY_SECTION_IDS[sectionId];
}

function resolveSectionId(sectionId?: string): SettingsSectionId {
  return findSectionId(sectionId) ?? "general";
}

/**
 * 設定カテゴリの一覧。
 * 変更理由: 説明文まで並べると画面幅の半分程度で一覧が縦に伸びて窮屈になるため、
 * Obsidian や Discord の設定画面のようにアイコンと名前だけの1行にする。説明文は本文の見出し下に出す。
 */
const SettingsSectionNav: React.FC<{
  activeSectionId: SettingsSectionId;
  onSelect: (sectionId: SettingsSectionId) => void;
}> = ({ activeSectionId, onSelect }) => (
  <nav className="settings-page__section-list" aria-label="設定カテゴリ">
    {SETTINGS_SECTION_GROUPS.map((group) => (
      <section
        key={group.id}
        className="settings-page__section-group"
        aria-labelledby={`settings-section-group-${group.id}`}
      >
        <h3
          id={`settings-section-group-${group.id}`}
          className="settings-page__section-group-title"
        >
          {group.title}
        </h3>
        {group.sections.map((section) => (
          <button
            key={section.id}
            type="button"
            className={`settings-page__section-btn${
              activeSectionId === section.id ? " settings-page__section-btn--active" : ""
            }`}
            aria-current={activeSectionId === section.id ? "page" : undefined}
            onClick={() => onSelect(section.id)}
          >
            <span className="settings-page__section-icon" aria-hidden="true">
              {section.icon}
            </span>
            <span className="settings-page__section-name">{section.title}</span>
          </button>
        ))}
      </section>
    ))}
  </nav>
);

export const SettingsPage: React.FC<{ tabId: string; page: SettingsPageType }> = ({
  tabId,
  page,
}) => {
  const { state: persistedViewState, update: updateViewState } = useTabViewState(tabId, page);
  // 全タブ共通の保存値を使うと、閉じて開き直した設定タブにも前回の表示状態が残る。
  // タブセッションから初期値を読み、Chrome側の再読み込みでは同じタブの状態を復元する。
  const [initialUiState] = useState(() => persistedViewState.settingsPage ?? {});
  // カテゴリ一覧をアイコンと名前だけの細い列にしたため、画面幅の半分程度でも常に表示し、
  // 本文が窮屈になる幅だけ左端のホットゾーンから開くメニューへ切り替える。
  const isCompact = useMediaQuery("(max-width: 720px)") ?? false;
  const [activeSectionId, setActiveSectionId] = useState<SettingsSectionId>(() =>
    resolveSectionId(
      initialUiState.linkedSectionId === page.sectionId
        ? (initialUiState.activeSectionId ?? page.sectionId)
        : page.sectionId,
    ),
  );
  const [formState, setFormState] = useState<SettingsFormState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isNgExamplesOpen, setIsNgExamplesOpen] = useState(initialUiState.ngExamplesOpen === true);
  const [ngSettingsTab, setNgSettingsTab] = useState<"ng" | "replacement">(
    initialUiState.ngSettingsTab === "replacement" ? "replacement" : "ng",
  );
  const [isReplacementExamplesOpen, setIsReplacementExamplesOpen] = useState(
    initialUiState.replacementExamplesOpen === true,
  );
  const [isNgAdvancedOpen, setIsNgAdvancedOpen] = useState(initialUiState.ngAdvancedOpen === true);
  const { savingSectionId, autoSaveError, setAutoSaveError, scheduleAutoSave } =
    useSettingsAutoSave();
  const { isCompactMenuOpen, openCompactMenu, closeCompactMenu, scheduleCompactMenuClose } =
    useCompactMenu(isCompact);
  const formStateRef = useRef<SettingsFormState | null>(null);
  const scrollViewportRef = useRef<HTMLDivElement | null>(null);
  const restoredScrollTopRef = useRef(
    typeof initialUiState.mainScrollTop === "number" &&
      Number.isFinite(initialUiState.mainScrollTop) &&
      initialUiState.mainScrollTop >= 0
      ? initialUiState.mainScrollTop
      : 0,
  );
  const shouldRestoreScrollRef = useRef(true);
  const previousSectionIdRef = useRef(page.sectionId);

  const activeSection = useMemo(
    () => SETTINGS_SECTION_MAP.get(activeSectionId) ?? SETTINGS_SECTIONS[0],
    [activeSectionId],
  );

  const maintenanceActions = useSettingsMaintenanceActions({
    formState,
    onResetFormState: (nextState) => {
      formStateRef.current = nextState;
      setFormState(nextState);
    },
    onResetError: (message) => setAutoSaveError(message),
  });

  useEffect(() => {
    formStateRef.current = formState;
  }, [formState]);

  useEffect(() => {
    // 再読み込み時は保存済みの選択を優先し、表示中にリンク先が変わった場合だけ切り替える。
    if (previousSectionIdRef.current === page.sectionId) return;
    previousSectionIdRef.current = page.sectionId;
    const linkedSectionId = findSectionId(page.sectionId);
    if (linkedSectionId) {
      setActiveSectionId(linkedSectionId);
    }
  }, [page.sectionId]);

  const persistPageUiState = useCallback(
    (nextScrollTop?: number) => {
      // 設定読込中はスクロール領域がまだないため、復元待ちの位置を0で上書きしない。
      const scrollTop =
        nextScrollTop ?? scrollViewportRef.current?.scrollTop ?? restoredScrollTopRef.current;

      const nextState: SettingsPageUiState = {
        activeSectionId,
        linkedSectionId: page.sectionId,
        mainScrollTop: scrollTop,
        ngExamplesOpen: isNgExamplesOpen,
        ngAdvancedOpen: isNgAdvancedOpen,
        ...(ngSettingsTab === "replacement" ? { ngSettingsTab } : {}),
        ...(isReplacementExamplesOpen ? { replacementExamplesOpen: true } : {}),
      };

      restoredScrollTopRef.current = scrollTop;
      updateViewState({ settingsPage: nextState });
    },
    [
      activeSectionId,
      isNgAdvancedOpen,
      isNgExamplesOpen,
      ngSettingsTab,
      isReplacementExamplesOpen,
      page.sectionId,
      updateViewState,
    ],
  );

  const loadSettings = useCallback(() => {
    setLoading(true);
    setError(null);

    container.config.ready(() => {
      try {
        const nextState = readAllSettings();
        formStateRef.current = nextState;
        setFormState(nextState);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "設定の読み込みに失敗しました");
      } finally {
        setLoading(false);
      }
    });
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    persistPageUiState();
  }, [persistPageUiState]);

  useEffect(() => {
    if (loading || !shouldRestoreScrollRef.current || !scrollViewportRef.current) {
      return;
    }

    scrollViewportRef.current.scrollTop = restoredScrollTopRef.current;
    shouldRestoreScrollRef.current = false;
  }, [loading]);

  const updateFieldValue = useCallback(
    (sectionId: SettingsSectionId, fieldKey: string, value: SettingsFormValue) => {
      const currentState = formStateRef.current;
      if (!currentState) {
        return;
      }

      const nextSectionData: SettingsSectionFormData = {
        ...currentState[sectionId],
        [fieldKey]: value,
      };
      const nextState: SettingsFormState = {
        ...currentState,
        [sectionId]: nextSectionData,
      };
      // Reactのstate updater内で次の保存値を組み立てると、バッチ更新時に
      // 保存予約が抜けることがあるため、refへ先に反映してから保存を予約する。
      formStateRef.current = nextState;
      setFormState(nextState);
      scheduleAutoSave(sectionId, nextSectionData);
    },
    [scheduleAutoSave],
  );

  const renderField = useCallback(
    (sectionId: SettingsSectionId, field: SettingsFieldDefinition) => {
      const sectionData = formState?.[sectionId] ?? {};
      const value = sectionData[field.key];

      const id = `settings-${field.key}`;

      if (field.kind === "boolean") {
        return (
          <SettingRow
            key={field.key}
            htmlFor={id}
            label={field.title}
            description={field.description}
          >
            <SwitchControl
              id={id}
              checked={toBooleanValue(value)}
              // 非推奨の項目は互換のため表示だけ残しており、切り替えても動作に影響しない。
              disabled={field.deprecated}
              onCheckedChange={(checked) => updateFieldValue(sectionId, field.key, checked)}
            />
          </SettingRow>
        );
      }

      if (field.kind === "number") {
        return (
          <SettingRow
            key={field.key}
            htmlFor={id}
            label={field.title}
            description={field.description}
          >
            <input
              id={id}
              type="number"
              value={toNumberValue(value)}
              min={field.minimum}
              max={field.maximum}
              step={field.step}
              onChange={(event) => {
                const nextValue = Number(event.currentTarget.value);
                updateFieldValue(sectionId, field.key, Number.isFinite(nextValue) ? nextValue : 0);
              }}
            />
          </SettingRow>
        );
      }

      if (field.options && field.options.length > 0) {
        const labelId = `${id}-label`;
        const isSegmented = field.widget === "segmented";
        return (
          <SettingRow
            key={field.key}
            labelId={labelId}
            label={field.title}
            description={field.description}
            layout={isSegmented ? "inline" : "stacked"}
          >
            <ChoiceControl
              id={id}
              labelledBy={labelId}
              value={toStringValue(value)}
              options={field.options}
              variant={isSegmented ? "segmented" : "list"}
              onValueChange={(nextValue) => updateFieldValue(sectionId, field.key, nextValue)}
            />
          </SettingRow>
        );
      }

      if (field.widget === "replacement_editor") {
        return (
          <div key={field.key} className="settings-page__ng-field">
            <h3 className="settings-page__ng-field-title">{field.title}</h3>
            <p className="settings-page__ng-field-description">{field.description}</p>
            <ReplacementEditor
              value={toStringValue(value)}
              onChange={(nextValue) => updateFieldValue(sectionId, field.key, nextValue)}
            />
          </div>
        );
      }

      if (field.widget === "ng_editor") {
        return (
          <div key={field.key} className="settings-page__ng-field">
            <h3 className="settings-page__ng-field-title">{field.title}</h3>
            {field.description && (
              <p className="settings-page__ng-field-description">{field.description}</p>
            )}
            <NGEditor
              value={toStringValue(value)}
              onChange={(nextValue) => {
                updateFieldValue(sectionId, field.key, nextValue);
              }}
            />
          </div>
        );
      }

      // 変更理由: 1行の文字列（URLや正規表現）も2行のtextareaで表示していたため、
      // 複数行を書く項目だけtextareaにし、それ以外は1行の入力欄にする。
      return (
        <SettingRow
          key={field.key}
          htmlFor={id}
          label={field.title}
          description={field.description}
          layout="stacked"
        >
          {field.widget === "textarea" ? (
            <textarea
              id={id}
              rows={field.rows ?? 6}
              value={toStringValue(value)}
              onChange={(event) => {
                updateFieldValue(sectionId, field.key, event.currentTarget.value);
              }}
            />
          ) : (
            <input
              id={id}
              type="text"
              value={toStringValue(value)}
              onChange={(event) => {
                updateFieldValue(sectionId, field.key, event.currentTarget.value);
              }}
            />
          )}
        </SettingRow>
      );
    },
    [formState, updateFieldValue],
  );

  const renderSectionItems = useCallback(
    (sectionId: SettingsSectionId, items: readonly SettingsSectionItem[]) =>
      // 変更理由: 区切りの見出しの下に項目をまとめた枠を置き、枠の中は行ごとに線で区切る。
      // 項目の境目と見出しの階層を見た目で分かるようにし、Obsidianなどの設定画面に揃える。
      groupSectionItems(items).map((group, index) => {
        const hasOnlyEditors = group.fields.every(
          (field) => field.widget === "ng_editor" || field.widget === "replacement_editor",
        );
        return (
          <section key={group.divider?.id ?? `group-${index}`} className="settings-page__group">
            {group.divider && (
              <div className="settings-page__group-header">
                <h3 className="settings-page__group-title">{group.divider.title}</h3>
                {group.divider.description && (
                  <p className="settings-page__group-description">{group.divider.description}</p>
                )}
              </div>
            )}
            {group.fields.length > 0 &&
              // NG・置換のエディタは独自の枠と操作を持つため、行の枠へ入れない。
              (hasOnlyEditors ? (
                group.fields.map((field) => renderField(sectionId, field))
              ) : (
                <div className="settings-page__group-card">
                  {group.fields.map((field) => renderField(sectionId, field))}
                </div>
              ))}
          </section>
        );
      }),
    [renderField],
  );

  const regularSectionItems = useMemo(() => {
    if (activeSection.id === "ng") {
      return [] as SettingsSectionItem[];
    }

    return activeSection.fields;
  }, [activeSection]);

  const ngPrimarySectionItems = useMemo(() => {
    if (activeSection.id !== "ng") {
      return [] as SettingsSectionItem[];
    }

    return activeSection.fields.filter(
      (item) => isSettingsFieldItem(item) && NG_PRIMARY_FIELD_KEYS.has(item.key),
    );
  }, [activeSection]);

  const ngAdvancedSectionItems = useMemo(() => {
    if (activeSection.id !== "ng") {
      return [] as SettingsSectionItem[];
    }

    return activeSection.fields.filter(
      (item) =>
        isSettingsDividerItem(item) ||
        (isSettingsFieldItem(item) &&
          !NG_PRIMARY_FIELD_KEYS.has(item.key) &&
          item.key !== "replace_str_txt"),
    );
  }, [activeSection]);

  if (loading) {
    return (
      <div className="settings-page__loading">
        <Spinner size="sm" />
        <span>設定を読み込み中...</span>
      </div>
    );
  }

  if (error || !formState) {
    return (
      <div className="settings-page__error-state">
        <Alert color="red" icon={<AlertTriangle size={16} />}>
          {error ?? "設定の読み込みに失敗しました"}
        </Alert>
        <Button variant="light" onClick={loadSettings}>
          再試行
        </Button>
      </div>
    );
  }

  const relatedSection = activeSection.relatedSection;

  return (
    <div className={`settings-page__shell${isCompact ? " settings-page__shell--compact" : ""}`}>
      {!isCompact && (
        <aside className="settings-page__sidebar">
          <SettingsSectionNav activeSectionId={activeSectionId} onSelect={setActiveSectionId} />
        </aside>
      )}

      {isCompact && (
        <>
          <div
            className="settings-page__compact-hotzone"
            role="button"
            tabIndex={0}
            aria-label="設定カテゴリメニューを開く"
            onMouseEnter={openCompactMenu}
            onFocus={openCompactMenu}
            onBlur={scheduleCompactMenuClose}
          />

          {isCompactMenuOpen && (
            <aside
              className="settings-page__compact-menu"
              onMouseEnter={openCompactMenu}
              onMouseLeave={scheduleCompactMenuClose}
            >
              <div className="settings-page__compact-menu-scroll">
                <SettingsSectionNav
                  activeSectionId={activeSectionId}
                  onSelect={(sectionId) => {
                    setActiveSectionId(sectionId);
                    closeCompactMenu();
                  }}
                />
              </div>
            </aside>
          )}
        </>
      )}

      <main
        ref={scrollViewportRef}
        className="settings-page__main"
        onScroll={(event) => persistPageUiState(event.currentTarget.scrollTop)}
      >
        {/* 変更理由: ページ全体を大きな枠で囲むと、中の項目の枠と二重になって重く見える。
            枠は項目のまとまりだけに付け、見出しは枠の外に置く。 */}
        <div className="settings-page__content">
          <header className="settings-page__header">
            <div className="settings-page__heading">
              <h2 className="settings-page__title">{activeSection.title}</h2>
              {/* 変更は常に自動保存するため、保存中だけ知らせる。 */}
              {savingSectionId === activeSection.id && (
                <span className="settings-page__saving" role="status">
                  <RefreshCw size={14} className="animate-spin" aria-hidden="true" />
                  保存中...
                </span>
              )}
            </div>
            <p className="settings-page__description">{activeSection.description}</p>
            {relatedSection && (
              <p className="settings-page__related">
                {relatedSection.description}
                <Button
                  className="settings-page__related-link"
                  variant="subtle"
                  onClick={() => setActiveSectionId(relatedSection.id)}
                >
                  {relatedSection.label}
                </Button>
              </p>
            )}
          </header>

          <div className="settings-page__body">
            {autoSaveError && (
              <Alert
                className="settings-page__auto-save-error"
                color="red"
                icon={<AlertTriangle size={16} />}
              >
                {autoSaveError}
              </Alert>
            )}

            {/* 変更理由: 表示セクションのタイトルバー設定を先頭に置き、関連項目を見つけやすくする。 */}
            {activeSection.id === "display" && (
              <SettingsSupplementaryPanels
                panelIds={activeSection.supplementaryPanelIds}
                maintenanceActions={maintenanceActions}
              />
            )}

            {/* 項目のないカテゴリで空の入れ物を出すと、間隔が二重に空くため描かない。 */}
            {activeSection.id !== "ng" && regularSectionItems.length > 0 && (
              <div className="settings-page__section-stack">
                {activeSection.id !== "site-board" &&
                  renderSectionItems(activeSection.id, regularSectionItems)}

                {activeSection.id === "site-board" && (
                  // 変更理由: 見出し・区切り線・項目名で bbsmenu を3回繰り返していたため、
                  // 見出しは用途（板一覧の取得元）だけにし、項目名で入力内容を示す。
                  // 枠も二重にせず、ほかの項目と同じ「見出しの下に1枚の枠」の形にする。
                  <section className="settings-page__group">
                    <div className="settings-page__group-header">
                      <h3 className="settings-page__group-title">BBSMENU</h3>
                    </div>
                    <div className="settings-page__group-card">
                      {regularSectionItems
                        .filter(isSettingsFieldItem)
                        .map((field) => renderField("site-board", field))}
                      <div className="settings-page__group-actions">
                        <Button
                          onClick={() => void maintenanceActions.handleBBSMenuCheck()}
                          loading={maintenanceActions.isBbsMenuChecking}
                          disabled={maintenanceActions.isBbsMenuRefreshing}
                        >
                          URLチェック
                        </Button>
                        <Tooltip label="設定したBBSMENUを強制取得してキャッシュを更新します。「一度開いた板」は明示的な記録だけから再構成し、外部サイトや重複を除外します。">
                          <span>
                            <Button
                              onClick={() => void maintenanceActions.handleBBSMenuRefresh()}
                              loading={maintenanceActions.isBbsMenuRefreshing}
                              disabled={maintenanceActions.isBbsMenuChecking}
                            >
                              板一覧を再取得
                            </Button>
                          </span>
                        </Tooltip>
                      </div>
                    </div>
                  </section>
                )}
              </div>
            )}

            {activeSection.id === "ng" && (
              <div className="settings-page__section-stack settings-page__section-stack--ng">
                <div
                  className="settings-page__rule-tabs"
                  role="tablist"
                  aria-label="NGと文字列置換"
                >
                  {(["ng", "replacement"] as const).map((tab, index, tabs) => (
                    <button
                      key={tab}
                      id={`rule-tab-${tabId}-${tab}`}
                      role="tab"
                      type="button"
                      aria-selected={ngSettingsTab === tab}
                      aria-controls={`rule-panel-${tabId}-${tab}`}
                      tabIndex={ngSettingsTab === tab ? 0 : -1}
                      onClick={() => setNgSettingsTab(tab)}
                      onKeyDown={(event) => {
                        const next =
                          event.key === "ArrowRight"
                            ? tabs[(index + 1) % tabs.length]
                            : event.key === "ArrowLeft"
                              ? tabs[(index + tabs.length - 1) % tabs.length]
                              : event.key === "Home"
                                ? tabs[0]
                                : event.key === "End"
                                  ? tabs[tabs.length - 1]
                                  : null;
                        if (next) {
                          event.preventDefault();
                          setNgSettingsTab(next);
                          document.getElementById(`rule-tab-${tabId}-${next}`)?.focus();
                        }
                      }}
                    >
                      {tab === "ng" ? "NGルール" : "文字列置換"}
                    </button>
                  ))}
                </div>
                {ngSettingsTab === "ng" ? (
                  <div
                    role="tabpanel"
                    id={`rule-panel-${tabId}-ng`}
                    aria-labelledby={`rule-tab-${tabId}-ng`}
                    className="settings-page__section-stack--nested"
                  >
                    {renderSectionItems("ng", ngPrimarySectionItems)}

                    <Button
                      className="settings-page__toggle"
                      variant="subtle"
                      aria-expanded={isNgExamplesOpen}
                      onClick={() => setIsNgExamplesOpen((prev) => !prev)}
                    >
                      <ChevronDown
                        size={16}
                        className={`settings-page__toggle-icon${
                          isNgExamplesOpen ? " settings-page__toggle-icon--open" : ""
                        }`}
                        aria-hidden="true"
                      />
                      NG記法例
                    </Button>

                    {isNgExamplesOpen && (
                      <Surface as="section" tone="muted" variant="flat">
                        <SurfaceHeader>
                          <SurfaceDescription>
                            よく使う例をそのままコピーして調整できます。
                          </SurfaceDescription>
                        </SurfaceHeader>
                        <SurfaceBody>
                          {NG_DSL_EXAMPLES.map((example) => (
                            <section
                              key={example.title}
                              className="settings-page__section-stack--nested"
                            >
                              <h3 className="settings-page__help-label">{example.title}</h3>
                              <SurfaceDescription>{example.description}</SurfaceDescription>
                              <NGDslHelpSnippet code={example.code} />
                            </section>
                          ))}
                        </SurfaceBody>
                      </Surface>
                    )}

                    <Button
                      className="settings-page__toggle"
                      variant="subtle"
                      aria-expanded={isNgAdvancedOpen}
                      onClick={() => setIsNgAdvancedOpen((prev) => !prev)}
                    >
                      <ChevronDown
                        size={16}
                        className={`settings-page__toggle-icon${
                          isNgAdvancedOpen ? " settings-page__toggle-icon--open" : ""
                        }`}
                        aria-hidden="true"
                      />
                      高度なNG設定
                    </Button>

                    {isNgAdvancedOpen && (
                      <div className="settings-page__section-stack--nested">
                        {renderSectionItems("ng", ngAdvancedSectionItems)}
                      </div>
                    )}
                  </div>
                ) : (
                  <div
                    role="tabpanel"
                    id={`rule-panel-${tabId}-replacement`}
                    aria-labelledby={`rule-tab-${tabId}-replacement`}
                    className="settings-page__section-stack--nested"
                  >
                    {renderSectionItems(
                      "ng",
                      activeSection.fields.filter(
                        (item) => isSettingsFieldItem(item) && item.key === "replace_str_txt",
                      ),
                    )}
                    <Button
                      className="settings-page__toggle"
                      variant="subtle"
                      aria-expanded={isReplacementExamplesOpen}
                      onClick={() => setIsReplacementExamplesOpen((prev) => !prev)}
                    >
                      <ChevronDown
                        size={16}
                        className={`settings-page__toggle-icon${isReplacementExamplesOpen ? " settings-page__toggle-icon--open" : ""}`}
                        aria-hidden="true"
                      />
                      置換記法例
                    </Button>
                    {isReplacementExamplesOpen && (
                      <Surface as="section" tone="muted" variant="flat">
                        <SurfaceHeader>
                          <SurfaceDescription>
                            よく使う例をそのままコピーして調整できます。
                          </SurfaceDescription>
                        </SurfaceHeader>
                        <SurfaceBody>
                          <h3 className="settings-page__help-label">基本・正規表現</h3>
                          <ReplacementDslHelpSnippet code={REPLACEMENT_DSL_EXAMPLE} />
                          <h3 className="settings-page__help-label">行削除・適用条件</h3>
                          <ReplacementDslHelpSnippet code={REPLACEMENT_LINE_EXAMPLE} />
                          <p className="ng-editor__help-note">
                            既定では大文字小文字を区別してすべて置換します。flags=i
                            は大小文字を無視して最初の一致、flags=gi はすべての一致を置換します。to
                            "" で空文字に置換できます。
                          </p>
                          <p className="ng-editor__help-note">
                            remove body line first は先頭行だけを判定し、first
                            を省略すると一致する行をすべて削除します。行端の空白と画像タグ、BEアイコンのsssp://表記を考慮します。削除した画像はサムネイルにも表示しません。
                          </p>
                        </SurfaceBody>
                      </Surface>
                    )}
                  </div>
                )}
              </div>
            )}

            {activeSection.id !== "display" && (
              <SettingsSupplementaryPanels
                panelIds={activeSection.supplementaryPanelIds}
                maintenanceActions={maintenanceActions}
              />
            )}
          </div>
        </div>
      </main>
    </div>
  );
};
