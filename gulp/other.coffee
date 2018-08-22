gulp = require "gulp"
path = require "path"
fs = require "fs-extra"
{gulp: $} = require "./plugins"
{browsers, paths, defaultOptions} = require "./config"
util = require "./util"

###
  tasks
###
manifest = (browser) ->
  output = paths.output[browser]
  src = paths.manifest
  bin = "#{output}/manifest.json"
  return ->
    return unless util.isSrcNewer(src, bin)
    await fs.ensureDir(output)
    await util.exec('"./node_modules/.bin/wemf"', [src, "-O", bin, "--browser", browser], true)
    return

shortQuery = (browser) ->
  output = paths.output[browser]+"/lib"
  return ->
    return gulp.src paths.lib.shortQuery
      .pipe($.rename("shortQuery.min.js"))
      .pipe($.changed(output, transformPath: (p) -> return path.join(path.dirname(p), "shortQuery.min.js")))
      .pipe(gulp.dest(output))

webExtPolyfill = (browser) ->
  output = paths.output[browser]+"/lib"
  return ->
    return gulp.src paths.lib.webExtPolyfill
      .pipe($.changed(output))
      .pipe(gulp.dest(output))

###
  gulp task
###
for browser in browsers
  gulp.task "manifest:#{browser}", manifest(browser)

  gulp.task "lib:shortQuery:#{browser}", shortQuery(browser)
  gulp.task "lib:webExtPolyfill:#{browser}", webExtPolyfill(browser)

  gulp.task "lib:#{browser}", gulp.parallel(
    "lib:shortQuery:#{browser}"
    "lib:webExtPolyfill:#{browser}"
  )

gulp.task "manifest", gulp.task("manifest:chrome")
gulp.task "lib", gulp.task("lib:chrome")

gulp.task "clean", ->
  return Promise.all([
    fs.remove("./.rpt2_cache")
    fs.remove("./debug-chrome")
    fs.remove("./debug-firefox")
    fs.remove("./read.crx_2.zip")
  ])
