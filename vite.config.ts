import react from "@vitejs/plugin-react";
import { build as esbuildBuild } from "esbuild";
import fs from "fs-extra";
import path from "path";
import { defineConfig, lazyPlugins, Plugin } from "vite-plus";

// ─── helpers ────────────────────────────────────────────────────────────────

// const BUILD_COPY_DESTINATION_KEY = "BUILD_COPY_DESTINATION";

// function resolveBuildCopyDestination(mode: string): string | undefined {
//   const env = loadEnv(mode, process.cwd(), "");
//   const configured = process.env[BUILD_COPY_DESTINATION_KEY] ?? env[BUILD_COPY_DESTINATION_KEY];
//   const destination = configured?.trim();
//   return destination ? path.resolve(destination) : undefined;
// }

// ─── plugin: optional build output copy ─────────────────────────────────────

// function buildOutputCopyPlugin(outputDir: string, destination: string | undefined): Plugin {
//   return {
//     name: "build-output-copy",
//     apply: "build",
//     async writeBundle() {
//       if (!destination) return;

//       const source = path.resolve(outputDir);
//       const relativeDestination = path.relative(source, destination);
//       if (relativeDestination === "") {
//         console.warn(
//           `[build-output-copy] コピー先がビルド出力と同じためスキップします: ${destination}`,
//         );
//         return;
//       }
//       if (
//         !path.isAbsolute(relativeDestination) &&
//         relativeDestination !== ".." &&
//         !relativeDestination.startsWith(`..${path.sep}`)
//       ) {
//         throw new Error(
//           `[build-output-copy] コピー先をビルド出力の配下には指定できません: ${destination}`,
//         );
//       }

//       try {
//         await fs.ensureDir(destination);
//         await fs.copy(source, destination, { overwrite: true });
//         console.log(`[build-output-copy] ${source} -> ${destination}`);
//       } catch (error) {
//         console.error(
//           `[build-output-copy] ビルド成果物のコピーに失敗しました: ${destination}`,
//           error,
//         );
//         throw error;
//       }
//     },
//   };
// }

// ─── plugin: browser HTML (without Pug) ─────────────────────────────────────

function browserHtmlPlugin(outputDir: string, entry: string, platform: string): Plugin {
  const manifestJson = fs.readJsonSync("src/manifest.json");

  return {
    name: "browser-html-build",
    async buildStart() {
      if (entry !== "browser") return;

      const version = String(manifestJson.version ?? "");

      // browserビューは新UI(React)のエントリを直接起動したいため、
      // 旧Pugテンプレートを経由せずに互換HTMLをここで固定生成する。
      // no-referrer だと YouTube 埋め込みが client identity 不足で 153 になりやすいため、
      // クロスオリジンでは origin だけ送る既定寄りの方針にして他の外部埋め込みとも両立させる。
      // 変更理由: TauriのWebViewではMonacoのAMDローダーがエディタCSSを適用しないため、
      // コピー済みの本体CSSをHTMLから直接読み込み、拡張版の読み込み経路は変えない。
      const monacoStyle =
        platform === "tauri"
          ? '<link rel="stylesheet" href="/lib/monaco/vs/editor/editor.main.css">'
          : "";
      // CSSやテーマスクリプトの取得待ちにも、ブラウザの初期背景をOSの配色へ合わせる。
      const html = `<!DOCTYPE html><html class="view view_browser" data-app-version="${version}"><head><meta charset="utf-8"><meta name="color-scheme" content="light dark"><meta name="referrer" content="strict-origin-when-cross-origin"><title>read.crx-2</title><script src="../theme-init.js"></script><script src="../browser.js?v=${version}" defer></script><link rel="stylesheet" href="/browser.css?v=${version}">${monacoStyle}</head><body><div id="root"></div></body></html>`;

      const outputFile = path.join(outputDir, "view", "index.html");
      await fs.ensureDir(path.dirname(outputFile));
      await fs.writeFile(outputFile, html);
      await fs.remove(path.join(outputDir, "view", "browser.html"));
    },
  };
}

