const rolldown = require("rolldown");
const { replacePlugin } = require("rolldown/plugins");
const sassCompiler = require("sass");
const sass = require("gulp-sass")(sassCompiler);
const webExt = (async () => {
  return await import("web-ext");
})();

module.exports = {
  compiler: {
    sass: sassCompiler,
    pug: require("pug"),
  },
  gulp: {
    gulp: require("gulp"),
    plumber: require("gulp-plumber"),
    filter: require("gulp-filter").default ?? require("gulp-filter"),
    concat: require("gulp-concat"),
    notify: require("gulp-notify"),
    merge: require("merge2"),
    rename: require("gulp-rename"),
    replace: require("gulp-replace"),
    sass,
    postcss: require("gulp-postcss"),
    pug: require("gulp-pug"),
  },
  rolldown: {
    rolldown: rolldown.rolldown,
    watch: rolldown.watch,
    replace: replacePlugin,
  },
  postcss: {
    autoprefixer: require("autoprefixer"),
  },
  other: {
    sharp: require("sharp"),
    crx3: require("crx3"),
    webExt: webExt,
  },
};
