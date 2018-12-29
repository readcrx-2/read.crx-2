export function deepCopy(src: any): any {
  if (typeof src !== "object" || src === null) {
    return src;
  }

  const copy = Array.isArray(src) ? [] : {};

  for (const key in src) {
    copy[key] = deepCopy(src[key]);
  }

  return copy;
}

export function replaceAll(str: string, before: string, after: string): string {
  let i = str.indexOf(before);
  if (i === -1) return str;
  let result = str.slice(0, i) + after;
  let j = str.indexOf(before, i+before.length);
  while (j !== -1) {
    result += str.slice(i+before.length, j) + after;
    i = j;
    j = str.indexOf(before, i+before.length);
  }
  return result + str.slice(i+before.length);
}

export function escapeHtml(str: string): string {
  return replaceAll(
    replaceAll(
      replaceAll(
        replaceAll(
          replaceAll(str, "&", "&amp;")
        , "<", "&lt;")
      , ">", "&gt;")
    , '"', "&quot;")
  , "'", "&apos;");
}

export function safeHref(url: string): string {
  return /^https?:\/\//.test(url) ? url : "/view/empty.html";
}

export function clipboardWrite(str: string) {
  const $textarea = $__("textarea");
  $textarea.value = str;
  document.body.addLast($textarea);
  $textarea.select();
  document.execCommand("copy");
  $textarea.remove();
}
