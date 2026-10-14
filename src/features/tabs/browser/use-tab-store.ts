// 移行中の互換窓口。タブストアは UI 部品層（view/browser/state/tabs）へ移した（Phase D-4）。
// 呼び出し元を付け替えたら削除する。
export * from "src/view/browser/state/tabs/use-tab-store";
