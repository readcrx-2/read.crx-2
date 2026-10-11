import { emitTo, listen } from "@tauri-apps/api/event";

export interface TauriEventChannelOptions<T> {
  /** Tauri event名。窓をまたいで共有する契約なので、送信側と受信側で同じ定義を使う。 */
  name: string;
  /** 送り先の窓label。emitToで対象を限定し、関係のない窓へ届けない。 */
  target: string;
  /** ログの接頭辞に使う機能名。 */
  logLabel: string;
  /** payloadの実行時検証。別WebViewから届く値は型を信用できないため必須にする。 */
  isPayload: (payload: unknown) => payload is T;
}

export interface TauriEventChannel<T> {
  readonly name: string;
  readonly target: string;
  readonly isPayload: (payload: unknown) => payload is T;
  /** 検証してから送り先の窓だけへ送る。不正な値は送らずにTypeErrorで知らせる。 */
  emit(payload: T): Promise<void>;
  /** 受信したpayloadを検証し、正しいものだけを購読者へ渡す。不正な値はログに残して捨てる。 */
  listen(listener: (payload: T) => void): Promise<() => void>;
}

/**
 * 窓をまたぐTauri eventを、名前・送り先・検証の3点で一か所に定義する。
 *
 * 変更理由: event名の定数、emitTo、listen、型ガードを機能ごとに手書きしていたため、
 * 送信側だけ検証して受信側で忘れる、といった食い違いが起きやすかった。
 */
export function defineTauriEventChannel<T>(
  options: TauriEventChannelOptions<T>,
): TauriEventChannel<T> {
  const { name, target, logLabel, isPayload } = options;
  return {
    name,
    target,
    isPayload,
    async emit(payload) {
      if (!isPayload(payload)) {
        throw new TypeError(`[${logLabel}] 送信しようとした ${name} のpayloadが不正です`);
      }
      await emitTo(target, name, payload);
    },
    listen(listener) {
      return listen<unknown>(name, ({ payload }) => {
        if (!isPayload(payload)) {
          console.error(`[${logLabel}] 不正な ${name} を受信しました:`, payload);
          return;
        }
        listener(payload);
      });
    },
  };
}
