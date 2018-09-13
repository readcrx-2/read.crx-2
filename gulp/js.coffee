path = require "path"
gulp = require "gulp"
{gulp: $, rollup: _} = require "./plugins"
{browsers, paths, defaultOptions} = require "./config"
util = require "./util"

getReplaceMap = (browser) ->
  return {
    "BROWSER": browser
    "IMG_EXT": if browser is "chrome" then "webp" else "png"
  }

###
  rollup
###
cache = {}

makeInOut = (browser, {output, pathname, plugins, outObj = {} }) ->
  i = Object.assign({}, defaultOptions.rollup.in)
  i.input = paths.js[pathname]
  cache[pathname] = null
  i.cache = cache[pathname]
  i.plugins = plugins.concat(i.plugins) if plugins?

  o = Object.assign({}, defaultOptions.rollup.out, outObj)
  o.file = "#{paths.output[browser]}/#{output}"
  return {input: i, output: o}
exports.makeInOut = makeInOut

getRollupIOConfigs = (name, browser) ->
  replace = _.replace(
    delimiters: ["&[", "]"]
    values: getReplaceMap(browser)
  )
  switch name
    when "app"
      return {
        pathname: "app"
        output: "app.js"
        plugins: [replace]
        outObj:
          name: "app"
      }
    when "core"
      return {
        pathname: "core"
        output: "app_core.js"
        plugins: [replace]
        outObj:
          name: "app"
          extend: true
      }
    when "ui"
      return {
        pathname: "ui"
        output: "ui.js"
        plugins: [replace]
        outObj:
          name: "UI"
      }
    when "submitRes"
      return {
        pathname: "submitRes"
        output: "write/submit_res.js"
        plugins: [replace]
      }
    when "submitThread"
      return {
        pathname: "submitThread"
        output: "write/submit_thread.js"
        plugins: [replace]
      }
  throw new Error("Error: rollupIOConfig Not Found '#{name}'")
  return
exports.getRollupIOConfigs = getRollupIOConfigs

makeFunc = (browser, configName) ->
  args = getRollupIOConfigs(configName, browser)
  filename = path.basename(args.output)
  {input: i, output: o} = makeInOut(browser, args)
  func = ->
    try
      bundle = await _.rollup.rollup(i)
      cache[args.pathname] = bundle
      await bundle.write(o)
    catch e
      util.onRollupError(filename)(e)
    return
  func.displayName = "js:#{filename}:#{browser}"
  return func

app = (browser) ->
  return makeFunc(browser, "app")
core = (browser) ->
  return makeFunc(browser, "core")
ui = (browser) ->
  return makeFunc(browser, "ui")
submitRes = (browser) ->
  return makeFunc(browser, "submitRes")
submitThread = (browser) ->
  return makeFunc(browser, "submitThread")

###
  tasks
###
rr = /&\[(\w+)\]/g
makeReplaceOptions = (browser) ->
  rm = getReplaceMap(browser)
  return (m, p1) ->
    return rm[p1]

background = (browser) ->
  output = paths.output[browser]
  ro = makeReplaceOptions(browser)
  return ->
    return $.merge(
      gulp.src paths.lib.webExtPolyfill
    ,
      gulp.src paths.js.background
        .pipe($.plumber(util.onCoffeeError))
        .pipe($.replace(rr, ro))
        .pipe($.coffee(defaultOptions.coffee))
    ).pipe($.concat("background.js"))
    .pipe(gulp.dest(output))

csAddlink = (browser) ->
  output = paths.output[browser]
  ro = makeReplaceOptions(browser)
  return ->
    return gulp.src paths.js.csAddlink
      .pipe($.plumber(util.onCoffeeError))
      .pipe($.changed(output, extension: ".js"))
      .pipe($.replace(rr, ro))
      .pipe($.coffee(defaultOptions.coffee))
      .pipe(gulp.dest(output))

view = (browser) ->
  output = paths.output[browser]+"/view"
  ro = makeReplaceOptions(browser)
  return ->
    return gulp.src paths.js.view
      .pipe($.plumber(util.onCoffeeError))
      .pipe($.changed(output, extension: ".js"))
      .pipe($.replace(rr, ro))
      .pipe($.coffee(defaultOptions.coffee))
      .pipe(gulp.dest(output))

zombie = (browser) ->
  output = paths.output[browser]
  ro = makeReplaceOptions(browser)
  return ->
    return gulp.src paths.js.zombie
      .pipe($.plumber(util.onCoffeeError))
      .pipe($.changed(output, extension: ".js"))
      .pipe($.replace(rr, ro))
      .pipe($.coffee(defaultOptions.coffee))
      .pipe(gulp.dest(output))

csWrite = (browser) ->
  output = paths.output[browser]+"/write"
  ro = makeReplaceOptions(browser)
  return ->
    return gulp.src paths.js.csWrite
      .pipe($.plumber(util.onCoffeeError))
      .pipe($.changed(output, extension: ".js"))
      .pipe($.replace(rr, ro))
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
