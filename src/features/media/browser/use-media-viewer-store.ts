import { toOriginalImageUrl, toViewerImageUrl } from "src/core/util/url-media";
import { create } from "zustand";

import type { ViewerState } from "./media-viewer-types";

const MIN_VIEWER_SCALE = 0.25;
const MAX_VIEWER_SCALE = 10;
const TOOLBAR_ZOOM_STEP = 0.25;

function clampViewerScale(scale: number): number {
  // 高解像度メディアの細部を確認しつつ、過大な描画負荷を避けるため拡大は10倍までに制限する。
  return Math.min(MAX_VIEWER_SCALE, Math.max(MIN_VIEWER_SCALE, scale));
}

interface MediaViewerStoreState {
  viewer: ViewerState | null;
  viewerScopeId: string | null;
  viewerScale: number;
  isLoading: boolean;
  openMediaFromUrl: (url: string, resImages: string[] | undefined, scopeId: string) => void;
  closeViewer: (scopeId: string) => void;
  navigateViewer: (delta: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  resetScale: () => void;
  zoomByWheel: (deltaY: number) => void;
  setImageLoading: (isLoading: boolean) => void;
}

export const useMediaViewerStore = create<MediaViewerStoreState>((set, get) => ({
  viewer: null,
  viewerScopeId: null,
  viewerScale: 1,
  isLoading: false,

  openMediaFromUrl: (url, resImages, scopeId) => {
    const imageUrl = toViewerImageUrl(url);
    if (!imageUrl) {
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }

    const images = resImages && resImages.length > 1 ? resImages : undefined;
    const currentIndex = images ? Math.max(0, images.indexOf(url)) : undefined;

    // ズーム途中で画像が切り替わると視覚的な違和感が大きいため、
    // 最初からオリジナル解像度を表示して表示の一貫性を優先する。
    const initialSrc = toOriginalImageUrl(imageUrl) ?? imageUrl;

    set({
      viewer: {
        src: initialSrc,
        label: url,
        images,
        currentIndex,
      },
      viewerScopeId: scopeId,
      // 画像を切り替えた時に前回のズーム倍率を引き継ぐと初見画像の全体把握が難しいため、毎回等倍に戻す。
      viewerScale: 1,
      // 画像が切り替わるたびに読み込み中状態に戻す。
      isLoading: true,
    });
  },

  closeViewer: (scopeId) => {
    // 変更理由: ストアは複数のThreadPageで共有されるため、所有者を確認せずに閉じると
    // 2ペインの別スレッドが表示中のビューアーまで破棄してしまう。
    if (get().viewerScopeId !== scopeId) {
      return;
    }

    // ビューアを閉じた時に前回倍率が残ると次回表示で意図せず拡大状態になるため、
    // close 時点で必ず等倍へ戻して初期表示の一貫性を保つ。
    set({ viewer: null, viewerScopeId: null, viewerScale: 1, isLoading: false });
  },

  navigateViewer: (delta) => {
    const { viewer } = get();
    if (!viewer?.images) {
      return;
    }

    const length = viewer.images.length;
    const currentIndex = viewer.currentIndex ?? 0;
    // 先頭/末尾で循環させると前後関係を見失いやすいため、端で停止させる。
    const nextIndex = Math.min(length - 1, Math.max(0, currentIndex + delta));
    if (nextIndex === currentIndex) {
      return;
    }

    const rawUrl = viewer.images[nextIndex];
    const nextSrc = toViewerImageUrl(rawUrl) ?? rawUrl;
    const nextInitialSrc = toOriginalImageUrl(nextSrc) ?? nextSrc;

    set({
      viewer: {
        ...viewer,
        src: nextInitialSrc,
        label: rawUrl,
        currentIndex: nextIndex,
      },
      viewerScale: 1,
      // 画像が切り替わるたびに読み込み中状態に戻す。
      isLoading: true,
    });
  },

  zoomIn: () => {
    set((state) => ({
      viewerScale: clampViewerScale(state.viewerScale + TOOLBAR_ZOOM_STEP),
    }));
  },

  zoomOut: () => {
    set((state) => ({
      viewerScale: clampViewerScale(state.viewerScale - TOOLBAR_ZOOM_STEP),
    }));
  },

  resetScale: () => {
    set({ viewerScale: 1 });
  },

  zoomByWheel: (deltaY) => {
    if (!Number.isFinite(deltaY) || deltaY === 0) {
      return;
    }
    set((state) => {
      // ホイールの移動量を指数倍率へ変換し、拡大と縮小を対称にする。
      // 小数を丸めるとトラックパッドの細かな入力が消えるため、目標倍率の精度を維持する。
      const nextScale = state.viewerScale * Math.exp(-deltaY * 0.0018);
      return { viewerScale: clampViewerScale(nextScale) };
    });
  },

  setImageLoading: (isLoading) => {
    set({ isLoading });
  },
}));
