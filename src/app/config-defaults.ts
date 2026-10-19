// 変更理由: 保存済み設定がない場合の既定値を一つの一覧に集約し、参照箇所ごとの値ずれを防ぐ。
export const DEFAULT_CONFIG: Readonly<Record<string, string>> = {
  theme_id: "system",
  // HTTPで指定されたGETは、従来どおりHTTPSを先に試してから必要なときだけHTTPへ戻す。
  https_mode: "https_first",
  // 変更理由: 自動更新のON/OFFとは独立した間隔設定で、未変更時の既定間隔は20秒にする。
  auto_load_second: "20000",
  auto_load_second_board: "20000",
  auto_next_thread: "off",
  auto_next_thread_mode: "balanced",
  // EdgeLiveViewerと同じく候補がまだ立っていない間だけ待ち、subjectの無期限取得を防ぐ。
  next_thread_search_duration: "180",
  pause_auto_scroll_on_popup: "on",
  // 変更理由: フィルタバーは本文を押し下げるため、スレを開いた直後は閉じておくことを既定にする。
  thread_filter_default_open: "off",
  // 更新コントロールで選ぶスレッド表示形式。未変更時は従来どおり通常表示にする。
  thread_display_mode: "normal",
  image_blur: "on",
  image_blur_word: ".{0,5}[^ァ-ヺ^ー]グロ(?:[^ァ-ヺ^ー].{0,5}|$)|.{0,5}死ね.{0,5}",
  expand_short_url: "none",
  expand_short_url_timeout: "3000",
  ngwords:
    'hide:\n  when title contains:\n    "5ちゃんねるへようこそ"\n    "【新着情報】5chブラウザがやってきた！"',
  chain_ng: "off",
  chain_ng_id: "off",
  chain_ng_slip: "off",
  // 旧設定のoffは表示方式のhard-ngへ読み替えるため、保存キーと既定値を維持する。
  display_ng: "off",
  nothing_id_ng: "off",
  nothing_slip_ng: "off",
  how_to_judgment_id: "first_res",
  repeat_message_ng_count: "0",
  use_siki_guard: "off",
  debug_log: "off",
  default_name: "",
  default_mail: "",
  focus_new_tab_on_open: "on",
  // 新規タブも同じホームを入口にし、既存の関連板・指定板の設定は選択肢として保つ。
  new_tab_page_mode: "home",
  new_tab_page_board_url: "",
  // 変更理由: 垂直タブバー導入時の既定は水平とし、既存利用者の見た目を変えない。
  tab_bar_orientation: "horizontal",
  // 変更理由: 垂直バーの既定は縮小モード（簡易表示）とし、本文の幅を優先する。
  tab_bar_collapsed: "on",
  // 変更理由: 展開幅の既定はタイトルが省略されにくい208pxとする。
  tab_bar_width: "208",
  // 変更理由: タイトルバー左端の各操作を専用モーダルで個別に切り替えられるよう、
  // 戻る・進む・更新を別々の設定値として保存する。
  title_bar_back: "on",
  title_bar_forward: "on",
  title_bar_refresh: "on",
  write_submit_ctrl_enter: "off",
  // 変更理由: 書き込み後のパネルは利用者が明示的に選んだ場合だけ閉じ、既存の操作感を保つ。
  write_close_panel_after_submit: "off",
  // 変更理由: 投稿前警告は従来どおり表示しつつ、利用者が書き込み設定から任意で無効化できるようにする。
  write_pre_submit_warnings: "on",
  // 変更理由: 現在の貼り付け時除去を既定で維持し、利用者が書き込み・ドメイン設定から切り替えられるようにする。
  write_sanitize_urls_on_paste: "on",
  auto_load_idle_stop_timeout: "auto",
  // コメントOverlayの設定はTauri版の実況開始時に読み込み、Browser版の既存挙動には影響させない。
  // speedキーは既存設定との互換性のため残し、新規値はコメントの通過時間（秒）として保存する。
  // 文字サイズは表示倍率を含む描画側の共通コード定数で管理し、保存値による実機差を作らない。
  comment_overlay_fetch_all_threads: "off",
  // 表示領域は自由な縦横比を既定とし、16:9への固定は実況パネルから明示的に選ぶ。
  comment_overlay_lock_aspect_ratio: "off",
  // 最前面への固定は利用者が選んだときだけ有効にする。
  comment_overlay_always_on_top: "off",
  no_history: "off",
  no_writehistory: "off",
  bbsmenu:
    "https://menu.5ch.io/bbsmenu.html\nhttps://menu.2ch.sc/bbsmenu.html\nhttps://fox-tools.pages.dev/html/hinan-bbsmenu.html\nhttps://fox-tools.pages.dev/html/tulip-hinan-bbsmenu.html\n// open2chは一度手動でbbsmenuのURLへアクセスする必要があります。\n// https://menu.open2ch.net/bbsmenu.html\n",
  bbsmenu_option: "",
  other_board_titles: "{}",
  useragent: "",
  imgur_access_token: "",
  imgur_client_id: "",
  format_2chnet: "html",
  sage_flag: "off",
  // サイト・板設定は全体設定へ安全にフォールバックできる空のドキュメントを既定値にする。
  site_board_settings: "{}",
  opened_board_entries: "[]",
  image_replace_dat_obj: "",
  image_replace_dat:
    "^https?:\\/\\/(?:www\\.youtube\\.com\\/watch\\?(?:.+&)?v=|youtu\\.be\\/)([\\w\\-]+).*\thttps://img.youtube.com/vi/$1/default.jpg\nhttp:\\/\\/(?:www\\.)?nicovideon?\\.jp\\/(?:(?:watch|thumb)(?:_naisho)?(?:\\?v=|\\/)|\\?p=)(?!am|fz)[a-z]{2}(\\d+)\thttp://tn-skr.smilevideo.jp/smile?i=$1\n\\.(png|jpe?g|gif|bmp|webp)([\\?#:].*)?$\t.$1$2",
  replace_str_txt: "",
};

