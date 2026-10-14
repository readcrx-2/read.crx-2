# window.app 互換層の整理計画

- 状態: Phase 3 完了（2026-10-15 作成。Phase 0 と Phase 4 以降は未着手）
- 前提: [モジュール境界の明確化計画](module-boundaries-plan.md) の Phase A〜F が完了していること
- 作業ブランチ: 未定（`develop` から作る）

## 1. 目的

- 画面のコード（`view`・`features`）が `window.app` を経由して `core` を使う道をなくし、サービスコンテナだけを入口にする。
- `window.app` の利用者を確かめ、不要になった互換コード（`app.ts` の公開 API、`jsutil`、各モジュールの既定のインスタンス）を減らす。
- これにより、モジュール境界の検査（lint）を横から抜ける経路をなくす。

## 2. 背景（現状）

### 2.1 二重の入口

- モジュール境界の Phase E で、状態や保存を伴う `core` のモジュールをサービスコンテナ経由にした（`container.history`・`container.writeHistory` など。計画書 §3.6）。
- 一方で、`src/view/browser/utils/legacy-app.ts` の `getLegacy*` 系の関数が、`window.app` から同じ `core` の実装を取り出している。
- 同じものに入る道が 2 本並んでいる。`legacy-app.ts` の型は手書きで、`core` の実装と食い違っても型検査で気づけない。
- `window.app` 経由の参照は、lint の `CORE_DIRECT_MODULES` の検査にかからない。

### 2.2 計測結果（2026-10-15、テストを除く）

`legacy-app.ts` の関数を使っているファイルは 9 個（テストは別に 3 個）。

| 関数 | 使っているファイル | 置き換え先の候補 |
| --- | --- | --- |
| `waitForLegacyBookmarkReady` | `use-bookmark-revision`・`use-page-bookmark`・`BookmarkListPage`・`FavoriteBoardsSection`・`settings-data-transfer`・`omnibar-sources` | ブックマークの準備完了を待つサービス（新設） |
| `getLegacyBookmarkService` | `BookmarkListPage`・`FavoriteBoardsSection`・`settings-data-transfer`・`omnibar-sources` | `container.bookmark`（不足する操作を足す） |
| `getLegacyBookmarkEntryList` | `settings-data-transfer`・`bookmark-root` | ブックマークの保存先を扱うサービス（新設） |
| `getLegacyConfigService` | `bookmark-root` | `container.config` |
| `getLegacyHistoryService` | `HistoryListPage`・`omnibar-sources` | `container.history`（Phase E で追加済み。足りない関数を足す） |
| `getLegacyWriteHistoryService` | `WriteHistoryListPage`・`use-thread-res-context-menu` | `container.writeHistory`（同上） |
| `getLegacyReadStateService` | `HistoryListPage` | `container.readState` |

`src/app.ts` は、`window.app` に `Board`・`Bookmark`・`BookmarkEntryList`・`Cache`・`History`・`NG`・`ReplaceStrTxt`・`Thread`・`URL`・`util`（`jsutil`）・`WriteHistory` など約 30 の名前を公開している。

### 2.3 `window.app` が残る限り消せないもの

- `core/util/jsutil.ts`（`window.app.util` の互換用のまとめ口）。
- `corePorts` を参照する各モジュールの既定のインスタンス（`NG`・`ThreadService`・`BoardTitleSolver`・`ReplaceStrTxt` など）。
- `URL.ts` の再エクスポート（`window.app.URL` のために `getProtocol`・`isHttps` を残している）。

## 3. 方針

1. `view`・`features` は `window.app` を使わない。`core` の機能はサービスコンテナから使う（モジュール境界の計画書 §3.6 と同じ考え方）。
2. サービスの型は、今までどおり `Pick<typeof ...>` で `core` の関数から取り、関数の形を二重に書かない。
3. `window.app` そのものを消すかどうかは、外の利用者を調べてから決める（Phase 4）。利用者がいる場合は、必要な名前だけを残す。
4. 1 コミットで「サービスの追加と付け替え」を 1 つずつ扱う。モジュール境界の作業と同じく、移動と付け替えを混ぜない。

## 4. 段階的な進め方

### Phase 0: 安全網を整える

- E2E の負荷時の不安定さを直す。全体を 2 並列で流すと、`ng-persistence` か `ui` の 1 件が実行ごとに入れ替わって失敗することがある（作業前のコミットでも同じく起きる。単独なら通る）。
- 理由: ブックマークと起動待ちは画面全体に関わり、単体テストだけでは確かめきれないため。

### Phase 1: 置き換え先があるものから付け替える

