export interface CommentOverlayGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 縦横比固定を有効にしたときの表示領域の比率。 */
export const COMMENT_OVERLAY_ASPECT_RATIO = 16 / 9;

export const DEFAULT_COMMENT_OVERLAY_GEOMETRY: CommentOverlayGeometry = {
  x: 80,
  y: 80,
  width: 900,
  height: 506,
};

/** 仮想デスクトップ上でOverlayの配置先を表示するためのモニター情報。 */
export interface CommentOverlayMonitor {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  scaleFactor: number;
}

export interface CommentOverlayAttachmentWindow {
  id: string;
  title: string;
  processPath?: string | null;
}

export interface CommentOverlayWindowPlatform {
  /** 再起動後は保存した実行ファイルから探し直し、古いウィンドウIDは再利用しない。 */
  attachment?: {
    listWindows(): Promise<readonly CommentOverlayAttachmentWindow[]>;
    getState(): { targetId: string | null; error: string | null; processPath?: string };
    setTarget(id: string | null): Promise<void>;
  };
  /** 配置の復元はMainだけが行い、表示前と調整窓の初期化で完了を待つ。 */
  restorePlacement?(): Promise<void>;
  show(): Promise<void>;
  hide(): Promise<void>;
  focus(): Promise<void>;
  minimize(): Promise<void>;
  toggleMaximize(): Promise<void>;
  close(): Promise<void>;
  watchVisibility(listener: (visible: boolean) => void): Promise<() => void>;
  getMonitors(): Promise<readonly CommentOverlayMonitor[]>;
  /** ChLens本体の窓があるモニターのid（getMonitorsのid）。判定できない環境では省略する。 */
  getHostMonitorId?: () => Promise<string | null>;
  /**
   * 選択画面の縮小静止画。対応しない環境ではnullを返す。保存はしない。
   * 表示位置の調整窓が見えている間だけ、前回の撮影完了後に周期的に要求される。
   */
  captureMonitorPreview?: (monitor: CommentOverlayMonitor) => Promise<string | null>;
  getGeometry(): Promise<CommentOverlayGeometry | null>;
  watchGeometry(listener: (geometry: CommentOverlayGeometry) => void): Promise<() => void>;
  setGeometry(geometry: CommentOverlayGeometry): Promise<void>;
  loadGeometry(): Promise<CommentOverlayGeometry | null>;
  saveGeometry(geometry: CommentOverlayGeometry): Promise<void>;
}
