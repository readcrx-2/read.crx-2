## AGENTS.md

### Project Overview

これは、TypeScript (React) と SCSS を使用して構築された 5ch 互換掲示板クライアントです。
ブラウザ拡張機能（Chrome/Firefox）およびデスクトップアプリ（Tauri）として動作します。

- **パッケージマネージャ:** pnpm
- **ビルドシステム:** Vite
- **言語/UIライブラリ:** TypeScript, React, SCSS
- **プラットフォーム:** Chrome, Firefox, Tauri
- **テスト環境:** Vitest (ユニットテスト), Playwright (E2Eテスト)

### Building instructions

ビルドは Vite を通じて行われます。`PLATFORM` 環境変数でターゲットを指定します。

- **Chrome 向けビルド:**
  ```bash
  pnpm run build:chrome
  ```
- **Tauri (Windows) 向けビルド:**
  ```bash
  pnpm run build:tauri
  ```
- **Firefox 向けビルド:**
  ```bash
  pnpm run build:firefox
  ```
- **開発中のウォッチモード (Chrome):**
  ```bash
  pnpm run watch:chrome
  ```
- **すべてのビルドとパッケージの作成:**
  ```bash
  pnpm run pack:all
  ```

### Architecture & Design Decisions

- **ブラウザビュー:** Vite のブラウザ向けエントリは `src/view/browser/index.tsx` です。`src/view/browser/App.tsx` がペイン、タブ、ナビゲーション、ステータスバー、下部パネルを組み合わせ、`src/view/browser/shell/ContentArea.tsx` がタブ内の各ページを `src/view/browser/pages/` から描画します。機能に属するフック・状態管理・補助処理は `src/features/<機能名>/browser/` に、その機能のReactコンポーネントは `src/features/<機能名>/ui/` に置きます（例: `tabs`、`auto-refresh`、`next-thread`、`live-chat`、`write`、`popup`、`auxiliary-window`、`thread`、`ng`、`bookmark`）。`src/view/browser/hooks/` と `src/view/browser/components/` には特定の機能に属さない汎用フック・部品（ステータスバーなど）だけを置き、`src/view/browser/pages/` は各機能を組み合わせるページの入口として扱います。`App`・`pages`・`shell/`（タブ表示、分離ウィンドウ、タイトルバー、ナビゲーションバー、下部パネルなど、機能を組み合わせる画面の外枠）は組み立て層で、`features` を import できます。それ以外の `src/view/browser/` 配下（`ui`・`hooks`・`utils`・`types`・`components` など）は UI 部品層で、`features` から参照してよい代わりに `features` と組み立て層を import しません（詳細は `docs/plans/module-boundaries-plan.md` の §3）。機能どうしは一方向だけ依存でき、他の機能のファイルは `vite.config.ts` の `FEATURE_PUBLIC_MODULES` に載せた公開モジュールだけを import します。新しく他の機能から使うファイルは一覧へ追加し、`index.ts` でまとめて再エクスポートする入口は作りません（CSS などの副作用が使わない画面やテストに入るため）。共通のUI・ユーティリティは `src/view/browser/` 配下に置きます。
- **コア機能:** `src/core/` に掲示板・スレッド・ブックマーク・履歴・キャッシュ・NG 判定などのドメイン処理を、`board/`、`thread/`、`ng/`、`bookmark/`、`history/`、`network/`（HTTP・URL）、`storage/`（キャッシュ・IndexedDB・Tauri DB）、`util/`（ドメインに属さない純粋関数）のドメイン別ディレクトリに置きます。ログ、通知、ジェスチャ認識など特定のドメインに属さない処理は `src/app/` に置きます。`view`・`features` から `core` を使うとき、状態や保存を伴うモジュール（履歴・ログ・設定への書き込み・キャッシュを持つ解決処理など）はサービスコンテナ経由にし、入力から結果を返すだけの純粋なモジュールと型は直接 import します。直接 import してよいモジュールは `vite.config.ts` の `CORE_DIRECT_MODULES` に載せ、lint で検査します。
- **サービスコンテナ:** `src/service-container/` がサービスのインターフェース、共有コンテナ、レガシー実装を接続するセットアップ処理を提供します。ビューはこのコンテナを通じて設定、取得、保存、通知などを利用します。
- **プラットフォーム抽象化:** `src/app/platform/` がウィンドウ操作、HTTP、ストレージの共通インターフェースを定義し、`browser/` と `tauri/` の実装を実行環境に応じて選択します。Tauri 環境で不足する拡張機能 API は `src/browser-shim.js` が補います。
- **共有ライブラリ:** `packages/chlib/` はワークスペース内の共有パッケージで、5ch 互換 URL、掲示板・スレッド・bbsmenu のパーサー、取得処理などを提供します。
- **スタイル管理:** CSS のエントリポイントは `src/view/browser/styles/index.css` です。foundation、UI、layout、components、pages のスタイルをこのファイルから import し、`src/view/browser/index.tsx` で読み込みます。
- **レガシー互換層:** `src/app.ts` は起動処理と既存の `window.app` API を維持し、新しいコードでは ES module と `src/service-container/` を優先します。
- **ビルド構成:** `vite.config.ts` が `src/view/browser/index.tsx` を起点に、`PLATFORM` に応じた Chrome、Firefox、Tauri 向けの出力を構成します。開発・ビルド・テスト・静的解析には Vite+ の `vp` コマンドを使用します。

