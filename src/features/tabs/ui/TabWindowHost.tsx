// 移行中の互換窓口。TabWindowHost は組み立て層（view/browser/shell）へ移した。
// 呼び出し元を付け替えたら削除する。
export { TabWindowHost } from "src/view/browser/shell/TabWindowHost";
