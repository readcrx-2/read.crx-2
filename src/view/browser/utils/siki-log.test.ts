import { getImportedThread, isImportedThreadUrl } from "src/view/browser/utils/imported-thread";
import { parseSikiLogDocument, registerSikiLogThread } from "src/view/browser/utils/siki-log";
import { describe, expect, it } from "vite-plus/test";

describe("Sikiログ", () => {
  it("スレッドJSONから本文と表示用メタデータを抽出する", () => {
    const parsed = parseSikiLogDocument({
      location: "https://egg.5ch.io/test/read.cgi/software/123/",
      thread_array: [
        {
          body: '<anchor class="res-anc" data-anc="0">&gt;&gt;1</anchor><br>本文',
          id: "abc123",
          mail: "sage",
          mname: '<span style="color:var(--color-siki-accent3);">名前</span>',
          num: 1,
          timestamp: Date.UTC(2022, 6, 23, 12, 34, 56),
        },
        { an: 1, vflag: 0 },
      ],
      title: "読み込んだスレッド",
    });

    expect(parsed).toMatchObject({
      title: "読み込んだスレッド",
      threadUrl: "https://egg.5ch.io/test/read.cgi/software/123/",
    });
    expect(parsed.responses).toEqual([
      {
        date: "2022/07/23(土) 21:34:56",
        id: "abc123",
        mail: "sage",
        message: "&gt;&gt;1<br>本文",
        name: "名前",
        num: 1,
        other: "2022/07/23(土) 21:34:56",
      },
    ]);
  });

  it("本文未取得のページング要素を無視し、レス番号を保持する", () => {
    const parsed = parseSikiLogDocument({
      location: "https://example.com/test/read.cgi/board/100/",
      thread_array: [{ body: "一", num: 7000 }, { an: 1 }, { body: "三", num: 7002 }],
    });

    expect(parsed.responses.map(({ num, message }) => ({ num, message }))).toEqual([
      { num: 7000, message: "一" },
      { num: 7002, message: "三" },
    ]);
  });

  it("登録時に同一URLの別ログを別タブとして識別する", () => {
    const parsed = parseSikiLogDocument({
      location: "https://example.com/test/read.cgi/board/100/",
      thread_array: [{ body: "本文" }],
    });

    const firstPage = registerSikiLogThread(parsed);
    const secondPage = registerSikiLogThread(parsed);

    expect(firstPage.threadUrl).not.toBe(secondPage.threadUrl);
    expect(isImportedThreadUrl(firstPage.threadUrl)).toBe(true);
    expect(getImportedThread(firstPage.threadUrl)?.responses[0]?.message).toBe("本文");
  });

  it("locationまたは本文がないJSONを拒否する", () => {
    expect(() => parseSikiLogDocument({ thread_array: [{ body: "本文" }] })).toThrow(
      "locationがありません",
    );
    expect(() =>
      parseSikiLogDocument({
        location: "https://example.com/test/read.cgi/board/100/",
        thread_array: [{ an: 0 }],
      }),
    ).toThrow("表示できる本文がありません");
  });
});
