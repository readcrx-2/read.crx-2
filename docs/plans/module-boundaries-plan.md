# モジュール境界の明確化計画

- ブランチ: `refactor/module-boundaries`（`develop` から作成。旧名 `feature/module-boundaries`）
- 状態: Phase 0・A・B・C-1・C-2・D-1〜D-4 完了（§3.2 の逆向きの依存はすべて解消し、§3.4 の検査を許可リストなしの `error` で導入）。次は D-5（機能間の残りの依存）

## 1. 目的

- 今後の機能追加に備え、`core` / `features` / `view` / `app` の依存方向を明文化し、機械的に検査できるようにする。
- VS Code の Source Code Organization（レイヤーと依存方向を決め、違反を検査する）を参考に、アーキテクチャの研究材料にする。
  - 参考: https://github.com/microsoft/vscode/wiki/Source-Code-Organization

## 2. 背景（現状）

- ESLint から oxlint（`vp lint`）へ移行済み。
- `vite.config.ts` の oxlint 設定は `vite-plus/prefer-vite-plus-imports` と `simple-import-sort` のみで、**import の境界を検査するルールが無い**。そのため、以下の違反はすべて lint を通過していた。
- `AGENTS.md` の構成説明は散文のみで、機械的に担保されていない。

### 2.1 計測結果（2026-10-14）

計測は `vp lint -c <probe.json>` で `eslint/no-restricted-imports` と `import/no-cycle` を一時的に有効にして行った。ルール案は §4 を参照。

| 境界 | 違反 | 内容 |
| --- | --- | --- |
| `core` → `service-container` | 27 ファイル | うち値として `container` を使うファイルが 15。残りは型（`interfaces`）の import のみ |
| `core` → `view` / `features` | 0 件 | 違反なし |
| `features` 間の直接 import | 42 組・139 件 | 最多は `tabs → auto-refresh`（10）、次いで `archive-replay → comment-overlay`（8）、`tabs → auxiliary-window`（8） |
| `view` → `core` 直接 import | 21 ファイル | `AGENTS.md` ではサービスコンテナ経由が望ましいとされている |
| 循環 import | 6 件 | `core/util/jsutil.ts`、`core/board/Board.ts`、`core/network/URL.ts`、`core/storage/Cache.ts` など |

### 2.2 core の依存の詳細

- `core` は `container`（`src/service-container/index`）を値として使い、`container.bookmark`、`container.ng`、`container.cache`、`container.config`、`container.readState`、`container.util` などを呼んでいる。
- `core` が `container.toast.notify` を呼ぶ箇所もあり、UI 寄りの処理が `core` に入り込んでいる（`BBSMenuModel.ts` など）。
- `core` が使う型（`IConfig`、`ICacheItem`、`IBookmark`、`IReadState` など）は `src/service-container/interfaces.ts` に定義されている。
- `src/service-container/setup.ts` は `core` の実装を import して組み立てる側。`core` → `service-container/index` の向きは、組み立て層への逆向き依存になっている。

## 3. 依存ルール（2026-10-15 確定）

`view/browser` を「UI 部品層」と「組み立て層」に分け、依存は次の向きだけを許可する。

```
view/browser/{App, pages, shell}                     ← 組み立て層（features を import してよい）
   ↓
features/<機能>   ── 機能同士は互いに依存しない
   ↓
view/browser/{ui, hooks, utils, types, components, state, commands}   ← UI 部品層
   ↓
service-container ・ app ・ core/*（app/platform のインターフェースを含む）
   ↓
core/util
```

1. `core/*` は `view/*`、`features/*` を import しない。
2. `core/*` は `service-container` を値として import しない。型は `core/ports` に置く（Phase B で完了）。
3. `features/<A>` は `features/<B>` の内部を import しない。共有が必要なものは UI 部品層か `core` に移す。
4. **`features` から UI 部品層への依存は認める。** UI 部品層は `features`・`pages`・`shell`・`App` を import しない。
5. `features` は組み立て層（`pages`・`shell`・`App`）を import しない。
6. `view/*` は `core/*` を直接 import しない。サービスコンテナ経由にする（段階的に適用）。
7. 循環 import を作らない。

