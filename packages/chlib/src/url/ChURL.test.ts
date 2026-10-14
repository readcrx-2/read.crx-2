// @vitest-environment node
import { fc, test as propertyTest } from "@fast-check/vitest";
import { describe, expect, it } from "vite-plus/test";

import { ChURL } from "./ChURL";
import { HOSTNAME } from "./hosts";

function urlWithHost(hostname: string, path: string): string {
  const url = new URL(`https://example.com${path}`);
  url.hostname = hostname;
  return url.href;
}

const pathSegmentArbitrary = fc
  .array(fc.constantFrom("a", "z", "0", "9", "_", "-"), { minLength: 1, maxLength: 16 })
  .map((characters) => characters.join(""));

describe("ChURL", () => {
  propertyTest.prop([
    fc.constantFrom("bbs.example.test", HOSTNAME.NEW_5CH, HOSTNAME.OLD_2CH, HOSTNAME.EDDIBB),
    pathSegmentArbitrary,
    fc.integer({ min: 1, max: 9_999_999_999 }).map(String),
    fc.integer({ min: 1, max: 1000 }),
    fc.boolean(),
  ])(
    "正規化済みスレッドURLを再解析しても結果が変わらない",
    (hostname, boardKey, threadId, resNumber, isDatLink) => {
      const path = isDatLink
        ? `/${boardKey}/dat/${threadId}.dat`
        : `/test/read.cgi/${boardKey}/${threadId}/${resNumber}`;
      const normalized = new ChURL(`https://${hostname}${path}?view=compact#res=${resNumber}`);
      const reparsed = new ChURL(normalized.href);

      expect(reparsed.href).toBe(normalized.href);
      expect(reparsed.type).toBe("thread");
      expect(reparsed.getBoardName()).toBe(boardKey);
      expect(reparsed.getThreadId()).toBe(threadId);
    },
  );

  it("任意ドメインのdat直リンクをスレッドURLとして正規化する", () => {
    const url = new ChURL("https://bbs.example.test/flaming/dat/1000000001.dat");

    expect(url.type).toBe("thread");
    expect(url.url.href).toBe("https://bbs.example.test/test/read.cgi/flaming/1000000001/");
    expect(url.getDatUrl()).toBe("https://bbs.example.test/flaming/dat/1000000001.dat");
    expect(url.getSubjectUrl()).toBe("https://bbs.example.test/flaming/subject.txt");
  });

  it("eddibbのdat直リンクをHTTPの標準スレッドURLへ正規化する", () => {
    const url = new ChURL(urlWithHost(HOSTNAME.EDDIBB, "/liveedge/dat/1000000011.dat"));

    expect(url.type).toBe("thread");
    expect(url.url.href).toBe(`http://${HOSTNAME.EDDIBB}/test/read.cgi/liveedge/1000000011/`);
    expect(url.getDatUrl()).toBe(`http://${HOSTNAME.EDDIBB}/liveedge/dat/1000000011.dat`);
  });

  it("レス番号付きのread.cgi URLをスレッド本体へ正規化する", () => {
    const url = new ChURL(
      urlWithHost(`kako.${HOSTNAME.NEW_5CH}`, "/test/read.cgi/exampleboard/1000000008/20"),
    );

    expect(url.type).toBe("thread");
    expect(url.url.href).toBe(
      `https://kako.${HOSTNAME.NEW_5CH}/test/read.cgi/exampleboard/1000000008/`,
    );
  });

  it("native URLとして直接使え、旧.url参照も同じインスタンスを返す", () => {
    const url = new ChURL("https://example.com/test/read.cgi/board-key/123/?q=1#res=45&raw=value");

    expect(url).toBeInstanceOf(URL);
    expect(url.url).toBe(url);
    expect(url.hostname).toBe("example.com");
    expect(url.pathname).toBe("/test/read.cgi/board-key/123/");
    expect(url.searchParams.get("q")).toBe("1");
    expect(url.getHashParams().get("res")).toBe("45");
    expect(url.getHashParams().get("raw")).toBe("value");

    url.hash = "changed=1";
    expect(url.hash).toBe("#changed=1");
    // raw hashはURL読み込み時のレス位置情報として固定し、URL編集後も読める。
    expect(url.getHashParams().get("res")).toBe("45");
  });

  it("test/-形式のスレッドを板・dat取得先・識別子へ揃える", () => {
    const url = new ChURL(urlWithHost("server.example.test", "/test/-/board-key/123/45"));

    expect(url.type).toBe("thread");
    expect(url.getThreadId()).toBe("123");
    expect(url.getBoardName()).toBe("board-key");
    expect(url.toBoard().href).toBe("https://server.example.test/board-key/");
    expect(url.getDatUrl()).toBe("https://server.example.test/board-key/dat/123.dat");
    expect(url.getSubjectUrl()).toBe("https://server.example.test/board-key/subject.txt");
  });

  it.each([`ula.${HOSTNAME.OLD_5CH_NET}`, `ula.${HOSTNAME.OLD_2CH}`])(
    "旧ULAホスト %s を現在のスレッド形式へ移す",
    (host) => {
      const url = new ChURL(
        urlWithHost(host, `/2ch/board-key/server-key.${HOSTNAME.OLD_5CH_NET}/123/45`),
      );
      expect(url.type).toBe("thread");
      expect(url.href).toBe(`https://server-key.${HOSTNAME.NEW_5CH}/test/read.cgi/board-key/123/`);
      expect(url.getResNumber()).toBe("45");
      expect(url.getBoardName()).toBe("board-key");
    },
  );

  it("itestのgレス番号を解決し、未解決hostから取得URLを作らない", () => {
    const url = new ChURL(
      urlWithHost(HOSTNAME.ITEST_5CH, "/test/read.cgi/board-key/123/g?g=45#res=45"),
    );
    expect(url.type).toBe("thread");
    expect(url.getThreadId()).toBe("123");
    expect(url.getResNumber()).toBe("45");
    expect(url.toBoard().href).toBe(`https://${HOSTNAME.ITEST_5CH}/board-key/`);
    expect(url.getDatUrl()).toBeNull();
    expect(url.getSubjectUrl()).toBeNull();
  });

  it("itest map resolverへ入力元ネットワークを渡しkakoを過去ログとして扱う", () => {
    let network: "5ch" | "bbspink" | null = null;
    const pink = new ChURL(urlWithHost(HOSTNAME.ITEST_BBSPINK, "/board-key/123/"));
    expect(
      pink.convertFromPhone((_boardKey, sourceNetwork) => {
        network = sourceNetwork;
        return `pink-server.${HOSTNAME.BBSPINK}`;
      }),
    ).toBe(true);
    expect(network).toBe("bbspink");
    expect(pink.hostname).toBe(`pink-server.${HOSTNAME.BBSPINK}`);

    const archive = new ChURL(
      urlWithHost(HOSTNAME.ITEST_5CH, "/kako/test/read.cgi/board-key/123/"),
    );
    expect(archive.isArchive).toBe(true);
    expect(archive.getDatUrl()).not.toBeNull();
    expect(archive.getSubjectUrl()).toBeNull();
  });
});
