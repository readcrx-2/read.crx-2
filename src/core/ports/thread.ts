import type { INGResult } from "src/core/ports/ng";
import type { IReadState } from "src/core/ports/read-state";

export interface IThread {
  url: string;
  title: string;
  resCount: number;
  createdAt: number;
  ng?: INGResult | null;
  demoted?: INGResult | null;
  highlight?: INGResult | null;
  isNet?: boolean | null;
  readState?: IReadState;
  threadNumber?: number;
}

export interface IRes {
  num: number;
  name: string;
  mail: string;
  date: string;
  id?: string;
  slip?: string;
  trip?: string;
  other?: string;
  be?: string;
  message: string;
  isNew?: boolean;
  ng?: INGResult;
  isAA?: boolean;
  class?: string[];
}

export interface IThreadDetail {
  url: string;
  // 取得元によってタイトルが無いケースがあるため、TS移行前のnullを保持する。
  title: string | null;
  res: IRes[];
  message?: string;
  expired?: boolean;
  missingFromSubject?: boolean;
}

export interface IThreadService {
  getThread(
    url: string,
    options?: {
      forceUpdate?: boolean;
      /** 自動更新由来の取得では、dat落ち確認のsubject.txt取得を間引く */
      throttleSubjectCheck?: boolean;
      onCache?: (thread: IThreadDetail) => void;
    },
  ): Promise<IThreadDetail>;
}