### 3.1 この形にした理由

- `features` → `view/browser` の import は、決定時点で **124 ファイル・約 400 行** ある。主な参照先は `types`（42）、`use-view-surface`（36）、`link-routing`（20）、`StatusBar`（15）、`ContextMenu`（14）、`use-toast`（12）。
- これを禁止すると、`view/browser` の汎用部分をほぼ丸ごと移すことになり、実質はディレクトリ名の付け替えになる。
- 移し先の候補だった `app`・`core` は React に依存しない層である。React のフックや部品を置くと、AGENTS.md の層の定義が崩れる。
- 参考にしている VS Code でも、`workbench/contrib/*`（機能）は `workbench/browser` や `base/browser/ui`（共有 UI）に依存してよい。禁止されているのは逆向きの依存である。
- そのため、問題は `features` → `view` の数ではなく、**UI 部品層 → `features`・`pages` の逆向きの依存** にあると判断した。

### 3.2 解消が必要な逆向きの依存（決定時点）

| 逆向きの依存 | 対応 |
| --- | --- |
| `features/tabs/ui/TabView.tsx` → `pages/*`（9 ページ） | 解消済み（`cb32daee`、`650c689b`）。`TabView`・`ContentArea`・`TabWindowHost`・`DetachedTabWindowContent` は `App` からしか使われない組み立て部品だったため、まとめて `view/browser/shell/` へ移した。props・context でページ一覧を渡す仕組みは不要になった |
| `ui/ContextMenu`・`ui/FloatingPopup` → `features/popup/browser/use-popup-manager`（`usePopupCloseBehavior`） | 解消済み（`c90fd1b2`、`56c835ec`）。フックを `view/browser/hooks` へ移した |
| `utils/utils.ts`（`export *`）・`utils/message-filter.ts` → `features/media/domain/*` | 解消済み（`f6157577`、`8cc79f92`、`5f1dee29`）。純粋関数を `core/util` へ移し、再エクスポートを外した |
| `commands/*` → `features/tabs/browser/*`（タブストア） | 解消済み（D-4: `8496ef14`、`73cd33d3`）。タブストアを UI 部品層（`view/browser/state/tabs`）へ移した |
| `components/{NavigationBar,BottomPanel,TitleBar,PageCountStatusItem}` → 各機能 | 解消済み（`257a23a0`、`6204bc2b`）。機能を組み合わせる枠なので、組み立て層（`view/browser/shell/`）へ移した。利用者は `App` と `shell/DetachedTabWindowContent` だけなので、ルール 5 とは衝突しない |
| `types.ts` → `pages/settings/settings-types`（型のみ、D-2 の途中で発見） | 解消済み（`52f6bcfd`、`75d54cdf`）。`SettingsPageUiState` はタブの表示状態に保存される型なので、参照する `SettingsSectionId` と一緒に `view/browser/types.ts` へ定義を移し、`pages/settings` 側から参照する |

### 3.3 機能間で共有されているものの置き場所

- **タブストア**（`use-tab-store`・`tab-store-actions`・`tab-store-selectors`・`tab-store-types`）は、アプリの外枠の状態として UI 部品層（`view/browser/state/tabs`）へ移した（D-4）。`tab-store-*` の全モジュール・`use-tab-view-scope`・`browser-session-storage` と、タブの自動更新フィールドを扱う純粋関数 `auto-refresh-pages`（元は `features/auto-refresh`）を一緒に移した。タブの機能そのもの（`TabBar`・`TabContextMenu` など）は `features/tabs` に残す。`TabView` などの組み立て部品は D-2 で `shell/` へ移した。
  - 機能間の依存の参照先で最も多い（`use-tab-store` 18 ファイル、`tab-store-actions` 7 ファイル）。
  - `tab-store-actions` → `view/browser/types` の依存も、同じ層の中の依存になる。
