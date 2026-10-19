import { validateRuleDsl } from "@chlen/chlib";
import {
  Archive,
  Bug,
  Eye,
  Globe2,
  MessageCircle,
  RefreshCw,
  Settings,
  ShieldAlert,
} from "lucide-react";
import { DEFAULT_CONFIG } from "src/app/config-defaults";
import { isTauriRuntime } from "src/app/platform/runtime";
import { container } from "src/service-container/index";
import {
  buildFieldSchema,
  buildUiSchema,
} from "src/view/browser/pages/settings/settings-form-registry";
import type {
  SettingsDividerItem,
  SettingsFieldDefinition,
  SettingsFieldGroup,
  SettingsFormState,
  SettingsFormValue,
  SettingsOption,
  SettingsRelatedSection,
  SettingsSectionDefinition,
  SettingsSectionFormData,
  SettingsSectionGroup,
  SettingsSectionGroupId,
  SettingsSectionItem,
  SettingsSupplementaryPanelId,
} from "src/view/browser/pages/settings/settings-types";
import {
  isSettingsDividerItem,
  isSettingsFieldItem,
} from "src/view/browser/pages/settings/settings-types";
import type { SettingsSectionId } from "src/view/browser/types";
import {
  NG_DISPLAY_CONFIG_KEY,
  NG_DISPLAY_MODE_OPTIONS,
  normalizeNgDisplayMode,
} from "src/view/browser/utils/ng-display-mode";

const THEME_ID_OPTIONS = [
  { const: "system", title: "OSに合わせる" },
  { const: "light", title: "ライト" },
  { const: "dark", title: "ダーク" },
] as const satisfies readonly SettingsOption[];

const NEW_TAB_PAGE_MODE_OPTIONS = [
  // 初期ページの設定値は維持し、統一した入口の名前を表示する。
  { const: "home", title: "ホーム" },
  { const: "related_board", title: "関連する板" },
  { const: "custom_board", title: "指定の板" },
] as const satisfies readonly SettingsOption[];

const TAB_BAR_ORIENTATION_OPTIONS = [
  { const: "horizontal", title: "水平（上部）" },
  { const: "vertical", title: "垂直（左端）" },
] as const satisfies readonly SettingsOption[];

const HOW_TO_JUDGMENT_ID_OPTIONS = [
  { const: "first_res", title: "1レス目に存在する場合" },
  { const: "exists_once", title: "1つでも存在する場合" },
] as const satisfies readonly SettingsOption[];

// 値は packages/chlib の HttpsMode と同じ。表示名は利用者に依頼された呼び方に合わせる。
const HTTPS_MODE_OPTIONS = [
  { const: "https_only", title: "HTTPS only" },
  { const: "https_first", title: "HTTPS優先" },
  { const: "auto", title: "自動" },
] as const satisfies readonly SettingsOption[];

const AUTO_NEXT_THREAD_MODE_OPTIONS = [
  { const: "balanced", title: "標準（精度と追従性のバランス）" },
  { const: "aggressive", title: "積極（スレタイ変化を広く許容）" },
] as const satisfies readonly SettingsOption[];

export const NG_PRIMARY_FIELD_KEYS = new Set(["ngwords"]);

function defineSection(
  id: SettingsSectionId,
  title: string,
  description: string,
  icon: React.ReactNode,
  fields: readonly SettingsSectionItem[],
  options?: {
    supplementaryPanelIds?: readonly SettingsSupplementaryPanelId[];
    relatedSection?: SettingsRelatedSection;
  },
): SettingsSectionDefinition {
  const fieldItems = fields.filter(isSettingsFieldItem);

  // 変更理由: セクション定義を data 中心に寄せると、
  // 設定項目の追加・移動時に巨大 JSX を触らずに済む。
  return {
    id,
    title,
    description,
    icon,
    fields,
    schema: {
      type: "object",
      properties: Object.fromEntries(
        fieldItems.map((field) => [field.key, buildFieldSchema(field)]),
      ),
      additionalProperties: false,
    },
    uiSchema: buildUiSchema(fieldItems),
    supplementaryPanelIds: options?.supplementaryPanelIds,
    relatedSection: options?.relatedSection,
  };
}

