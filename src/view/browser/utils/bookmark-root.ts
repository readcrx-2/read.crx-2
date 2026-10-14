import { isTauriRuntime } from "src/app/platform/runtime";
import { container } from "src/service-container/index";
import { getLegacyBookmarkEntryList } from "src/view/browser/utils/legacy-app";
import browser from "webextension-polyfill";

export interface BookmarkFolderNode {
  id: string;
  title: string;
  children: BookmarkFolderNode[];
}

function normalizeBookmarkFolderTitle(title: string): string {
  const normalizedTitle = title.trim();
  return normalizedTitle.length > 0 ? normalizedTitle : "名称未設定フォルダ";
}

function toBookmarkFolderNode(node: browser.Bookmarks.BookmarkTreeNode): BookmarkFolderNode | null {
  if (!Array.isArray(node.children)) {
    return null;
  }

  return {
    id: node.id,
    title: normalizeBookmarkFolderTitle(node.title),
    children: node.children
      .map((childNode) => toBookmarkFolderNode(childNode))
      .filter((childNode): childNode is BookmarkFolderNode => childNode !== null),
  };
}

export function supportsBookmarkFolderSelection(): boolean {
  // 変更理由: Tauri はブックマークをブラウザAPIではなく別ストレージで扱うため、
  // 保存先フォルダ選択UIを表示すると誤解を招く。ランタイム判定を優先して無効化する。
  return !isTauriRuntime() && typeof browser !== "undefined" && browser.bookmarks !== undefined;
}

export function readConfiguredBookmarkFolderId(): string {
  // window.app.config と container.config は同じ Config の実体を見るため、コンテナから読む
  // （legacy-window-app-plan の Phase 1）。
  const bookmarkId = container.config.get("bookmark_id");
  return typeof bookmarkId === "string" ? bookmarkId : "";
}

export function isBookmarkRootSelectionRequired(): boolean {
  const bookmarkEntryList = getLegacyBookmarkEntryList();
  return (
    readConfiguredBookmarkFolderId().length === 0 ||
    bookmarkEntryList?.needReconfigureRootNodeId?.wasCalled === true
  );
}

export async function readBookmarkFolderTree(): Promise<BookmarkFolderNode[]> {
  if (!supportsBookmarkFolderSelection()) {
    return [];
  }

  const tree = await browser.bookmarks.getTree();
  const rootChildren = Array.isArray(tree[0]?.children) ? tree[0].children : [];

  return rootChildren
    .map((node) => toBookmarkFolderNode(node))
    .filter((node): node is BookmarkFolderNode => node !== null);
}

export async function readBookmarkFolderName(bookmarkId: string): Promise<string | null> {
  if (!supportsBookmarkFolderSelection() || bookmarkId.length === 0) {
    return null;
  }

  try {
    const [node] = await browser.bookmarks.get(bookmarkId);
    // 変更理由: browser.bookmarks.get() は実装差分で folder node の children を
    // 返さないことがあり、存在する保存先でも未設定扱いになる不具合を防ぐ。
    if (!node || typeof node.url === "string") {
      return null;
    }
    return normalizeBookmarkFolderTitle(node.title);
  } catch {
    return null;
  }
}

export async function updateBookmarkFolderId(bookmarkId: string): Promise<void> {
  // 変更理由: bookmark root の切替は app.ts 側の config_updated listener が
  // runtime へ反映するため、UI は config 更新だけを責務にして同期経路を一本化する。
  // 以前は window.app.config があればそちらを待ち、なければ container.config へ投げっぱなしにしていた。
  // 両者は同じ Config の実体なので、コンテナに一本化して保存の完了まで待つ。
  await container.config.set("bookmark_id", bookmarkId);
}
