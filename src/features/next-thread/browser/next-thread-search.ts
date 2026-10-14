// 移行中の互換窓口。純粋な判定処理は next-thread/domain へ移した（計画書 §3.5）。
// 呼び出し元を付け替えたら削除する。
export * from "src/features/next-thread/domain/next-thread-search";