- `getLegacyHistoryService` → `container.history`
- `getLegacyWriteHistoryService` → `container.writeHistory`
- `getLegacyReadStateService` → `container.readState`
- `getLegacyConfigService` → `container.config`
- 足りない関数（一覧の取得・削除・件数など）は、`IHistoryService`・`IWriteHistoryService` の `Pick` に足し、`setupBrowserViewServices` で登録する。

完了条件: 上の 4 つの関数の利用が 0 件。`vp test run`・`tsc`・`vp lint src/`・`build:chrome` が通る。

結果（2026-10-15）: 4 つの関数を `legacy-app.ts` から削除し、利用は 0 件になった。

- `IHistoryService` に `get`、`IWriteHistoryService` に `get`・`remove` を足した。
- `IReadStateService` は `Pick` ではなく `core/ports` の手書きのインターフェースなので、`getAll` を足し、`setupContainer` の既読情報のアダプタで `ReadState.getAll` へつないだ。
- 画面の挙動の差: 以前は `window.app` にサービスがなければ空の一覧を返す（書込履歴の右クリック操作は「利用できません」と出す）作りだった。サービスコンテナは描画前に必ず登録されるため、この分岐はなくした。
- `bookmark-root` の保存先の書き込みは、以前は `window.app.config` がなければ `container.config` へ投げっぱなしにしていた。両者は同じ `Config` の実体なので、`container.config.set` を待つ形に一本化した。

### Phase 2: ブックマークを整理する（山場）

- `Bookmark`・`BookmarkEntryList`・`BrowserBookmarkEntryList`・`IDBBookmarkEntryList` は古い作りが濃く、起動時の準備完了待ち（`waitForLegacyBookmarkReady`、6 ファイル）が絡む。
- 進め方:
  1. 今の起動の順番（設定の読み込み → ブックマークの初期化 → 最初の走査）を文書にし、テストで固定する。
  2. 「準備完了を待つ」ことをサービスの約束として定義する（例: `container.bookmark.ready(): Promise<void>`）。
  3. 画面が使っている `getLegacyBookmarkService`・`getLegacyBookmarkEntryList` の操作を洗い出し、`IBookmark` か新しいサービスに足す。
  4. 1 ファイルずつ付け替える。
- 注意: ブックマークの保存先（ブラウザのブックマーク・IndexedDB・Tauri）の切り替えは、プラットフォーム抽象化（`src/app/platform/`）と重なるため、境界をここで決め直す。

完了条件: `legacy-app.ts` の関数の利用が 0 件。

結果（2026-10-15）: 6 ファイルの利用をサービスコンテナへ付け替え、利用は 0 件になった。中身が空になった `legacy-app.ts` も削除した（Phase 3 の最初の項目を前倒しで済ませた。lint で塞ぐ作業は Phase 3 に残る）。

- 起動の順番（`setup.test.ts` の「ブックマークの起動の順番」で固定した）:
  1. 設定の読み込み（`Config.ready`）が終わった時点で `Bookmark` を作り、最初の走査を始める（`setup.ts` の `initializeBookmarkRuntime`）。この前に `setupContainer` を呼ぶと例外になる。
  2. `bootView` が DOM の準備を待ち、`setupContainer` と（メインの画面では）`setupBrowserViewServices` を呼んでから描画する。
  3. 画面は `container.bookmark.ready()` で最初の走査の完了を待ってから一覧を読む。走査が失敗しても `ready()` は reject せず、原因を `console.error` に残す（以前の `waitForLegacyBookmarkReady` は何も残さず握りつぶしていた）。
- §5 の判断: 「準備完了を待つ」約束は `container.bookmark.ready()` として `IBookmark` に足した。同じ実体の初回の走査を待つだけで、別のサービスに分ける理由がないため。
- `IBookmark`（`core/ports` の手書きのインターフェース）に `ready`・`getAll`・`import` を足した。書き出し・読み込みで使う保存形式の型として `IBookmarkEntry` を足した（ports は core の実装を import しないため、`Entry` と同じ形をここに書いた）。
- 保存先のフォルダの操作（選び直しの要否・切り替え）は、`container.bookmarkRoot`（`IBookmarkRootService`、新設）にした。core は使わないため `service-container/interfaces.ts` に置いた。IndexedDB（Tauri）の保存先には切り替えがないので、`setRootNodeId` は何もせず成功を返す（以前の画面の挙動と同じ）。
- 画面の挙動の差: 一覧の読み込みで `getAll` がない場合に `getAllThreads`・`getAllBoards` をつなげる分岐と、`window.app` にブックマークがない場合に空の一覧を返す分岐をなくした（Phase 1 と同じ理由で、サービスコンテナは描画前に必ず登録される）。
- 保存先の切り替え（ブラウザのブックマーク・IndexedDB）とプラットフォーム抽象化の境界: 今回は動かさず、`core/bookmark/Bookmark` が `isTauriRuntime()` で選ぶ形のままにした。画面からは `bookmarkRoot` だけが見えるため、`src/app/platform/` へ移すかは画面に影響なく後で決められる（提案にとどめる）。
- `app.ts` の `window.app.bookmark`・`bookmarkEntryList` は画面からは使わなくなったが、外の利用者を Phase 4 で調べるまで残す。
- 大きさ（Tauri のビルド）: `replay.js` が約 0.5KB、`browser.js` が約 0.1KB 増えた（`setupContainer` のブックマークのアダプタに足した関数の分）。`overlay.js` は変わらない。

