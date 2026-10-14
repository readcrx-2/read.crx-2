# 開発ドキュメント

このディレクトリには、実装計画、仕様、運用手順、過去の作業記録を置く。
利用者の不満や思いつきを未整理のまま残す場所は、リポジトリ直下の`.todo`とする。

## 分類

### Plans

これから実装する機能やリファクタリングの計画。

- [ChLens Tauri コメントオーバーレイ統合計画](plans/chlens-tauri-comment-overlay-integration-plan.md)
- [Chlens Live 開発ロードマップ（独立アプリ構想・技術検討記録）](plans/chlens-live-development-roadmap.md)
- [Popup manager リファクタリング計画](plans/popup-manager-refactoring-plan.md)
- [類似画像NG 実装計画](plans/similar-image-ng-plan.md)
- [Browser UI / CSS の Radix UI 統一・分割計画](plans/ui-radix-refactoring-plan.md)
- [モジュール境界の明確化計画](plans/module-boundaries-plan.md)
- [モジュール境界の作業状況（2026-10-15）](plans/module-boundaries-status.md)

### Specs

実装時に参照する仕様やDSLの設計。

- [ReplaceStrTxt 置換DSL仕様案](specs/replace-str-txt-dsl-spec.md)

### Design

アプリケーション内の責務や設計境界。

- [掲示板URLの責務境界](design/url-boundary.md)

### Guides

開発者や自動化が参照する手順書。

- [AI改善ループの全体像](guides/ai-improvement-workflow.md)
- [AI todo triageの手順](guides/ai-triage.md)

### Archive

現在の計画や手順ではなく、過去の作業記録として保持するもの。

- [2026-08-22 todo archive](archive/todo-archive-2026-08-22.md)

## 運用ルール

- 新しい実装計画は`plans/`へ置く。
- DSL、データ形式、外部連携の契約は`specs/`へ置く。
- 繰り返し実行する開発・運用手順は`guides/`へ置く。
- 完了した計画や置き換えられた文書は、必要に応じて`archive/`へ移す。
- 文書を移動した場合は、同じ変更でリポジトリ内の参照リンクも更新する。
- GitHub Issueが実装の作業単位、文書が設計・背景・完了条件の記録となるよう役割を分ける。
- 新規Issueのタイトル・本文・コメントとコミットの件名・本文は日本語で統一する。Conventional Commitsのtype/scopeなど形式上の識別子は英語のままにする。

## 正本の役割

- ルートの`.todo`は、利用者が未整理の不満や思いつきを書く唯一の受信箱とする。自動トリアージもこのファイルだけを読む。
- GitHub Issueは、実装タスク、優先度、仕様、進捗の正本とする。
- `develop`は、作業ブランチとPRが参照する最新の開発・統合ブランチとする。
- PRはレビューとコード取り込みの窓口であり、Issueの進捗状態を管理する場所にはしない。
