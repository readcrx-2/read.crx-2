# モジュール境界の明確化計画

- ブランチ: `feature/module-boundaries`（`develop` から作成）
- 状態: 計画確定・Phase 0 完了・Phase 1 は本文書で確定、Phase A 着手前

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

### Phase A: core の container 依存を止める（実装済み・未コミット）

目的: `core` から `container` の値 import を無くし、違反の増加を止める。

実装内容（`vite.config.ts` の `lint`）:

1. `overrides` の `src/core/**` に `eslint/no-restricted-imports`（`warn`）を追加。対象は `service-container/index` への値 import。`allowTypeImports: true` で型 import は許可する。
2. 既存違反の 14 ファイルを、`overrides` の許可リスト（ルールを `off`）に入れた。
3. 確認: 許可リスト外の新規 `core` ファイルで警告が出ること、`features` / `view` では警告が増えていないこと（0 件）を確認済み。

作業手順:

1. 上記のルールを追加する（実装済み）。
   - `import type` は許可する（Phase B まで型依存は残すため）。
2. 既存の違反 14 ファイルを許可リストに入れる（実装済み）。
3. 許可リストから外すのは、そのファイルを触るときだけとする。
4. `core` からの `container.toast.notify` 呼び出しは、Phase A では触らず、Phase B で移す候補としてメモする。

完了条件: 新規の `core` → `container`（値）が `vp lint` の警告として出る。既存の違反は許可リストに固定されている。

### Phase B: core が使うポートを core 側に持つ

目的: `core` が `service-container` を型でも参照しない状態にする。

1. `core` が必要とするインターフェース（`IConfig`、`ICacheService`、`ICacheItem`、`IBookmark`、`IReadState` など）を `src/core/ports/` へ移す。
2. `service-container/interfaces.ts` は `core/ports` の型を re-export するか、実装側で `core/ports` を実装する形にする。
3. `core` の `import type` を `core/ports` に書き換える。
4. `container.toast`、`container.util` などの UI・アプリ寄りの呼び出しは、`core` の外（`features` か `app`）へ移す。

完了条件: `core` の `service-container` 参照がゼロになり、Phase A の許可リストが空になる。

### Phase C: 依存を引数で注入する

目的: `core` の内部で `container` を参照しないようにし、テストを書きやすくする。

1. `Board`、`BoardService`、`BBSMenuModel` など影響範囲の小さいものから、必要なポートをコンストラクタや引数で受け取る形にする。
2. 組み立ては `service-container/setup.ts` が担当する。
3. 一度に全部は変えず、1 クラスずつ別コミットにする。

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
