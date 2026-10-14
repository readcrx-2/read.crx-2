import React, { useEffect, useRef, useState } from "react";
import type { NextThreadSearchState } from "src/features/next-thread/browser/use-next-thread-search";
import type {
  NextThreadEvidence,
  ThreadSearchCandidate,
} from "src/features/next-thread/domain/next-thread-search";
import { Dialog } from "src/view/browser/ui/Dialog";
import { Spinner } from "src/view/browser/ui/Spinner";

interface NextThreadSearchDialogProps {
  state: NextThreadSearchState;
  onClose: () => void;
  onSelect: (candidate: ThreadSearchCandidate) => void;
  autoMoveCountdown?: number | null;
}

const EVIDENCE_LABELS: Partial<Record<NextThreadEvidence, string>> = {
  "explicit-link": "本文リンク",
  "exact-adjacent-number": "連番",
  "exact-next-number": "次番号",
  // 類似度が低くても番組一覧の末尾から継続すると判定した理由を、候補の比較時に示す。
  "program-title-continuation": "番組の継続",
  // 番号が消えた短縮タイトルも、元の話題を保持していることを候補の根拠として表示する。
  "short-title-continuation": "題名の短縮",
  "nearby-next-number": "近い番号",
  "same-base-title": "同系統タイトル",
  "near-title": "近いタイトル",
  "same-title": "同じタイトル",
  "similar-title": "類似タイトル",
  "newer-thread": "新しいスレ",
  "active-thread": "稼働中",
};

function getEvidenceLabels(candidate: ThreadSearchCandidate): string[] {
  return (candidate.reasons ?? [])
    .map((reason) => EVIDENCE_LABELS[reason])
    .filter((label): label is string => label != null);
}

function formatSimilarity(similarity: number): string {
  return String(Math.round(similarity * 100)) + "%";
}

export const NextThreadSearchDialog: React.FC<NextThreadSearchDialogProps> = ({
  state,
  onClose,
  onSelect,
  autoMoveCountdown = null,
}) => {
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const firstCandidateRef = useRef<HTMLButtonElement>(null);
  const isAutoMovePrompt = autoMoveCountdown != null;
  const isOpen = state.status !== "idle" || isAutoMovePrompt;
  const isSearching = state.status === "searching";
  const isReady = state.status === "ready";
  const isError = state.status === "error";
  const isSimilarSearch = state.searchType === "similar";

  useEffect(() => {
    // テーマトークンは `.browser-shell[data-theme]` にスコープされるため、
    // body直下のPortalではダークテーマのsurface/textを継承できない。
    setPortalContainer(document.querySelector<HTMLElement>(".browser-shell"));
  }, []);

  useEffect(() => {
    if (isOpen && isReady && state.candidates.length > 0) {
      // 検索中に開いた場合も、候補が揃った時点で閉じるボタンではなく先頭候補へ移す。
      firstCandidateRef.current?.focus();
    }
  }, [isOpen, isReady, state.candidates]);

  return (
    <Dialog.Root
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <Dialog.Portal container={portalContainer ?? undefined}>
        <Dialog.Overlay className="browser-dialog-overlay" />
        <Dialog.Content
          ref={contentRef}
          className="browser-dialog-content next-thread-search-dialog__content"
          onOpenAutoFocus={(event) => {
            // 初期フォーカスを操作の主目的であるスレ候補へ置き、候補待ち中はダイアログ内に留める。
            event.preventDefault();
            (firstCandidateRef.current ?? contentRef.current)?.focus();
          }}
          tabIndex={-1}
        >
          <Dialog.Title className="browser-dialog-title">
            {isAutoMovePrompt
              ? "次スレ候補が見つかりました"
              : isSimilarSearch
                ? "類似スレを検索"
                : "次スレ候補を検索"}
          </Dialog.Title>
          <Dialog.Description className="browser-dialog-description">
            {isAutoMovePrompt ? (
              <>
                {/* 候補を主役にするため、短いカウントは大きな状態パネルを使わず案内文に収める。 */}
                あと{" "}
                <strong className="next-thread-search-dialog__countdown">
                  {autoMoveCountdown}秒
                </strong>
                で1番目の候補へ自動移動します。候補を選ぶとすぐに移動します。
              </>
            ) : (
              <>
                「{state.sourceThread?.title ?? "現在のスレ"}」を基準に、
                {isSimilarSearch ? "タイトルが似ているスレ" : "積極判定の次スレ候補"}を表示します
              </>
            )}
          </Dialog.Description>

          {isSearching ? (
            <div className="next-thread-search-dialog__status" role="status">
              <Spinner
                size="sm"
                aria-label={isSimilarSearch ? "類似スレを検索中" : "次スレ候補を検索中"}
              />
              <span>板のスレ一覧を検索中...</span>
            </div>
          ) : null}

          {isError ? (
            <p className="next-thread-search-dialog__error" role="alert">
              {state.error}
            </p>
          ) : null}

          {isReady && state.candidates.length > 0 ? (
            <ol
              className="next-thread-search-dialog__candidate-list"
              aria-label={isSimilarSearch ? "類似スレ一覧" : "次スレ候補一覧"}
            >
              {state.candidates.map((candidate, index) => {
                const evidenceLabels = getEvidenceLabels(candidate);
                return (
                  <li key={candidate.thread.url}>
                    <button
                      ref={index === 0 ? firstCandidateRef : undefined}
                      type="button"
                      className="next-thread-search-dialog__candidate"
                      onClick={() => onSelect(candidate)}
                      aria-label={candidate.thread.title + "へ移動"}
                    >
                      <span className="next-thread-search-dialog__rank">{index + 1}</span>
                      <span className="next-thread-search-dialog__candidate-body">
                        <span className="next-thread-search-dialog__candidate-title">
                          {candidate.thread.title}
                        </span>
                        <span className="next-thread-search-dialog__candidate-meta">
                          {candidate.thread.resCount.toLocaleString("ja-JP")}レス ・ 一致度{" "}
                          {formatSimilarity(candidate.similarity)}
                          {candidate.score != null ? (
                            <>
                              {" ・ スコア "}
                              <span className="next-thread-search-dialog__candidate-score">
                                {Math.round(candidate.score)}
                              </span>
                            </>
                          ) : null}
                        </span>
                        {evidenceLabels.length > 0 ? (
                          <span className="next-thread-search-dialog__candidate-evidence">
                            {evidenceLabels.join(" / ")}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          ) : null}

          {isReady && state.candidates.length === 0 ? (
            <div className="next-thread-search-dialog__status">
              <span>
                {isSimilarSearch
                  ? "類似スレは見つかりませんでした。"
                  : "次スレ候補は見つかりませんでした。"}
              </span>
              {state.boardMessage ? <span>{state.boardMessage}</span> : null}
            </div>
          ) : null}

          <div className="next-thread-search-dialog__actions">
            <button
              type="button"
              className="browser-button"
              data-variant="subtle"
              onClick={onClose}
            >
              {isAutoMovePrompt ? "自動移動をキャンセル" : "閉じる"}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
