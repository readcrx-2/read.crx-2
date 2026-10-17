import { getImportedThread, isImportedThreadUrl } from "src/view/browser/utils/imported-thread";
import { parseLocalDatText, registerLocalDatThread } from "src/view/browser/utils/local-dat";
import { describe, expect, it } from "vite-plus/test";

describe("ローカルdat", () => {
  it("1行目のスレタイと各レスを読み込む", () => {
    const parsed = parseLocalDatText(
      [
        "名無しさん<>sage<>2026/10/17(土) 12:00:00.00 ID:abcd1234<>本文一行目<br>二行目<>テスト板のスレ",
        "別の人<><>2026/10/17(土) 12:01:00.00 ID:efgh5678<>返信<>",
      ].join("\n"),
      "1781000000.dat",
    );

    expect(parsed.title).toBe("テスト板のスレ");
    expect(
      parsed.responses.map(({ num, name, id, message }) => ({ num, name, id, message })),
    ).toEqual([
      { num: 1, name: "名無しさん", id: "abcd1234", message: "本文一行目<br>二行目" },
      { num: 2, name: "別の人", id: "efgh5678", message: "返信" },
    ]);
  });

  it("スレタイが無いdatはファイル名から拡張子を除いて表示する", () => {
    const parsed = parseLocalDatText(
      "名無し<>sage<>2026/10/17(土) 12:00:00.00 ID:x<>本文<>",
      "1781000000.dat",
    );

    expect(parsed.title).toBe("1781000000");
  });

  it("レスが一つも無いdatを拒否する", () => {
    expect(() => parseLocalDatText("", "empty.dat")).toThrow("表示できるレスがありません");
  });

  it("登録時に同じdatを別タブとして識別する", () => {
    const parsed = parseLocalDatText(
      "名無し<>sage<>2026/10/17(土) 12:00:00.00 ID:x<>本文<>題名",
      "1.dat",
    );

    const firstPage = registerLocalDatThread(parsed);
    const secondPage = registerLocalDatThread(parsed);

    expect(firstPage.threadUrl).not.toBe(secondPage.threadUrl);
    expect(isImportedThreadUrl(firstPage.threadUrl)).toBe(true);
    expect(getImportedThread(firstPage.threadUrl)?.responses[0]?.message).toBe("本文");
  });
});
