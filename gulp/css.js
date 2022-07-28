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
      return c.sass.SassString(transformedStr)
    "vals($name)": (name) ->
      nameVal = name.getValue()
      str = ""
      switch nameVal
        when "scroll"
          str = if browser is "chrome" then "auto" else "scroll"
        else
          console.error("Error: Scss vals not found. Unknown val name: #{nameVal}")
      return c.sass.SassString(str)
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
    return gulp.src paths.css.ui, { since: gulp.lastRun(ui) }
      .pipe($.sass.sync(sassOptions).on("error", util.onScssError))
      .pipe($.postcss(defaultOptions.postcss))
      .pipe(gulp.dest(output))

view = (browser) ->
  output = paths.output[browser]+"/view"
  sassOptions = Object.assign({}, defaultOptions.sass, {
    functions: transforms[browser]
  })
  return ->
    return gulp.src paths.css.view, { since: gulp.lastRun(view) }
      .pipe($.sass.sync(sassOptions).on("error", util.onScssError))
      .pipe($.postcss(defaultOptions.postcss))
      .pipe(gulp.dest(output))

write = (browser) ->
  output = paths.output[browser]+"/write"
  sassOptions = Object.assign({}, defaultOptions.sass, {
    functions: transforms[browser]
  })
  return ->
    return gulp.src paths.css.write, { since: gulp.lastRun(write) }
      .pipe($.sass.sync(sassOptions).on("error", util.onScssError))
      .pipe($.postcss(defaultOptions.postcss))
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