- **NG・媒体の共有部品**（`use-ng-status`・`NgBadge`・`ResMediaGallery`・`ExternalImage`）は、Phase D の中で次のどちらかに決める。
  - UI 部品層へ移す。
  - 他の機能からは `features/<x>/index.ts`（公開 API）だけを import してよい、というルールにする。

### 3.4 検査（D-3 で導入、`36f7219a`）

`vite.config.ts` の oxlint の `overrides` で、`eslint/no-restricted-imports` により次を `error` として検査する。

- `src/view/browser/{ui,hooks,utils,types,components,state,commands}/**` から `src/features/**`、`src/view/browser/pages/**`、`src/view/browser/shell/**`、`src/view/browser/App` を禁止する。
- `src/features/**` から `src/view/browser/pages/**`、`src/view/browser/shell/**`、`src/view/browser/App` を禁止する。
- 導入時は `src/view/browser/commands/` の 2 ファイルとそのテストを許可リストで除外していたが、D-4 でタブストアを移したため削除した（`f2651140`）。現在は許可リストなし。
- 注意: CI（`.github/workflows/ci.yml`）は `scripts/check-changed-files.mjs` で、変更したファイルだけに `vp check` を実行する。新しく違反する import を足したファイルは必ず変更ファイルに含まれるので検出できるが、既存の違反を一覧したいときは `vp lint src/` を手元で実行する。

## 4. 検査の方法

- oxlint（`vp lint`）で実装できることを確認済み。
  - `eslint/no-restricted-imports`（`patterns` の `group` 指定）: 指定パターンへの import を検出できる。
  - `import/no-cycle`: 循環 import を検出できる。
- 追加の依存ツール（dependency-cruiser など）は現時点では不要と判断した。
- 導入は最初 `warn` で行い、既存違反を潰してから `error` に上げる。
- 既存違反は、ファイル単位の許可リストで段階的に減らす。

計測用の probe 設定の例:

```json
{
  "plugins": ["import", "eslint"],
  "rules": {
    "eslint/no-restricted-imports": ["error", { "patterns": [{ "group": ["**/service-container/index"], "message": "core は container を値として使わない" }] }],
    "import/no-cycle": "error"
  }
}
```

## 5. 段階的な進め方

### Phase 0: 環境の確認（完了）

- `pnpm install` 済み。`pnpm exec vp --version` で Vite+ が動くことを確認。
- `vp` は PATH に無いため、`pnpm exec vp` で実行する。

### Phase 1: 依存ルールの確定（本文書）

- §3 のルールを確定する。判断が必要な点は §7 にまとめる。

### Phase A: core の container 依存を止める（完了）

目的: `core` から `container` の値 import を無くし、違反の増加を止める。

- 最初は `src/core/**` に `no-restricted-imports`（`warn`）を入れ、既存違反 14 ファイルを許可リストに入れた。
- 許可リストは Phase C-1 で空になり、禁止ルールは `error` に上げた（違反 0 件の状態で上げたため）。

### Phase B: core が使う型を core 側（`src/core/ports/`）に持つ（完了）

目的: `core` が使う型の正本を `core` 側に置き、型の import から `service-container` を外す。

1. `src/core/ports/` へ移した型: `ICacheItem`、`IReadState`、`INGResult`、`IThread`、`IRes`、`IThreadDetail`、`IThreadService`、`IBoardResult`、`IBBSMenuResult`（5 ファイル）。
2. `service-container/interfaces.ts` は、`src/core/ports` から import して再エクスポートする。既存の `features` や `view` の import は変えていない。
3. 続けて、サービスのインターフェース（`IConfig`、`IBookmark`、`IUtil`、`IBoardService`、`IBBSMenuService`、`INGService` など）を `src/core/ports/services.ts` へ移した（同じく再エクスポート）。

### Phase C-1: core のサービス参照を `corePorts` に置き換える（完了）

