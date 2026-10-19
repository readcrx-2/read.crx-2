# E2Eテスト整備計画

## 目的

Chrome拡張版だけを検証している現在のE2Eを広げ、Tauri版の実行環境に固有の処理
（`src/app/platform/tauri/`、`src/browser-shim.js`、RustのHTTP・SQLite・投稿Cookie）も
画面から検証できるようにする。

## 方針

- **Chrome版**: 機能全体の検証を担う。既存の `tests/*.spec.mts` を引き続き拡充する。
  既定のheadlessで動き画面を奪わないため、offstage-windowsは必須ではない。
- **Tauri版**: Windowsだけで、Tauri固有の経路に絞った少数のspecを持つ。
  WebView2にはheadlessがなく、メイン・コメントOverlay・過去実況再生の窓が前面に出るため、
  [offstage-windows](https://github.com/LippInc/offstage-windows) で非表示デスクトップへ逃がす。
  Chrome版と同じspecをすべて二重に流すことはしない（Rustのビルドと実行が重いため）。
- **実行の仕組み**: `obsidian-lazy-plugins` の `scripts/run-e2e.mjs` に倣い、
  並列実行と `@serial` の直列実行を分け、blobレポートを最後にHTMLへまとめる。

## Phase 0: Tauri版の保存先を分離する

`identifier: com.chlens.app` のままだと、E2Eが普段使いの
`%APPDATA%\com.chlens.app`（SQLite・投稿Cookie）、`%LOCALAPPDATA%\com.chlens.app`
（WebView2のプロファイル・ログ）を読み書きしてしまう。Windowsの既知フォルダーは
`APPDATA` 環境変数では変わらないため、アプリ側で差し替える。

- Cargo feature `e2e` を有効にしたビルドだけ、環境変数 `CHLENS_DATA_DIR` を読む。
  配布版はfeatureを含まないため、環境変数を設定されても保存先は変わらない。
- 差し替え時は次をすべて `CHLENS_DATA_DIR` 配下へ置く。
  - SQLite（`chlens.db`）: Rustのコマンドで差し替え先を返し、フロントエンドが絶対パスで開く
  - 投稿Cookie（`write-cookies.dat`）
  - WebView2のユーザーデータ（`WEBVIEW2_USER_DATA_FOLDER` をプロセス起動時に設定）
  - ログ（`tauri-plugin-log` の出力先）

## Phase 1: 実行の仕組みを揃える

- `scripts/run-e2e.mjs`: 並列・`@serial` の2段階で実行し、blobレポートを統合する。
- `pnpm run test:e2e` は `pnpx offstage-windows` 経由でPlaywrightを起動する。
  ウィンドウを見たいときや `--ui`・`--debug` では `OFFSTAGE=0` を使う。
- `playwright.config.ts` を `chrome` と `tauri` のprojectに分ける。
  - `chrome`: 既存の `tests/*.spec.mts`（2 workers）
  - `tauri`: `tests/tauri/*.spec.mts`。窓が1つの非表示デスクトップを共有するため1 worker

## Phase 2: Tauri用fixture

- `pnpm run build:tauri:e2e`（`tauri build --debug --no-bundle --features e2e`）で
  `src-tauri/target/debug/chlens.exe` を作る。
- テストごとに空きポートと一時ディレクトリを用意し、
  `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=<port>` と
  `CHLENS_DATA_DIR=<一時ディレクトリ>` を渡してexeを起動する。
- `chromium.connectOverCDP` で接続し、`/view/index.html` のページを `page` fixtureにする。
- 終了時はプロセスを止め、一時ディレクトリを消す。再起動を検証するspec向けに、
  同じ保存先で起動し直す操作もfixtureから使えるようにする。

## Phase 3: Tauri版のspec

1. 起動してホームが表示される
2. localboardから板一覧・スレ一覧・レスを取得できる（RustのHTTP経由）
3. 再起動しても閲覧履歴・設定が残る（SQLite・WebView2の保存領域）
4. コメントOverlay・過去実況再生の窓を開閉できる

## Phase 4: CI

| ジョブ | runner | 実行条件 |
|---|---|---|
| Chrome版E2E（既存） | ubuntu-latest。spec数が増えたらshard分割 | 毎PR |
| Tauri版E2E | windows-latest、Rustキャッシュ | `src-tauri/`・`src/app/platform/`・`src/browser-shim.js`・`tests/tauri/` の変更、developへのpush、手動、週1回 |

`fail-fast: false`、`concurrency`、`timeout-minutes`、失敗時もレポートをアップロードする設定は
`obsidian-lazy-plugins` の `e2e.yml` に倣う。

## Phase 5: 後回し

- Firefox版のE2E
- Chrome版をWindowsでも動かすmatrix

## 進捗

- [x] Phase 0
- [x] Phase 1
- [x] Phase 2
- [x] Phase 3
- [x] Phase 4（`.github/workflows/e2e-tauri.yml`。GitHub上での実行はまだ確認していない）

### Phase 0〜3で分かったこと

- `WEBVIEW2_USER_DATA_FOLDER` は、Tauriが渡す保存先より優先される。プロセス起動時に設定すれば、
  設定から自動生成される窓も含めてすべての窓の保存先が切り替わる。
- 非表示のTauri窓もCDPにはページとして残り、`document.visibilityState` も `"visible"` のまま。
  窓の表示状態は `plugin:window|is_visible` でネイティブの窓に問い合わせる。
- 終了は `/F` なしの `taskkill`（WM_CLOSE）で行う。メイン窓を閉じるとアプリ全体が終了し、
  強制終了と違ってlocalStorageとSQLiteを書き終えてから終わる。
- cargoの出力先は `.cargo/config.toml` の `build.target-dir` でも変わるため、fixtureは
  `cargo metadata` で探す。
- 起動のたびに次のコンソールエラーが出る。テストは失敗させていないが、別途直したい。
  - `manifest.json` の取得がCSPの `connect-src` に阻まれる
  - 埋め込みフォントのdata URIがCSPの `default-src` に阻まれる（`font-src` 未指定）
  - `favicon.ico` が見つからない
