// 起動時などの一括取得で通信が集中しないよう、同時数を小さく固定する。
export const MAX_CONCURRENT_BATCH_REQUESTS = 4;

/** 入力順の結果を保ちながら、非同期処理の同時実行数を制限する。 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new RangeError("concurrencyは1以上の整数で指定してください");
  }

  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(concurrency, items.length);
  const workers = Array.from({ length: workerCount }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await mapper(items[index]!, index);
    }
  });

  await Promise.all(workers);
  return results;
}
