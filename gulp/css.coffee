gulp = require "gulp"
{compiler: c, gulp: $} = require "./plugins"
{browsers, paths, defaultOptions} = require "./config"
util = require "./util"

transform = (browser) ->
  ext = util.getExt(browser)
  return {
    "img($name)": (name) ->
      nameVal = name.getValue()
      transformedStr = "url(/img/#{nameVal}.#{ext})"
      return c.sass.types.String(transformedStr)
  }
transforms = {}
for browser in browsers
  transforms[browser] = transform(browser)

ui = (browser) ->
  output = paths.output[browser]
  sassOptions = Object.assign({}, defaultOptions.sass, {
    functions: transforms[browser]
  })
  return ->
    return gulp.src paths.css.ui
      .pipe($.sass(sassOptions).on("error", util.onScssError))
      .pipe(gulp.dest(output))

view = (browser) ->
  output = paths.output[browser]+"/view"
  sassOptions = Object.assign({}, defaultOptions.sass, {
    functions: transforms[browser]
  })
  return ->
    return gulp.src paths.css.view
      .pipe($.sass(sassOptions).on("error", util.onScssError))
      .pipe(gulp.dest(output))

write = (browser) ->
  output = paths.output[browser]+"/write"
  sassOptions = Object.assign({}, defaultOptions.sass, {
    functions: transforms[browser]
  })
  return ->
    return gulp.src paths.css.write
      .pipe($.sass(sassOptions).on("error", util.onScssError))
      .pipe(gulp.dest(output))

###
  gulp task
###
for browser in browsers
  gulp.task "css:ui.css:#{browser}", ui(browser)
  gulp.task "css:view:#{browser}", view(browser)
  gulp.task "css:write:#{browser}", write(browser)

  gulp.task "css:#{browser}", gulp.parallel(
    "css:ui.css:#{browser}"
    "css:view:#{browser}"
    "css:write:#{browser}"
  )

gulp.task "css", gulp.task("css:chrome")
