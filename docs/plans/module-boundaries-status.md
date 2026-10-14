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
| D-3 | UI 部品層 → `features`・組み立て層、`features` → 組み立て層の import を oxlint で `error` にする。`commands` の 2 ファイルとそのテストは許可リスト | `36f7219a` |
| D-4 | タブストア（`tab-store-*`・`use-tab-store`・`use-tab-view-scope`・`browser-session-storage`）と `auto-refresh-pages` を `view/browser/state/tabs` へ移し、参照先を付け替える（80 ファイル）。D-3 の許可リストを削除する | `8496ef14`、`73cd33d3`、`f2651140` |
| D-5 | Story の分割（`29271136`、`59f9a085`）、次スレの判定処理の `next-thread/domain` への移動（`275de136`）、公開モジュールの一覧と機能どうしの境界・循環の検査（`97b686af`）。途中で作った `index.ts` は取り消した（`34ee041a`、`4ef928da`） | 上記 |

検証は、各コミット時点で `tsc` と `vp test run` を通しています。D-2 の完了時点では、`vp test run`（276 ファイル・2157 件）、`tsc`、`build:chrome` がすべて通りました。

## 2. 未完了の作業

### Phase D: `features` の依存（完了）

- 機能どうしの依存は **45 行・24 組**（テストを除く）。D-4 の前は 84 件・35 組だった。すべて公開モジュール（`vite.config.ts` の `FEATURE_PUBLIC_MODULES`、10 機能・30 ファイル）経由で、循環は無い。
- `comment-overlay` → `archive-replay` の逆向きは Storybook の Story だけだったので、Story を `archive-replay` 側へ分けた。実行時の依存は `archive-replay → comment-overlay` の一方向。
- **決定（2026-10-15）**: `features` → `view` の依存は認める。ただし `view/browser` を 2 層に分ける。
  - UI 部品層（`ui`・`hooks`・`utils`・`types`・`components`・`state`・`commands`）: `features` から参照してよい。`features`・`pages` は import しない。
  - 組み立て層（`App`・`pages`・`shell`）: `features` を組み合わせる最上位。
  - 理由と詳細は計画書の §3 を参照。
- 先に解消する逆向きの依存（計画書の §3.2）:
  1. ~~`features/tabs/ui/TabView.tsx` → `pages/*`~~（解消: `cb32daee`、`650c689b`。`shell/` へ移した）
  2. ~~`ui/ContextMenu`・`ui/FloatingPopup` → `features/popup` の `usePopupCloseBehavior`~~（解消: `c90fd1b2`、`56c835ec`）
  3. ~~`utils/utils.ts`・`utils/message-filter.ts` → `features/media/domain`~~（解消: `f6157577`、`8cc79f92`、`5f1dee29`）
  4. ~~`commands/*` → タブストア~~（解消: D-4。タブストアを `view/browser/state/tabs` へ移した）
  5. ~~`components/{NavigationBar,BottomPanel,TitleBar,PageCountStatusItem}` → 各機能~~（解消: `257a23a0`、`6204bc2b`。`shell/` へ移した）
  6. ~~`types.ts` → `pages/settings/settings-types`~~（解消: `52f6bcfd`、`75d54cdf`。型を `types.ts` へ移した）
- 逆向きの依存の残り（D-4 の後）: UI 部品層から `features`・組み立て層への import も、`features` から組み立て層への import も、テストを含めて 0 件。
- 項目 5 の注意（解消済み）: `DetachedTabWindowContent` が `BottomPanel`・`PageCountStatusItem`・`TitleBar` を使っていたため、`shell/` へ移すとルール 5 に反するおそれがあった。`DetachedTabWindowContent` 自体を `shell/` へ移したので、衝突しなくなった。

### Phase C-2 の残り（完了）

- `jsutil.searchNextThread`: 実装を `core/board/next-thread-candidates.ts` の `searchNextThreadCandidates`（依存を引数で受け取る）へ移した。`jsutil` には `window.app.util` のために `corePorts` を渡すだけの入口を残す（`23f035ff`）。
- `core` の中で `jsutil` を経由していた `Thread`・`Bookmark` を定義元の参照に変え、`core` から `jsutil` への import を lint で禁止した（`29311151`、`3f3a46f8`）。
- `core` の `toast`: `NG` の正規表現エラーと `BBSMenuModel` の板一覧取得エラーを、`ICoreNoticeService`（`notice`）の出来事（`ngRuleRegexInvalid`・`bbsMenuFetchFailed`）として伝えるようにした。文言・トースト・HTML は `service-container/setup.ts` が決める。`CorePorts` から `toast` を外し、`IToastService` の定義を `service-container/interfaces.ts` へ移した（`a828c47b`、`2b138518`）。
  - `Board` の `message` は、取得結果として返す文言で、画面の部品の呼び出しではないため、そのままにした。