目的: `core` が `service-container` を import しない状態にする。

実装内容:

1. `src/core/ports/registry.ts` に `corePorts` を置いた。`CorePorts` は core が使うサービスの型だけを持つ。
   - 未登録のまま使うと、どのサービスを参照したかを含めて例外にする（`undefined` による原因不明の `TypeError` を避けるため）。
2. `service-container/Container.ts` で、global の container と同じ実体を `installCorePorts` で登録する。`setup.ts` の末尾でも登録する（同じ実体のため冪等）。
3. core の 14 ファイルの `container.` を `corePorts.` に置き換え、テストの `vi.mock` も `src/core/ports/registry` へ移した。
4. 禁止ルールを `error` にした（`src/core/**` から `**/service-container/**` への import）。

注意（C-1 の限界）:

- `corePorts` は登録されたサービスを引き回すだけで、まだグローバルな参照である。依存を引数で受け取る形（Phase C-2）には至っていない。
- `features` / `view` 側のテストで service-container をモックしていた箇所は、core に届く経路が変わったため、`corePorts` も同じ実体へ差し替えた（4 ファイル）。

完了条件（C-1）: `src/core` が `service-container` を import しない（達成）。`vp test run`、`tsc`、`build:chrome` が通る（達成）。

### Phase C-2: 依存を引数で注入する（完了。残りは後述）

目的: `core` の内部で `corePorts` も参照しないようにし、テストを書きやすくする。

1. `Board`、`BoardService`、`BBSMenuModel` など影響範囲の小さいものから、必要なポートをコンストラクタや引数で受け取る形にする。
2. 組み立ては `service-container/setup.ts` が担当する。
3. 一度に全部は変えず、1 モジュールずつ別コミットにする。
4. `core` からの `container.toast.notify` の呼び出しは、この段階で `features` か `app` へ移す。

進捗:

- 完了: `BoardService`（`createBoardService(deps)`、`setup.ts` が `container` を渡す）。
- 完了: `AutoNgPolicy` と `ThreadNgEvaluator`（`config` と `ThreadNgDeps` を引数で受け取る）。呼び出し側の `ThreadService` と `use-thread-data` は、まだ `corePorts` を渡している。
- 完了: `ch-server-move-detect`（`chServerMoveDetect(url, deps, html?)`）。
- 完了: `ImageReplaceDat`（`createImageReplaceDat(deps)`。既定のインスタンスの `get`・`set`・`replace` を export）。テストを追加。
- 完了: `ReplaceStrTxt`（`createReplaceStrTxt(deps)`。既定のインスタンスの `get`・`set`・`replace` を export）。
- 完了: `URL`（`expandShortURL(url, config)`。モジュール外からの呼び出しはない）。
- 完了: `OpenedBoards`（`createOpenedBoards(deps)`。既定のインスタンスの `upsertOpenedBoardEntry` を export）。
- 完了: `NG`（`createNG(deps)`。既定のインスタンスの関数を export。`toast` は依存として残す）。テストを追加。
- 完了: `BBSMenuModel`（コンストラクタで `cache`・`config`・`toast` を受け取る）。
- 完了: `BBSMenu`（`createBBSMenuFacade(deps)`。既定のインスタンスを export）。
- 完了: `BoardTitleSolver`（`createBoardTitleSolver(deps)`。既定のインスタンスを export）。
- 完了: `Board`（コンストラクタと静的メソッドで `BoardDeps` を受け取る）。
- 完了: `Thread`（コンストラクタと静的メソッドで `ThreadDeps` を受け取る）。
- 完了: `ThreadService`（`createThreadService(deps)`。既定のインスタンスを export）。

「既定値・既定のインスタンス」について:

- `Board`・`Thread` のコンストラクタと静的メソッドは、依存を必須にした。`window.app` 経由の外部利用はないことを確認したため、省略時の既定値は設けていない。
- 各モジュールの既定のインスタンス（`BoardService`・`NG`・`ThreadService` など）は、`app.ts` の公開 API のために残している。
- これらの既定値・既定インスタンスが、`corePorts` を参照する唯一の場所になっている。

