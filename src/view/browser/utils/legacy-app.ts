interface LegacyCallbacksLike {
  add?: (callback: () => void) => void;
  wasCalled?: boolean;
}

interface LegacyBookmarkEntryList {
  setRootNodeId?: (rootNodeId: string) => Promise<boolean> | boolean;
  needReconfigureRootNodeId?: LegacyCallbacksLike;
}

interface LegacyAppShape {
  bookmarkEntryList?: LegacyBookmarkEntryList;
}

function getLegacyApp(): LegacyAppShape | undefined {
  return (window as Window & { app?: LegacyAppShape }).app;
}

export function getLegacyBookmarkEntryList(): LegacyBookmarkEntryList | undefined {
  return getLegacyApp()?.bookmarkEntryList;
}
