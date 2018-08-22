fs = require "fs-extra"
{compiler: c, rollup: _} = require "./plugins"
util = require "./util"

browsers = [
  "chrome"
  "firefox"
]

paths = {}
do ->
  i = "./src"
  paths =
    output: {}
    js:
      app: "#{i}/app.ts"
      core: "#{i}/core/core.coffee"
      ui: "#{i}/ui/ui.coffee"
      submitRes: "#{i}/write/submit_res.coffee"
      submitThread: "#{i}/write/submit_thread.coffee"
      background: "#{i}/background.coffee"
      csAddlink: "#{i}/cs_addlink.coffee"
      view: "#{i}/view/*.coffee"
      zombie: "#{i}/zombie.coffee"
      csWrite: "#{i}/write/cs_write.coffee"
    css:
      ui: "#{i}/ui/ui.scss"
      view: "#{i}/view/*.scss"
      write: ["#{i}/write/*.scss", "!#{i}/write/write.scss"]
    watchCss:
      ui: ["#{i}/ui/*.scss", "#{i}/common.scss"]
      view: ["#{i}/view/*.scss", "#{i}/common.scss"]
      write: ["#{i}/write/*.scss", "#{i}/common.scss"]
    html:
      view: "#{i}/view/*.pug"
      zombie: "#{i}/zombie.pug"
      write: "#{i}/write/*.pug"
    img:
      imgsSrc: "#{i}/image/svg"
      imgs: [
        "read.crx_48x48.png"
        "read.crx_38x38.png"
        "read.crx_19x19.png"
        "read.crx_16x16.png"
        "close_16x16.webp"
        "dummy_1x1.webp"
        "lock_12x12_3a5.webp"

        "arrow_19x19_333_r90.webp"
        "arrow_19x19_333_r-90.webp"
        "search2_19x19_777.webp"
        "star_19x19_333.webp"
        "star_19x19_007fff.webp"
        "reload_19x19_333.webp"
        "pencil_19x19_333.webp"
        "menu_19x19_333.webp"
        "lock_19x19_182.webp"
        "unlock_19x19_333.webp"
        "pause_19x19_333.webp"
        "pause_19x19_811.webp"
        "regexp_19x19_333.webp"
        "regexp_19x19_06e.webp"

        "arrow_19x19_ddd_r90.webp"
        "arrow_19x19_ddd_r-90.webp"
        "search2_19x19_aaa.webp"
        "star_19x19_ddd.webp"
        "star_19x19_f93.webp"
        "reload_19x19_ddd.webp"
        "pencil_19x19_ddd.webp"
        "menu_19x19_ddd.webp"
        "lock_19x19_3a5.webp"
        "unlock_19x19_ddd.webp"
        "pause_19x19_ddd.webp"
        "pause_19x19_a33.webp"
        "regexp_19x19_ddd.webp"
        "regexp_19x19_f93.webp"
      ]
      icon: "#{i}/image/svg/read.crx.svg"
      logo128: "#{i}/image/svg/read.crx.svg"
      loading: "#{i}/image/svg/loading.svg"
    lib:
      shortQuery: "./node_modules/ShortQuery.js/bin/shortQuery.chrome.min.js"
      webExtPolyfill: "./node_modules/webextension-polyfill/dist/browser-polyfill.min.js"
    manifest: "#{i}/manifest.json"
  return

for browser in browsers
  paths.output[browser] = "./debug-#{browser}"

manifestJson = fs.readJsonSync(paths.manifest)

defaultOptions =
  plumber:
    errorHandler: util.plumberHandler
  rollupTs:
    tsconfigDefaults:
      compilerOptions:
        typescript: c.ts
        target: "es2017"
        lib: [
          "dom"
          "es2015"
          "es2016"
          "es2017"
        ]
        skipLibCheck: true
        noUnusedLocals: true
        alwaysStrict: true
        strictNullChecks: true
        noImplicitThis: true
  coffee:
    coffee: c.coffee
    bare: true
  sass:
    outputStyle: "compressed"
  pug:
    pug: c.pug
    locals: manifestJson
  sharp:
    webp:
      lossless: true

defaultOptions.rollup =
  in:
    plugins: [
      _.coffee(defaultOptions.coffee)
      _.ts(defaultOptions.rollupTs)
    ]
    context: "window"
    onwarn: util.rollupOnWarn
  out:
    format: "iife"

module.exports = {browsers, paths, defaultOptions, manifest: manifestJson}
