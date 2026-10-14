import { useEffect, useState } from "react";
import { container } from "src/service-container/index";

export function readBookmarkStatus(url: string): boolean {
  try {
    return Boolean(container.bookmark.get(url));
  } catch (error) {
    // 変更理由: 起動直後などで bookmark service がまだ登録されていなくても、
    // スレ一覧そのものは表示できるよう、ブックマークなしとして扱って詳細はログに残す。
    console.error("[ThreadList] bookmark status read failed:", error);
    return false;
  }
}

export function useBookmarkRevision(): number {
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let cancelled = false;

    // 初回の走査の完了は window.app ではなくサービスコンテナで待つ（legacy-window-app-plan の Phase 2）。
    void container.bookmark.ready().then(() => {
      if (cancelled) {
        return;
      }

      // 変更理由: 初回 scan 前に一覧が描画されると既存ブックマークが星にならないため、
      // scan 完了後に一覧のブックマーク状態だけを再読込する。
      setRevision((current) => current + 1);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const handleBookmarkUpdated = () => {
      // 変更理由: ブックマークはスレ一覧の取得結果とは別に更新されるため、
      // 通知を受けた時だけ行を再計算し、一覧の再取得なしで星表示を同期する。
      setRevision((current) => current + 1);
    };

    try {
      container.message.on("bookmark_updated", handleBookmarkUpdated);
    } catch (error) {
      // 変更理由: サービス初期化前の描画で購読に失敗しても一覧表示を妨げず、
      // 初期化順序の問題を診断できるようエラーを記録する。
      console.error("[ThreadList] bookmark update listener registration failed:", error);
      return;
    }

    return () => {
      container.message.off("bookmark_updated", handleBookmarkUpdated);
    };
  }, []);

  return revision;
}
