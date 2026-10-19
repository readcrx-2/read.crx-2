import type { RefObject } from "react";
import { useEffect, useSyncExternalStore } from "react";
import {
  commandPalette,
  commandPaletteStore,
} from "src/view/browser/commands/command-palette-store";
import type { OmnibarInputMode } from "src/view/browser/hooks/use-omnibar";

interface UseCommandPaletteFocusParams {
  isActivePane: boolean;
  isUrlEditing: boolean;
  setIsUrlEditing: (editing: boolean) => void;
  urlInputRef: RefObject<HTMLInputElement | null>;
  activate: (mode: OmnibarInputMode) => void;
  handleBlur: () => void;
  omnibarMode: OmnibarInputMode;
  isOmnibarOpen: boolean;
}

/**
 * コマンドパレットの開閉とオムニバー(タイトルバーのURL入力)の編集開始・フォーカス・ブラー連動をまとめる。
 * パレットの状態を返し、呼び出し側はフォーカスアウト時の判定に使う。
 */
export function useCommandPaletteFocus({
  isActivePane,
  isUrlEditing,
  setIsUrlEditing,
  urlInputRef,
  activate,
  handleBlur,
  omnibarMode,
  isOmnibarOpen,
}: UseCommandPaletteFocusParams) {
  const paletteState = useSyncExternalStore(
    commandPaletteStore.subscribe,
    commandPaletteStore.getState,
    commandPaletteStore.getState,
  );

  useEffect(() => {
    if (!isActivePane) {
      return;
    }

    const handleShortcut = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) {
        return;
      }

      const key = event.key.toLowerCase();
      // Ctrl/Cmd+LはブラウザのURL入力に任せ、アプリはコマンドパレットのショートカットだけを扱う。
      if (event.shiftKey && key === "p") {
        event.preventDefault();
        if (paletteState.opened && paletteState.mode === "command") {
          commandPalette.close();
        } else {
          commandPalette.open("command");
        }
      }
    };

    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [isActivePane, paletteState.mode, paletteState.opened]);

  useEffect(() => {
    if (!paletteState.opened || !isActivePane) {
      return;
    }

    setIsUrlEditing(true);
    activate(paletteState.mode);
  }, [activate, isActivePane, paletteState.mode, paletteState.opened, setIsUrlEditing]);

  useEffect(() => {
    if (!paletteState.opened || !isActivePane || !isUrlEditing) {
      return;
    }

    // 変更理由: 入力欄はピルと入れ替わって現れるため、現れた直後に操作を引き継ぎ、
    // 候補取得を開始してそのまま入力できるようにする。
    urlInputRef.current?.focus();
  }, [isActivePane, isUrlEditing, paletteState.opened, urlInputRef]);

  useEffect(() => {
    const isCommandPaletteActive =
      paletteState.opened || (omnibarMode === "command" && isOmnibarOpen);
    if (!isActivePane || !isCommandPaletteActive) {
      return;
    }

    // 変更理由: OSや別ウィンドウへフォーカスが移ると入力欄のblurが発火しない環境があるため、
    // コマンドパレットが開いている間はウィンドウのフォーカスアウトでも状態を閉じる。
    const handleWindowBlur = () => {
      handleBlur();
      commandPalette.close();
    };
    window.addEventListener("blur", handleWindowBlur);
    return () => window.removeEventListener("blur", handleWindowBlur);
  }, [handleBlur, isActivePane, isOmnibarOpen, omnibarMode, paletteState.opened]);

  return paletteState;
}