const ALL_SETTINGS_SECTIONS = [
  defineSection(
    "general",
    "一般",
    "新しいタブで開くページや、タブバーの配置、通信の方法を設定します。",
    <Settings size={20} />,
    [
      {
        kind: "divider",
        id: "new-tab",
        title: "タブ",
      },
      {
        kind: "string",
        key: "new_tab_page_mode",
        title: "新しいタブで開くページ",
        options: NEW_TAB_PAGE_MODE_OPTIONS,
        widget: "segmented",
      },
      {
        kind: "boolean",
        key: "focus_new_tab_on_open",
        title: "外部ページから開いたときに新しいタブをフォーカスする",
        description:
          "外部ページの「chlens で開く」からスレを開いたとき、新しいタブをアクティブにします。",
      },
      {
        kind: "string",
        key: "new_tab_page_board_url",
        title: "指定の板 URL",
        description:
          "『指定の板』を選んだ時に開く板URLです（例: https://example.com/test/read.cgi/software/）。",
      },
      {
        kind: "divider",
        id: "tab-bar",
        title: "タブバー",
      },
      {
        kind: "string",
        key: "tab_bar_orientation",
        title: "タブバーの配置",
        description: "タブ一覧を上部の横並びと左端の縦並びで切り替えます。",
        options: TAB_BAR_ORIENTATION_OPTIONS,
        widget: "segmented",
      },
      {
        kind: "boolean",
        key: "tab_bar_collapsed",
        title: "垂直タブバーを簡易表示にする",
        description: "タイトルを隠してアイコンのみの細幅で表示します。",
      },
      {
        kind: "divider",
        id: "network",
        title: "通信",
      },
      {
        kind: "string",
        key: "https_mode",
        title: "HTTPSへの切り替え",
        description:
          "HTTPのURLを読み込むときの扱いです。HTTPS onlyはHTTPSだけで接続し、HTTPS非対応の板は読めません。HTTPS優先はHTTPSで接続できないときだけHTTPで接続します。自動はURLのとおりに接続します。",
        options: HTTPS_MODE_OPTIONS,
        widget: "radio",
      },
      // 変更理由: 書き込み設定は書き込みパネルの歯車モーダルに集約し、
      // 全体設定画面で同じ項目を重複表示しない。
      // {
      //   kind: "divider",
      //   id: "network",
      //   title: "通信",
      // },
      // {
      //   kind: "string",
      //   key: "format_2chnet",
      //   title: "2chnetの取得形式",
      //   options: FORMAT_2CH_OPTIONS,
      //   widget: "radio",
      // },
    ],
  ),
  // 変更理由: 一般とサムネイルに分かれていた見た目の設定をまとめ、探しやすくする。
  // タブバーはタブの操作と一緒に探されるため、一般へ置く。
  defineSection(
    "display",
    "表示",
    "テーマやタイトルバー、サムネイルなど画面の見た目を調整します。",
    <Eye size={20} />,
    [
      {
        kind: "divider",
        id: "appearance",
        title: "外観",
      },
      {
        kind: "string",
        key: "theme_id",
        title: "テーマ",
        options: THEME_ID_OPTIONS,
        widget: "segmented",
      },
      {
        kind: "divider",
        id: "thumbnails",
        title: "サムネイル",
      },
      {
        kind: "boolean",
        key: "image_blur",
        title: "画像にぼかしを適用する",
      },
      {
        kind: "string",
        key: "image_blur_word",
        title: "ぼかし判定ワード",
        description: "正規表現で指定します。",
      },
    ],
    {
      supplementaryPanelIds: ["titleBarButtonSettings"],
    },
  ),
  defineSection(
    "reload",
    "自動更新・次スレ",
    "次スレ追従と、更新後のスクロール挙動を調整します。",
    <RefreshCw size={20} />,
    [
      {
        kind: "divider",
        id: "auto-scroll",
        title: "自動スクロール",
      },
      {
        kind: "boolean",
        key: "pause_auto_scroll_on_popup",
        title: "ポップアップ表示中は自動スクロールを一時停止する",
        description: "OFFにすると、レスポップアップなどを表示している間も新着レスへ追従します。",
      },
      {
        kind: "divider",
        id: "auto-next-thread",
        title: "自動次スレ移動",
      },
      {
        kind: "boolean",
        key: "auto_next_thread",
        title: "1000到達後に次スレへ自動移動する",
        description:
          "3秒ごとに設定した時間だけ探索します。1000未満でdat落ちした場合は停止し、標準・積極では移動後も本流候補を短時間だけ監視します。",
      },
      {
        // 探索時間を明示し、次スレ未作成時にsubjectの確認をいつ終了するか利用者が選べるようにする。
        kind: "number",
        key: "next_thread_search_duration",
        title: "次スレ検索時間（秒）",
        description: "時間内に候補が見つからない場合は自動更新も停止します。",
        minimum: 60,
        maximum: 600,
        step: 1,
      },
      {
        kind: "string",
        key: "auto_next_thread_mode",
        title: "次スレ判定",
        description:
          "標準は精度と追従性のバランスを取り、積極はスレタイの変化を広く許容します。どちらも別板や古いスレには移動しません。",
        options: AUTO_NEXT_THREAD_MODE_OPTIONS,
        widget: "radio",
      },
    ],
    {
      // 変更理由: 更新間隔は板ごとに上書きするため「板ごとの設定」に置いている。
      // 名前から探してここへ来た利用者が迷わないよう、置き場所へ案内する。
      relatedSection: {
        id: "site-board",
        description: "自動更新の間隔は、ドメインや板ごとに設定します。",
        label: "板の設定を開く",
      },
    },
  ),
  defineSection(
    "ng",
    "NG",
    "レスやスレッドのNGルールと、表示する文字列の置換を設定します。",
    <ShieldAlert size={20} />,
    [
      {
        kind: "string",
        key: "ngwords",
        title: "NGルール",
        description:
          "「hide:」などの動作の下にwhen/unless条件を書きます。一覧はOR、複数の条件はANDです。書き方は下の「NG記法例」を参照してください。",
        widget: "ng_editor",
      },
      {
        kind: "string",
        key: "replace_str_txt",
        title: "置換ルール",
        description:
          "名前・メール・日付欄・本文の文字列を置換したり、不要な行を削除します。保存後に読み込むレスへ適用します。",
        widget: "replacement_editor",
      },
      {
        kind: "divider",
        id: "chain",
        title: "連鎖NG",
      },
      {
        kind: "boolean",
        key: "chain_ng",
        title: "NGレスへの返信を連鎖NGにする",
      },
      {
        kind: "divider",
        id: "display",
        title: "表示",
      },
      {
        kind: "string",
        key: NG_DISPLAY_CONFIG_KEY,
        title: "NGレスの表示方式",
        description:
          "完全非表示、クリックで一時表示、表示したまま強調する方式を選べます。一時的なNG解除はこの設定とは独立して動作します。",
        options: NG_DISPLAY_MODE_OPTIONS,
        widget: "radio",
      },
      {
        kind: "divider",
        id: "judgement",
        title: "判定基準",
      },
      {
        kind: "boolean",
        key: "use_siki_guard",
        title: "しきい値ガードを有効にする（非推奨）",
        description:
          "現在のコードでは参照されず、切り替えても動作に影響しません。保存済み設定との互換性のため表示のみ残しています。",
        deprecated: true,
      },
      {
        kind: "boolean",
        key: "nothing_id_ng",
        title: "IDありスレのIDなしレスをNGにする",
      },
      {
        kind: "boolean",
        key: "nothing_slip_ng",
        title: "SLIPありスレのSLIPなしレスをNGにする",
      },
      {
        kind: "string",
        key: "how_to_judgment_id",
        title: "ID / SLIP 判定方法",
        options: HOW_TO_JUDGMENT_ID_OPTIONS,
        widget: "radio",
      },
    ],
  ),
  defineSection(
    "overlay",
    "実況",
    "Tauri版のコメント流し表示を調整します。最前面表示と分裂スレ取得は変更時に反映します。",
    <MessageCircle size={20} />,
    [
      {
        kind: "divider",
        id: "display",
        title: "表示",
      },
      {
        kind: "boolean",
        key: "comment_overlay_always_on_top",
        title: "常に最前面に表示する",
        description: "ほかのアプリより手前にコメントOverlayを表示します。",
      },
      {
        kind: "boolean",
        key: "comment_overlay_fetch_all_threads",
        title: "分裂スレを本流判定中はすべて取得する",
        description:
          "コメントOverlay限定で同じ番組の候補スレを並行取得し、本流が決まった後に非本流の待機コメントを除外します。",
      },
    ],
  ),
  // 変更理由: ドメイン共通から各板への継承は通常の全体設定フォームとは異なるため、
  // 専用パネルへ閉じ込めて項目追加時のフォーム分岐を増やさない。
  // 必要な板だけを上書きする応用設定なので、よく使う閲覧の設定より後ろに置く。
  // BBSMENUは下の板の候補にもなるため、「その他」から移して同じカテゴリの先頭に置く。
  defineSection(
    "site-board",
    "板",
    "板一覧の取得元と、自動更新の間隔や書き込みの既定値をドメイン共通・板ごとに設定します。",
    <Globe2 size={20} />,
    [
      {
        kind: "string",
        key: "bbsmenu",
        title: "bbsmenu の URL",
        description: "1行に1つ指定します。",
        widget: "textarea",
        rows: 6,
      },
    ],
    {
      supplementaryPanelIds: ["siteBoardSettings"],
    },
  ),
  defineSection(
    "data",
    "データ",
    "設定・履歴のエクスポート / インポート、ブックマークの保存先、設定の初期化を扱います。",
    <Archive size={20} />,
    [],
    {
      // 変更理由: ブックマークの保存先と設定の初期化もデータの扱いなので、「その他」から移して探しやすくする。
      supplementaryPanelIds: ["dataManagement", "externalIntegration", "dangerZone"],
    },
  ),
  defineSection(
    "debug",
    "デバッグ",
    "詳細ログの出力を設定します。",
    <Bug size={20} />,
    [
      {
        kind: "boolean",
        key: "debug_log",
        title: "ログを有効にする",
        description: "ONで詳細ログを出力します。",
      },
    ],
    {
      supplementaryPanelIds: ["debugLog"],
    },
  ),
] as const satisfies readonly SettingsSectionDefinition[];

