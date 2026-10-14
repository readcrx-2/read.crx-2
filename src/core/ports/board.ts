import type { IThread } from "src/core/ports/thread";

export interface IBoardResult {
  threads: IThread[];
  message: string | null;
}
