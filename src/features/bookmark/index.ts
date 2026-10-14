// bookmark の公開 API。他の機能はここからだけ import する（docs/plans/module-boundaries-plan.md §3.5）。
// 機能の中のファイルは自己循環を避けるため、この index を経由せず直接 import する。
export { readBookmarkStatus, useBookmarkRevision } from "./browser/use-bookmark-revision";
