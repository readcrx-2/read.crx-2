import "./OverlayPlacementWindow.css";

import type { Meta, StoryObj } from "@storybook/react-vite";

import type { CommentOverlayGeometry, CommentOverlayWindowPlatform } from "../platform/types";
import { OverlayPlacementPanel } from "./OverlayPlacementPanel";

// 実画面の代わりに、デスクトップらしい配色の静止画をプレビューとして返す。
const PREVIEW_IMAGE = `data:image/svg+xml;utf8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080"><rect width="1920" height="1080" fill="#1f2a3a"/><rect x="80" y="60" width="1100" height="900" fill="#2d3b52"/><rect x="1240" y="60" width="600" height="900" fill="#3a4a63"/><rect y="1030" width="1920" height="50" fill="#0f1622"/></svg>',
)}`;

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
    captureMonitorPreview: async () => PREVIEW_IMAGE,
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
