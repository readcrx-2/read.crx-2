import { extractPostDate, type IRes as CanonicalRes } from "packages/chlib/src/index";
import type { IRes } from "src/core/ports/thread";

/**
 * chlibの共有レス（CanonicalRes）を、ビューへ渡すIResへ変換する。
 *
 * 型の境界: CanonicalResは番号を`number`、日付を入力の生文字列で持つ。
 * IResは番号を`num`、日付を表示用の日時だけで持ち、NG判定結果などの表示状態も載せる。
 * ID・Slip・Trip・BEはアダプタ（toCanonicalRes）で抽出済みのため、ここでは再抽出せず写すだけにする。
 * 入力は変更しない。
 */
export function toViewRes(post: CanonicalRes): IRes {
  const other = post.other ?? post.date;
  return {
    num: post.number,
    name: post.name,
    mail: post.mail,
    message: post.message,
    other,
    // 日時の形式差はchlibへ集約し、見つからなければ空文字にする。
    date: other ? (extractPostDate(other) ?? "") : "",
    id: post.id,
    slip: post.slip,
    trip: post.trip,
    be: post.be,
  };
}