/** Browser版へTauri専用の設定項目を露出させないため、環境判定を一覧生成へ閉じ込める。 */
export function getSettingsSections(isTauri: boolean): readonly SettingsSectionDefinition[] {
  return ALL_SETTINGS_SECTIONS.filter((section) => section.id !== "overlay" || isTauri);
}

export const SETTINGS_SECTIONS = getSettingsSections(isTauriRuntime());

// 変更理由: カテゴリが増えて一覧が単調な縦並びになったため、Obsidian や Discord の設定画面のように
// 見出しで用途ごとにまとめる。全カテゴリの所属を型で強制し、追加時にグループの付け忘れを防ぐ。
const SETTINGS_SECTION_GROUP_OF = {
  general: "app",
  display: "app",
  "site-board": "browsing",
  reload: "browsing",
  overlay: "browsing",
  ng: "browsing",
  data: "manage",
  debug: "manage",
} as const satisfies Record<SettingsSectionId, SettingsSectionGroupId>;

const SETTINGS_SECTION_GROUP_TITLES = [
  // 「アプリ」では「閲覧」と役割の違いが伝わらないため、最初に見る基本の設定として示す。
  { id: "app", title: "基本" },
  { id: "browsing", title: "閲覧" },
  { id: "manage", title: "管理" },
] as const satisfies readonly { id: SettingsSectionGroupId; title: string }[];

