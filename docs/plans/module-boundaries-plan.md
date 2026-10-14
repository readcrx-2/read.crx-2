# モジュール境界の明確化計画

- ブランチ: `feature/module-boundaries`（`develop` から作成）
- 状態: Phase 0・A・B・C-1・C-2 完了。Phase D 以降は未着手

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

## 3. 依存ルール（案）

依存は次の向きだけを許可する。

```
view/browser (pages, App)
   ↓
features/<機能>   ── 機能同士は互いに依存しない
   ↓
core/*  ・  app/platform（インターフェース）
   ↓
core/util
```

1. `core/*` は `view/*`、`features/*` を import しない。
2. `core/*` は `service-container` を値として import しない。型は段階的に `core` 側へ移す（Phase B）。
3. `features/<A>` は `features/<B>` の内部を import しない。共有が必要なら `core` か `app` に移す。
4. `view/*` は `core/*` を直接 import しない。サービスコンテナ経由にする（段階的に適用）。
5. 循環 import を作らない。

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

### Phase D: features 間の依存を減らす

目的: `features` 同士の直接 import を 0 にする。

1. 計測結果の件数が多い組から着手する（`tabs → auto-refresh`、`archive-replay → comment-overlay`、`tabs → auxiliary-window` など）。
2. 共有が必要な部分は `core` か `app` へ移す。UI の共有が必要なら `view/browser/components` に置く。
3. 1 組ずつ別コミットにする。

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

- Phase B で、`core/ports` の置き場所を `src/core/ports/` とするか。
- `container.toast` の移動先を `app` にするか `features` にするか。
- Phase A の許可リストを `vite.config.ts` の `overrides` で持つか、別ファイルで持つか。
- `view` → `core` の直接 import を、どこまで段階的に禁止するか。

## 8. 検証

- 各 Phase の作業後に `pnpm exec vp lint` と `pnpm exec vp test run` を実行し、結果を記録する。
- 境界の検査は、probe 設定または `vite.config.ts` のルールで、違反件数の増減を確認する。
- 件数の変化は、この文書の §2.1 に追記する。
