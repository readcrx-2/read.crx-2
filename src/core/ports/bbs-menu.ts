import type { ParsedBBSMenu } from "packages/chlib/src/index";

export interface IBBSMenuResult {
  status: "success" | "error";
  // 取得失敗時は板一覧を持たないため optional にする（実装の BBSMenuModel と同じ形）。
  menu?: ParsedBBSMenu[];
  message?: string;
}