// TauriのコメントOverlayはlegacy app.bootを必要としないため、Browser用HTMLとは分けて
// 生成する。entryを分けることでChrome／Firefox bundleへOverlayの起動処理を混ぜない。
function overlayHtmlPlugin(outputDir: string, entry: string): Plugin {
  return {
    name: "comment-overlay-html-build",
    async buildStart() {
      if (entry !== "overlay") return;

      // 変更理由: Tauri WebViewの既定viewportをnative windowのCSS幅へ揃えないと、
      // hover時の再合成でviewportが再計測され、表示倍率が一時的に変わることがある。
      const html = `<!DOCTYPE html><html class="view view_comment_overlay"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>ChLens コメントOverlay</title><script src="../overlay.js" defer></script><link rel="stylesheet" href="../overlay.css"></head><body><div id="root"></div></body></html>`;
      const outputFile = path.join(outputDir, "view", "comment-overlay.html");
      await fs.ensureDir(path.dirname(outputFile));
      await fs.writeFile(outputFile, html);
    },
  };
}

// 過去実況の操作窓もMainとは別WebViewで起動し、Browser版へentryを混ぜない。
function archiveReplayHtmlPlugin(outputDir: string, entry: string): Plugin {
  const manifestJson = fs.readJsonSync("src/manifest.json");

  return {
    name: "archive-replay-html-build",
    async buildStart() {
      if (entry !== "replay") return;
      const version = String(manifestJson.version ?? "");
      const html = `<!DOCTYPE html><html class="view view_archive_replay" data-app-version="${version}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>ChLens 過去実況再生</title><script src="../replay.js" defer></script><link rel="stylesheet" href="../replay.css"></head><body><div id="root"></div></body></html>`;
      const outputFile = path.join(outputDir, "view", "archive-replay.html");
      await fs.ensureDir(path.dirname(outputFile));
      await fs.writeFile(outputFile, html);
    },
  };
}

// ─── plugin: manifest.json ───────────────────────────────────────────────────

function manifestPlugin(platform: string, outputDir: string): Plugin {
  return {
    name: "manifest-build",
    async buildStart() {
      if (platform === "tauri") return;
      await fs.ensureDir(outputDir);
      const m = await fs.readJson("src/manifest.json");

      if (platform === "chrome") {
        m.permissions = m.permissions.filter(
          (v: string) => !["webRequest", "webRequestBlocking"].includes(v),
        );
        delete m.background.scripts;
        delete m.applications;
      } else if (platform === "firefox") {
        m.manifest_version = 2;
        delete m.update_url;
        delete m.minimum_chrome_version;
        m.content_security_policy = m.content_security_policy.extension_pages;
        delete m.incognito;
        m.permissions = m.permissions.filter((v: string) => !["declarativeNetRequest"].includes(v));
        delete m.declarative_net_request;
        delete m.background.service_worker;
        m.permissions.push(...m.host_permissions);
        delete m.host_permissions;
        m.browser_action = m.action;
        delete m.action;
        m.web_accessible_resources = m.web_accessible_resources[0].resources;
      }

      await fs.writeJson(`${outputDir}/manifest.json`, m, { spaces: 2 });
    },
  };
}

// ─── plugin: static file copies ──────────────────────────────────────────────