/** カテゴリを見出しごとにまとめる。表示するカテゴリが1つもない見出しは出さない。 */
export function groupSettingsSections(
  sections: readonly SettingsSectionDefinition[],
): readonly SettingsSectionGroup[] {
  return SETTINGS_SECTION_GROUP_TITLES.map((group) => ({
    ...group,
    sections: sections.filter((section) => SETTINGS_SECTION_GROUP_OF[section.id] === group.id),
  })).filter((group) => group.sections.length > 0);
}

export const SETTINGS_SECTION_GROUPS = groupSettingsSections(SETTINGS_SECTIONS);

export const SETTINGS_SECTION_MAP = new Map<SettingsSectionId, SettingsSectionDefinition>(
  SETTINGS_SECTIONS.map((section) => [section.id, section]),
);

export function isSettingsSectionId(value: string): value is SettingsSectionId {
  return SETTINGS_SECTION_MAP.has(value as SettingsSectionId);
}

function readFieldValue(field: SettingsFieldDefinition): SettingsFormValue {
  const rawValue = container.config.get(field.key);
  switch (field.kind) {
    case "boolean":
      return rawValue === "on";
    case "number": {
      const parsed = Number(rawValue ?? 0);
      return Number.isFinite(parsed) ? parsed : 0;
    }
    case "string":
      // 変更理由: 未設定時でもラジオ選択が空表示にならないよう、
      // 新規タブ初期ページは実挙動と同じ既定値をUIにも反映する。
      if (field.key === "new_tab_page_mode") {
        return typeof rawValue === "string" && rawValue !== ""
          ? rawValue
          : DEFAULT_CONFIG.new_tab_page_mode;
      }
      if (field.key === NG_DISPLAY_CONFIG_KEY) {
        return normalizeNgDisplayMode(rawValue);
      }
      if (field.key === "auto_next_thread_mode") {
        // 変更理由: 慎重モードを選択肢から外したため、既存値は標準へ読み替える。
        return rawValue === "aggressive" ? "aggressive" : DEFAULT_CONFIG.auto_next_thread_mode;
      }
      return typeof rawValue === "string" ? rawValue : "";
  }
}

