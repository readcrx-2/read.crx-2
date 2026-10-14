// 移行中の互換窓口。タブの自動更新状態の判定はタブストアと一緒に view/browser/state/tabs へ移した（Phase D-4）。
// 呼び出し元を付け替えたら削除する。
export * from "src/view/browser/state/tabs/auto-refresh-pages";
