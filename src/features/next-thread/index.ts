// next-thread の公開 API。他の機能はここからだけ import する（計画書 §3.5）。
// 機能の中のファイルは自己循環を避けるため、この index を経由せず直接 import する。
// 判定処理だけが必要な場合は、フックを読み込まない ./domain から import する。
export { useAutoNextThread } from "./browser/use-auto-next-thread";
export { useAutoNextThreadSetting } from "./browser/use-auto-next-thread-setting";
export * from "./domain";
