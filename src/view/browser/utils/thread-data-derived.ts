import type { IRes } from "src/service-container/interfaces";
import type { ThreadFilter, ThreadSearchTarget } from "src/view/browser/types";
import { hasExternalLink, hasImage, hasVideo } from "src/view/browser/utils/message-filter";
import type { NgDisplayMode } from "src/view/browser/utils/ng-display-mode";
import { buildIndexes } from "src/view/browser/utils/thread-index";
import { filterThreadResponses } from "src/view/browser/utils/thread-search";

export interface ThreadDerivedDataOptions {
  responses: IRes[];
  filter: ThreadFilter;
  popularReplyThreshold: number;
  searchQuery: string;
  searchTarget: ThreadSearchTarget;
  isNgTemporarilyDisabled: boolean;
  ngDisplayMode: NgDisplayMode;
}

export type ThreadFilterCounts = Record<Exclude<ThreadFilter, "all">, number>;

export interface ThreadDerivedData {
  visibleResponses: IRes[];
  indexes: ReturnType<typeof buildIndexes>;
  filteredResponses: IRes[];
  /** 各フィルタに該当するレス数。フィルタ項目の横へ件数を出すために使う。 */
  filterCounts: ThreadFilterCounts;
  idPositions: Map<number, number>;
}

const COUNTED_FILTERS = ["popular", "image", "video", "link"] as const;

function matchesThreadFilter(
  res: IRes,
  filter: Exclude<ThreadFilter, "all">,
  repIndex: ReturnType<typeof buildIndexes>["repIndex"],
  popularReplyThreshold: number,
): boolean {
  switch (filter) {
    case "popular":
      return (repIndex.get(res.num)?.size ?? 0) >= popularReplyThreshold;
    case "image":
      return hasImage(res.message);
    case "video":
      return hasVideo(res.message);
    case "link":
      return hasExternalLink(res.message);
  }
}

/**
 * スレッド本文から、索引・フィルター結果・ID位置をまとめて導出する。
 *
 * 変更理由: 取得ライフサイクルと表示用の計算を同じフックへ詰め込むと、通信の変更が
 * フィルターや返信索引へ波及しやすく、別スレッドへの切替時にどの状態が正本か追いにくいため。
 */
export function deriveThreadData(options: ThreadDerivedDataOptions): ThreadDerivedData {
  const {
    responses,
    filter,
    popularReplyThreshold,
    searchQuery,
    searchTarget,
    isNgTemporarilyDisabled,
    ngDisplayMode,
  } = options;
  // 変更理由: NGレスはResItemがプレースホルダーとして描画するため、一覧から除外せず
  // anchor--ng-targetのジャンプ先を維持する。hard-ngの除外は索引側だけへ限定する。
  const visibleResponses = responses;
  const indexes = buildIndexes(responses, {
    hardNgExclusionMode: isNgTemporarilyDisabled ? undefined : ngDisplayMode,
  });

  let filteredResponses = visibleResponses;
  if (filter !== "all") {
    filteredResponses = filteredResponses.filter((res) =>
      matchesThreadFilter(res, filter, indexes.repIndex, popularReplyThreshold),
    );
  }

  // 件数は検索語に関係なくスレッド全体に対して数え、フィルタを選ぶ前に該当数を見られるようにする。
  const filterCounts: ThreadFilterCounts = { popular: 0, image: 0, video: 0, link: 0 };
  for (const res of visibleResponses) {
    for (const countedFilter of COUNTED_FILTERS) {
      if (matchesThreadFilter(res, countedFilter, indexes.repIndex, popularReplyThreshold)) {
        filterCounts[countedFilter] += 1;
      }
    }
  }

  if (searchQuery) {
    filteredResponses = filterThreadResponses(filteredResponses, searchQuery, searchTarget);
  }

  const idPositions = new Map<number, number>();
  const counters = new Map<string, number>();
  for (const res of visibleResponses) {
    if (!res.id) {
      continue;
    }
    const count = (counters.get(res.id) ?? 0) + 1;
    counters.set(res.id, count);
    idPositions.set(res.num, count);
  }

  return { visibleResponses, indexes, filteredResponses, filterCounts, idPositions };
}
