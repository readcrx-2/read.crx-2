# E2Eテスト

Chrome拡張版をビルドし、Playwrightの専用Chromiumで画面操作を検証します。

```powershell
pnpm exec playwright install chromium
pnpm run test:e2e
```

対話的に実行する場合は `pnpm run test:e2e:ui` を使います。ビルド済みなら、
`pnpm exec playwright test --project=chrome tests/localboard.spec.mts` で個別に実行できます。
`pnpm run test:e2e tests/localboard.spec.mts` のように、ビルドしてから絞り込むこともできます。
失敗時のスクリーンショットとトレースは `test-results/`、HTMLレポートは
`playwright-report/` に保存されます。

`pnpm run test:e2e` は [offstage-windows](https://github.com/LippInc/offstage-windows) 経由で実行し、
Windowsでは窓を非表示デスクトップに出して作業中の画面やフォーカスを奪わないようにします
（Windows以外ではそのまま実行します）。窓を見たいときはPowerShellで `$env:OFFSTAGE='0'` を設定し、
終わったら `Remove-Item Env:OFFSTAGE` で戻します。

実行は `scripts/run-e2e.mjs` が2段階に分けます。テスト名に `@serial` を含むものは、
並列の段階の後に1 workerで実行します。保存領域や窓のフォーカスを共有して並列では不安定になるテストに付けます。
2段階のレポートは最後に `playwright-report/` へまとめます。

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
書き込み、read.cgi形式、差分206応答、Firefoxはまだ対象外です。

## Tauri版

`tests/tauri/` はWindowsだけで、Tauri版に固有の経路を検証します（他のOSではskipします）。

```powershell
pnpm run test:e2e:tauri
```

`build:tauri:e2e` でCargo feature `e2e` 付きのデバッグ版exeを作り、テストごとに起動します。
保存先は環境変数 `CHLENS_DATA_DIR` で一時ディレクトリへ差し替えるため、普段使いの
`%APPDATA%\com.chlens.app` などには触れません。WebView2のリモートデバッグへCDPで接続し、
メイン窓を `page`、Overlayや過去実況再生の窓を `tauri.window("overlay")` などで扱います。
`tauri.restart()` は同じ保存先のまま、窓を閉じる操作でアプリを終了して起動し直します。

現在は起動とE2E用の保存先、RustのHTTP経由の板・スレッドの取得と更新、再起動後のタブと
閲覧履歴の復元、過去実況再生とコメントOverlayの窓の表示・非表示を検証します。
ビルド済みなら `pnpm exec offstage-windows node scripts/run-e2e.mjs --project=tauri` で実行でき、
別の場所のexeは `CHLENS_E2E_TAURI_EXE` で指定できます。

既存のChromiumを使う場合は `CHLENS_E2E_CHROMIUM_PATH` に実行ファイルを指定できます。
実際のDATで置換を再現する場合は `CHLENS_E2E_DAT_PATH` にShift_JISのDATファイルを指定し、
`pnpm exec playwright test tests/replacement.spec.mts` を実行します。DATはローカルのテストサーバーで配信し、
画像はダミー応答にするため、元の掲示板へのアクセスは不要です。DATの内容をリポジトリへ保存する必要もありません。

## UIスクリーンショット

架空の板・スレ・レスを使い、全画面をライトとダークの両テーマで撮影します。
撮影は時間がかかるため `pnpm run test:e2e` には含めず、次のコマンドのときだけ実行します。
E2Eと同じく非表示デスクトップで動くため、撮影中も画面やフォーカスを奪いません。

```powershell
pnpm run ui:shots        # Chrome版
pnpm run ui:shots:tauri  # Tauri版（Windowsだけ）
pnpm run ui:shots:all    # 両方
```

出力先は `screenshots/ui/<実行日時>/<chrome|tauri>/<light|dark>/` です。
ホーム、板一覧、スレ一覧、レス表示（実況表示・新着）、ブックマーク・閲覧履歴・ログ・書き込み履歴、
ステータスバーの各ミニウィンドウを保存します。設定画面は各カテゴリを縦スクロールで分割し、
NG記法例・高度なNG設定・文字列置換・エクスポートのダイアログも開いて撮影します。
Tauri版はさらに、コメントOverlayの操作窓・空の状態・流れている状態と、過去実況再生の窓を撮ります。

撮影手順は `tests/screenshots/ui-scenario.mts` に共通化しています。各版のspec
（`tests/ui-screenshots.spec.mts`・`tests/tauri/ui-screenshots.spec.mts`）は起動方法と固有の画面だけを持ちます。
Tauri版はE2E用の保存先で起動するため、普段使いのデータや設定は変わりません。
`<実行日時>` の部分を変える場合はPowerShellで `$env:UI_SHOT_DIR='V:\temp\chlens-shots'` を指定し、
Playwrightの引数は `pnpm run ui:shots -- --grep dark` のように後ろへ付けます。
