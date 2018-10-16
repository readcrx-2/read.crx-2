import {ReadState} from "../core/BookmarkEntryList"

export function deepCopy (src:any):any {
  var copy:any, key:string;

  if (typeof src !== "object" || src === null) {
    return src;
  }

  copy = Array.isArray(src) ? [] : {};

  for (key in src) {
    copy[key] = deepCopy(src[key]);
  }

  return copy;
}

export function replaceAll (str:string, before:string, after:string): string {
  var i = str.indexOf(before);
  if (i === -1) return str;
  var result = str.slice(0, i) + after;
  var j = str.indexOf(before, i+before.length);
  while (j !== -1) {
    result += str.slice(i+before.length, j) + after;
    i = j;
    j = str.indexOf(before, i+before.length);
  }
  return result + str.slice(i+before.length);
}

export function escapeHtml (str:string):string {
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

export function safeHref (url:string):string {
  return /^https?:\/\//.test(url) ? url : "/view/empty.html";
}

export function clipboardWrite (str:string):void {
  var $textarea:HTMLTextAreaElement;

  $textarea = $__("textarea");
  $textarea.value = str;
  document.body.addLast($textarea);
  $textarea.select();
  document.execCommand("copy");
  $textarea.remove();
}

export function isNewerReadState (a:ReadState|null, b:ReadState|null):Boolean {
  if (!b) {
    return false;
  }
  if (!a) {
    return true;
  }

  if (a.received !== b.received) {
    return (a.received < b.received);
  }
  if (a.read !== b.read) {
    return (a.read < b.read);
  }
  if (a.date && b.date) {
    return (a.date < b.date);
  } else if (a.date) {
    return false;
  } else if (b.date) {
    return true;
  }
  if (a.last !== b.last) {
    return true;
  }
  if (a.offset !== b.offset) {
    return true;
  }

  return false;
}
