gulp = require "gulp"
path = require "path"
{gulp: $, rollup: _} = require "./plugins"
{browsers, paths, defaultOptions} = require "./config"
{makeInOut, getRollupIOConfigs} = require "./js"
util = require "./util"

makeRollupConfig = (browser, configName) ->
  config = getRollupIOConfigs(configName, browser)
  c = makeInOut(browser, config)
  return {
    c.input...
    output: c.output
  }

rollupWatch = (config) ->
  filename = path.basename(config.output.file)
  _.rollup.watch(config).on("event", util.onRollupWatch(filename))
  return

###
  tasks
###
watch = (browser) ->
  appjsConfig = makeRollupConfig(browser, "app")
  corejsConfig = makeRollupConfig(browser, "core")
  uijsConfig = makeRollupConfig(browser, "ui")
  submitResjsConfig = makeRollupConfig(browser, "submitRes")
  submitThreadjsConfig = makeRollupConfig(browser, "submitThread")
  return ->
    rollupWatch(appjsConfig)
    rollupWatch(corejsConfig)
    rollupWatch(uijsConfig)
    rollupWatch(submitResjsConfig)
    rollupWatch(submitThreadjsConfig)
    gulp.watch([paths.lib.webExtPolyfill, paths.js.background], gulp.task("js:background.js:#{browser}"))
    gulp.watch(paths.js.csAddlink, gulp.task("js:cs_addlink.js:#{browser}"))
    gulp.watch(paths.js.view, gulp.task("js:view:#{browser}"))
    gulp.watch([paths.lib.webExtPolyfill, paths.js.zombie], gulp.task("js:zombie.js:#{browser}"))
    gulp.watch(paths.js.csWrite, gulp.task("js:cs_write.js:#{browser}"))
    gulp.watch(paths.css.ui, gulp.task("css:ui.css:#{browser}"))
    gulp.watch(paths.css.view, gulp.task("css:view:#{browser}"))
    gulp.watch(paths.css.write, gulp.task("css:write:#{browser}"))
    gulp.watch(paths.watchHtml.view, gulp.task("html:view:#{browser}"))
    gulp.watch(paths.watchHtml.zombie, gulp.task("html:zombie.html:#{browser}"))
    gulp.watch(paths.watchHtml.write, gulp.task("html:write:#{browser}"))
    gulp.watch(paths.img.imgsSrc, gulp.task("img:#{browser}"))
    gulp.watch(paths.manifest, gulp.task("manifest:#{browser}"))
    gulp.watch(paths.lib.shortQuery, gulp.task("lib:shortQuery:#{browser}"))
    gulp.watch(paths.lib.webExtPolyfill, gulp.task("lib:webExtPolyfill:#{browser}"))
    return

###
  gulp task
###
for browser in browsers
  gulp.task "watch-in:#{browser}", watch(browser)

gulp.task "watch-in", gulp.task("watch-in:chrome")
