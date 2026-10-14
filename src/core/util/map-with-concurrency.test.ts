// @vitest-environment node
import fc from "fast-check";
import { mapWithConcurrency } from "src/core/util/map-with-concurrency";
import { describe, expect, it } from "vite-plus/test";

describe("同時実行数を制限したmap", () => {
  it("入力件数や上限にかかわらず同時実行数を上限以下に保ち、結果順を維持する", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 80 }),
        fc.integer({ min: 1, max: 12 }),
        async (itemCount, concurrency) => {
          let activeCount = 0;
          let maximumActiveCount = 0;
          const items = Array.from({ length: itemCount }, (_, index) => index);

          const results = await mapWithConcurrency(items, concurrency, async (item) => {
            activeCount += 1;
            maximumActiveCount = Math.max(maximumActiveCount, activeCount);
            await Promise.resolve();
            activeCount -= 1;
            return item * 2;
          });

          expect(maximumActiveCount).toBeLessThanOrEqual(concurrency);
          expect(results).toEqual(items.map((item) => item * 2));
        },
      ),
    );
  });

  it("0件の入力は空配列を返す", async () => {
    await expect(mapWithConcurrency([], 4, async (item: never) => item)).resolves.toEqual([]);
  });

  it("不正な同時実行数を拒否する", async () => {
    await expect(mapWithConcurrency([1], 0, async (item) => item)).rejects.toThrow(RangeError);
  });
});
