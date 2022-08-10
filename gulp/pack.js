const gulp = require("gulp");
const fs = require("fs-extra");
const os = require("os");
const path = require("path");
const { other: o } = require("./plugins");
const { browsers, paths, manifest } = require("./config");
const util = require("./util");

const createCrx3 = async function (tmpDir, pemPath) {
  await o.crx3([tmpDir], {
    keyPath: pemPath,
    crxPath: `./build/read.crx_2.${manifest.version}.crx`,
  });
};

const createXpi = async function (tmpDir, apicrePath) {
  const apicre = await fs.readJson(apicrePath);
  const webExt = await o.webExt;
  await webExt.cmd.sign({
    sourceDir: tmpDir,
    artifactsDir: process.cwd() + "/build",
    apiKey: apicre.issuer,
    apiSecret: apicre.secret,
  });
};

/*
  tasks
*/
const scan = function (browser) {
  const output = path.normalize(paths.output[browser]);
  return async function () {
    await util.exec("freshclam", []);
    await util.exec("clamscan", ["-ir", output]);
  };
};

const pack = function (browser) {
  let createFunc, secretEnv;
  const output = paths.output[browser];
  const tmpDir = path.join(os.tmpdir(), `debug-${browser}`);
  switch (browser) {
    case "chrome":
      var type = "crx";
      createFunc = createCrx3;
      secretEnv = "read.crx-2-pem-path";
      break;
    case "firefox":
      type = "xpi";
      createFunc = createXpi;
      secretEnv = "read.crx-2-apicre-path";
      break;
    default:
      type = "crx";
      createFunc = createCrx3;
      secretEnv = "read.crx-2-pem-path";
  }
  return async function () {
    await fs.copy(output, tmpDir);
    const secretPath =
      process.env[secretEnv] != null
        ? process.env[secretEnv]
        : await util.puts("秘密鍵のパスを入力して下さい: ");
    await createFunc(tmpDir, secretPath);
    await fs.remove(tmpDir);
  };
};

/*
  gulp task
*/
for (let browser of browsers) {
  gulp.task(`scan:${browser}`, scan(browser));
  gulp.task(`pack-in:${browser}`, pack(browser));
}

gulp.task("scan", gulp.task("scan:chrome"));
gulp.task("pack-in", gulp.task("pack-in:chrome"));
