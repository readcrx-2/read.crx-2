import type { RefObject } from "react";
import { useEffect, useSyncExternalStore } from "react";
import {
  commandPalette,
  commandPaletteStore,
} from "src/view/browser/commands/command-palette-store";
import type { OmnibarInputMode } from "src/view/browser/hooks/use-omnibar";

interface UseCommandPaletteFocusParams {
  isActivePane: boolean;
  isUrlExpanded: boolean;
  setIsUrlExpanded: (expanded: boolean) => void;
  urlInputRef: RefObject<HTMLInputElement | null>;
  activate: (mode: OmnibarInputMode) => void;
  handleBlur: () => void;
  omnibarMode: OmnibarInputMode;
  isOmnibarOpen: boolean;
}

/**
 * コマンドパレットの開閉とURLバー(オムニバー)の展開・フォーカス・ブラー連動をまとめる。
 * パレットの状態を返し、呼び出し側はフォーカスアウト時の判定に使う。
 */
export function useCommandPaletteFocus({
  isActivePane,
  isUrlExpanded,
  setIsUrlExpanded,
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

    setIsUrlExpanded(true);
    activate(paletteState.mode);
  }, [activate, isActivePane, paletteState.mode, paletteState.opened, setIsUrlExpanded]);

  useEffect(() => {
    if (!paletteState.opened || !isActivePane || !isUrlExpanded) {
      return;
    }

    urlInputRef.current?.focus();
  }, [isActivePane, isUrlExpanded, paletteState.opened, urlInputRef]);

  useEffect(() => {
    if (!isUrlExpanded || paletteState.opened || !isActivePane) {
      return;
    }

    // 変更理由: URLバーを展開した直後に入力欄へ操作を引き継ぎ、候補取得を開始して
    // 下矢印のクリックだけで検索操作へ移れるようにする。
    urlInputRef.current?.focus();
  }, [isActivePane, isUrlExpanded, paletteState.opened, urlInputRef]);

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