### Coding Conventions

- **ES Modules:** 名前付きエクスポートを優先してください。
- **型定義:** `any` の使用は避け、厳密な型定義を心がけてください。
- **デザイントークン:** CSSの色、余白、角丸、影、文字、重なり順は `src/view/browser/styles/foundation/tokens.css` の参照値と `themes.css` の `--sys-*` 意味トークンを使ってください。必要な意味トークンがない場合はトークン側へ追加し、コンポーネントCSSに色や寸法の値を直接書かないでください。ブラウザ共通スタイルを読み込まない画面では、foundationのトークンとテーマも明示的に読み込んでください。
- **プラットフォーム抽象化:** ストレージや通信などのプラットフォーム固有の機能は `src/app/platform/` 以下のインターフェースを通じて利用してください。
- **意図の明文化:** バグ修正や意図的な変更を行う際は、コード内に「なぜそのように書いたか」という背景をコメントとして残してください。
- **日本語の徹底:** PR・Issueのタイトル、本文、コメント、コード内の自然言語コメント、テストスイート名・テスト名は日本語で記述してください。API名、変数名、ファイル名、ログや画面に表示する固定文言、規約上必要な英語の識別子・ディレクティブは原文を維持して構いません。
- **エラーはログに出す** エラーは握りつぶしせず、しっかり詳細なログを出すようにしてくださいっす。
- **具体的なURLは書かない:** テスト、PR・Issueの本文・コメント、コード内の例示には、実在のスレッドを特定できる具体的なURLを含めないでください。ダミーは `example.com` のような予約済みドメインを使い、一目で架空とわかるものにしてください。

### Gitとコミット

- **コミットメッセージ:** Conventional Commits形式で、type/scopeなどの形式上の識別子は英語のまま、件名と本文は日本語で統一してください。変更の意図が明確になる詳細な説明を含めてください（例: `fix(thread): 自動更新の停止条件を修正`）。
- **コミットスコープ:** scopeは変更の主な責務を表す英語の固定語彙を使用してください。`AGENTS.md`の構成分類を候補の基準としますが、実際のコード責務に合わせて次の一覧から選んでください。
  - `browser`: `src/view/browser/` 全般
  - `thread`: スレッド表示、検索、次スレ機能
  - `url`: URL解析、正規化、リンク遷移
  - `media`: 画像、動画、Imgurなどのメディア処理
  - `copy`: コピー処理
  - `bookmark`: お気に入り機能
  - `settings`: 設定画面、設定保存
  - `write`: 書き込み機能
  - `popup`: ポップアップ、ペイン
  - `platform`: Browser/Tauriのプラットフォーム抽象化
  - `chlib`: `packages/chlib/` の共有ライブラリ
  - `workflow`: Issue、todo、自動化などの開発ワークフロー
  - `architecture`: 設計文書、構成説明
  - 既存の一覧で表せない全体変更だけは、scopeを省略して構いません。
  - 複数領域にまたがる変更は、利用者向けの主目的または変更の中心となる責務を1つ選んでください。
  - Issueのラベル名とscopeは一致させなくても構いません。scope名は小文字で統一してください。

### 開発ブランチの方針

- `develop`を唯一の開発・統合ブランチとして扱う。
- `feature/chlens-live`は今回の統合対象となった旧ブランチであり、新しい作業のbaseや最新コードの参照先にはしない。

<!--VITE PLUS START-->

# Using Vite+, the Unified Toolchain for the Web

This project is using Vite+, a unified toolchain built on top of Vite, Rolldown, Vitest, tsdown, Oxlint, Oxfmt, and Vite Task. Vite+ wraps runtime management, package management, and frontend tooling in a single global CLI called `vp`. Vite+ is distinct from Vite, and it invokes Vite through `vp dev` and `vp build`. Run `vp help` to print a list of commands and `vp <command> --help` for information about a specific command.

Docs are local at `node_modules/vite-plus/docs` or online at https://viteplus.dev/guide/.

## Built-in Commands vs Scripts

`vp <name>` runs a built-in command. `vp run <name>` runs a `package.json` script or a `vite.config.ts` task. Scripts cannot overwrite built-ins, so `vp dev` and `vp run dev` may do different things. Check `package.json` and `vite.config.ts` first, and run `vp run <name>` when the project defines a script or task with that name.

## Tool Versions

Run `vp toolchain` to show versions and relationships in the active Vite+
release. Add a tool name to select part of the graph. For example, run
`vp toolchain vite`. Use `--global` to ignore the local `vite-plus` package. Use
`vp why <package>` to show the package-manager dependency graph.

## Review Checklist

- [ ] Run `vp install` after pulling remote changes and before getting started.
- [ ] Run `vp check` and `vp test` to format, lint, type check and test changes.
- [ ] Check if there are `vite.config.ts` tasks or `package.json` scripts necessary for validation, run via `vp run <script>`.
- [ ] If setup, runtime, or package-manager behavior looks wrong, run `vp env doctor` and include its output when asking for help.

<!--VITE PLUS END-->
