const gulp = require("gulp");
const path = require("path");
const {gulp: $, rollup: _} = require("./plugins");
const {browsers, paths, defaultOptions} = require("./config");
const {makeInOut, getRollupIOConfigs} = require("./js");
const util = require("./util");

const makeRollupConfig = function(browser, configName) {
  const config = getRollupIOConfigs(configName, browser);
  const c = makeInOut(browser, config);
  return {
    ...c.input,
    output: c.output
  };
};

const rollupWatch = function(config) {
  const filename = path.basename(config.output.file);
  _.rollup.watch(config).on("event", util.onRollupWatch(filename));
};

/*
  tasks
*/
const watch = function(browser) {
  const appjsConfig = makeRollupConfig(browser, "app");
  const corejsConfig = makeRollupConfig(browser, "core");
  const uijsConfig = makeRollupConfig(browser, "ui");
  const submitResjsConfig = makeRollupConfig(browser, "submitRes");
  const submitThreadjsConfig = makeRollupConfig(browser, "submitThread");
  return function() {
    rollupWatch(appjsConfig);
    rollupWatch(corejsConfig);
    rollupWatch(uijsConfig);
    rollupWatch(submitResjsConfig);
    rollupWatch(submitThreadjsConfig);
    gulp.watch([paths.lib.webExtPolyfill, paths.js.background], gulp.task(`js:background.js:${browser}`));
    gulp.watch(paths.js.csAddlink, gulp.task(`js:cs_addlink.js:${browser}`));
    gulp.watch(paths.js.view, gulp.task(`js:view:${browser}`));
    gulp.watch([paths.lib.webExtPolyfill, paths.js.zombie], gulp.task(`js:zombie.js:${browser}`));
    gulp.watch(paths.js.csWrite, gulp.task(`js:cs_write.js:${browser}`));
    gulp.watch(paths.css.ui, gulp.task(`css:ui.css:${browser}`));
    gulp.watch(paths.css.view, gulp.task(`css:view:${browser}`));
    gulp.watch(paths.css.write, gulp.task(`css:write:${browser}`));
    gulp.watch(paths.html.view, gulp.task(`html:view:${browser}`));
    gulp.watch(paths.html.zombie, gulp.task(`html:zombie.html:${browser}`));
    gulp.watch(paths.html.write, gulp.task(`html:write:${browser}`));
    gulp.watch(paths.img.imgsSrc, gulp.task(`img:${browser}`));
    gulp.watch(paths.manifest, gulp.task(`manifest:${browser}`));
    gulp.watch(paths.lib.shortQuery, gulp.task(`lib:shortQuery:${browser}`));
    gulp.watch(paths.lib.webExtPolyfill, gulp.task(`lib:webExtPolyfill:${browser}`));
  };
};

/*
  gulp task
*/
for (let browser of browsers) {
  gulp.task(`watch-in:${browser}`, watch(browser));
}

gulp.task("watch-in", gulp.task("watch-in:chrome"));
