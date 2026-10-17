import {
  type Dispatch,
  type FocusEvent,
  type KeyboardEvent,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { createLogger } from "src/app/logger";
import type { ResolvedBrowserCommand } from "src/view/browser/commands/browser-commands";
import { filterAndSortBrowserCommands } from "src/view/browser/commands/command-search";
import {
  buildOmnibarSuggestions,
  type OmnibarMergedEntry,
  type OmnibarSuggestion,
} from "src/view/browser/utils/omnibar";

const logger = createLogger("view/browser");

export type OmnibarInputMode = "navigation" | "command";

interface UseOmnibarOptions {
  displayUrl: string;
  maxSuggestions: number;
  loadEntries: () => Promise<OmnibarMergedEntry[]>;
  onSelectSuggestion: (suggestion: OmnibarSuggestion) => void;
  onSubmitInput: (inputValue: string) => void;
  commands?: readonly ResolvedBrowserCommand[];
  recentCommandIds?: readonly string[];
  onSelectCommand?: (command: ResolvedBrowserCommand) => void;
  getDirectInputSuggestion?: (
    inputValue: string,
    displayUrl: string,
  ) => OmnibarSuggestion | OmnibarSuggestion[] | null;
}

interface UseOmnibarResult {
  inputValue: string;
  mode: OmnibarInputMode;
  isOpen: boolean;
  isLoading: boolean;
  suggestions: OmnibarSuggestion[];
  commandSuggestions: ResolvedBrowserCommand[];
  shouldShowNoMatch: boolean;
  activeSuggestionIndex: number;
  setActiveSuggestionIndex: Dispatch<SetStateAction<number>>;
  activate: (mode: OmnibarInputMode) => void;
  handleInputChange: (value: string) => void;
  handleKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
  handleFocus: (e: FocusEvent<HTMLInputElement>) => void;
  handleBlur: () => void;
  handleSelectSuggestion: (suggestion: OmnibarSuggestion) => void;
}

export function useOmnibar({
  displayUrl,
  maxSuggestions,
  loadEntries,
  onSelectSuggestion,
  onSubmitInput,
  commands = [],
  recentCommandIds = [],
  onSelectCommand = () => undefined,
  getDirectInputSuggestion,
}: UseOmnibarOptions): UseOmnibarResult {
  const [inputValue, setInputValue] = useState(displayUrl);
  const [isFocused, setIsFocused] = useState(false);
  const [omnibarEntries, setOmnibarEntries] = useState<OmnibarMergedEntry[]>([]);
  const [isOmnibarLoaded, setIsOmnibarLoaded] = useState(false);
  const [isOmnibarLoading, setIsOmnibarLoading] = useState(false);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(0);
  const mode: OmnibarInputMode = inputValue.startsWith(">") ? "command" : "navigation";

  useEffect(() => {
    if (!isFocused) {
      setInputValue(displayUrl);
    }
  }, [displayUrl, isFocused]);

  useEffect(() => {
    // 変更理由: コマンドモードでは履歴ソースを待たずに候補を表示し、
    // 「>」入力直後の操作感を保つ。ナビゲーションへ戻った時だけ遅延ロードする。
    if (!isFocused || mode === "command" || isOmnibarLoaded) {
      return;
    }

    setIsOmnibarLoading(true);

    let cancelled = false;
    void loadEntries()
      .then((entries) => {
        if (cancelled) {
          return;
        }
        setOmnibarEntries(entries);
        setIsOmnibarLoaded(true);
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        // 変更理由: 候補取得に失敗してもURLの直接入力は継続できるようにしつつ、
        // 履歴・お気に入りが消えた原因はログから追跡できるようにする。
        logger.error("Failed to load omnibar entries", { error });
        setOmnibarEntries([]);
        setIsOmnibarLoaded(true);
      })
      .finally(() => {
        if (!cancelled) {
          setIsOmnibarLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isFocused, isOmnibarLoaded, loadEntries, mode]);

  useEffect(() => {
    if (mode === "command" && isOmnibarLoading) {
      // 変更理由: 履歴取得中に「>」へ切り替えても、古いナビゲーション用spinnerで
      // コマンド候補を隠さず、入力モードの切り替えを即時に反映する。
      setIsOmnibarLoading(false);
    }
  }, [isOmnibarLoading, mode]);

  const navigationSuggestions = useMemo(
    () => buildOmnibarSuggestions(omnibarEntries, inputValue, maxSuggestions),
    [inputValue, maxSuggestions, omnibarEntries],
  );

  const directInputSuggestions = useMemo(() => {
    if (mode !== "navigation") {
      return [];
    }

    const result = getDirectInputSuggestion?.(inputValue, displayUrl) ?? null;
    if (!result) {
      return [];
    }

    return Array.isArray(result) ? result : [result];
  }, [displayUrl, getDirectInputSuggestion, inputValue, mode]);

  const suggestions = useMemo(() => {
    if (directInputSuggestions.length === 0) {
      return navigationSuggestions;
    }

    // 変更理由: 同一URLの履歴候補があるとき通常の「URLを開く」は重複のため隠すが、
    // 「新しいタブで開く」は明示的な別タブ要求なので残し、直入力の選択肢を保つ。
    const filteredDirect = directInputSuggestions.filter((direct) => {
      if (direct.openInNewTab) {
        return true;
      }

      return !navigationSuggestions.some(
        (suggestion) => suggestion.url.trim() === direct.url.trim(),
      );
    });

    if (filteredDirect.length === 0) {
      return navigationSuggestions;
    }

    // URLとして認識できた入力は、履歴候補と同じリスト内に「URLを開く」操作として置く。
    return [...filteredDirect, ...navigationSuggestions].slice(0, maxSuggestions);
  }, [directInputSuggestions, maxSuggestions, navigationSuggestions]);

  const commandSuggestions = useMemo(
    () =>
      mode === "command"
        ? filterAndSortBrowserCommands(commands, inputValue.slice(1), recentCommandIds)
        : [],
    [commands, inputValue, mode, recentCommandIds],
  );

  const activeSuggestionCount = mode === "command" ? commandSuggestions.length : suggestions.length;

  useEffect(() => {
    if (activeSuggestionIndex >= activeSuggestionCount) {
      setActiveSuggestionIndex(0);
      return;
    }

    if (mode === "command" && !commandSuggestions[activeSuggestionIndex]?.enabled) {
      const firstEnabled = commandSuggestions.findIndex((command) => command.enabled);
      setActiveSuggestionIndex(firstEnabled >= 0 ? firstEnabled : 0);
    }
  }, [activeSuggestionCount, activeSuggestionIndex, commandSuggestions, mode]);

  const shouldShowNoMatch =
    isFocused &&
    !isOmnibarLoading &&
    (mode === "command" ? inputValue.slice(1).trim().length > 0 : inputValue.trim().length > 0) &&
    activeSuggestionCount === 0;

  const isOpen = isFocused && (isOmnibarLoading || activeSuggestionCount > 0 || shouldShowNoMatch);

  const handleSelectSuggestion = useCallback(
    (suggestion: OmnibarSuggestion) => {
      onSelectSuggestion(suggestion);
      setInputValue(suggestion.url);
      setIsFocused(false);
      setActiveSuggestionIndex(0);
    },
    [onSelectSuggestion],
  );

  const handleSelectCommand = useCallback(
    (command: ResolvedBrowserCommand) => {
      if (!command.enabled) {
        return;
      }
      onSelectCommand(command);
      setInputValue(displayUrl);
      setIsFocused(false);
      setActiveSuggestionIndex(0);
    },
    [displayUrl, onSelectCommand],
  );

  const moveSelection = useCallback(
    (direction: 1 | -1) => {
      if (activeSuggestionCount === 0) {
        return;
      }

      const isSelectable = (index: number) =>
        mode !== "command" || commandSuggestions[index]?.enabled === true;
      let nextIndex = activeSuggestionIndex;

      for (let step = 0; step < activeSuggestionCount; step += 1) {
        nextIndex = (nextIndex + direction + activeSuggestionCount) % activeSuggestionCount;
        if (isSelectable(nextIndex)) {
          setActiveSuggestionIndex(nextIndex);
          return;
        }
      }
    },
    [activeSuggestionCount, activeSuggestionIndex, commandSuggestions, mode],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        moveSelection(1);
        return;
      }

      if (e.key === "ArrowUp") {
        e.preventDefault();
        moveSelection(-1);
        return;
      }

      if (e.key === "Enter") {
        if (mode === "command") {
          const selected = commandSuggestions[activeSuggestionIndex] ?? commandSuggestions[0];
          if (selected?.enabled) {
            e.preventDefault();
            handleSelectCommand(selected);
          }
          return;
        }

        const selected = suggestions[activeSuggestionIndex] ?? suggestions[0];
        if (selected) {
          e.preventDefault();
          handleSelectSuggestion(selected);
          return;
        }

        onSubmitInput(inputValue);
        e.currentTarget.blur();
        return;
      }

      if (e.key === "Escape") {
        setIsFocused(false);
        setInputValue(displayUrl);
        setActiveSuggestionIndex(0);
        e.currentTarget.blur();
      }
    },
    [
      activeSuggestionIndex,
      commandSuggestions,
      displayUrl,
      handleSelectCommand,
      handleSelectSuggestion,
      inputValue,
      mode,
      moveSelection,
      onSubmitInput,
      suggestions,
    ],
  );

  const activate = useCallback(
    (nextMode: OmnibarInputMode) => {
      setInputValue(nextMode === "command" ? ">" : displayUrl);
      setIsFocused(true);
      setActiveSuggestionIndex(0);
    },
    [displayUrl],
  );

  const handleFocus = useCallback((e: FocusEvent<HTMLInputElement>) => {
    setIsFocused(true);
    setActiveSuggestionIndex(0);
    if (e.target.value.startsWith(">")) {
      // コマンドprefixを選択範囲に含めると、入力開始時にprefixまで消えるため末尾へ置く。
      e.target.setSelectionRange(e.target.value.length, e.target.value.length);
    } else {
      // Chrome風: フォーカス時に全選択
      e.target.select();
    }
  }, []);

  const handleBlur = useCallback(() => {
    setIsFocused(false);
    setActiveSuggestionIndex(0);
    setInputValue(displayUrl);
  }, [displayUrl]);

  const handleInputChange = useCallback((value: string) => {
    setInputValue(value);
    setActiveSuggestionIndex(0);
  }, []);

  return {
    inputValue,
    mode,
    isOpen,
    isLoading: isOmnibarLoading,
    suggestions,
    commandSuggestions,
    shouldShowNoMatch,
    activeSuggestionIndex,
    setActiveSuggestionIndex,
    activate,
    handleInputChange,
    handleKeyDown,
    handleFocus,
    handleBlur,
    handleSelectSuggestion,
  };
}
