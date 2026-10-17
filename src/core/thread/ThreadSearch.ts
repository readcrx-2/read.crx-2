import { ChURL } from "packages/chlib/src/index";
import { createLogger } from "src/app/logger";
import { ask as askBoardTitleSolver } from "src/core/board/BoardTitleSolver.js";
import { Request } from "src/core/network/HTTP.ts";
import { setProtocol } from "src/core/network/URL.ts";
import { decodeCharReference } from "src/core/util/char-reference";

const logger = createLogger("core/thread");

interface ThreadSearchResult {
  url: string;
  createdAt: number;
  title: string;
  resCount: string | number;
  boardUrl: string;
  boardTitle: string | null;
  isHttps: boolean;
}

// 移行理由: RSS項目の変換結果を明示し、既存の初回Promise・2回目以降空配列の契約を型で保つ。
async function parseItem(item: Element, protocol: string): Promise<ThreadSearchResult> {
  let boardTitle: string | null;
  // 旧RSSの要素欠落時も空文字として解析を続ける既存動作を維持する。
  const url = item.getElementsByTagName("guid")[0]!.textContent ?? "";
  let title = decodeCharReference(item.getElementsByTagName("title")[0]!.textContent ?? "");
  const match = title.match(/\((\d+)\)$/);
  title = title.replace(/\(\d+\)$/, "");
  const boardUrl = new ChURL(url).toBoard();
  try {
    boardTitle = await askBoardTitleSolver(boardUrl);
  } catch (error) {
    logger.error("板名の取得に失敗しました:", error);
    boardTitle = "";
  }
  return {
    url: setProtocol(url, protocol),
    createdAt: Date.parse(item.getElementsByTagName("pubDate")[0]!.textContent ?? ""),
    title,
    resCount: match != null ? match[1]! : 0,
    boardUrl: boardUrl.href,
    boardTitle,
    isHttps: protocol === "https:",
  };
}

export default class ThreadSearch {
  loaded: "None" | "Small" | "Big" = "None";
  loaded20: Promise<ThreadSearchResult[]> | null = null;
  readonly query: string;
  readonly protocol: string;

  constructor(query: string, protocol: string) {
    this.query = query;
    this.protocol = protocol;
  }

  async _read(_count?: number): Promise<ThreadSearchResult[]> {
    // 検索結果をキャッシュさせないという旧オプションの意図を維持する。
    const { status, body } = await new Request(
      "GET",
      `https://ff5ch.syoboi.jp/?q=${encodeURIComponent(this.query)}&alt=rss`,
      { preventCache: true },
    ).send();
    if (status !== 200) {
      throw new Error("検索の通信に失敗しました");
    }
    let items: Element[];
    try {
      const parser = new DOMParser();
      const rss = parser.parseFromString(body, "application/xml");
      items = Array.from(rss.getElementsByTagName("item"));
    } catch (error) {
      logger.error("RSSの解析に失敗しました:", error);
      throw new Error("検索のJSONのパースに失敗しました", { cause: error });
    }
    return Promise.all(items.map((item) => parseItem(item, this.protocol)));
  }

  read(): Promise<ThreadSearchResult[]> | ThreadSearchResult[] {
    if (this.loaded === "None") {
      this.loaded = "Big";
      return this._read();
    }
    // 初回だけ検索し、2回目以降は既存契約どおり空配列を返す。
    return [];
  }
}
