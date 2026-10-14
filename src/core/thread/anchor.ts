/**
 * スレッドフロートBBSで用いられるアンカー形式を解析する。
 */
export const Anchor = {
  reg: {
    ANCHOR:
      /(?:&gt;|＞){1,2}[\d\uff10-\uff19]+(?:[-\u30fc][\d\uff10-\uff19]+)?(?:\s*[,、]\s*[\d\uff10-\uff19]+(?:[-\u30fc][\d\uff10-\uff19]+)?)*/g,
    _FW_NUMBER: /[\uff10-\uff19]/g,
  },

  parseAnchor(input: string): { targetCount: number; segments: [number, number][] } {
    let str = input.replaceAll("\u30fc", "-");
    str = str.replace(Anchor.reg._FW_NUMBER, (value) =>
      String.fromCharCode(value.charCodeAt(0) - 65248),
    );

    const data: { targetCount: number; segments: [number, number][] } = {
      targetCount: 0,
      segments: [],
    };
    if (!/^(?:&gt;|＞){0,2}([\d]+(?:-\d+)?(?:\s*[,、]\s*\d+(?:-\d+)?)*)$/.test(str)) {
      return data;
    }

    const segReg = /(\d+)(?:-(\d+))?/g;
    let segment: RegExpExecArray | null;
    while ((segment = segReg.exec(str))) {
      // 桁数の大きすぎる値と1以下の値は、従来どおり対象から除外する。
      if (segment[1].length > 5 || (segment[2] != null && segment[2].length > 5)) continue;
      if (+segment[1] < 1) continue;

      let segrangeStart: number;
      let segrangeEnd: number;
      if (segment[2]) {
        if (+segment[1] <= +segment[2]) {
          segrangeStart = +segment[1];
          segrangeEnd = +segment[2];
        } else {
          segrangeStart = +segment[2];
          segrangeEnd = +segment[1];
        }
      } else {
        segrangeStart = +segment[1];
        segrangeEnd = +segment[1];
      }

      data.targetCount += segrangeEnd - segrangeStart + 1;
      data.segments.push([segrangeStart, segrangeEnd]);
    }
    return data;
  },
};
