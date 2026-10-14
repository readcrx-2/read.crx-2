# モジュール境界の作業状況（2026-10-15 時点）

- ブランチ: `feature/module-boundaries`（`develop` から作成、未 push）
- 全体計画: [モジュール境界の明確化計画](module-boundaries-plan.md)
- この文書は、作業途中の問題点と判断待ちの事項をまとめたもの。

## 1. 完了している作業

| Phase | 内容 | 主なコミット |
| --- | --- | --- |
| 0 | 依存の導入、ベースラインの確認 | — |
| A | `core` → `service-container` の値 import を警告（許可リスト付き） | `6c4cd841` |
| B | `core` が使う型を `src/core/ports/` へ移動 | `ce0a8a88`、`085daacf` |
| C-1 | `core` のサービス参照を `corePorts`（`registry.ts`）へ置き換え。禁止ルールを `error` に | `13f77d40` |
| C-2 | `core` の各モジュールの依存を引数で受け取る形に変更（工場関数・コンストラクタ） | `8c4dcd21` 〜 `bcd44aa5`、`9db8c344` |
| D-1 | `useViewSurface` を `features/auxiliary-window` から `view/browser/hooks` へ移動 | `f86bb8d9` |

検証は、各コミット時点で `tsc` と `vp test run`（276 ファイル・2157 件）を通しています。

## 2. 未完了の作業

### Phase D: `features` 間の依存（停止中）

- 残りは **138 件・41 組**。
- 主な共有先:
  - タブ状態（`use-tab-store`・`tab-store-actions`）。ほぼ全機能が参照。
  - 媒体の表示部品（`ResMediaGallery`・`ExternalImage`・`url-media`）。
  - NG の状態と表示部品（`use-ng-status`・`NgBadge`）。
- **判断待ち**: `features` から `view` への依存を認めるかどうか。
  - 認める場合: `view/browser` の汎用部分（hooks・components・types）を共有層とし、`view/browser/pages` と `App` を最上位とする。`view/browser` が `features` を import しないことを検査で守る。
  - 認めない場合: 共有の状態・部品を `app` か `core` へ移す。

### Phase C-2 の残り

- `jsutil.searchNextThread` が `Board.get(url, corePorts)` を呼んでいる。
- 各モジュールの既定インスタンス（`NG`・`ThreadService`・`BoardService` など）は、`app.ts` の公開 API のために `corePorts` を参照している。
- `core` の中で UI 寄りの通知（`toast`）を使う箇所が残っている。
  - `NG` の `onRegexError`
  - `BBSMenuModel` の板一覧取得エラー
  - `Board` の `message` による通知
- 一部のテスト（`ReplaceStrTxt.test` など）は、登録済みサービスのモックに頼ったまま。工場関数に依存を直接渡す形にはしていない。

### Phase E: 循環 import と `view` → `core`（未着手）

- 循環 import は計測時 6 件。C-2 の後の件数は未計測。
- `view` → `core` の直接 import は 21 ファイル（計測時）。サービスコンテナ経由への置き換えは未着手。

### Phase F: 検査を `error` にする（未着手）

- 禁止ルールは `core` → `service-container` のみ（`error`）。
- `features` 間の依存と `view` → `core` の依存には、まだ検査がない。
- 循環検出（`import/no-cycle`）は計測でのみ使用。`vite.config.ts` には入っていない。

## 3. 計画との食い違い

- 計画書 §3 の図では `view` が `features` の上にある。
- 実際には `tab-store-actions` が `view/browser/types` を参照しており、逆方向の依存が既にある。
- D-1 で `features` → `view/browser/hooks` の依存が 1 種類増えた。
- 判断が決まるまで、計画書の図は未確定。

## 4. 検証の抜け

- `build:chrome` は、C-2 の途中までは通している。D-1 の移動と「Board・Thread の依存を必須にする」変更の後は再実行していない。
- lint には、この作業と無関係な警告が以前からある（`unicorn`・`react` など）。エラーはない。

## 5. 次に必要なこと

1. `features` → `view` の依存の扱いを決める（上記 2 の判断事項）。
2. 判断後、Phase D を 1 組ずつ進める。
3. 判断を待たずにできるもの:
   - `build:chrome` の再実行
   - `jsutil` の `corePorts` 参照の整理
   - `core` の `toast` 通知の移動計画
