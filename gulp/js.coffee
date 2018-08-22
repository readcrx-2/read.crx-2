path = require "path"
gulp = require "gulp"
{gulp: $, rollup: _} = require "./plugins"
{browsers, paths, defaultOptions} = require "./config"
util = require "./util"

###
  rollup
###
makeInOut = (browser, {output, pathname, plugins, outObj = {} }) ->
  cache = null

  i = Object.assign({}, defaultOptions.rollup.in)
  i.input = paths.js[pathname]
  i.cache = cache
  i.plugins = [plugins...] if plugins?

  o = Object.assign({}, defaultOptions.rollup.out, outObj)
  o.file = "#{paths.output[browser]}/#{output}"
  return {input: i, output: o}
exports.makeInOut = makeInOut

makeFunc = (browser, args) ->
  filename = path.basename(args.output)
  {input: i, output: o} = makeInOut(browser, args)
  func = ->
    try
      bundle = await _.rollup.rollup(i)
      await bundle.write(o)
    catch e
      util.outputError(filename)(e)
    return
  func.displayName = "js:#{filename}:#{browser}"
  return func

rollupIOConfigs =
  app: {
    pathname: "app"
    output: "app.js"
    plugins: [ _.ts(defaultOptions.rollupTs) ]
    outObj:
      name: "app"
  }
  core: {
    pathname: "core"
    output: "app_core.js"
    outObj:
      name: "app"
      extend: true
  }
  ui: {
    pathname: "ui"
    output: "ui.js"
    outObj:
      name: "UI"
  }
  submitRes: {
    pathname: "submitRes"
    output: "write/submit_res.js"
  }
  submitThread: {
    pathname: "submitThread"
    output: "write/submit_thread.js"
  }
exports.rollupIOConfigs = rollupIOConfigs

app = (browser) ->
  return makeFunc(browser, rollupIOConfigs.app)
core = (browser) ->
  return makeFunc(browser, rollupIOConfigs.core)
ui = (browser) ->
  return makeFunc(browser, rollupIOConfigs.ui)
submitRes = (browser) ->
  return makeFunc(browser, rollupIOConfigs.submitRes)
submitThread = (browser) ->
  return makeFunc(browser, rollupIOConfigs.submitThread)

###
  tasks
###
background = (browser) ->
  output = paths.output[browser]
  return ->
    return $.merge(
      gulp.src paths.lib.webExtPolyfill
    ,
      gulp.src paths.js.background
        .pipe($.plumber(defaultOptions.plumber))
        .pipe($.changed(output, extension: ".js"))
        .pipe($.coffee(defaultOptions.coffee))
    ).pipe($.concat("background.js"))
    .pipe(gulp.dest(output))

csAddlink = (browser) ->
  output = paths.output[browser]
  return ->
    return gulp.src paths.js.csAddlink
      .pipe($.plumber(defaultOptions.plumber))
      .pipe($.changed(output, extension: ".js"))
      .pipe($.coffee(defaultOptions.coffee))
      .pipe(gulp.dest(output))

view = (browser) ->
  output = paths.output[browser]+"/view"
  return ->
    return gulp.src paths.js.view
      .pipe($.plumber(defaultOptions.plumber))
      .pipe($.changed(output, extension: ".js"))
      .pipe($.coffee(defaultOptions.coffee))
      .pipe(gulp.dest(output))

zombie = (browser) ->
  output = paths.output[browser]
  return ->
    return gulp.src paths.js.zombie
      .pipe($.plumber(defaultOptions.plumber))
      .pipe($.changed(output, extension: ".js"))
      .pipe($.coffee(defaultOptions.coffee))
      .pipe(gulp.dest(output))

csWrite = (browser) ->
  output = paths.output[browser]+"/write"
  return ->
    return gulp.src paths.js.csWrite
      .pipe($.plumber(defaultOptions.plumber))
      .pipe($.changed(output, extension: ".js"))
      .pipe($.coffee(defaultOptions.coffee))
      .pipe(gulp.dest(output))

###
  gulp task
###
for browser in browsers
  gulp.task "js:background.js:#{browser}", background(browser)
  gulp.task "js:cs_addlink.js:#{browser}", csAddlink(browser)
  gulp.task "js:view:#{browser}", view(browser)
  gulp.task "js:zombie.js:#{browser}", zombie(browser)
  gulp.task "js:cs_write.js:#{browser}", csWrite(browser)

  gulp.task "js:#{browser}", gulp.parallel(
    app(browser)
    core(browser)
    ui(browser)
    submitRes(browser)
    submitThread(browser)
    "js:background.js:#{browser}"
    "js:cs_addlink.js:#{browser}"
    "js:view:#{browser}"
    "js:zombie.js:#{browser}"
    "js:cs_write.js:#{browser}"
  )

gulp.task "js", gulp.task("js:chrome")
