let browser;
const gulp = require("gulp");
const { gulp: $ } = require("./plugins");
const { browsers, paths, defaultOptions } = require("./config");
const util = require("./util");

const pugOptions = {};
for (browser of browsers) {
  pugOptions[browser] = Object.assign({}, defaultOptions.pug, {
    data: {
      image_ext: util.getExt(browser),
    },
  });
}

/*
  tasks
*/
var view = function (browser) {
  const output = paths.output[browser] + "/view";
  return () =>
    gulp
      .src(paths.html.view, { since: gulp.lastRun(view) })
      .pipe($.plumber(util.onPugError))
      .pipe($.filter(paths.html.notBasePugs))
      .pipe($.pug(pugOptions[browser]))
      .pipe(gulp.dest(output));
};

var zombie = function (browser) {
  const output = paths.output[browser];
  return () =>
    gulp
      .src(paths.html.zombie, { since: gulp.lastRun(zombie) })
      .pipe($.plumber(util.onPugError))
      .pipe($.filter(paths.html.notBasePugs))
      .pipe($.pug(pugOptions[browser]))
      .pipe(gulp.dest(output));
};

var write = function (browser) {
  const output = paths.output[browser] + "/write";
  return () =>
    gulp
      .src(paths.html.write, { since: gulp.lastRun(write) })
      .pipe($.plumber(util.onPugError))
      .pipe($.filter(paths.html.notBasePugs))
      .pipe($.pug(pugOptions[browser]))
      .pipe(gulp.dest(output));
};

/*
  gulp task
*/
for (browser of browsers) {
  gulp.task(`html:view:${browser}`, view(browser));
  gulp.task(`html:zombie.html:${browser}`, zombie(browser));
  gulp.task(`html:write:${browser}`, write(browser));

  gulp.task(
    `html:${browser}`,
    gulp.parallel(
      `html:view:${browser}`,
      `html:zombie.html:${browser}`,
      `html:write:${browser}`
    )
  );
}

gulp.task("html", gulp.task("html:chrome"));
