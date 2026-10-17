# ChLens

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

ChLens は [read.crx-2](https://github.com/readcrx-2/read.crx-2) からフォークした、5ch 互換掲示板ブラウザです。

Chrome・Firefox の拡張機能と、Tauri デスクトップアプリとして利用できます。

## ChLens の画面の考え方

一つのペインには一つのビューを表示し、板一覧・スレ一覧・スレッドを同じ場所で切り替えます。見比べたいときは2ペインにして、二つのビューを並べます。

## 特徴

### 閲覧

- 板一覧（板ツリー）、お気に入り板、板ボタンバー
- スレ一覧の検索・並べ替え
- タブ式の表示、2ペイン表示、タブの別窓表示
- 閉じたタブを開き直す
- レス番号ジャンプ、スレ内検索
- アンカーのポップアップ、返信ツリー、IDのポップアップ
- 自動更新、自動スクロール
- 次スレ候補の検索、1000レス到達後の自動次スレ移動
- 類似スレの検索

### 履歴・保存・コピー

- ブックマーク、閲覧履歴、書き込み履歴
- ログ検索
- ローカルのdatファイルを開く、Sikiのログファイルを開く
- スレタイ・URLのコピー（Markdown形式）、スレ全体のTOON形式コピー（AI用）

### NG・置換

- NGルール（記述の短いDSLで条件を書く）
- NGレスの表示方式（非表示・隠す・強調など）
- ID・SLIPによるNG判定（ID無し・SLIP無しのレスを判定）
- 置換ルール

### 画像・メディア

- 画像のサムネイル表示、ライトボックス、画像ビューア（別窓も可）
- 画像のぼかし（判定ワードとぼかし量を設定）
- 外部メディアの表示

### 書き込み

- 書き込み欄は1つで、別窓でも開ける
- 投稿画像のサムネイルプレビュー
- 投稿前の確認、URL貼り付け時のリンク除去

### 実況（Tauri版のみ）

- 実況コメント流し（通過時間・不透明度・表示位置を設定）
- 過去実況再生（複数のスレを時系列で再生）

### 外部連携

- 新着レスのライブチャット風表示（Chrome版・Tauri版）
- MCP連携（保存済みのスレッドログや履歴をAIエージェントから読める。Chrome版のみ）

### 設定・操作

- テーマ（ライト・ダーク・OSに合わせる）
- タブバーの配置（上・左端）
- 設定の書き出し・読み込み、板やサイトごとの設定
- コマンドパレット（Ctrl+Shift+P）

## スクリーンショット

掲載用のスクリーンショットは準備中。

1. 2ペインで板一覧とスレッドを並べた画面
2. スレ内検索や返信ツリーを使っている画面
3. Tauri 版の過去実況再生とコメントオーバーレイ

## ダウンロード

拡張機能とデスクトップアプリの配布物は [GitHub Releases](https://github.com/22-2/ChLens/releases) を確認してください。

## 対応環境・サービス

- **ブラウザー拡張機能:** Google Chrome、Mozilla Firefox
- **デスクトップアプリ:** Tauri
- **掲示板:** 5ch 系サービス、2ch.sc、open2ch、まちBBS、したらばなどの互換 BBS

掲示板や外部サービスの仕様・利用条件は変更される場合があります。商用利用を含め、利用前に各サービスの規約を確認してください。

## 開発

Node.js と pnpm を用意してから、リポジトリを取得します。

```bash
git clone https://github.com/22-2/ChLens.git
cd ChLens
pnpm install
```

主なコマンド:

```bash
# Chrome / Firefox 拡張機能
pnpm run build:chrome
pnpm run build:firefox
pnpm run build:extensions

# Tauri デスクトップアプリ
pnpm run build:tauri
pnpm run dev:tauri

# 開発用ウォッチ
pnpm run watch:chrome
```

ビルド成果物を別のディレクトリへコピーする場合は、`.env` にコピー先を指定します。未設定の場合はコピーされません。

```dotenv
BUILD_COPY_DESTINATION=../read-crx-build
```

## 貢献

Issue や Pull Request での提案・報告を歓迎します。開発ブランチやコード変更のルールは [AGENTS.md](AGENTS.md) を参照してください。

## 謝辞

本プロジェクトは read.crx-2 の成果をベースにしています。オリジナルの作者とコミュニティに感謝します。

## ライセンス

MIT
