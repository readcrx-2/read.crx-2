import "src/view/browser/styles/index.css";

import { createRoot } from "react-dom/client";
import { bootView } from "src/app/boot";
import { ArchiveReplayWindow } from "src/features/archive-replay/ui/ArchiveReplayWindow";

// 過去実況窓は旧互換のwindow.appを使わないため、src/appを経由せず起動処理だけを呼ぶ。
void bootView("/view/archive-replay.html", () => {
  const root = document.getElementById("root");
  if (!root) {
    console.error("[ArchiveReplay] root要素が見つかりません");
    return;
  }
  createRoot(root).render(<ArchiveReplayWindow />);
});
