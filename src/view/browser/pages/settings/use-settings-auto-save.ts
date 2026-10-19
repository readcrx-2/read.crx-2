import { parseReplacementDsl, validateRuleDsl } from "@chlen/chlib";
import { useCallback, useRef, useState } from "react";
import { container } from "src/service-container/index";
import {
  saveSectionFormData,
  SETTINGS_SECTION_MAP,
} from "src/view/browser/pages/settings/settings-sections";
import type { SettingsSectionFormData } from "src/view/browser/pages/settings/settings-types";
import type { SettingsSectionId } from "src/view/browser/types";

/** 設定フォームの変更を、変更と同時に保存し、保存中の項目と失敗結果を保持する。 */
export function useSettingsAutoSave() {
  const [savingSectionId, setSavingSectionId] = useState<SettingsSectionId | null>(null);
  const [autoSaveError, setAutoSaveError] = useState<string | null>(null);
  const saveAttemptRef = useRef(0);

  const scheduleAutoSave = useCallback(
    (sectionId: SettingsSectionId, sectionFormData: SettingsSectionFormData) => {
      const section = SETTINGS_SECTION_MAP.get(sectionId);
      if (!section) {
        return;
      }

      // 新しい編集が始まった時点で、前回の保存結果を古いものとして扱う。
      // 保存中に次の入力が入った場合、古い失敗結果が修正後の画面へ戻らないようにする。
      const attemptId = ++saveAttemptRef.current;
      setAutoSaveError(null);

      // 入力途中の構文エラーはエディタ内に表示し、自動保存失敗の通知を繰り返さない。
      if (
        typeof sectionFormData.replace_str_txt === "string" &&
        parseReplacementDsl(sectionFormData.replace_str_txt).diagnostics.length > 0
      ) {
        setSavingSectionId(null);
        return;
      }

      if (
        typeof sectionFormData.ngwords === "string" &&
        validateRuleDsl(sectionFormData.ngwords).diagnostics.length > 0
      ) {
        setSavingSectionId(null);
        return;
      }

      setSavingSectionId(sectionId);

      void (async () => {
        try {
          await saveSectionFormData(section, sectionFormData);
          if (attemptId === saveAttemptRef.current) {
            setAutoSaveError(null);
          }
        } catch (saveError) {
          if (attemptId !== saveAttemptRef.current) {
            return;
          }
          const message =
            saveError instanceof Error ? saveError.message : "設定の自動保存に失敗しました";
          setAutoSaveError(message);
          container.toast.error(message);
        } finally {
          if (attemptId === saveAttemptRef.current) {
            setSavingSectionId((prev) => (prev === sectionId ? null : prev));
          }
        }
      })();
    },
    [],
  );

  return { savingSectionId, autoSaveError, setAutoSaveError, scheduleAutoSave };
}