// 設定画面や操作UIから編集できず、内部処理だけで扱う設定。
// UIで編集可能なキーとの補集合をテストし、新しい既定値の分類漏れを防ぐ。
export const CONFIG_KEYS_OUTSIDE_SETTINGS_FORM = [
  // 短縮URLを展開する対象の選択値。URL処理が参照する。
  "expand_short_url",
  // 短縮URL展開リクエストのタイムアウト（ミリ秒）。
  "expand_short_url_timeout",
  // IDの連鎖NGを有効にする値。自動NG判定が参照する。
  "chain_ng_id",
  // SLIPの連鎖NGを有効にする値。自動NG判定が参照する。
  "chain_ng_slip",
  // 同一文の繰り返しをNGにするレス数のしきい値。
  "repeat_message_ng_count",
  // 書き込み欄に入れる既定の名前。書き込みパネルで編集する。
  "default_name",
  // 書き込み欄に入れる既定のメール文字列。書き込みパネルで編集する。
  "default_mail",
  // 閲覧履歴を記録しない設定。履歴タブの生成処理が参照する。
  "no_history",
  // 書き込み履歴を記録しない設定。書き込み履歴の保存処理が参照する。
  "no_writehistory",
  // bbsmenuから除外する板などのオプション文字列。
  "bbsmenu_option",
  // 利用者が設定した板名のキャッシュ（JSON）。
  "other_board_titles",
  // 書き込みリクエストへ付けるUser-Agent文字列。
  "useragent",
  // Imgur APIの利用者アクセストークン。外部連携パネルで編集する。
  "imgur_access_token",
  // Imgur APIクライアントID。外部連携パネルで編集する。
  "imgur_client_id",
  // 2chnetからスレッドを取得するときに使う形式。
  "format_2chnet",
  // ドメイン共通・板別の設定上書きを保存するJSON。
  "site_board_settings",
  // 最近開いた板のURLと表示名を保存するJSON。
  "opened_board_entries",
  // 画像URL置換ルールの読み込み状態を保持する内部データ。
  "image_replace_dat_obj",
  // 画像・動画URLを置き換えるルール一覧。
  "image_replace_dat",
] as const;

// 変更理由: 補助パネルや操作UIで編集する設定も通常フォーム外の分類から除き、
// UIで変更できない既定値だけを CONFIG_KEYS_OUTSIDE_SETTINGS_FORM に残す。
export const CONFIG_KEYS_EDITABLE_OUTSIDE_SETTINGS_FORM = [
  // 更新コントロールとドメイン・板設定から更新間隔を変更できる。
  "auto_load_second",
  // 板一覧の更新コントロールとドメイン・板設定から変更できる。
  "auto_load_second_board",
  // 垂直タブバーのドラッグ操作で幅を保存する。
  "tab_bar_width",
  // 表示設定のタイトルバー操作パネルで表示を切り替える。
  "title_bar_back",
  // 表示設定のタイトルバー操作パネルで表示を切り替える。
  "title_bar_forward",
  // 表示設定のタイトルバー操作パネルで表示を切り替える。
  "title_bar_refresh",
  // 書き込みパネルの設定から投稿ショートカットを切り替える。
  "write_submit_ctrl_enter",
  // 書き込みパネルの設定から投稿後の動作を切り替える。
  "write_close_panel_after_submit",
  // ドメイン・板設定と書き込みパネルから確認動作を切り替える。
  "write_pre_submit_warnings",
  // 書き込みパネルとドメイン・板設定からURLの貼り付け時除去を切り替える。
  "write_sanitize_urls_on_paste",
  // 更新コントロールから自動停止時間を選択できる。
  "auto_load_idle_stop_timeout",
  // 更新コントロールからスレッドの表示形式を選択できる。
  "thread_display_mode",
  // 実況の表示領域パネルで縦横比の固定を切り替えるため、通常の設定フォームには置かない。
  "comment_overlay_lock_aspect_ratio",
  // ドメイン・板設定からsageの既定動作を切り替える。
  "sage_flag",
] as const;
