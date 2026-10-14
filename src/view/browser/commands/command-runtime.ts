import { container } from "src/service-container";
import type { IToastService } from "src/service-container/interfaces";
import type { ViewSurface } from "src/view/browser/hooks/use-view-surface";
import { copyText, formatMarkdownLink } from "src/view/browser/utils/clipboard";

/**
 * コマンドが操作する対象を、表示中のページから独立して表現する。
 *
 * 変更理由: 一覧行や別窓のタブメニューは、現在のアクティブページではなく
 * 選択されたスレッドを操作するため、巨大なページ用コンテキストを要求しない
 * 小さな対象型を用意する。
 */
export interface CommandTarget {
  readonly kind: "thread" | "board";
  readonly url: string;
  readonly title: string;
}

/** 対象操作・Clipboard操作で共有する要求ID。 */
export const COMMAND_REQUEST_IDS = {
  TARGET_COPY: "target.copy",
  CLIPBOARD_COPY_TEXT: "clipboard.copy-text",
  TARGET_BOOKMARK_SET: "target.bookmark.set",
  TARGET_BOOKMARK_TOGGLE: "target.bookmark.toggle",
} as const;

export type CommandRequest =
  | {
      readonly id: typeof COMMAND_REQUEST_IDS.TARGET_COPY;
      readonly args: {
        readonly target: CommandTarget;
        readonly format: "title" | "url" | "title-url" | "markdown";
      };
    }
  // 変更理由: レス本文やURLのように対象型へ収まらない文字列も、表示先と失敗処理を
  // 同じClipboard経路へ集約するため、対象付きコピーとは別の要求として表現する。
  | {
      readonly id: typeof COMMAND_REQUEST_IDS.CLIPBOARD_COPY_TEXT;
      readonly args: {
        readonly text: string;
      };
    }
  | {
      readonly id: typeof COMMAND_REQUEST_IDS.TARGET_BOOKMARK_SET;
      readonly args: {
        readonly target: CommandTarget;
        readonly bookmarked: boolean;
      };
    }
  | {
      readonly id: typeof COMMAND_REQUEST_IDS.TARGET_BOOKMARK_TOGGLE;
      readonly args: {
        readonly target: CommandTarget;
      };
    };

/**
 * コマンド実行時に使う表示先と通知先をまとめる。
 *
 * 変更理由: 別窓から実行した操作がメイン窓のclipboard/documentへ戻らないよう、
 * 実行入口で表示環境を必須にする。タブ操作などの状態更新は別のruntimeで後から
 * 拡張できるよう、ここでは対象操作に必要な最小値だけを定義する。
 */
export interface CommandRuntime {
  readonly surface: ViewSurface;
  readonly toast: IToastService;
}

function getCommandLabel(request: CommandRequest): string {
  switch (request.id) {
    case COMMAND_REQUEST_IDS.TARGET_COPY:
    case COMMAND_REQUEST_IDS.CLIPBOARD_COPY_TEXT:
      return "コピー";
    case COMMAND_REQUEST_IDS.TARGET_BOOKMARK_SET:
    case COMMAND_REQUEST_IDS.TARGET_BOOKMARK_TOGGLE:
      return "ブックマークの更新";
  }
}

function getCopyText(
  request: Extract<CommandRequest, { id: typeof COMMAND_REQUEST_IDS.TARGET_COPY }>,
): string {
  const { target, format } = request.args;
  switch (format) {
    case "title":
      return target.title;
    case "url":
      return target.url;
    case "title-url":
      return `${target.title}\n${target.url}`;
    case "markdown":
      return formatMarkdownLink(target.title, target.url);
  }
}

/**
 * 対象操作・Clipboard操作を実行する低位API。
 *
 * 失敗は呼び出し元へthrowする。メニューイベント用の入口だけがログと通知を
 * まとめて担当することで、入口を増やしても同じエラーが二重に表示されない。
 */
export async function executeCommandRequest(
  request: CommandRequest,
  runtime: CommandRuntime,
): Promise<void> {
  switch (request.id) {
    case COMMAND_REQUEST_IDS.TARGET_COPY:
      await executeCommandRequest(
        {
          id: COMMAND_REQUEST_IDS.CLIPBOARD_COPY_TEXT,
          args: { text: getCopyText(request) },
        },
        runtime,
      );
      return;
    case COMMAND_REQUEST_IDS.CLIPBOARD_COPY_TEXT:
      await copyText(request.args.text, runtime.surface);
      return;
    case COMMAND_REQUEST_IDS.TARGET_BOOKMARK_SET: {
      const { target, bookmarked } = request.args;
      const currentBookmarked = Boolean(container.bookmark.get(target.url));
      if (currentBookmarked === bookmarked) {
        return;
      }

      if (bookmarked) {
        await Promise.resolve(
          container.bookmark.add({
            url: target.url,
            title: target.title,
            type: target.kind,
          }),
        );
      } else {
        await Promise.resolve(container.bookmark.remove(target.url));
      }
      return;
    }
    case COMMAND_REQUEST_IDS.TARGET_BOOKMARK_TOGGLE: {
      const { target } = request.args;
      const currentBookmarked = Boolean(container.bookmark.get(target.url));
      await executeCommandRequest(
        {
          id: COMMAND_REQUEST_IDS.TARGET_BOOKMARK_SET,
          args: { target, bookmarked: !currentBookmarked },
        },
        runtime,
      );
      return;
    }
  }
}

/**
 * UIイベントから安全に呼び出せるコマンド入口。
 *
 * 変更理由: ReactのイベントハンドラはPromiseを待たないため、rejectを放置すると
 * 別窓ではエラーが画面に出ず、原因も追跡できない。ここで操作単位のログと通知を
 * 共通化し、各メニューを薄いadapterに保つ。
 */
export async function runCommandRequest(
  request: CommandRequest,
  runtime: CommandRuntime,
): Promise<boolean> {
  try {
    await executeCommandRequest(request, runtime);
    if (request.id === COMMAND_REQUEST_IDS.TARGET_COPY) {
      const label =
        request.args.format === "title"
          ? "タイトル"
          : request.args.format === "url"
            ? "URL"
            : request.args.format === "title-url"
              ? "タイトルとURL"
              : "Markdownリンク";
      runtime.toast.success(`${label}をコピーしました`);
    } else if (request.id === COMMAND_REQUEST_IDS.CLIPBOARD_COPY_TEXT) {
      // 変更理由: URL・本文・選択範囲など入口ごとに成功表示が漏れないよう、共通コピー境界で通知する。
      runtime.toast.success("クリップボードにコピーしました");
    }
    return true;
  } catch (error: unknown) {
    const target = "target" in request.args ? request.args.target : undefined;
    console.error("コマンドの実行に失敗しました", {
      commandId: request.id,
      ...(target ? { target } : {}),
      error,
    });
    runtime.toast.error(`${getCommandLabel(request)}に失敗しました`);
    return false;
  }
}
