# E2Eテスト

Chrome拡張版をビルドし、Playwrightの専用Chromiumで画面操作を検証します。

```powershell
pnpm exec playwright install chromium
pnpm run test:e2e
```

対話的に実行する場合は `pnpm run test:e2e:ui` を使います。ビルド済みなら、
`pnpm exec playwright test tests/localboard.spec.mts` で個別に実行できます。
失敗時のスクリーンショットとトレースは `test-results/`、HTMLレポートは
`playwright-report/` に保存されます。

`localboard.mts` はテストごとにループバックの空きポートで起動し、bbsmenu、
SETTING.TXT、subject.txt、datをShift_JISで配信します。レス追加もテストから制御できます。
ブラウザプロファイルとお気に入りフォルダーもテスト専用です。

アプリはHTTP指定でも先にHTTPS接続を試すため、HTTP専用localboardへの接続では
`ERR_SSL_PROTOCOL_ERROR` がログに出た後、HTTPへ再試行します。

現在は拡張機能の起動、ホーム・設定、スレ一覧からの閲覧、レス更新と重複防止、
セッション復元、閲覧履歴、NG設定の永続化、スレッド自動更新のON・OFFを検証します。
`replacement.spec.mts` ではNG内の文字列置換タブ、構文診断・保存・状態復元、
BEアイコン行の削除とサムネイル非表示、対象外の本文・画像の維持も検証します。
`ng-dsl.spec.mts` ではwhen/unless形式のNG設定の診断・保存・復元、OR一覧・AND条件・ID除外、
適用先指定とスレ一覧のハイライトを検証します。IDの右クリックNGも新構文での永続化を確認します。
複数ID・unless単体の記法例、スレ一覧とレスのcollapse、クリックによる内容表示、
NG・置換のEnter / Tab操作も確認します。
書き込み、read.cgi形式、差分206応答、Firefox・Tauriはまだ対象外です。

既存のChromiumを使う場合は `CHLENS_E2E_CHROMIUM_PATH` に実行ファイルを指定できます。
実際のDATで置換を再現する場合は `CHLENS_E2E_DAT_PATH` にShift_JISのDATファイルを指定し、
`pnpm exec playwright test tests/replacement.spec.mts` を実行します。DATはローカルのテストサーバーで配信し、
画像はダミー応答にするため、元の掲示板へのアクセスは不要です。DATの内容をリポジトリへ保存する必要もありません。

## UIスクリーンショット

`pnpm run ui:shots` でChrome拡張版をビルドし、架空の板・スレ・レスを使ってUIを撮影します。
出力先は `screenshots/ui/<実行日時>/` です。ホーム、板一覧、スレ一覧、レス表示、
ブックマーク・閲覧履歴・ログ・書き込み履歴、ステータスバーの各ミニウィンドウを保存します。
設定画面は各カテゴリを縦スクロールで分割し、NG記法例・高度なNG設定・文字列置換も開いて撮影します。
出力先を変える場合はPowerShellで `$env:UI_SHOT_DIR='V:\temp\chlens-shots'; pnpm run ui:shots` と指定します。

Tauri版はリモートデバッグを有効にして起動し、別のターミナルで撮影します。

```powershell
# ターミナル1
pnpm run dev:tauri:debug

# ターミナル2
pnpm run ui:shots:tauri
```

Tauri側も架空の板・スレ・レスを使い、ブックマーク・閲覧履歴・ログ・書き込み履歴、
ステータスバーの各ミニウィンドウ、コメントOverlayの操作窓と流れている状態、
Tauri版の設定全カテゴリ・全セクションを保存します。接続先は既定で `127.0.0.1:9222` です。
撮影には一時タブを使い、テーマ・表示形式・bbsmenuの設定は終了時に復元します。
別ポートを使う場合は `$env:CHLENS_CDP_URL='http://127.0.0.1:9333'` を指定します。
