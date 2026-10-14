const inFlightRequests = new Map<string, Promise<unknown>>();

/** 同じsubject.txtを同時に取得する呼び出しは、進行中の通信結果を共有する。 */
export function runBoardRequest<T>(key: string, request: () => Promise<T>): Promise<T> {
  const existing = inFlightRequests.get(key);
  if (existing) return existing as Promise<T>;

  const pending = request().finally(() => {
    if (inFlightRequests.get(key) === pending) {
      inFlightRequests.delete(key);
    }
  });
  inFlightRequests.set(key, pending);
  return pending;
}
