// 移行中の互換窓口。PageCountStatusItem は組み立て層（view/browser/shell）へ移した。
// 呼び出し元を付け替えたら削除する。
export { PageCountStatusItem } from "src/view/browser/shell/PageCountStatusItem";
