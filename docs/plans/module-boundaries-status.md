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
| D-2（一部） | `url-media` が `core/network/url-utils` ではなく `@chlen/chlib` を直接参照するようにする | `71e14707` |
| D-2（一部） | タブ表示の組み立て部品（`ContentArea`・`TabView`・`TabWindowHost`・`DetachedTabWindowContent`）を `features/tabs/ui` から `view/browser/shell/` へ移し、`App` の参照先を付け替える | `cb32daee`、`650c689b` |
| D-2（一部） | 画面の外枠の部品（`NavigationBar`・`BottomPanel`・`TitleBar`・`PageCountStatusItem`）を `components` から `shell/` へ移し、参照先を付け替える | `257a23a0`、`6204bc2b` |
| D-2（一部） | `SettingsSectionId`・`SettingsPageUiState` の型を `pages/settings/settings-types` から `view/browser/types.ts` へ移し、参照先を付け替える | `52f6bcfd`、`75d54cdf` |

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
  1. ~~`features/tabs/ui/TabView.tsx` → `pages/*`~~（解消: `cb32daee`、`650c689b`。`shell/` へ移した）
  2. ~~`ui/ContextMenu`・`ui/FloatingPopup` → `features/popup` の `usePopupCloseBehavior`~~（解消: `c90fd1b2`、`56c835ec`）
  3. ~~`utils/utils.ts`・`utils/message-filter.ts` → `features/media/domain`~~（解消: `f6157577`、`8cc79f92`、`5f1dee29`）
  4. `commands/*` → タブストア（D-4 で解消する）
  5. ~~`components/{NavigationBar,BottomPanel,TitleBar,PageCountStatusItem}` → 各機能~~（解消: `257a23a0`、`6204bc2b`。`shell/` へ移した）
  6. ~~`types.ts` → `pages/settings/settings-types`~~（解消: `52f6bcfd`、`75d54cdf`。型を `types.ts` へ移した）
- 逆向きの依存の残り（2026-10-15、`75d54cdf` 以降、テストを除く）: UI 部品層から `features`・`pages`・`shell` への import は 5 行・2 ファイル（`commands/browser-commands.ts`・`commands/tab-command-runtime.ts` → タブストア）。項目 4 として D-4 で解消する。テストを含めると、さらに `commands` のテスト 2 ファイル・3 行がある。`features` から組み立て層（`pages`・`shell`・`App`）への import は 0 件。
- 項目 5 の注意（解消済み）: `DetachedTabWindowContent` が `BottomPanel`・`PageCountStatusItem`・`TitleBar` を使っていたため、`shell/` へ移すとルール 5 に反するおそれがあった。`DetachedTabWindowContent` 自体を `shell/` へ移したので、衝突しなくなった。

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

- `build:chrome` は、`75d54cdf`（D-2 の最後のコミット）の後に再実行し、成功した。同じ時点で `vp test run`（276 ファイル・2157 件）、`tsc`、`vp lint`（エラー 0 件）も通った。
- lint には、この作業と無関係な警告が以前からある（`unicorn`・`react` など）。エラーはない。

## 5. 次に必要なこと

1. D-2 は、D-4 で扱う項目 4（`commands` → タブストア）を除いて完了した。
2. D-3: UI 部品層の検査を入れる。残りは `commands` の 2 ファイルだけなので、Phase A と同じく許可リストに入れて `error` で導入し、D-4 で許可リストを空にする。
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
2. ~~**`components` → `shell/` の移動が計画のルール 5 と衝突する**~~（解消）。`DetachedTabWindowContent` を含むタブ表示の組み立て部品 4 ファイルを `shell/` へ移した（`cb32daee`、`650c689b`）。
3. ~~**`TabView` → `pages/*` の逆向きの依存は、解消方法が未決**~~（解消）。`TabView` は `App` からしか使われない組み立て部品だったため、`shell/` へ移した。props・context の仕組みは作らない。
4. **機能間の依存の件数が、計測条件によって食い違う**。前回は 138 件・41 組、今回は 84 件・35 組（テストを除く）。
   - 決定: テストを除いた件数を正式な指標とし、テストを含む件数は参考として併記する。
5. **`core/util` が `core/network/url-utils` に依存している**（`url-media.ts`）。`url-utils.ts` は import を持たない純粋モジュールなので循環はないが、`util`（最下層）から `network` を参照する形になっている。
   - 解消: `url-utils` は chlib の再エクスポートだけの互換窓口だったため、`url-media` が `@chlen/chlib` を直接参照するようにした（`71e14707`）。置き場所は変えない。
6. **`view/browser/types.ts` が `pages/settings/settings-types` を型として import している**（D-2 の途中で発見）。UI 部品層から組み立て層への逆向きの依存なので、§2 の項目 6 として扱った。
   - 解消: `SettingsSectionId`・`SettingsPageUiState` の定義を `view/browser/types.ts` へ移した（`52f6bcfd`、`75d54cdf`）。
