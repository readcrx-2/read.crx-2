import React, { useEffect, useRef } from "react";
import type { TopBarMode } from "src/view/browser/pages/thread/use-thread-top-bar";
import type { ThreadFilter, ThreadSearchTarget } from "src/view/browser/types";
import type { ThreadFilterCounts } from "src/view/browser/utils/thread-data-derived";

interface ThreadPageTopBarProps {
  activeTopBar: TopBarMode;
  filter: ThreadFilter;
  filterCounts: ThreadFilterCounts;
  onClose: () => void;
  onFilterChange: (filter: ThreadFilter) => void;
  onSearchTargetChange: (searchTarget: ThreadSearchTarget) => void;
  onSearchQueryChange: (query: string) => void;
  searchFocusKey: number;
  suppressInitialFocus?: boolean;
  searchQuery: string;
  searchTarget: ThreadSearchTarget;
}

// 変更理由: 「全て」ボタンを置かず、選択中の項目をもう一度押すと解除する切り替え式にする。
const FILTER_BUTTONS: { key: Exclude<ThreadFilter, "all">; label: string }[] = [
  { key: "popular", label: "人気" },
  { key: "image", label: "画像" },
  { key: "video", label: "動画" },
  { key: "link", label: "外部" },
];

const SEARCH_TARGETS: { key: ThreadSearchTarget; label: string }[] = [
  { key: "all", label: "すべて" },
  { key: "body", label: "本文" },
  { key: "name", label: "名前" },
  { key: "id", label: "ID" },
];

export const ThreadPageTopBar: React.FC<ThreadPageTopBarProps> = ({
  activeTopBar,
  filter,
  filterCounts,
  onClose,
  onFilterChange,
  onSearchTargetChange,
  onSearchQueryChange,
  searchFocusKey,
  suppressInitialFocus = false,
  searchQuery,
  searchTarget,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (activeTopBar === "none" || suppressInitialFocus) {
      return;
    }

    // スクロール途中でツールバーを開いても input focus による scroll jump を起こしにくくする。
    try {
      inputRef.current?.focus({ preventScroll: true });
    } catch {
      inputRef.current?.focus();
    }
  }, [activeTopBar, searchFocusKey, suppressInitialFocus]);

  // ThreadPage本体は「バーを出すか」だけを判断し、
  // 検索とフィルタの複合UIは専用コンポーネントへ閉じ込めて見通しを保つ。
  if (activeTopBar === "none") {
    return null;
  }

  return (
    <div className="thread-page__top-bar thread-page__toolbar">
      <div className="thread-page__filters">
        {FILTER_BUTTONS.map(({ key, label }) => {
          const isSelected = filter === key;
          const count = filterCounts[key];
          return (
            <button
              key={key}
              type="button"
              className={`thread-page__filter-btn${
                isSelected ? " thread-page__filter-btn--active" : ""
              }${count === 0 ? " thread-page__filter-btn--empty" : ""}`}
              aria-pressed={isSelected}
              onClick={() => onFilterChange(isSelected ? "all" : key)}
            >
              {label}
              <span className="thread-page__filter-count">{count}</span>
            </button>
          );
        })}
      </div>
      <div className="thread-page__toolbar-search">
        <select
          className="thread-page__toolbar-search-target"
          aria-label="検索対象"
          value={searchTarget}
          onChange={(event) => onSearchTargetChange(event.target.value as ThreadSearchTarget)}
        >
          {SEARCH_TARGETS.map(({ key, label }) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
        <input
          ref={inputRef}
          type="text"
          className="thread-page__toolbar-search-input"
          placeholder="フィルタする文字を入力"
          value={searchQuery}
          onChange={(event) => onSearchQueryChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              onClose();
            }
          }}
        />
      </div>
    </div>
  );
};