function writeFieldValue(field: SettingsFieldDefinition, value: SettingsFormValue): string {
  switch (field.kind) {
    case "boolean":
      return value ? "on" : "off";
    case "number":
      return String(typeof value === "number" && Number.isFinite(value) ? value : 0);
    case "string":
      if (field.key === NG_DISPLAY_CONFIG_KEY) {
        return normalizeNgDisplayMode(typeof value === "string" ? value : undefined);
      }
      return typeof value === "string" ? value : "";
  }
}

function readSectionFormData(section: SettingsSectionDefinition): SettingsSectionFormData {
  return Object.fromEntries(
    section.fields.filter(isSettingsFieldItem).map((field) => [field.key, readFieldValue(field)]),
  );
}

export function readAllSettings(): SettingsFormState {
  return Object.fromEntries(
    SETTINGS_SECTIONS.map((section) => [section.id, readSectionFormData(section)]),
  ) as SettingsFormState;
}

export async function saveSectionFormData(
  section: SettingsSectionDefinition,
  formData: SettingsSectionFormData,
): Promise<void> {
  if (typeof formData.ngwords === "string") {
    const parsed = validateRuleDsl(formData.ngwords);
    if (parsed.diagnostics.length > 0)
      throw new Error(
        parsed.diagnostics
          .map(({ line, column, message }) => `${line}行${column}列: ${message}`)
          .join("\n"),
      );
  }
  // 置換設定は通常のconfig.setを通す前に検証し、不正な文字列を永続化しない。
  if (section.fields.some((field) => "key" in field && field.key === "replace_str_txt")) {
    const result = await container.replaceStr.set(String(formData.replace_str_txt ?? ""));
    if (result.diagnostics.length > 0) {
      throw new Error(
        result.diagnostics
          .map((diagnostic) => `${diagnostic.line}行${diagnostic.column}列: ${diagnostic.message}`)
          .join("\n"),
      );
    }
  }
  await Promise.all(
    section.fields
      .filter(isSettingsFieldItem)
      .filter((field) => field.key !== "replace_str_txt")
      .map((field) =>
        Promise.resolve(
          container.config.set(field.key, writeFieldValue(field, formData[field.key])),
        ),
      ),
  );
  // config.setによる判定キャッシュの更新後に通知し、開いた一覧・レスにも編集結果を反映する。
  if (section.id === "ng") container.message.send("ng_changed");
}

export function readBBSMenuUrlsForCheck(raw: string): string[] {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("//"));
}

/**
 * 区切りごとに項目をまとめる。最初の区切りより前の項目は見出しなしの組にし、
 * 項目のない区切りも見出しとして残す（説明だけを示す区切りがあるため）。
 */
export function groupSectionItems(items: readonly SettingsSectionItem[]): SettingsFieldGroup[] {
  const groups: { divider?: SettingsDividerItem; fields: SettingsFieldDefinition[] }[] = [];
  for (const item of items) {
    if (isSettingsDividerItem(item)) {
      groups.push({ divider: item, fields: [] });
      continue;
    }
    const current = groups.at(-1);
    if (current) {
      current.fields.push(item);
    } else {
      groups.push({ fields: [item] });
    }
  }
  return groups;
}