### Phase 3: lint で塞ぐ

- `legacy-app.ts` を削除する。
- `view`・`features` から `window.app` を参照できないようにする。`no-restricted-imports` では検出できないため、`no-restricted-globals` か `no-restricted-properties`（`window.app`）を検討する。

結果（2026-10-15）: `legacy-app.ts` は Phase 2 で削除済み。`src/view/**`・`src/features/**`（テストを含む）に次の 2 つの規則をかけた（`vite.config.ts` の `WINDOW_APP_OWNERS`・`WINDOW_APP_MESSAGE`）。

- `no-restricted-globals`: グローバルの `app`（`global.d.ts` の `app` 名前空間を含む）。
- `no-restricted-properties`: `window.app`・`globalThis.app`・`self.app`。oxlint は `(window as ...).app` のような型の付け替え、`window["app"]`、`const { app } = window` も検出する（作業時に確かめた）。
- 抜け道として残るもの: ファイル内で `declare const app` と宣言して使う書き方（ローカルの変数として扱われる）と、`window.parent.app` のように別のウィンドウを経由する参照。どちらも今は使われていない。

規則を入れる前に、残っていた 2 か所を付け替えた。

- `src/view/browser/index.tsx`: `declare const app` で宣言したグローバルの `app.boot` を呼んでいた。`src/app` から `boot` を import して呼ぶ形にした。`window.app` を作る副作用はこの import で起きるため、外の利用者への影響はない（Phase 4 で調べるまで残す）。
- `src/view/browser/state/tabs/tab-store-history-visit.ts`: 閲覧履歴の保存の失敗を `window.app.message` の `notify` で画面へ知らせていた。同じ `Message` の実体を持つ `container.message` へ送る形にした。知らせる処理が失敗しても保存エラーの報告を止めないよう、失敗はログに残して続ける。

### Phase 4: `window.app` の外の利用者を調べる

- 調べる先:
  - コンテンツスクリプト（`src/cs_addlink.ts`）と背景処理（`src/background.ts`）
  - デバッグ用の機能（`src/app/debug/`、`pnpm debug:tauri`）
  - E2E とスクリプト（`tests/`・`scripts/`）
  - 利用者のユーザースクリプトなど、リポジトリの外の利用
- 利用者がいなければ: `app.ts` の公開 API、`jsutil`、既定のインスタンス、`URL.ts` の互換の再エクスポートをまとめて減らす。
- 利用者がいれば: 必要な名前だけを残し、残す理由を `app.ts` に書く。

### Phase 5（任意）: サービスコンテナのグローバルを見直す

- サービスコンテナは `window.__ServiceContainer` と `window.container` に載っている。
- テストで `vi.resetModules()` をしても同じ実体を保つためにこの形になっている面があるため、優先度は低い。見直すなら、テストの初期化の仕組みと一緒に考える。

## 5. 判断が必要な点

- Phase 2 の「準備完了を待つ」約束を、`container.bookmark` に足すか、別のサービスにするか。
- Phase 4 で、リポジトリの外の利用者（ユーザースクリプトなど）をどう確かめるか。告知期間を設けるか。
- `window.app` を残す場合、どの名前を正式な公開 API として扱うか。

## 6. 検証

- 各段階で `vp test run`・`tsc`・`vp lint src/`・`build:chrome` を実行する。
- ブックマークに関わる段階では、E2E と画面での確認（お気に入りの追加・削除、ホームのお気に入り板、設定の書き出し・読み込み、起動直後の表示）を行う。
- Tauri の各エントリ（overlay・replay・browser）の大きさを比べ、使わない実装が入っていないことを確かめる（モジュール境界の作業で使った方法）。