- テスト: `Board`・`Thread`・`BBSMenuModel`・`OpenedBoards.contract` は、registry のモックをやめて依存を直接渡す（`1256ad40`）。`NG`・`ReplaceStrTxt`・`OpenedBoards.upsert`・`BoardTitleSolver`・`ThreadService` のテストは、`window.app` などが使う既定のインスタンスを確かめるものなので、registry のモックのまま残す。
- 各モジュールの既定のインスタンス（`corePorts` を参照する）は、`app.ts`（`window.app`）の公開 API のための組み立て口として残す。新しいコードは、サービスコンテナか工場関数を使う。

### Phase E: 循環 import と `view` → `core`（完了）

- 循環 import: 3 組（両端から数えて 6 件）をすべて解消し、`import/no-cycle` を `src` 全体で `error` にした（`fbc9c5bd`）。
  - `Board` ↔ `jsutil`: `Board` が `jsutil` の再エクスポート経由で移転判定を import していた。定義元を直接参照する（`d23dd284`）。
  - `URL` ↔ `Cache`: `getProtocol`・`isHttps` を `core/network/url-protocol.ts` へ分けた。`URL.ts` は `window.app.URL` のために再エクスポートする（`171ab420`）。
  - `tab-store-new-tab` ↔ `tab-store-state-helpers`: `getPageIdentity` を `tab-store-page-identity.ts` へ分けた（`5f2f43d6`）。
- `view`・`features` → `core`: 計画書のルール 6 を「状態や保存を伴うモジュールはサービスコンテナ経由、純粋なモジュールと型は直接」に改めた（§3.6、`7e723d3c`）。
  - サービスを 6 つ足し、呼び出し元を付け替えた（`history`・`writeHistory`・`threadLog`・`openedBoards`・`boardTitle`・`replaceStr`）。型は `Pick<typeof ...>` で core の関数から取る。
  - `use-thread-data` は `corePorts` の代わりに `container` を渡す。
  - `OpenedBoards` の保存形式と読み取りを `opened-board-entries.ts` へ分けた。
  - 6 つのサービスは `setupBrowserViewServices` で、メインの画面の起動時だけ登録する（replay.js の約 12KB の増加を避けるため）。
  - テストは、core のモジュールの `vi.mock` を、サービスコンテナへのテスト用サービスの登録（`service-container/test-stubs.ts` の `stubService`）か、モックしたサービスコンテナへ移した。
  - 検査（`adaa6ab2`）: `CORE_DIRECT_MODULES` に載せた 12 の純粋なモジュール以外の値の import を禁止する。型の import は認め、テストと Story は core の制限から外す。

### Phase F: 検査を `error` にする（完了）

- 禁止ルール（`error`）は次の 4 つ。
  - `core` → `service-container`
  - UI 部品層 → `features`・組み立て層（D-3。許可リストは D-4 で削除）
  - `features` → 組み立て層（D-3）
  - `features` → 他の機能の内部（公開モジュール以外）（D-5）
  - `view`・`features` → 状態を持つ `core` のモジュール（Phase E）
  - `core` → `jsutil`（互換用のまとめ口。C-2 の残り）
- CI: 静的解析のジョブで `vp lint src/` を実行し、変更していないファイルの境界の崩れも検出する（`f27a8c02`）。フォーマットは今までどおり変更ファイルだけで検査する。
- 循環検出（`import/no-cycle`）は、Phase E で循環を 0 件にしたうえで `src` 全体に入れた（`fbc9c5bd`）。

## 3. 計画との食い違い（解消済み）

- 以前の計画書 §3 の図では `view` 全体が `features` の上にあり、`tab-store-actions` → `view/browser/types` や D-1 の依存と食い違っていた。
- 2026-10-15 の決定で、`view/browser` を UI 部品層と組み立て層に分けた図に改めた。上の 2 つの依存は、`features` → UI 部品層として認められる。

## 4. 検証の抜け

