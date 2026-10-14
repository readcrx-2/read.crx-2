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
| D-2（一部） | `usePopupCloseBehavior` と `popup-dom` を `view/browser/hooks`・`view/browser/utils` へ移動し、呼び出し元を付け替える | `c90fd1b2`、`56c835ec` |
| D-2（一部） | 外部メディア判定（`external-media`）・URL 判定（`url-media`）の純粋関数を `core/util` へ移す。`view/browser/utils` の URL 再エクスポートを外す | `f6157577`、`8cc79f92`、`5f1dee29` |

検証は、各コミット時点で `tsc` と `vp test run` を通しています。D-2 の完了時点では、`vp test run`（276 ファイル・2157 件）、`tsc`、`build:chrome` がすべて通りました。

## 2. 未完了の作業

### Phase D: `features` 間の依存（方針決定済み）

- 残りは **84 件・35 組**（2026-10-15、テストを除いて数えた値。以前の 138 件・41 組とは計測条件が違うため、単純には比べられない）。
- 主な共有先:
  - タブ状態（`use-tab-store`・`tab-store-actions`）。ほぼ全機能が参照。
  - 媒体の表示部品（`ResMediaGallery`・`ExternalImage`・`url-media`）。
  - NG の状態と表示部品（`use-ng-status`・`NgBadge`）。
- **決定（2026-10-15）**: `features` → `view` の依存は認める。ただし `view/browser` を 2 層に分ける。
  - UI 部品層（`ui`・`hooks`・`utils`・`types`・`components`・`state`・`commands`）: `features` から参照してよい。`features`・`pages` は import しない。
  - 組み立て層（`App`・`pages`・`shell`）: `features` を組み合わせる最上位。
  - 理由と詳細は計画書の §3 を参照。
- 先に解消する逆向きの依存（計画書の §3.2）:
  1. `features/tabs/ui/TabView.tsx` → `pages/*`（未着手。props か context の設計が要る）
  2. ~~`ui/ContextMenu`・`ui/FloatingPopup` → `features/popup` の `usePopupCloseBehavior`~~（解消: `c90fd1b2`、`56c835ec`）
  3. ~~`utils/utils.ts`・`utils/message-filter.ts` → `features/media/domain`~~（解消: `f6157577`、`8cc79f92`、`5f1dee29`）
  4. `commands/*` → タブストア（D-4 で解消する）
  5. `components/{NavigationBar,BottomPanel,TitleBar,PageCountStatusItem}` → 各機能（`shell/` へ移す。下記の注意を参照）
- 逆向きの依存の残り（2026-10-15）: UI 部品層から `features`・`pages` への import は 25 行・8 ファイル。
- 項目 5 の注意: `features/tabs/ui/DetachedTabWindowContent.tsx` が `BottomPanel`・`PageCountStatusItem`・`TitleBar` を使っている。`shell/` へ移すと、`features` → 組み立て層の依存が新しく生まれ、計画書 §3 のルール 5 に反する。移し方を決めるまで未着手（計画書 §7 の判断事項）。

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

- `build:chrome` は、D-2 の完了時点（2026-10-15）で再実行し、成功した。
- lint には、この作業と無関係な警告が以前からある（`unicorn`・`react` など）。エラーはない。

## 5. 次に必要なこと

1. D-2 の残り（判断が必要）:
   - 項目 5（`components` → `shell/`）は、`DetachedTabWindowContent` の扱いを決めてから進める（計画書 §7）。
   - 項目 1（`TabView` → `pages/*`）は、ページ一覧を props か context で渡す設計を決めてから進める。
2. D-3: 逆向きが 0 件になったら、UI 部品層の検査を `error` で入れる。
3. D-4: タブストアを `view/browser/state/tabs` へ移す（項目 4 もここで解消する）。
4. D-5: NG・媒体の共有部品の扱いを決め、機能間の残りの依存を解消する。
5. 並行してできるもの:
   - `jsutil` の `corePorts` 参照の整理
   - `core` の `toast` 通知の移動計画

## 6. 発見した問題（2026-10-15 時点）

1. **Rust カバレッジ CI が Linux で失敗していた**（PR #163 で修正）。
   - `png` が Windows 専用の依存で、Linux でビルドできなかった。
   - `frontendDist`（`../debug/tauri`）が存在せず、`generate_context!()` が失敗していた。
   - PR #163 は draft のまま、`develop` へはまだ入っていない。`refactor/module-boundaries` へは取り込み済み（merge `0e6be0c7`）。
   - 影響: `develop` の CI は、PR #163 がマージされるまで Rust カバレッジが失敗したままになる。
2. **`components` → `shell/` の移動が計画のルール 5 と衝突する**。`features/tabs/ui/DetachedTabWindowContent.tsx` が組み立て層の部品を使っている（計画書 §7 の判断事項 A/B）。
3. **`TabView` → `pages/*` の逆向きの依存は、解消方法が未決**。ページ一覧の渡し方（props か context か）を決める必要がある。
4. **機能間の依存の件数が、計測条件によって食い違う**。前回は 138 件・41 組、今回は 84 件・35 組（テストを除く）。次回の計測は、テストを含むかどうかを揃えてから行う。
5. **`core/util` が `core/network/url-utils` に依存している**（`url-media.ts`）。`url-utils.ts` は import を持たない純粋モジュールなので循環はないが、`util`（最下層）から `network` を参照する形になっている。`url-media` を `core/network` へ置くほうが層の定義に合うか、判断が必要。
