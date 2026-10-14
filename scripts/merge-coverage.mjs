import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import libCoverage from "istanbul-lib-coverage";
import libReport from "istanbul-lib-report";
import reports from "istanbul-reports";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reportsToWrite = ["text", "html", "lcov", "json"];

function locationKey(location) {
  return `${location.start.line}:${location.start.column}-${location.end.line}:${location.end.column}`;
}

function mergeCoverage(inputs) {
  // V8とIstanbulでは計測IDが異なるため、IDではなくソース位置を基準に統合する。
  const files = new Map();
  for (const input of inputs) {
    const inputMap = libCoverage.createCoverageMap(input);
    for (const filename of inputMap.files()) {
      const source = inputMap.fileCoverageFor(filename).data;
      const file = path.resolve(source.path);
      const target = files.get(file) ?? libCoverage.createFileCoverage(file).data;
      files.set(file, target);

      const statements = new Map(Object.entries(target.statementMap).map(([id, loc]) => [locationKey(loc), id]));
      for (const [sourceId, loc] of Object.entries(source.statementMap)) {
        const key = locationKey(loc);
        let id = statements.get(key);
        if (id === undefined) {
          id = String(statements.size);
          statements.set(key, id);
          target.statementMap[id] = loc;
          target.s[id] = 0;
        }
        target.s[id] += source.s[sourceId];
      }

      const functions = new Map(Object.entries(target.fnMap).map(([id, fn]) => [locationKey(fn.loc), id]));
      for (const [sourceId, fn] of Object.entries(source.fnMap)) {
        const key = locationKey(fn.loc);
        let id = functions.get(key);
        if (id === undefined) {
          id = String(functions.size);
          functions.set(key, id);
          target.fnMap[id] = fn;
          target.f[id] = 0;
        }
        target.f[id] += source.f[sourceId];
      }

      const branchKey = (branch) => JSON.stringify([branch.type, branch.locations.map(locationKey)]);
      const branches = new Map(Object.entries(target.branchMap).map(([id, branch]) => [branchKey(branch), id]));
      for (const [sourceId, branch] of Object.entries(source.branchMap)) {
        const key = branchKey(branch);
        let id = branches.get(key);
        if (id === undefined) {
          id = String(branches.size);
          branches.set(key, id);
          target.branchMap[id] = branch;
          target.b[id] = branch.locations.map(() => 0);
        }
        branch.locations.forEach((_, index) => {
          target.b[id][index] += source.b[sourceId][index];
        });
      }
    }
  }
  return libCoverage.createCoverageMap(Object.fromEntries(files));
}

async function readReport(filename) {
  return JSON.parse(await readFile(filename, "utf8"));
}

async function writeReport(coverageMap, outputDirectory) {
  const context = libReport.createContext({ dir: outputDirectory, coverageMap });
  for (const reporter of reportsToWrite) {
    reports.create(reporter === "lcov" ? "lcovonly" : reporter).execute(context);
  }
  await writeFile(
    path.join(outputDirectory, "coverage-summary.json"),
    JSON.stringify(coverageMap.getCoverageSummary().toJSON(), null, 2),
  );
}

const rawDirectory = path.join(root, "coverage/e2e/raw");
const rawFiles = (await readdir(rawDirectory)).filter((filename) => filename.endsWith(".json"));
if (!rawFiles.length) {
  throw new Error("E2Eカバレッジを取得できませんでした。ページ上で計測コードが実行されたか確認してください。");
}

const e2eInputs = await Promise.all(rawFiles.map((filename) => readReport(path.join(rawDirectory, filename))));
const e2eMap = mergeCoverage(e2eInputs);
await writeReport(e2eMap, path.join(root, "coverage/e2e"));
await writeFile(path.join(root, "coverage/e2e/coverage-final.json"), JSON.stringify(e2eMap.toJSON()));

if (!process.argv.includes("--e2e-only")) {
  const unit = await readReport(path.join(root, "coverage/unit/coverage-final.json"));
  const combinedMap = mergeCoverage([unit, ...e2eInputs]);
  await writeReport(combinedMap, path.join(root, "coverage/combined"));
  await writeFile(path.join(root, "coverage/combined/coverage-final.json"), JSON.stringify(combinedMap.toJSON()));
}
