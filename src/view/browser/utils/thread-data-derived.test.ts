// @vitest-environment node
import type { IRes } from "src/service-container/interfaces";
import { deriveThreadData } from "src/view/browser/utils/thread-data-derived";
import { describe, expect, it } from "vite-plus/test";

function response(num: number, message: string, id = `id-${num}`): IRes {
  return {
    num,
    name: "名無し",
    mail: "",
    date: `2026/09/12(土) 12:00:0${num}.000`,
    id,
    message,
  };
}

describe("スレッド表示用派生データ", () => {
  const responses = [
    response(1, "root", "same-id"),
    response(2, "&gt;&gt;1 https://example.com/image.jpg", "same-id"),
    response(3, "動画 https://example.com/movie.mp4"),
    response(4, "通常の本文"),
  ];

  it("フィルターと検索を同じ取得結果から順番に適用する", () => {
    const result = deriveThreadData({
      responses,
      filter: "image",
      popularReplyThreshold: 1,
      searchQuery: "image",
      searchTarget: "body",
      isNgTemporarilyDisabled: false,
      ngDisplayMode: "soft-ng",
    });

    expect(result.visibleResponses).toBe(responses);
    expect(result.filteredResponses.map((item) => item.num)).toEqual([2]);
  });

  it("検索語やフィルタに関係なく、スレッド全体で各フィルタの該当件数を数える", () => {
    const result = deriveThreadData({
      responses,
      filter: "video",
      popularReplyThreshold: 1,
      searchQuery: "該当しない語",
      searchTarget: "body",
      isNgTemporarilyDisabled: false,
      ngDisplayMode: "soft-ng",
    });

    expect(result.filteredResponses).toEqual([]);
    expect(result.filterCounts).toEqual({ popular: 1, image: 1, video: 1, link: 2 });
  });

  it("IDごとの出現位置と返信索引を表示側へ渡す", () => {
    const result = deriveThreadData({
      responses,
      filter: "all",
      popularReplyThreshold: 1,
      searchQuery: "",
      searchTarget: "all",
      isNgTemporarilyDisabled: false,
      ngDisplayMode: "soft-ng",
    });

    expect(result.idPositions.get(1)).toBe(1);
    expect(result.idPositions.get(2)).toBe(2);
    expect(result.indexes.repIndex.get(1)).toEqual(new Set([2]));
  });
});