function staticCopyPlugin(
  platform: string,
  outputDir: string,
  minifyJs: boolean,
  entry: string,
): Plugin {
  return {
    name: "static-copy",
    async buildStart() {
      // mainとOverlayを並列watchしても共有出力先を競合させないよう、
      // background・画像・Monacoなどの静的資産はmain entryだけが更新する。
      if (entry !== "browser") return;

      // 変更理由: content_scripts は manifest で単一JSを参照するため、
      // TS実装をここで bundle して常に最新の cs_addlink.js を出力する。
      await esbuildBuild({
        entryPoints: [
          path.resolve(__dirname, "src/cs_addlink.ts"),
          path.resolve(__dirname, "src/background.ts"),
        ],
        bundle: true,
        format: "iife",
        platform: "browser",
        target: "esnext",
        outdir: outputDir,
        minify: minifyJs,
      });

      const copies: Array<[string, string]> =
        platform !== "firefox" && platform !== "tauri"
          ? [["src/rules.json", `${outputDir}/rules.json`] as [string, string]]
          : [];

      copies.push(["src/view/browser/theme-init.js", `${outputDir}/theme-init.js`]);

      const imageOutputDir = path.join(outputDir, "img");
      await fs.remove(imageOutputDir);
      copies.push(["img", imageOutputDir]);

      // browser-polyfill
      if (platform === "tauri") {
        copies.push(["src/browser-shim.js", `${outputDir}/lib/browser-polyfill.min.js`]);
      } else {
        copies.push([
          "node_modules/webextension-polyfill/dist/browser-polyfill.min.js",
          `${outputDir}/lib/browser-polyfill.min.js`,
        ]);
      }

      await Promise.all(
        copies.map(async ([src, dest]) => {
          await fs.ensureDir(path.dirname(dest));
          await fs.copy(src, dest, { overwrite: true });
        }),
      );

      // vite.config.ts 内
      const monacoSrc = "node_modules/monaco-editor/min/vs";
      const monacoDest = `${outputDir}/lib/monaco/vs`;
      await fs.ensureDir(monacoDest);
      await fs.copy(monacoSrc, monacoDest, { overwrite: true });

      // ★ ハッシュ付き Worker をハッシュなしの名前にリネーム（コピー）するっす
      const assetsDir = path.join(monacoDest, "assets");
      if (await fs.pathExists(assetsDir)) {
        const files = await fs.readdir(assetsDir);
        for (const file of files) {
          // 例: json.worker-DKiEKt88.js -> json.worker.js に変換
          // MonacoのハッシュはURL用Base64なので、英数字以外にハイフンと下線も含む。
          const match = file.match(/^(.+?\.worker)-[a-zA-Z0-9_-]+\.js$/);
          if (match) {
            await fs.copy(path.join(assetsDir, file), path.join(assetsDir, `${match[1]}.js`), {
              overwrite: true,
            });
          }
        }
      }
    },
  };
}

// ─── main config ─────────────────────────────────────────────────────────────

// ─── lint: 機能（src/features）の境界 ──────────────────────────────────────────

/**
 * 機能ごとの公開モジュール（src/features/<機能>/ からの相対パス、拡張子なし）。
 * 他の機能は、ここに載せたファイルだけを import できる（計画: docs/plans/module-boundaries-plan.md §3.5）。
 * npm パッケージの package.json の exports と同じ考え方で、載っていないファイルは機能の内部として扱う。
 *
 * index.ts でまとめて再エクスポートしないのは、index.ts が export 先をすべて読み込み、
 * CSS や読み込み時に window を触るモジュールが、使わないエントリ（overlay・replay）やテストに入るため。
 * 新しく他の機能から使うときは、ここへ追加してレビューで公開してよいかを確認する。
 */
const FEATURE_PUBLIC_MODULES: Readonly<Record<string, readonly string[]>> = {
  "auto-refresh": ["browser/use-auto-scroll-state"],
  "auxiliary-window": ["browser/auxiliary-window-watcher", "browser/use-auxiliary-window"],
  bookmark: ["browser/use-bookmark-revision"],
  // domain・platform は comment-overlay の中でも使っている入口（index.ts）。
  "comment-overlay": ["domain", "platform", "ui/OverlayStage"],
  "live-chat": ["browser/use-live-chat-responses", "browser/use-thread-display-mode-setting"],
  media: [
    "application/imgur-album",
    "application/imgur-upload",
    "browser/use-media-viewer-store",
    "ui/ExternalImage",
    "ui/MediaViewerContainer",
    "ui/ResMediaGallery",
  ],
  "next-thread": [
    "browser/use-auto-next-thread",
    "browser/use-auto-next-thread-setting",
    "domain/auto-next-thread-trigger",
    "domain/next-thread-search",
  ],
  ng: [
    "browser/use-ng-status",
    "browser/use-thread-title-ng-dialog",
    "ui/NgBadge",
    "ui/NgResponsePlaceholder",
    "ui/ThreadTitleNgDialog",
  ],
  tabs: ["browser/use-detached-tab-controller", "browser/use-tab-command-runner"],
  thread: ["browser/use-thread-refresh-controller", "ui/ResBody", "ui/thread-context-menu-items"],
};

