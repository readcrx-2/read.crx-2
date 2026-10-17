/**
 * OSのファイル選択を開き、選ばれたファイルを返す。
 * キャンセルや選択なしは null で返し、呼び出し側で何もしない判定に使えるようにする。
 */
export function selectLocalFile(accept: string): Promise<File | null> {
  if (typeof document === "undefined" || !document.body) {
    return Promise.reject(new Error("ファイル選択を開ける画面がありません"));
  }

  const input = document.createElement("input");
  input.type = "file";
  input.accept = accept;
  input.hidden = true;

  return new Promise<File | null>((resolve) => {
    let settled = false;
    const settle = (file: File | null): void => {
      if (settled) {
        return;
      }
      settled = true;
      input.remove();
      resolve(file);
    };

    input.addEventListener("change", () => settle(input.files?.[0] ?? null), { once: true });
    // cancelイベントは、ファイルを選ばずOSの選択画面を閉じた場合にも発火する。
    input.addEventListener("cancel", () => settle(null), { once: true });
    document.body.append(input);
    input.click();
  });
}