- `build:chrome` は、`75d54cdf`（D-2 の最後のコミット）の後に再実行し、成功した。
- `36f7219a`（D-3）の時点で、`vp test run`（276 ファイル・2157 件）、`tsc`、`vp lint src/`（エラー 0 件）が通った。D-3 の検査は、許可リストを外すと `commands` の 4 ファイル・8 行だけを検出すること、`features` のファイルに `shell` の import を一時的に足すと検出することを確認した。
- `f2651140`（D-4）の時点で、`vp test run`（276 ファイル・2157 件）、`tsc`、`vp lint src/`（エラー 0 件）、`build:chrome` が通った。参照先の付け替えのコミットは、import の行以外を変えていないことを差分で確認した。
- `97b686af`（D-5）の時点で、`vp test run`（276 ファイル・2157 件）、`tsc`、`vp lint src/`（エラー 0 件）、`build:chrome` が通った。Tauri の overlay・replay・browser の各エントリの JS・CSS の大きさは、D-5 の前と同じ。D-5 の検査は、一覧に無いファイル・公開した入口の下のファイル・組み立て層・循環を一時的に足すとそれぞれ検出し、一覧から外すと利用箇所を検出することを確認した。
- `fbc9c5bd`（Phase E の循環）の時点で、`vp test run`（276 ファイル・2157 件）、`tsc`、`vp lint src/`（エラー 0 件）が通った。`core` と `features` に循環を一時的に足すと検出されることを確認した。
- `f76323ac`（Phase E の完了）の時点で、`vp test run`（276 ファイル・2158 件）、`tsc`、`vp lint src/`（エラー 0 件）、`build:chrome`、Storybook のビルドが通った。Tauri の各エントリの大きさは、overlay・replay が作業前と同じ（コンテナの枠の約 100 バイトを除く）、browser.js が約 1.9KB 増（サービスの登録分）。
- 同じ時点で E2E（Playwright）を、この環境にある Chromium（`CHLENS_E2E_CHROMIUM_PATH`）で実行し、18 件中 13 件が通った（閲覧履歴の保存、置換、NG、ローカル板、起動と設定画面など）。失敗した 5 件（`status-bar`・`theme-startup`）は、拡張機能を読み込まない既定のブラウザ（headless shell 1243）がこの環境に無いため起動できなかったもので、画面の不具合ではない。
- `1256ad40`（C-2 の残りの完了）の時点で、`vp test run`（277 ファイル・2161 件）、`tsc`、`vp lint src/`（エラー 0 件）、`build:chrome` が通った。Tauri の各エントリの大きさは、replay.js が `notice` の分で約 250 バイト増えたほかは変わらない。
- E2E は、この環境の Chromium で、`status-bar`・`theme-startup` の 5 件（既定のブラウザが無いための起動失敗）を除いて実行した。全体を 2 並列で流すと、`ng-persistence` か `ui` の 1 件が実行ごとに入れ替わって失敗することがある。同じ 2 つは単独で 4 回ずつ流すとすべて通り、C-2 の残りに着手する前のコミット（`f280702a`）でも同じように失敗したため、この作業より前からある負荷時の不安定さと判断した。
- lint には、この作業と無関係な警告が以前からある（`unicorn`・`react` など）。エラーはない。

## 5. 次に必要なこと

1. Phase D は完了した。`view/browser` の層の境界と、機能どうしの境界（公開モジュール・循環なし）は、許可リストなしで検査されている。
2. Phase E・F と C-2 の残りは完了した。画面での動作確認は Phase E の時点で済んでいる（2026-10-15）。
3. 機能間の件数の計測スクリプトは置かない。境界はすべて lint の error で検査し、CI で `src` 全体に流すようにしたため、件数を追う必要が無くなった。機能どうしの依存の一覧は `vite.config.ts` の `FEATURE_PUBLIC_MODULES` で読める。
4. 今後の候補（この計画の外）:
   - E2E の負荷時の不安定さ（`ng-persistence`・`ui` が 2 並列で時々失敗する）の調査。
   - `jsutil` などの互換用のまとめ口と既定のインスタンスを、`window.app` の利用者がいなくなった時点で減らす。

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
7. **機能の `index.ts`（まとめて再エクスポートするファイル）が副作用を広げる**（D-5 の途中で発見）。
   - `comment-overlay` の index から `OverlayStage` を出すと、その CSS が replay・browser の CSS にそれぞれ約 20KB 入った。
   - `next-thread` の index を経由すると、`comment-overlay` のテストが `window is not defined`（`service-container` の読み込み）で落ちた。
   - `media` の index を経由すると、overlay.js が約 46KB 増え、テストが 7 ファイル落ちた（`webextension-polyfill` の読み込み）。
   - 解消: `index.ts` をやめ、公開モジュールの一覧で公開 API を表す方針に改めた（計画書 §3.5）。今後も、まとめて再エクスポートするファイルを機能の入口にしない。
8. **`view/browser/state/tabs` の `tab-store-new-tab` と `tab-store-state-helpers` が互いに import している**（D-5 で循環を計測して発見）。D-4 で移す前から `features/tabs` にあった循環。
   - 解消: `getPageIdentity` を `tab-store-page-identity.ts` へ分けた（`5f2f43d6`）。
