import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

import iconv from "iconv-lite";

interface LocalThread {
  id: string;
  title: string;
  posts: string[];
}

/** 実際の通信とShift_JIS変換を通しつつ、外部掲示板に依存しない板を起動する。 */
export async function startLocalBoard() {
  const threads: LocalThread[] = [
    {
      id: "1000000001",
      title: "ローカルテストスレッド",
      posts: [
        "名無し<>sage<>2026/10/02(金) 12:00:00 ID:local001<>最初の日本語レス<>ローカルテストスレッド",
        "テスト住民<>sage<>2026/10/02(金) 12:01:00 ID:local002<>二番目の日本語レス<>ローカルテストスレッド",
      ],
    },
  ];
  const requests: string[] = [];
  const server = createServer((request, response) => {
    const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
    requests.push(pathname);
    const resources: Record<string, string> = {
      "/bbsmenu.html":
        '<html><head><title>テスト板メニュー</title></head><body>\n<br><br><b>テストカテゴリ</b><br>\n<a href="/local/">ローカルテスト板</a><br>\n</body></html>',
      "/local/SETTING.TXT": "BBS_TITLE=ローカルテスト板\n",
      "/local/subject.txt": `${threads
        .map((thread) => `${thread.id}.dat<>${thread.title} (${thread.posts.length})`)
        .join("\n")}\n`,
    };
    const datMatch = pathname.match(/^\/local\/dat\/(\d+)\.dat$/u);
    const datThread =
      datMatch == null ? undefined : threads.find((item) => item.id === datMatch[1]);
    const body = datThread == null ? resources[pathname] : `${datThread.posts.join("\n")}\n`;
    if (body === undefined) {
      console.error(`[localboard] 未対応のリクエスト: ${request.method} ${request.url}`);
      response.writeHead(404).end();
      return;
    }
    // 更新時も全体を200で返し、クライアント側のレス統合と重複防止を確認できるようにする。
    response.writeHead(200, {
      "Content-Type": `${pathname.endsWith(".html") ? "text/html" : "text/plain"}; charset=Shift_JIS`,
      "Cache-Control": "no-store",
    });
    response.end(iconv.encode(body, "Shift_JIS"));
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    // 空きポートをテスト単位で割り当て、並列実行時のポート競合を防ぐ。
    server.listen(0, "127.0.0.1", resolve);
  });
  server.on("error", (error) => console.error("[localboard] サーバーエラー", error));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    origin,
    boardUrl: `${origin}/local/`,
    threadUrl: `${origin}/test/read.cgi/local/1000000001/`,
    requests,
    setDat(source: string, threadId = threads[0]!.id) {
      // 添付DATの再現でも、外部掲示板へ通信せず同じ文字コード・取得経路を通す。
      const thread = threads.find((item) => item.id === threadId);
      if (!thread) throw new Error(`未登録のローカルスレッドです: ${threadId}`);
      thread.posts.splice(0, thread.posts.length, ...source.trimEnd().split(/\r?\n/u));
    },
    setThreads(nextThreads: LocalThread[]) {
      // スクショ用の架空スレ一覧をテストごとに差し替えられるようにする。
      threads.splice(
        0,
        threads.length,
        ...nextThreads.map((thread) => ({ ...thread, posts: [...thread.posts] })),
      );
    },
    appendPost(threadId = threads[0]!.id) {
      const thread = threads.find((item) => item.id === threadId);
      if (!thread) throw new Error(`未登録のローカルスレッドです: ${threadId}`);
      const nextNumber = thread.posts.length + 1;
      thread.posts.push(
        `追加住民<>sage<>2026/10/02(金) 12:02:00 ID:local${String(nextNumber).padStart(3, "0")}<>更新で追加された日本語レス #${nextNumber}<>`,
      );
    },
    async close() {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      });
    },
  };
}
