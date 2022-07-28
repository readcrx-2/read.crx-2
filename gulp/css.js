let browser;
const gulp = require("gulp");
const {compiler: c, gulp: $} = require("./plugins");
const {browsers, paths, defaultOptions} = require("./config");
const util = require("./util");

const transform = function(browser) {
  const ext = util.getExt(browser);
  return {
    "img($name)"(name) {
      const nameVal = name.getValue();
      const transformedStr = `url(/img/${nameVal}.${ext})`;
      return c.sass.SassString(transformedStr);
    },
    "vals($name)"(name) {
      const nameVal = name.getValue();
      let str = "";
      switch (nameVal) {
        case "scroll":
          str = browser === "chrome" ? "auto" : "scroll";
          break;
        default:
          console.error(`Error: Scss vals not found. Unknown val name: ${nameVal}`);
      }
      return c.sass.SassString(str);
    }
  };
};
const transforms = {};
for (browser of browsers) {
  transforms[browser] = transform(browser);
}

var ui = function(browser) {
  const output = paths.output[browser];
  const sassOptions = Object.assign({}, defaultOptions.sass, {
    functions: transforms[browser]
  });
  return () => gulp.src(paths.css.ui, { since: gulp.lastRun(ui) })
    .pipe($.sass.sync(sassOptions).on("error", util.onScssError))
    .pipe($.postcss(defaultOptions.postcss))
    .pipe(gulp.dest(output));
};

var view = function(browser) {
  const output = paths.output[browser]+"/view";
  const sassOptions = Object.assign({}, defaultOptions.sass, {
    functions: transforms[browser]
  });
  return () => gulp.src(paths.css.view, { since: gulp.lastRun(view) })
    .pipe($.sass.sync(sassOptions).on("error", util.onScssError))
    .pipe($.postcss(defaultOptions.postcss))
    .pipe(gulp.dest(output));
};

var write = function(browser) {
  const output = paths.output[browser]+"/write";
  const sassOptions = Object.assign({}, defaultOptions.sass, {
    functions: transforms[browser]
  });
  return () => gulp.src(paths.css.write, { since: gulp.lastRun(write) })
    .pipe($.sass.sync(sassOptions).on("error", util.onScssError))
    .pipe($.postcss(defaultOptions.postcss))
    .pipe(gulp.dest(output));
};

/*
  gulp task
*/
for (browser of browsers) {
  gulp.task(`css:ui.css:${browser}`, ui(browser));
  gulp.task(`css:view:${browser}`, view(browser));
  gulp.task(`css:write:${browser}`, write(browser));

  gulp.task(`css:${browser}`, gulp.parallel(
    `css:ui.css:${browser}`,
    `css:view:${browser}`,
    `css:write:${browser}`
  )
  );
}

gulp.task("css", gulp.task("css:chrome"));
