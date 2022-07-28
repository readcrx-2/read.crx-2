// TODO: This file was created by bulk-decaffeinate.
// Sanity-check the conversion and remove this comment.
const gulp = require("gulp");
const path = require("path");
const fs = require("fs-extra");
const {gulp: $} = require("./plugins");
const {browsers, paths, defaultOptions} = require("./config");
const util = require("./util");

/*
  tasks
*/
const manifest = function(browser) {
  const output = paths.output[browser];
  const src = paths.manifest;
  const bin = `${output}/manifest.json`;
  return async function() {
    if (!util.isSrcNewer(src, bin)) { return; }
    await fs.ensureDir(output);
    await util.exec('"./node_modules/.bin/wemf"', [src, "-O", bin, "--browser", browser], true);
  };
};

var shortQuery = function(browser) {
  const output = paths.output[browser]+"/lib";
  return () => gulp.src(paths.lib.shortQuery, { since: gulp.lastRun(shortQuery) })
    .pipe($.rename("shortQuery.min.js"))
    .pipe(gulp.dest(output));
};

var webExtPolyfill = function(browser) {
  const output = paths.output[browser]+"/lib";
  return () => gulp.src(paths.lib.webExtPolyfill, { since: gulp.lastRun(webExtPolyfill) })
    .pipe(gulp.dest(output));
};

/*
  gulp task
*/
for (let browser of browsers) {
  gulp.task(`manifest:${browser}`, manifest(browser));

  gulp.task(`lib:shortQuery:${browser}`, shortQuery(browser));
  gulp.task(`lib:webExtPolyfill:${browser}`, webExtPolyfill(browser));

  gulp.task(`lib:${browser}`, gulp.parallel(
    `lib:shortQuery:${browser}`,
    `lib:webExtPolyfill:${browser}`
  )
  );
}

gulp.task("manifest", gulp.task("manifest:chrome"));
gulp.task("lib", gulp.task("lib:chrome"));

gulp.task("clean", () => Promise.all([
  fs.remove("./.rpt2_cache"),
  fs.remove("./debug/chrome"),
  fs.remove("./debug/firefox"),
  fs.remove("./read.crx_2.zip")
]));