interface RestrictedImportPattern {
  group: string[];
  message: string;
  allowTypeImports?: boolean;
}

// core は service-container を import しない（計画書 §3 のルール 2、Phase C-1）。
const CORE_TO_CONTAINER_PATTERN: RestrictedImportPattern = {
  group: ["**/service-container/**"],
  message:
    "core は service-container を import しない。型は src/core/ports、サービスは corePorts（src/core/ports/registry）を使う。",
};

/**
 * view・features から直接 import してよい core のモジュール（src/core/ からの相対パス、拡張子なし）。
 * 入力から結果を返すだけで、保存・通信・共有の状態を持たないものだけを載せる（計画書 §3.6）。
 * 状態や保存を伴うもの（履歴・ログ・設定への書き込み・キャッシュを持つ解決処理など）は、
 * サービスコンテナ（src/service-container）に載せて container から使う。
 */
const CORE_DIRECT_MODULES: readonly string[] = [
  "board/BoardUrlNormalizer",
  "board/opened-board-entries",
  "network/url-utils",
  "ng/ThreadNgEvaluator",
  "ng/ngDsl",
  "ng/rules/catalog",
  "thread/MessageProcessor",
  "thread/reply-index",
  "util/external-media",
  "util/map-with-concurrency",
  "util/strip-html",
  "util/url-media",
];

// 型の import は実装を読み込まないため、どの core のモジュールからでも認める。
const CORE_DIRECT_PATTERN: RestrictedImportPattern = {
  group: ["**/core/**", ...CORE_DIRECT_MODULES.map((modulePath) => `!**/core/${modulePath}`)],
  allowTypeImports: true,
  message:
    "状態や保存を伴う core のモジュールは、サービスコンテナ（container）経由で使う。純粋なモジュールなら vite.config.ts の CORE_DIRECT_MODULES に追加する（計画書 §3.6）。",
};

// テストは本物の core の実装を組み合わせて確かめることがあるため、core の直接 import の制限から外す。
const TEST_FILE_GLOBS = ["**/*.test.ts", "**/*.test.tsx", "**/*.stories.tsx"];

/**
 * files に、patterns と core の直接 import の制限をかける override を作る。
 * テストと Story には、core の制限を除いた patterns だけをかける。
 * no-restricted-imports は後の override が前の設定を置き換えるため、範囲の広いものから順に並べる。
 */
function restrictImports(files: string[], patterns: RestrictedImportPattern[]) {
  // oxlint の設定型はタプルを要求するため、配列リテラルが広がらないよう型を明示する。
  const rule = (
    rulePatterns: RestrictedImportPattern[],
  ): ["error", { patterns: RestrictedImportPattern[] }] => ["error", { patterns: rulePatterns }];
  const testFiles = files
    .filter((glob) => glob.endsWith("/**"))
    .flatMap((glob) => TEST_FILE_GLOBS.map((testGlob) => `${glob.slice(0, -3)}/${testGlob}`));
  return [
    {
      files,
      excludeFiles: TEST_FILE_GLOBS,
      rules: { "eslint/no-restricted-imports": rule([...patterns, CORE_DIRECT_PATTERN]) },
    },
    ...(patterns.length > 0 && testFiles.length > 0
      ? [{ files: testFiles, rules: { "eslint/no-restricted-imports": rule(patterns) } }]
      : []),
  ];
}

