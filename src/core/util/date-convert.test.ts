import { stringToDate } from "src/core/util/date-convert";
import { describe, expect, it } from "vite-plus/test";

describe("stringToDate", () => {
  it("日時書式を解析し、不正な日時は拒否する", () => {
    const parsed = stringToDate("2024/2/3(土) 04:05");
    expect(parsed?.getFullYear()).toBe(2024);
    expect(parsed?.getMonth()).toBe(1);
    expect(parsed?.getDate()).toBe(3);
    expect(parsed?.getHours()).toBe(4);
    expect(parsed?.getMinutes()).toBe(5);
    expect(stringToDate("2024/13/3 04:05")).toBeNull();
  });
});
