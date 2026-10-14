export type { PopupCoreResult } from "src/features/popup/browser/use-popup-core";
export { usePopupCore } from "src/features/popup/browser/use-popup-core";
export type {
  ThreadPopupManagerParams,
  ThreadPopupManagerResult,
} from "src/features/popup/browser/use-thread-popup-manager";
export { useThreadPopupManager } from "src/features/popup/browser/use-thread-popup-manager";

/**
 * Popup managerは、スレッド上に開くpopupをまとめて管理する場所。
 *
 * 「どのpopupを表示するか」だけでなく、popup同士の親子関係や、
 * マウス操作に応じていつ閉じるかも、ここで一つの流れとして扱う。
 *
 * 【まず全体像】
 *
 * ThreadPage
 *   ├─ useThreadPopupManager ── popupを作る・座標を決める
 *   │    └─ usePopupCore ── popup一覧を保存・基本操作を担当する
 *   │         └─ popup-store.ts / popup-graph.ts
 *   └─ PopupRenderer ── popupを画面に描画する
 *        └─ usePopupCloseBehavior ── hoverやoutside clickで閉じる
 *
 * つまり、ThreadPage側が「開くpopup」を決め、storeがその一覧を持ち、
 * PopupRenderer側が一覧を画面に出す、という分担になっている。
 *
 * 【二段に分けている理由】
 *
 * - 下段の `usePopupCore` は、popupの種類やスレッドの内容を知らない共通層。
 *   scopeごとの一覧を読み取り、追加・削除・親子関係の操作だけを担当する。
 * - 上段の `useThreadPopupManager` は、スレッド画面に必要な組み立て役。
 *   `resMap` を使ったレス情報の解決、表示位置の計算、アンカープレビューの
 *   親子関係や遅延タイマーなど、スレッド固有のルールを担当する。
 * - そのため、popupを保存・操作する仕組みと、スレッド上でpopupをどう動かすかを
 *   別々に読めて、それぞれを独立してテストしやすい。
 *
 * 【popup情報の分け方（scope）】
 *
 * - popupの一覧・IDの採番・重なり順（z-index）を `popup-store.ts` に保存する。
 * - `scopeId` は、popupの情報を共有する範囲を表す名前。
 *   ThreadPageでは通常 `tabId` を使うので、別タブのpopupが混ざらない。
 * - 同じscopeで複数の表示部分が動いている間は、同じpopupの情報を共有する。
 *   最後の表示部分が画面から外れたときに、そのscopeの情報を片付ける。
 * - 本番ではstoreを一つ共有し、`createPopupStore` はテストなどで
 *   他のstateから独立したstoreを用意したいときに使う。
 *
 * 【popupの種類と親子関係】
 *
 * - 各popupは `PopupItem` という一件分のデータとして、
 *   種類ごとの表示内容・座標・重なり順を持つ。
 *   たとえばレスツリー、ID検索、コンテキストメニュー、アンカープレビューがある。
 * - `parentId` がpopupの親を指す。親から開いたpopupは同じ枝（branch）に属する。
 *   親を閉じると、その親から開いた子孫もまとめて閉じる。
 * - `popup-graph.ts` はこの親子関係の計算を担当する。
 *   ReactやZustandに依存しない小さな関数に分けているので、関係だけを安全にテストできる。
 *
 * 【popupが動く流れ】
 *
 * - `usePopupCore` は、指定したscopeに対してpopupを追加・削除したり、
 *   枝単位で閉じたり、レスツリーやIDポップアップをpinしたりする操作を提供する。
 * - `useThreadPopupManager` はスレッド固有の処理を担当する。
 *   レスからpopupを作り、画面内に収まる座標を計算し、
 *   アンカープレビューの深さ・元になったpopup・遅延タイマーを管理する。
 * - `usePopupCloseBehavior` は画面上の操作を担当する。
 *   popup内のhover、outside click、子popupへの移動を見て閉じるか判断する。
 *
 * 【閉じ方の主なルール】
 *
 * - リンクや中クリックの直後は、mouseleaveだけでpopupを閉じない。
 * - 右クリックでは、メニューを開く前に今あるpopupの枝を閉じない。
 * - コンテキストメニューはmouseleaveでは閉じず、outside clickやRadixのdismissで閉じる。
 * - pinしたレスツリーやIDポップアップやアンカーは一番上のpopupとして扱い、通常popupの一括closeから外す。
 * - アンカープレビューは、深さ・元になったpopup・遅延タイマーを使って親子関係を保つ。
 *
 * 画面上の閉じ方を担当する `usePopupCloseBehavior` は、UI 部品層の `view/browser/hooks` へ移した。
 */
