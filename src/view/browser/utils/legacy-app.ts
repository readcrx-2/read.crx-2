interface LegacyBookmarkService {
  getAll?: () => unknown;
  getAllThreads?: () => unknown;
  getAllBoards?: () => unknown;
  promiseFirstScan?: Promise<boolean>;
  import?: (entry: unknown) => Promise<boolean> | boolean;
}

interface LegacyCallbacksLike {
  add?: (callback: () => void) => void;
  wasCalled?: boolean;
}

interface LegacyBookmarkEntryList {
  setRootNodeId?: (rootNodeId: string) => Promise<boolean> | boolean;
  needReconfigureRootNodeId?: LegacyCallbacksLike;
}

interface LegacyAppShape {
  bookmark?: LegacyBookmarkService;
  bookmarkEntryList?: LegacyBookmarkEntryList;
}

function getLegacyApp(): LegacyAppShape | undefined {
  return (window as Window & { app?: LegacyAppShape }).app;
}

export function getLegacyBookmarkService(): LegacyBookmarkService | undefined {
  return getLegacyApp()?.bookmark;
}

export function getLegacyBookmarkEntryList(): LegacyBookmarkEntryList | undefined {
  return getLegacyApp()?.bookmarkEntryList;
}

export async function waitForLegacyBookmarkReady(): Promise<void> {
  try {
    // 変更理由: BrowserBookmarkEntryList は初回 scan 完了前だと空配列を返しうるため、
    // new-ui でも既存ブックマークの初期表示を取りこぼさないよう待機する。
    await getLegacyBookmarkService()?.promiseFirstScan;
  } catch {
    // 初回同期が失敗しても、呼び出し側は利用可能なデータで表示を継続する。
  }
}
