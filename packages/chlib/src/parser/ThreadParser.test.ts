// @vitest-environment node
import { fc, test as propertyTest } from "@fast-check/vitest";
import { describe, expect, it } from "vite-plus/test";

import { ThreadParser } from "../parser/ThreadParser";
import { ChURL } from "../url/ChURL";

const datFieldCharacters = ["a", "Z", "あ", "猫", "0", " ", "_", "-"] as const;
const datFieldArbitrary = fc
  .array(fc.constantFrom(...datFieldCharacters), { maxLength: 16 })
  .map((characters) => characters.join(""));
const datRowArbitrary = fc.record({
  name: datFieldArbitrary,
  mail: datFieldArbitrary,
  other: datFieldArbitrary,
  message: datFieldArbitrary,
  title: datFieldArbitrary,
});

type DatRow = {
  name: string;
  mail: string;
  other: string;
  message: string;
  title: string;
};

function createDatText(rows: DatRow[]): string {
  return rows
    .map(
      ({ name, mail, other, message, title }) =>
        `${name}<>${mail}<>${other}<>${message}<>${title}<>`,
    )
    .join("\n");
}

describe("ThreadParser", () => {
  propertyTest.prop([fc.array(datRowArbitrary, { minLength: 1, maxLength: 8 })])(
    "生成したdatレスの内容と順序を保つ",
    (rows) => {
      const url = new ChURL("https://egg.5ch.io/test/read.cgi/software/1000000001/");
      const result = ThreadParser.parse(url, createDatText(rows));

      expect(result.title).toBe(rows[0].title);
      expect(result.posts).toHaveLength(rows.length);
      rows.forEach((row, index) => {
        expect(result.posts[index]).toMatchObject({
          number: index + 1,
          name: row.name.trim() ? row.name : "名無し",
          mail: row.mail,
          other: row.other,
          message: row.message,
        });
      });
    },
  );

  propertyTest.prop([
    fc.array(datRowArbitrary, { minLength: 1, maxLength: 8 }),
    fc.integer({ min: 0, max: 3 }),
  ])("先頭の空行数が変わっても解析結果を保つ", (rows, leadingBlankLines) => {
    const url = new ChURL("https://egg.5ch.io/test/read.cgi/software/1000000001/");
    const dat = createDatText(rows);

    expect(ThreadParser.parse(url, "\n".repeat(leadingBlankLines) + dat)).toEqual(
      ThreadParser.parse(url, dat),
    );
  });

  it("メタデータ付きの2ch形式datを解析する", () => {
    const url = new ChURL("https://egg.5ch.io/test/read.cgi/software/1000000001/");
    const dat =
      "Name1</b>(Slip 1)<b><>Mail1<>2026/03/06(金) 12:00:00.00 ID:TestImage5<>Message1<>Thread Title\n" +
      "Name2</b>◆Trip2<b><>Mail2<>2026/03/06(金) 12:05:00.00 ID:def67890<>Message2<>\n";

    const result = ThreadParser.parse(url, dat);
    expect(result.title).toBe("Thread Title");
    expect(result.posts).toHaveLength(2);

    expect(result.posts[0].name).toBe("Name1</b>(Slip 1)<b>");
    expect(result.posts[0].id).toBe("TestImage5");
    expect(result.posts[0].slip).toBe("Slip 1");

    expect(result.posts[1].name).toBe("Name2</b>◆Trip2<b>");
    expect(result.posts[1].id).toBe("def67890");
    expect(result.posts[1].trip).toBe("◆Trip2");
  });

  it("2ch形式datの名前欄が空なら名無しを使用する", () => {
    const url = new ChURL("https://egg.5ch.io/test/read.cgi/software/1000000001/");
    const dat = "<><>2026/03/06(金) 12:00:00.00 ID:empty<>Message<>Thread Title\n";

    const result = ThreadParser.parse(url, dat);

    expect(result.posts[0].name).toBe("名無し");
  });

  it("したらばの過去ログHTMLを正規スレッド形式へ解析する", () => {
    const url = new ChURL("https://jbbs.shitaraba.net/bbs/read_archive.cgi/computer/12345/100/");
    const html = `
      <h1>過去ログのタイトル</h1><dl>
      <dt>1 ：<a href="mailto:"><b>名無しさん</b></a> ：2026/08/23(日) 12:00:00.00 ID:first</dt>
      <dd>最初の本文<br></dd><br><br>
      <dt>2 ：<b>二人目</b> ：2026/08/23(日) 12:05:00.00 ID:second</dt>
      <dd>二つ目の本文<br></dd><br><br>
    `;

    const result = ThreadParser.parse(url, html);

    expect(result.title).toBe("過去ログのタイトル");
    expect(result.posts).toEqual([
      expect.objectContaining({
        number: 1,
        name: "名無しさん",
        date: "2026/08/23(日) 12:00:00.00 ID:first",
        message: "最初の本文",
      }),
      expect.objectContaining({ number: 2, name: "二人目", id: "second", message: "二つ目の本文" }),
    ]);
  });
});
