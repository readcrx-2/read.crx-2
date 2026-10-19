/**
 * Chrome版・Tauri版の全画面を、ライトとダークのテーマで撮影する。
 *
 * 使い方: `node scripts/ui-screenshots.mjs <chrome|tauri|all> [Playwrightの引数]`
 * 保存先は `screenshots/ui/<実行日時>/<chrome|tauri>/<light|dark>/`。`UI_SHOT_DIR` で
 * `<実行日時>` の部分を差し替えられる。
 *
 * 変更理由: 以前のTauri版の撮影は、利用者が起動した開発版へ接続して設定を書き換えていた。
 * E2Eと同じfixtureで保存先を分けたTauri版を起動し、普段使いのデータに触れず1コマンドで撮る。
 * 撮影は通常のE2Eから外しているため（playwright.config.ts）、`CHLENS_UI_SHOTS` を付けて実行する。
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TARGETS = {
  chrome: { build: "build:chrome", spec: "tests/ui-screenshots.spec.mts" },
  tauri: { build: "build:tauri:e2e", spec: "tests/tauri/ui-screenshots.spec.mts" },
};

const [target, ...rawArgs] = process.argv.slice(2);
const platforms = target === "all" ? Object.keys(TARGETS) : [target];
if (!platforms.every((platform) => platform in TARGETS)) {
  console.error("使い方: node scripts/ui-screenshots.mjs <chrome|tauri|all> [Playwrightの引数]");
  process.exit(2);
}
// pnpm経由で先頭に残る `--` を、Playwrightがファイルの絞り込みとみなさないよう外す。
const playwrightArgs = rawArgs[0] === "--" ? rawArgs.slice(1) : rawArgs;

function run(command, args, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      env: { ...process.env, ...env },
      stdio: "inherit",
      // pnpmはWindowsではcmdのラッパーなので、シェル経由でないと起動できない。
      shell: command === "pnpm",
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal) reject(new Error(`${command} が ${signal} で終了しました`));
      else resolve(code ?? 1);
    });
  });
}

const stamp = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
const outputRoot = path.resolve(
  root,
  process.env.UI_SHOT_DIR ?? path.join("screenshots", "ui", stamp),
);
const offstage = path.join(root, "node_modules/offstage-windows/offstage.cjs");
const playwrightCli = path.join(root, "node_modules/@playwright/test/cli.js");

let exitCode = 0;
for (const platform of platforms) {
  const { build, spec } = TARGETS[platform];
  const buildExit = await run("pnpm", ["run", build]);
  if (buildExit !== 0) {
    console.error(`[ui:shots] ${platform} のビルドに失敗しました（終了コード ${buildExit}）`);
    exitCode ||= buildExit;
    continue;
  }
  // 撮影中の窓が作業中の画面やフォーカスを奪わないよう、非表示デスクトップで動かす。
  const shotExit = await run(
    process.execPath,
    [
      offstage,
      process.execPath,
      playwrightCli,
      "test",
      `--project=${platform}`,
      spec,
      "--workers=1",
      ...playwrightArgs,
    ],
    { CHLENS_UI_SHOTS: "true", UI_SHOT_DIR: outputRoot },
  );
  if (shotExit !== 0)
    console.error(`[ui:shots] ${platform} の撮影に失敗しました（終了コード ${shotExit}）`);
  exitCode ||= shotExit;
}

console.info(`[ui:shots] 保存先: ${outputRoot}`);
process.exitCode = exitCode;
