// ng の公開 API。他の機能はここからだけ import する（docs/plans/module-boundaries-plan.md §3.5）。
// 機能の中のファイルは自己循環を避けるため、この index を経由せず直接 import する。
export {
  NgStatusProvider,
  useIsNgTemporarilyDisabled,
  useNgDisplayMode,
  useNgStatus,
} from "./browser/use-ng-status";
export { useThreadTitleNgDialog } from "./browser/use-thread-title-ng-dialog";
export { NgBadge } from "./ui/NgBadge";
export { NgResponsePlaceholder } from "./ui/NgResponsePlaceholder";
export { ThreadTitleNgDialog } from "./ui/ThreadTitleNgDialog";
