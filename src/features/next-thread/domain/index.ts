// next-thread の公開 API のうち、React やサービスに依存しない判定処理。
// 純粋な関数だけが必要な機能（comment-overlay・auto-refresh など）はここから import する。
// index.ts を経由するとフックと service-container まで読み込むため（計画書 §3.5）。
export {
  isNextThreadSearchTriggered,
  NEXT_THREAD_TRIGGER_RES_COUNT,
} from "./auto-next-thread-trigger";
export {
  type AutoNextThreadMode,
  calculateTitleSimilarity,
  extractThreadSequenceNumber,
  findMainstreamThreadMatch,
} from "./next-thread-search";
