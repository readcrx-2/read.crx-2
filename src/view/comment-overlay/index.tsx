import "src/view/browser/styles/foundation/tokens.css";
import "src/view/browser/styles/foundation/themes.css";
import "src/features/comment-overlay/ui/OverlayStage.css";
import "./styles.css";

import { createRoot } from "react-dom/client";

import { OverlayApp } from "./OverlayApp";

const root = document.getElementById("root");
if (!root) {
  throw new Error("ChLens コメントOverlayのroot要素が見つかりません");
}

createRoot(root).render(<OverlayApp />);
