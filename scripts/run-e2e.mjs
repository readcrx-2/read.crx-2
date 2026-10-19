/**
 * PlaywrightのE2Eを「並列」と「`@serial` の直列」の2段階で実行し、レポートを1つにまとめる。
 *
 * 変更理由: 同じ保存領域や窓のフォーカスを奪い合うテストは並列では不安定になる。
 * テスト名へ `@serial` を付けたものだけ1 workerで後から流し、それ以外は並列のまま速く回す。
 * 2段階に分けるとレポートも2つに分かれるため、blobレポートを最後にHTMLへ統合する。
 *
 * 引数はそのままPlaywrightへ渡す（例: `--project=chrome tests/ui.spec.mts --shard=1/2`）。
 */
import { spawn } from "node:child_process";
import { copyFile, mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const playwrightCli = path.join(repoRoot, "node_modules/@playwright/test/cli.js");

const PHASES = [
  { name: "parallel", args: ["--grep-invert", "@serial"] },
  { name: "serial", args: ["--grep", "@serial", "--workers=1"] },
];

function runNode(script, args, env, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], {
      cwd,
      env: { ...process.env, ...env },
      stdio: "inherit",
      windowsHide: true,
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal) reject(new Error(`子プロセスが ${signal} で終了しました`));
      else resolve(code ?? 1);
    });
  });
}

async function listBlobs(directory) {
  try {
    return (await readdir(directory)).filter((name) => name.endsWith(".zip"));
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

/** pnpm経由では先頭に `--` が残ることがあり、Playwrightがそれ以降をファイル名の絞り込みとみなすため外す。 */
function normalizeArgs(args) {
  return args[0] === "--" ? args.slice(1) : args;
}

export async function runE2EPhases(rawArgs, root = repoRoot) {
  const args = normalizeArgs(rawArgs);
  const blobRoot = path.join(root, "blob-report");
  await rm(blobRoot, { recursive: true, force: true });

  let exitCode = 0;
  for (const phase of PHASES) {
    const result = await runNode(
      playwrightCli,
      [
        "test",
        ...args,
        ...phase.args,
        "--pass-with-no-tests",
        "--reporter=list,blob",
        "--output",
        path.join(root, "test-results", phase.name),
      ],
      { PLAYWRIGHT_BLOB_OUTPUT_DIR: path.join(blobRoot, phase.name) },
      root,
    );
    // 後の段階が成功しても、前の段階の失敗を結果に残す。
    exitCode ||= result;
  }

  const merged = path.join(blobRoot, "combined");
  await mkdir(merged, { recursive: true });
  let count = 0;
  for (const { name } of PHASES) {
    const phaseDirectory = path.join(blobRoot, name);
    for (const file of await listBlobs(phaseDirectory)) {
      await copyFile(path.join(phaseDirectory, file), path.join(merged, `${name}-${file}`));
      count++;
    }
  }
  if (count === 0) return exitCode;

  const mergeExit = await runNode(
    playwrightCli,
    ["merge-reports", "--reporter=html", merged],
    {
      PLAYWRIGHT_HTML_OPEN: "never",
      PLAYWRIGHT_HTML_OUTPUT_DIR: path.join(root, "playwright-report"),
    },
    root,
  );
  return exitCode || mergeExit;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  process.exitCode = await runE2EPhases(process.argv.slice(2));
}
