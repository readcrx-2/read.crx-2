gulp = require "gulp"
path = require "path"
{gulp: $, rollup: _} = require "./plugins"
{browsers, paths, defaultOptions} = require "./config"
{makeInOut, rollupIOConfigs} = require "./js"
util = require "./util"

makeRollupConfig = (browser, config) ->
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
  appjsConfig = makeRollupConfig(browser, rollupIOConfigs.app)
  corejsConfig = makeRollupConfig(browser, rollupIOConfigs.core)
  uijsConfig = makeRollupConfig(browser, rollupIOConfigs.ui)
  submitResjsConfig = makeRollupConfig(browser, rollupIOConfigs.submitRes)
  submitThreadjsConfig = makeRollupConfig(browser, rollupIOConfigs.submitThread)
  return ->
    rollupWatch(appjsConfig)
    rollupWatch(corejsConfig)
    rollupWatch(uijsConfig)
    rollupWatch(submitResjsConfig)
    rollupWatch(submitThreadjsConfig)
    gulp.watch([paths.lib.webExtPolyfill, paths.js.background], gulp.task("js:background.js:#{browser}"))
    gulp.watch(paths.js.csAddlink, gulp.task("js:cs_addlink.js:#{browser}"))
    gulp.watch(paths.js.view, gulp.task("js:view:#{browser}"))
    gulp.watch(paths.js.zombie, gulp.task("js:zombie:#{browser}"))
    gulp.watch(paths.js.csWrite, gulp.task("js:cs_write.js:#{browser}"))
    gulp.watch(paths.watchCss.ui, gulp.task("css:ui.css:#{browser}"))
    gulp.watch(paths.watchCss.view, gulp.task("css:view:#{browser}"))
    gulp.watch(paths.watchCss.write, gulp.task("css:write:#{browser}"))
    gulp.watch(paths.html.view, gulp.task("html:view:#{browser}"))
    gulp.watch(paths.html.zombie, gulp.task("html:zombie.html:#{browser}"))
    gulp.watch(paths.html.write, gulp.task("html:write:#{browser}"))
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
