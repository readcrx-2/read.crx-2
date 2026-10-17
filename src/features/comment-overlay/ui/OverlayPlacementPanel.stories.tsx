import "./OverlayPlacementWindow.css";

import type { Meta, StoryObj } from "@storybook/react-vite";

import type {
  CommentOverlayGeometry,
  CommentOverlayPreviewFrame,
  CommentOverlayWindowPlatform,
} from "../platform/types";
import { OverlayPlacementPanel } from "./OverlayPlacementPanel";

// 実画面の代わりに、デスクトップらしい配色の静止フレームをプレビューとして返す。
function createPreviewFrame(): CommentOverlayPreviewFrame {
  const width = 192;
  const height = 108;
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const inTaskbar = y >= 103;
      const inWindow = x >= 8 && x < 118 && y >= 6 && y < 96;
      const inSidebar = x >= 124 && x < 184 && y >= 6 && y < 96;
      const [red, green, blue] = inTaskbar
        ? [15, 22, 34]
        : inWindow
          ? [45, 59, 82]
          : inSidebar
            ? [58, 74, 99]
            : [31, 42, 58];
      pixels.set([red, green, blue, 255], (y * width + x) * 4);
    }
  }
  return { width, height, pixels };
}
const PREVIEW_FRAME = createPreviewFrame();

function createPlatform(targetId: string | null): CommentOverlayWindowPlatform {
  let currentTarget = targetId;
  let geometry: CommentOverlayGeometry = { x: 2_080, y: 160, width: 1_280, height: 720 };
  const noop = async (): Promise<void> => {};
  return {
    attachment: {
      listWindows: async () => [
        { id: "player", title: "動画プレイヤー" },
        { id: "browser", title: "ブラウザー" },
      ],
      getState: () => ({ targetId: currentTarget, error: null }),
      setTarget: async (id) => {
        currentTarget = id;
      },
    },
    show: noop,
    hide: noop,
    focus: noop,
    minimize: noop,
    toggleMaximize: noop,
    close: noop,
    watchVisibility: async () => () => {},
    getMonitors: async () => [
      {
        id: "monitor-1",
        name: "左モニター",
        x: 0,
        y: 0,
        width: 1_920,
        height: 1_080,
        scaleFactor: 1,
      },
      {
        id: "monitor-2",
        name: "メインモニター",
        x: 1_920,
        y: 0,
        width: 2_560,
        height: 1_440,
        scaleFactor: 1.25,
      },
    ],
    // ChLensは左モニター、Overlayはメインモニターにある状況を再現する。
    getHostMonitorId: async () => "monitor-1",
    captureMonitorPreview: async () => PREVIEW_FRAME,
    getGeometry: async () => geometry,
    watchGeometry: async () => () => {},
    setGeometry: async (next) => {
      geometry = next;
    },
    loadGeometry: async () => geometry,
    saveGeometry: noop,
  };
}

const meta = {
  title: "ChLens/コメントOverlay/表示位置の調整窓",
  component: OverlayPlacementPanel,
  parameters: {
    docs: {
      description: {
        component:
          "別窓で開く表示位置の調整画面です。窓の高さに合わせてプレビューが縮み、スクロールせずに収まることを確認します。",
      },
    },
  },
  decorators: [
    (Story) => (
      <div className="browser-shell overlay-placement-window-shell" data-theme="dark">
        <main className="overlay-placement-window">
          <Story />
        </main>
      </div>
    ),
  ],
} satisfies Meta<typeof OverlayPlacementPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ManualPlacement: Story = {
  name: "範囲を指定",
  args: { platform: createPlatform(null) },
};

export const FollowWindow: Story = {
  name: "ウィンドウに追従",
  args: { platform: createPlatform("player") },
};
