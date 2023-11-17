const gulp = require("gulp");
const fs = require("fs-extra");
const { gulp: $ } = require("./plugins");
const { browsers, paths } = require("./config");

/*
  tasks
*/
const manifest = function (browser) {
  const output = paths.output[browser];
  const bin = `${output}/manifest.json`;

  return async function () {
    const tmpManifest = await fs.readJson(paths.manifest);

    if (browser === "chrome") {
      tmpManifest.permissions = tmpManifest.permissions.filter(
        (v) => !["webRequest", "webRequestBlocking"].includes(v)
      );
      delete tmpManifest.background.scripts;
      delete tmpManifest.applications;
    } else if (browser === "firefox") {
      tmpManifest.manifest_version = 2;
      delete tmpManifest.update_url;
      delete tmpManifest.minimum_chrome_version;
      tmpManifest.content_security_policy =
        tmpManifest.content_security_policy.extension_pages;
      delete tmpManifest.incognito;
      tmpManifest.permissions = tmpManifest.permissions.filter(
        (v) => !["declarativeNetRequest"].includes(v)
      );
      delete tmpManifest.declarative_net_request;
      delete tmpManifest.background.service_worker;
      tmpManifest.permissions.push(...tmpManifest.host_permissions);
      delete tmpManifest.host_permissions;
      tmpManifest.browser_action = tmpManifest.action;
      delete tmpManifest.action;
      tmpManifest.web_accessible_resources =
        tmpManifest.web_accessible_resources[0].resources;
    }

    await fs.ensureDir(output);
    await fs.writeJson(bin, tmpManifest, { spaces: 2 });
  };
};

const rules = function (browser) {
  if (browser === "firefox") {
    return async () => {};
  }

  const output = paths.output[browser];
  return () =>
    gulp
      .src(paths.rules, { since: gulp.lastRun(rules) })
      .pipe(gulp.dest(output));
};

var shortQuery = function (browser) {
  const output = paths.output[browser] + "/lib";
  return () =>
    gulp
      .src(paths.lib.shortQuery, { since: gulp.lastRun(shortQuery) })
      .pipe($.rename("shortQuery.min.js"))
      .pipe(gulp.dest(output));
};

var webExtPolyfill = function (browser) {
  const output = paths.output[browser] + "/lib";
  return () =>
    gulp
      .src(paths.lib.webExtPolyfill, { since: gulp.lastRun(webExtPolyfill) })
      .pipe(gulp.dest(output));
};

/*
  gulp task
*/
for (let browser of browsers) {
  gulp.task(`manifest:${browser}`, manifest(browser));
  gulp.task(`rules:${browser}`, rules(browser));

  gulp.task(`lib:shortQuery:${browser}`, shortQuery(browser));
  gulp.task(`lib:webExtPolyfill:${browser}`, webExtPolyfill(browser));

  gulp.task(
    `lib:${browser}`,
    gulp.parallel(`lib:shortQuery:${browser}`, `lib:webExtPolyfill:${browser}`)
  );
}

gulp.task("manifest", gulp.task("manifest:chrome"));
gulp.task("rules", gulp.task("rules:chrome"));
gulp.task("lib", gulp.task("lib:chrome"));

gulp.task("clean", () =>
  Promise.all([
    fs.remove("./.rpt2_cache"),
    fs.remove("./debug/chrome"),
    fs.remove("./debug/firefox"),
    fs.remove("./read.crx_2.zip"),
  ])
);
