# Tauri設定メモ

`tauri.conf.json` のフロントエンド用コマンドは、Tauri CLI自身を呼び出さない専用スクリプトを指定する。

- `beforeDevCommand`: `pnpm watch:tauri`
- `beforeBuildCommand`: `pnpm build:tauri:assets`

`pnpm dev:tauri` と `pnpm build:tauri` はそれぞれTauri CLIの開発起動とアプリ・インストーラーのビルドを担当する。
その前段で、設定から呼び出されるスクリプトがWebView用資産だけを生成することで、Tauri CLIの再帰呼び出しを防ぐ。

## Rustのテストとカバレッジ

Rustのカバレッジには`cargo-llvm-cov`を使う。初回のみRustツールチェーンへLLVM計測ツールを追加し、CLIをインストールする。

```powershell
rustup component add llvm-tools-preview
cargo install cargo-llvm-cov --locked
```

リポジトリのルートから次を実行すると、Rustライブラリのテストを実行して行・領域カバレッジを表示し、HTMLレポートを`coverage/rust/html/index.html`へ出力する。

```powershell
pnpm run test:rust:coverage
```

カバレッジ率は未テスト経路を探す目安として使い、最初から一律の最低率をCIへ設定しない。重要な動作のテストを追加した後、安定して維持できる水準を決める。