// view/browser の UI 部品層は features と組み立て層（App・pages・shell）を import しない
// （計画: docs/plans/module-boundaries-plan.md §3 のルール 4、Phase D-3）。
// features から UI 部品層への参照は認めるため、逆向きを禁止して循環を防ぐ。
const UI_LAYER_FILES = [
  "src/view/browser/ui/**",
  "src/view/browser/hooks/**",
  "src/view/browser/utils/**",
  "src/view/browser/components/**",
  "src/view/browser/commands/**",
  "src/view/browser/state/**",
  "src/view/browser/types.ts",
];
const UI_LAYER_PATTERN: RestrictedImportPattern = {
  group: [
    "**/features/**",
    "**/view/browser/pages/**",
    "**/view/browser/shell/**",
    "**/view/browser/App",
  ],
  message:
    "view/browser の UI 部品層は features と組み立て層（App・pages・shell）を import しない。機能を組み合わせる部品は view/browser/shell に置く。",
};

// features は組み立て層（App・pages・shell）を import しない（計画書 §3 のルール 5）。
const FEATURE_TO_COMPOSITION_PATTERN: RestrictedImportPattern = {
  group: ["**/view/browser/pages/**", "**/view/browser/shell/**", "**/view/browser/App"],
  message:
    "features は組み立て層（App・pages・shell）を import しない。組み立て層から props・context で受け取るか、部品を UI 部品層へ移す。",
};

/**
 * view・features から window.app（旧互換の入口）を参照させない（docs/plans/legacy-window-app-plan.md の Phase 3）。
 * window.app 経由の参照は no-restricted-imports にかからず、CORE_DIRECT_MODULES の検査を横から抜けるため、
 * グローバルの `app` と、`window.app` などのプロパティ参照の両方を塞ぐ。
 * `(window as ...).app` のような型の付け替えや `window["app"]`、分割代入も検出される。
 * 抜け道として残るのは、ファイル内で `declare const app` と宣言して使う書き方（ローカルの変数として扱われる）。
 */
const WINDOW_APP_OWNERS = ["window", "globalThis", "self"];
const WINDOW_APP_MESSAGE =
  "view・features は window.app を使わない。core の機能はサービスコンテナ（container）から使う（docs/plans/legacy-window-app-plan.md）。";

/**
 * 機能ごとに、他の機能の内部（公開モジュール以外）への import を禁止する override を作る。
 * 新しく作った機能にも自動で適用されるよう、src/features のディレクトリから一覧を作る。
 */
