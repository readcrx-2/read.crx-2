// auxiliary-window の公開 API。他の機能はここからだけ import する（docs/plans/module-boundaries-plan.md §3.5）。
// 機能の中のファイルは自己循環を避けるため、この index を経由せず直接 import する。
export {
  type AuxiliaryWindowWatcher,
  watchAuxiliaryWindow,
} from "./browser/auxiliary-window-watcher";
export {
  type AuxiliaryWindowOptions,
  openAuxiliaryWindow,
  useAuxiliaryWindow,
} from "./browser/use-auxiliary-window";
