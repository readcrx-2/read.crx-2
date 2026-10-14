// 移行中の互換窓口。ContentArea は組み立て層（view/browser/shell）へ移した。
// 呼び出し元を付け替えたら削除する。
export { ContentArea } from "src/view/browser/shell/ContentArea";