function createFeatureBoundaryOverrides() {
  const featuresDir = path.resolve(__dirname, "src/features");
  const featureNames = fs
    .readdirSync(featuresDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
  const unknown = Object.keys(FEATURE_PUBLIC_MODULES).filter(
    (name) => !featureNames.includes(name),
  );
  if (unknown.length > 0) {
    // 機能の名前を変えたのに一覧が古いままだと、検査が黙って緩くなるため設定の読み込みで止める。
    throw new Error(`FEATURE_PUBLIC_MODULES に存在しない機能があります: ${unknown.join(", ")}`);
  }
  return featureNames.flatMap((feature) =>
    restrictImports(
      [`src/features/${feature}/**`],
      [
        FEATURE_TO_COMPOSITION_PATTERN,
        {
          group: [
            "**/features/*/**",
            `!**/features/${feature}/**`,
            ...Object.entries(FEATURE_PUBLIC_MODULES)
              .filter(([owner]) => owner !== feature)
              .flatMap(([owner, modules]) =>
                modules.map((modulePath) => `!**/features/${owner}/${modulePath}`),
              ),
          ],
          message:
            "他の機能の内部を import しない。公開してよいファイルなら vite.config.ts の FEATURE_PUBLIC_MODULES に追加する（計画書 §3.5）。",
        },
      ],
    ),
  );
}

export default defineConfig(async ({ mode, command }) => {
  const platform = process.env.PLATFORM || "chrome";
  const entry = process.env.ENTRY || "browser";
  const outputDir = `./debug/${platform}`;
  const analyzeBundle = process.env.ANALYZE === "true";
  // const buildCopyDestination = resolveBuildCopyDestination(mode);
  const isWatchMode = process.argv.includes("--watch");
  const isWatchDev =
    isWatchMode && (mode === "development" || process.env.VITE_WATCH_DEV === "true");
  const minifyOutput = !isWatchDev;

  const entryMap: Record<string, { file: string; name: string }> = {
    // app:           { file: "src/app.ts",                      name: "app" },
    // ui:            { file: "src/ui/ui.js",                    name: "UI" },
    // submit_res:    { file: "src/write/submit_res.js",         name: "submit_res" },
    // submit_thread: { file: "src/write/submit_thread.js",      name: "submit_thread" },
    browser: { file: "src/view/browser/index.tsx", name: "BrowserView" },
    overlay: { file: "src/view/comment-overlay/index.tsx", name: "CommentOverlay" },
    replay: { file: "src/view/archive-replay/index.tsx", name: "ArchiveReplay" },
  };

  const { file, name } = entryMap[entry];
  // Vite+は設定をCommonJSとして束ねるため、ESM専用プラグインは計測時だけ動的に読み込む。
  const coveragePlugin =
    process.env.VITE_COVERAGE === "true"
      ? (await import("vite-plugin-istanbul")).default({
          include: [
            "src/**/*.ts",
            "src/**/*.tsx",
            "packages/*/src/**/*.ts",
            "packages/*/src/**/*.tsx",
          ],
          exclude: ["**/*.test.ts", "**/*.test.tsx", "**/*.d.ts"],
          requireEnv: true,
          forceBuildInstrument: true,
        })
      : null;
  const visualizerPlugin = analyzeBundle
    ? (await import("rollup-plugin-visualizer")).visualizer
    : undefined;

  return {
    staged: {
      "src/**/*.{ts,tsx}": "vp check --fix",
    },
    fmt: {
      // ドキュメントは文章構成を優先し、コード用フォーマッターで意図せず書き換えない。
      // Peggyが生成するDSLパーサーは生成物なので整形しない（generate:dslで再生成する）。
      ignorePatterns: ["docs/**", "**/*.md", "packages/chlib/src/rules/dsl-grammar.{js,d.ts}"],
    },
    lint: {
      plugins: ["oxc", "typescript", "unicorn", "react", "import"],
      jsPlugins: [
        "eslint-plugin-simple-import-sort",
        {
          name: "vite-plus",
          specifier: "vite-plus/oxlint-plugin",
        },
      ],
      categories: {
        correctness: "warn",
      },
      env: {
        builtin: true,
      },
      ignorePatterns: [
        "debug/**",
        "playwright-report/**",
        "test-results/**",
        "src-tauri/target/**",
        "packages/chlib/src/rules/dsl-grammar.{js,d.ts}",
      ],
      rules: {
        "vite-plus/prefer-vite-plus-imports": "error",
        "simple-import-sort/imports": "error",
        "simple-import-sort/exports": "error",
        // 循環 import を作らない（計画: docs/plans/module-boundaries-plan.md §3 のルール 7、Phase E）。
        // 循環は読み込み順によって値が undefined になる不具合や、層の境界の崩れにつながるため。
        "import/no-cycle": "error",
      },
      // core は service-container に依存しない（計画: docs/plans/module-boundaries-plan.md Phase C-1）。
      // 依存は core/ports（型と registry）だけにする。service-container は setup で registry に登録する。
      overrides: [
        // core は service-container を import しない。
        // jsutil（window.app.util の互換用のまとめ口）を経由させない制限もここにあったが、
        // legacy-window-app-plan の Phase 4 で jsutil そのものを削除したため外した。
        {
          files: ["src/core/**"],
          rules: {
            "eslint/no-restricted-imports": ["error", { patterns: [CORE_TO_CONTAINER_PATTERN] }],
          },
        },
        // view 全体（組み立て層や overlay・replay の画面を含む）: core の直接 import だけを制限する（§3.6）。
        ...restrictImports(["src/view/**"], []),
        // UI 部品層: features・組み立て層への import と、core の直接 import を制限する（§3 のルール 4・6）。
        ...restrictImports(UI_LAYER_FILES, [UI_LAYER_PATTERN]),
        // 機能ごとの境界（組み立て層と、他の機能の内部への import を禁止）。
        ...createFeatureBoundaryOverrides(),
        // 生の console を使わず createLogger（src/app/logger）を通す。
        // レベル切り替えやタグ付けが効かず、後から保存先を足すときに取りこぼすため。
        // 既存コードを機能単位で置き換えているので、移行済みの範囲から順に対象を広げる。
        {
          files: ["src/features/**", "src/core/**"],
          rules: { "eslint/no-console": "error" },
        },
        // view・features は window.app を参照しない（docs/plans/legacy-window-app-plan.md の Phase 3）。
        {
          files: ["src/view/**", "src/features/**"],
          rules: {
            "eslint/no-restricted-globals": ["error", { name: "app", message: WINDOW_APP_MESSAGE }],
            "eslint/no-restricted-properties": [
              "error",
              ...WINDOW_APP_OWNERS.map((object) => ({
                object,
                property: "app",
                message: WINDOW_APP_MESSAGE,
              })),
            ],
          },
        },
      ],
      options: {
        typeAware: true,
        typeCheck: true,
      },
    },
    define: {
      // watch/dev でも production が注入されると分岐が壊れるため、Vite の mode を正として注入する。
      "process.env.NODE_ENV": JSON.stringify(mode),
      // 本番のChrome/FirefoxビルドではTauri専用の動的importを除去し、開発・テストでは実行時判定を保つ。
      __CHLENS_TAURI_BUILD__: JSON.stringify(command !== "build" || platform === "tauri"),
    },
    plugins: lazyPlugins(() => [
      react(),
      ...(coveragePlugin ? [coveragePlugin] : []),
      browserHtmlPlugin(outputDir, entry, platform),
      overlayHtmlPlugin(outputDir, entry),
      archiveReplayHtmlPlugin(outputDir, entry),
      manifestPlugin(platform, outputDir),
      staticCopyPlugin(platform, outputDir, minifyOutput, entry),
      // buildOutputCopyPlugin(outputDir, buildCopyDestination),
      ...(visualizerPlugin
        ? [
            // 解析時だけソースマップから minify 前のモジュール構成を metadata.json に出す。
            visualizerPlugin({
              filename: path.resolve(outputDir, "metadata.json"),
              template: "raw-data",
              projectRoot: process.cwd(),
              sourcemap: true,
            }),
          ]
        : []),
    ]),
    resolve: {
      alias: {
        // Preact互換の実行可否をまとめて検証するため、Reactの実行時 import を差し替える。
        "react-dom/client": "preact/compat/client",
        "react-dom": "preact/compat",
        "react/jsx-runtime": "preact/jsx-runtime",
        "react/jsx-dev-runtime": "preact/jsx-dev-runtime",
        react: "preact/compat",
        src: path.resolve(__dirname, "./src"),
        packages: path.resolve(__dirname, "./packages"),
        // 変更理由: Tauri版のShift_JIS/EUC-JPフォームエンコードが使うiconv-liteは
        // NodeのBufferを参照するため、WebViewでも同じ実装を解決できるようにする。
        buffer: path.resolve(__dirname, "./node_modules/buffer/index.js"),
        // Chlens側もLive側と同じ共有rules sourceを解決し、評価器の二重実装を防ぐ。
        "@chlen/chlib": path.resolve(__dirname, "./packages/chlib/src/index.ts"),
        "webextension-polyfill":
          platform === "tauri"
            ? path.resolve(__dirname, "./src/browser-shim.js")
            : "webextension-polyfill",
      },
      extensions: [".tsx", ".ts", ".jsx", ".js"],
    },
    build: {
      outDir: outputDir,
      emptyOutDir: false,
      minify: minifyOutput,
      sourcemap: analyzeBundle ? true : process.env.VITE_COVERAGE === "true" ? "inline" : false,
      lib: {
        entry: path.resolve(__dirname, file),
        formats: ["iife"],
        name,
      },
      rollupOptions: {
        output: {
          entryFileNames: `${entry}.js`,
          assetFileNames: (assetInfo) => {
            if (assetInfo.name?.endsWith(".css")) {
              return `${entry}.css`;
            }
            return "[name].[ext]";
          },
        },
      },
    },
  };
});