残課題（C-2 の範囲外）:

- `jsutil.searchNextThread` は `Board.get` に `corePorts` を渡している。`jsutil` は互換用のファサードなので、呼び出し元を含めて別の段階で扱う。
- `NG` の `toast`、`Board` が通知に使う `message`、`BBSMenuModel` の `toast` は UI 寄りの処理である。`features` か `app` へ移す（後半の作業）。

### Phase D: features 間の依存を減らす（進行中）

目的: `features` 同士の直接 import を 0 にする。

進捗:

- 完了（D-1）: `useViewSurface` を `features/auxiliary-window` から `view/browser/hooks` へ移した。機能間の依存を 1 組（`auxiliary-window` への依存、9 機能・約 30 箇所）解消した。
- 残り: 45 行・24 組（D-4 の後、テストを除く。テストを含めると 61 行・24 組）。

方針（2026-10-15 決定、§3 を参照）:

- `features` から UI 部品層への依存は認める。UI 部品層から `features`・`pages` への逆向きの依存を先に解消する。

進め方:

1. D-2: §3.2 の逆向きの依存を、1 件ずつ別コミットで解消する。最初は D-1 と同じ要領の `usePopupCloseBehavior` の移動。
2. D-3（完了、`36f7219a`）: §3.4 の検査を `error` で入れた。D-2 の後に残る `commands` の 2 ファイル（タブストアへの依存）は許可リストに入れ、D-4 で外す。
3. D-4（完了）: タブストアを `view/browser/state/tabs` へ移し（`8496ef14`、`73cd33d3`）、§3.4 の許可リストを削除した（`f2651140`）。
4. D-5: NG・媒体の共有部品の扱いを決め、機能間の残りの依存を 1 組ずつ解消する。

### Phase E: 循環 import と view → core

1. 循環 import の 6 件を解消する（`core/util` の抽出など）。
2. `view` → `core` の直接 import を、サービスコンテナ経由に段階的に置き換える。

### Phase F: 検査を error に上げる

1. 違反がゼロになった項目から `warn` を `error` に上げる。
2. CI（`.github/workflows/ci.yml`）の lint が、その `error` を検出することを確認する。

## 6. 進め方の原則

- 1 コミットで「依存の付け替え」と「ファイル移動」を混ぜない。
- 1 コミットで 1 つの境界だけを扱う。
- 各 Phase の完了条件を満たしてから次へ進む。
- ESLint へは戻さない。oxlint で検査できることを確認済み。

## 7. 判断が必要な点

決定済み（2026-10-15）:

- D-2 の 5 件目と `TabView` → `pages/*` の扱い: 案 A を広げ、タブ表示の組み立て部品 4 ファイルを `view/browser/shell/` へ移した（§3.2）。
- 機能間の依存の件数は、**テストを除いた件数を正式な指標** とする。テストを含む件数は参考として併記する。
- `core/util/url-media.ts` は、`core/network/url-utils`（chlib の再エクスポートだけの互換窓口）を経由せず `@chlen/chlib` を直接参照する（`71e14707`）。chlib は最下層の共有パッケージなので、`util` から参照してよい。

未決:

- Phase B で、`core/ports` の置き場所を `src/core/ports/` とするか。
- `container.toast` の移動先を `app` にするか `features` にするか。
- Phase A の許可リストを `vite.config.ts` の `overrides` で持つか、別ファイルで持つか。
- `view` → `core` の直接 import を、どこまで段階的に禁止するか。

## 8. 検証

- 各 Phase の作業後に `pnpm exec vp lint` と `pnpm exec vp test run` を実行し、結果を記録する。
- 境界の検査は、probe 設定または `vite.config.ts` のルールで、違反件数の増減を確認する。
- 件数の変化は、この文書の §2.1 に追記する。
