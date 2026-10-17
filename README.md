# ChLens

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

ChLens は [read.crx-2](https://github.com/readcrx-2/read.crx-2) からフォークした、5ch 互換掲示板ブラウザです。

Chrome・Firefox の拡張機能と、Tauri デスクトップアプリとして利用できます。

## ChLens の画面の考え方

一つのペインには一つのビューを表示し、板一覧・スレ一覧・スレッドを同じ場所で切り替えます。見比べたいときは2ペインにして、二つのビューを並べます。

## 特徴

### タブとペインで掲示板を行き来

- ペインごとに表示するページをタブで切り替え、2ペインでは二つのページを並べて表示
- タブを別窓に切り離して表示
- 書き込み欄は一つだけ。別窓で開き、投稿先のスレッドを選んで書き込み
- 縦型タブバーやコマンドパレットから、タブ・ページの操作をすばやく実行
- スレッド画面の下部パネルから、同じ板のスレ一覧や書き込み画面を開く

### スレッドを読みやすく、追いやすく

- スレ内検索、レス番号へのジャンプ、返信ツリーやIDのポップアップ
- NG・ハイライト設定、人気レスの絞り込み、レス数や未読数の表示
- 自動更新、新着レス通知、次スレ候補の検索

### メディアや過去ログもまとめて表示

- レス内の画像や対応する外部メディアをビューアーで表示
- Siki の JSON ログを読み込み、スレッドとして閲覧
- Tauri 版では複数の実況スレッドを時系列で再生し、コメントをオーバーレイ表示

### 板ごとの使い方に合わせて設定

- 5ch 系サービス、2ch.sc、open2ch、まちBBS、したらばなどに対応
- サイト・板単位で自動更新などの動作を調整
- お気に入り、閲覧履歴、書き込み履歴を利用

## スクリーンショット

掲載用のスクリーンショットは準備中です。画面の違いが伝わるよう、まず次の3画面を掲載する予定です。

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
