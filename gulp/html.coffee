gulp = require "gulp"
{gulp: $} = require "./plugins"
{browsers, paths, defaultOptions} = require "./config"
util = require "./util"

pugOptions = {}
for browser in browsers
  pugOptions[browser] = Object.assign({}, defaultOptions.pug, {
    data:
      image_ext: util.getExt(browser)
  })

###
  tasks
###
view = (browser) ->
  output = paths.output[browser]+"/view"
  return ->
    return gulp.src paths.html.view
      .pipe($.plumber(util.onPugError))
      .pipe($.progenyMtime())
      .pipe($.changed(output, extension: ".html"))
      .pipe($.pug(pugOptions[browser]))
      .pipe(gulp.dest(output))

zombie = (browser) ->
  output = paths.output[browser]
  return ->
    return gulp.src paths.html.zombie
      .pipe($.plumber(util.onPugError))
      .pipe($.progenyMtime())
      .pipe($.changed(output, extension: ".html"))
      .pipe($.pug(pugOptions[browser]))
      .pipe(gulp.dest(output))

write = (browser) ->
  output = paths.output[browser]+"/write"
  return ->
    return gulp.src paths.html.write
      .pipe($.plumber(util.onPugError))
      .pipe($.progenyMtime())
      .pipe($.changed(output, extension: ".html"))
      .pipe($.pug(pugOptions[browser]))
      .pipe(gulp.dest(output))

###
  gulp task
###
for browser in browsers
  gulp.task "html:view:#{browser}", view(browser)
  gulp.task "html:zombie.html:#{browser}", zombie(browser)
  gulp.task "html:write:#{browser}", write(browser)

  gulp.task "html:#{browser}", gulp.parallel(
    "html:view:#{browser}"
    "html:zombie.html:#{browser}"
    "html:write:#{browser}"
  )

gulp.task "html", gulp.task("html:chrome")
