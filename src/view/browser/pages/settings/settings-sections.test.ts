// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { saveConfig, sendMessage } = vi.hoisted(() => ({
  saveConfig: vi.fn(),
  sendMessage: vi.fn(),
}));

vi.mock("src/service-container/index", () => ({
  container: {
    // 置換ルールの解析と保存は、下の corePorts のモック（同じ container）を使う本物の実装で確かめる。
    replaceStr: {
      // モックの組み立て時ではなく呼び出し時に参照するため、静的 import の関数を使える。
      set: (value: string) => setReplacementDsl(value),
    },
    message: { send: sendMessage },
    config: {
      get: () => null,
      set: saveConfig,
    },
  },
}));

// core の処理が使うサービスは、上の service-container のモックと同じものを渡す。
vi.mock("src/core/ports/registry", async () => ({
  corePorts: (await import("src/service-container/index")).container,
}));

vi.mock("src/features/ng/ui/NGEditor", () => ({
  NGEditor: () => null,
}));

import {
  CONFIG_KEYS_EDITABLE_OUTSIDE_SETTINGS_FORM,
  CONFIG_KEYS_OUTSIDE_SETTINGS_FORM,
  DEFAULT_CONFIG,
} from "src/app/config-defaults";
import { set as setReplacementDsl } from "src/core/thread/ReplaceStrTxt";

import { getSettingsSections, readAllSettings, saveSectionFormData } from "./settings-sections";

describe("置換設定のフォーム保存", () => {
  beforeEach(() => saveConfig.mockClear());

  it("不正なDSLを永続化せず、位置付きのエラーを返す", async () => {
    const section = getSettingsSections(false).find((candidate) => candidate.id === "ng")!;
    await expect(
      saveSectionFormData(section, { replace_str_txt: 'replace body:\n  from "a"\n  to bare' }),
    ).rejects.toThrow("3行3列");
    expect(saveConfig).not.toHaveBeenCalled();
  });

  it("有効なDSLを文字列として一度だけ保存する", async () => {
    const section = getSettingsSections(false).find((candidate) => candidate.id === "ng")!;
    const source = 'replace body:\n  from "a"\n  to "b"';
    await saveSectionFormData(section, { replace_str_txt: source });
    expect(saveConfig.mock.calls.filter(([key]) => key === "replace_str_txt")).toEqual([
      ["replace_str_txt", source],
    ]);
  });
});

describe("NG設定の保存後の再判定通知", () => {
  beforeEach(() => {
    saveConfig.mockReset();
    sendMessage.mockClear();
  });

  it("全設定の保存が完了してから開いた画面へ変更を通知する", async () => {
    const section = getSettingsSections(false).find((candidate) => candidate.id === "ng")!;
    let finishSave!: () => void;
    const pending = new Promise<void>((resolve) => {
      finishSave = resolve;
    });
    saveConfig.mockImplementation((key) => (key === "ngwords" ? pending : undefined));
    const saving = saveSectionFormData(section, {
      ngwords: 'collapse:\n  when title contains "定期"',
      replace_str_txt: "",
    });
    await vi.waitFor(() =>
      expect(saveConfig).toHaveBeenCalledWith("ngwords", 'collapse:\n  when title contains "定期"'),
    );
    expect(sendMessage).not.toHaveBeenCalled();
    finishSave();
    await saving;
    expect(sendMessage).toHaveBeenCalledExactlyOnceWith("ng_changed");
  });

  it("保存に失敗した場合は変更を通知しない", async () => {
    const section = getSettingsSections(false).find((candidate) => candidate.id === "ng")!;
    saveConfig.mockRejectedValue(new Error("保存失敗"));
    await expect(
      saveSectionFormData(section, {
        ngwords: 'hide:\n  when body contains "宣伝"',
        replace_str_txt: "",
      }),
    ).rejects.toThrow("保存失敗");
    expect(sendMessage).not.toHaveBeenCalled();
  });
});

