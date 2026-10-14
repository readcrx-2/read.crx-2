# モジュール境界の作業状況（2026-10-15 時点）

- ブランチ: `refactor/module-boundaries`（`develop` から作成。旧名 `feature/module-boundaries`）
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

### Phase D: `features` 間の依存（方針決定済み）

- 残りは **138 件・41 組**。
- 主な共有先:
  - タブ状態（`use-tab-store`・`tab-store-actions`）。ほぼ全機能が参照。
  - 媒体の表示部品（`ResMediaGallery`・`ExternalImage`・`url-media`）。
  - NG の状態と表示部品（`use-ng-status`・`NgBadge`）。
- **決定（2026-10-15）**: `features` → `view` の依存は認める。ただし `view/browser` を 2 層に分ける。
  - UI 部品層（`ui`・`hooks`・`utils`・`types`・`components`・`state`・`commands`）: `features` から参照してよい。`features`・`pages` は import しない。
  - 組み立て層（`App`・`pages`・`shell`）: `features` を組み合わせる最上位。
  - 理由と詳細は計画書の §3 を参照。
- 先に解消する逆向きの依存（計画書の §3.2）:
  1. `features/tabs/ui/TabView.tsx` → `pages/*`
  2. `ui/ContextMenu`・`ui/FloatingPopup` → `features/popup` の `usePopupCloseBehavior`
  3. `utils/utils.ts`・`utils/message-filter.ts` → `features/media/domain`
  4. `commands/*` → タブストア
  5. `components/{NavigationBar,BottomPanel,TitleBar,PageCountStatusItem}` → 各機能（`shell/` へ移す）

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

## 3. 計画との食い違い（解消済み）

- 以前の計画書 §3 の図では `view` 全体が `features` の上にあり、`tab-store-actions` → `view/browser/types` や D-1 の依存と食い違っていた。
- 2026-10-15 の決定で、`view/browser` を UI 部品層と組み立て層に分けた図に改めた。上の 2 つの依存は、`features` → UI 部品層として認められる。

## 4. 検証の抜け

- `build:chrome` は、C-2 の途中までは通している。D-1 の移動と「Board・Thread の依存を必須にする」変更の後は再実行していない。
- lint には、この作業と無関係な警告が以前からある（`unicorn`・`react` など）。エラーはない。

## 5. 次に必要なこと

1. D-2: 逆向きの依存を 1 件ずつ解消する（`usePopupCloseBehavior` の移動から）。
2. D-3: 逆向きが 0 件になったら、UI 部品層の検査を `error` で入れる。
3. D-4: タブストアを `view/browser/state/tabs` へ移す。
4. D-5: NG・媒体の共有部品の扱いを決め、機能間の残りの依存を解消する。
5. 並行してできるもの:
   - `build:chrome` の再実行
   - `jsutil` の `corePorts` 参照の整理
   - `core` の `toast` 通知の移動計画
