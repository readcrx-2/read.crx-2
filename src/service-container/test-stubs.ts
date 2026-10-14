/**
 * テストでサービスコンテナに登録する差し替え用のサービスを作る。
 * テストが使う関数だけを渡せばよく、渡していない関数が呼ばれたら、どのサービスの何が
 * 足りないかを含めて例外にする（undefined の呼び出しによる原因不明の TypeError を避けるため）。
 */
export function stubService<T extends object>(serviceName: string, impl: Partial<T>): T {
  // Partial<T> を T として返すため、足りない関数は Proxy で検出する。
  return new Proxy(impl, {
    get(target, property, receiver) {
      if (property in target || typeof property === "symbol" || property === "then") {
        return Reflect.get(target, property, receiver);
      }
      throw new Error(`テスト用の ${serviceName} サービスに ${property} が用意されていません`);
    },
  }) as T;
}