describe("設定セクションの実行環境フィルター", () => {
  it("設定画面に表示する全項目へ集約した既定値を用意する", () => {
    const fieldKeys = getSettingsSections(true).flatMap((section) =>
      section.fields.flatMap((field) => ("key" in field ? [field.key] : [])),
    );

    for (const key of fieldKeys) {
      expect(DEFAULT_CONFIG).toHaveProperty(key);
    }
  });

  it("通常フォームにない既定値を別一覧で明示し、分類漏れを防ぐ", () => {
    const formKeys = new Set(
      getSettingsSections(true).flatMap((section) =>
        section.fields.flatMap((field) => ("key" in field ? [field.key] : [])),
      ),
    );
    const outsideFormKeys = new Set<string>(CONFIG_KEYS_OUTSIDE_SETTINGS_FORM);
    const editableOutsideFormKeys = new Set<string>(CONFIG_KEYS_EDITABLE_OUTSIDE_SETTINGS_FORM);
    const unclassifiedKeys = Object.keys(DEFAULT_CONFIG).filter(
      (key) => !formKeys.has(key) && !editableOutsideFormKeys.has(key) && !outsideFormKeys.has(key),
    );
    const incorrectlyClassifiedKeys = CONFIG_KEYS_OUTSIDE_SETTINGS_FORM.filter(
      (key) =>
        formKeys.has(key) ||
        editableOutsideFormKeys.has(key) ||
        !Object.prototype.hasOwnProperty.call(DEFAULT_CONFIG, key),
    );

    expect(unclassifiedKeys).toEqual([]);
    expect(incorrectlyClassifiedKeys).toEqual([]);
  });

  it("未使用のしきい値ガード設定を非推奨・編集不可として示す", () => {
    const section = getSettingsSections(false).find((candidate) => candidate.id === "ng");
    const field = section?.fields.find(
      (candidate) => "key" in candidate && candidate.key === "use_siki_guard",
    );

    expect(field).toMatchObject({
      deprecated: true,
      title: "しきい値ガードを有効にする（非推奨）",
    });
    expect(section?.schema.properties?.use_siki_guard).toMatchObject({ readOnly: true });
    expect(section?.uiSchema.use_siki_guard).toMatchObject({ "ui:disabled": true });
  });

  it("Browser版ではTauri専用のOverlay設定を表示しない", () => {
    const sections = getSettingsSections(false);

    expect(sections.some((section) => section.id === "overlay")).toBe(false);
  });

  it("Tauri版ではOverlay設定と4項目を表示する", () => {
    const sections = getSettingsSections(true);
    const overlay = sections.find((section) => section.id === "overlay");

    expect(overlay).toBeDefined();
    expect(overlay?.fields.map((field) => ("key" in field ? field.key : field.id))).toEqual([
      "display",
      "comment_overlay_speed",
      "comment_overlay_opacity",
      "comment_overlay_max_queue",
      "comment_overlay_fetch_all_threads",
    ]);
  });

  it("NG表示方式に3つの選択肢を用意し、旧既定値をhard-ngへ読み替える", () => {
    const ng = getSettingsSections(false).find((section) => section.id === "ng");
    const displayField = ng?.fields.find((field) => "key" in field && field.key === "display_ng");

    expect(displayField).toMatchObject({
      kind: "string",
      widget: "radio",
      options: [{ const: "hard-ng" }, { const: "soft-ng" }, { const: "highlight-ng" }],
    });
    expect(readAllSettings().ng.display_ng).toBe("hard-ng");
  });

  it("書き込み操作の設定を一般セクションへ表示しない", () => {
    const general = getSettingsSections(false).find((section) => section.id === "general");
    const keys = general?.fields.map((field) => ("key" in field ? field.key : field.id));

    expect(keys).not.toContain("write_submit_ctrl_enter");
    expect(keys).not.toContain("sage_flag");
    expect(keys).not.toContain("write_close_panel_after_submit");
    expect(keys).not.toContain("write_sanitize_urls_on_paste");
  });

  it("タイトルバーのボタン設定を表示セクションへまとめる", () => {
    const general = getSettingsSections(false).find((section) => section.id === "general");
    const display = getSettingsSections(false).find((section) => section.id === "display");
    const keys = display?.fields.map((field) => ("key" in field ? field.key : field.id));

    expect(general).toBeDefined();
    expect(general?.supplementaryPanelIds ?? []).not.toContain("titleBarButtonSettings");
    expect(display?.supplementaryPanelIds).toContain("titleBarButtonSettings");
    expect(keys).not.toContain("title_bar_back");
    expect(keys).not.toContain("title_bar_forward");
    expect(keys).not.toContain("title_bar_refresh");
  });
});
