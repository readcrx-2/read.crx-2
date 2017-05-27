gulp = require "gulp"
readline = require "readline"
os = require "os"
path = require "path"
fs = require "fs-extra"
runSequence = require "run-sequence"
merge = require "merge2"
notify = require "gulp-notify"
plumber = require "gulp-plumber"
changed = require "gulp-changed"
sort = require "gulp-sort"
concat = require "gulp-concat"
rename = require "gulp-rename"

coffee = require "gulp-coffee"
ts = require "gulp-typescript"
sass = require "gulp-sass"
pug = require "gulp-pug"
execSync = require("child_process").exec

manifest = require "./src/manifest.json"

coffeeCompiler = require "coffee-script"
tsCompiler = require "typescript"
sassCompiler = require "node-sass"
pugCompiler = require "pug"

# -------
args =
  outputPath: "./debug"
  manifestPath: "./src/manifest.json"
  appTsPath: "./src/app.ts"
  csaddlinkCoffeePath: "./src/cs_addlink.coffee"
  appCoreCoffeePath: "./src/core/*.coffee"
  appCoreTsPath: "./src/core/*.ts"
  uiCoffeePath: "./src/ui/*.coffee"
  uiTsPath: "./src/ui/*.ts"
  uiCssPath: "./src/ui/ui.scss"
  viewCoffeePath: "./src/view/*.coffee"
  viewCssPath: "./src/view/*.scss"
  viewHtmlPath: "./src/view/*.pug"
  zombieCoffeePath: "./src/zombie.coffee"
  zombieHtmlPath: "./src/zombie.pug"
  writeCoffeePath:
    cs:
      ts: "./src/core/URL.ts"
      coffee: [
        "./src/core/Ninja.coffee"
        "./src/core/WriteHistory.coffee"
        "./src/ui/Animate.coffee"
        "./src/write/write.coffee"
      ]
    write:
      ts: [
        "./src/app.ts"
        "./src/core/URL.ts"
      ]
      coffee: "./src/write/cs_write.coffee"
    submit_thread:
      ts: "./src/core/URL.ts"
      coffee:[
        "./src/core/Ninja.coffee"
        "./src/ui/Animate.coffee"
        "./src/write/submit_thread.coffee"
      ]
  writeCssPath: "./src/write/*.scss"
  writeHtmlPath: "./src/write/*.pug"
  webpSrcPath: "./src/image/svg"
  webpBinPath: "./debug/img"
  icoSrcPath: "./src/image/svg/read.crx.svg"
  icoBinPath: "./debug/img/favicon.ico"
  logo128SrcPath: "./src/image/svg/read.crx.svg"
  logo128BinPath: "./debug/img/read.crx_128x128.png"
  loadingSrcPath: "./src/image/svg/loading.svg"
  loadingBinPath: "./debug/img/loading.webp"
  jQueryPath: ["./node_modules/jquery/dist/jquery.slim.min.js", "./node_modules/ShortQuery.js/bin/shortQuery.chrome.min.js"]
  shortQueryPath: "./node_modules/ShortQuery.js/bin/shortQuery.chrome.min.js"
  coffeeOptions:
    coffee: coffeeCompiler
    bare: true
  tsOptions:
    typescript: tsCompiler
    target: "es2015"
    lib: ["dom", "es2015", "es2016"]
    skipLibCheck: true
    noUnusedLocals: true
    alwaysStrict: true
  sassOptions:
    outputStyle: "compressed"
  pugOptions:
    pug: pugCompiler
    locals: manifest
imgs = [
  "read.crx_48x48.png"
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
]
# -------
sass.compiler = sassCompiler
sortForExtend =
  comparator: (file1, file2) ->
    return file1.path.split(".").length - file2.path.split(".").length
exec = (command) ->
  return new Promise( (resolve, reject) ->
    execSync(command, (err, stdout, stderr) ->
      if err
        console.error stderr
        reject(err)
      else
        console.log stdout if stdout isnt ""
        resolve()
      return
    )
    return
  )
execWithLine = (command) ->
  return new Promise( (resolve, reject) ->
    CP = execSync(command, (err, stdout, stderr) ->
      if err then reject(err) else resolve()
      return
    )
    CP.stdout.pipe(process.stdout)
    return
  )
putsPromise = (mes) ->
  return new Promise( (resolve, reject) ->
    console.log(mes)
    reader = readline.createInterface(
      input: process.stdin
      output: process.stdout
      terminal: false
    )
    reader.on("line", (l) ->
      resolve(l)
      reader.close()
      return
    )
    reader.prompt()
    return
  )
#--------

gulp.task "default", ["js", "html", "css", "img", "manifest", "lib"]

gulp.task "pack", (cb) ->
  return runSequence(
    "clean",
    "default",
    "scan",
    "crx"
    cb
  )

gulp.task "watch", ["default"], ->
  gulp.watch("./src/**", ["default"])
  return

gulp.task "clean", ->
  return Promise.all([
    fs.remove("./debug"),
    fs.remove("./read.crx_2.zip")
  ])

gulp.task "scan", ->
  return execWithLine("freshclam").then( ->
    return execWithLine("clamscan -ir debug")
  )

gulp.task "crx", (cb) ->
  tmpDir = os.tmpdir()
  return fs.copy(args.outputPath, path.join(tmpDir, "debug")).then( ->
    if process.env["read.crx-2-pem-path"]?
      return Promise.resolve(process.env["read.crx-2-pem-path"])
    return putsPromise("秘密鍵のパスを入力して下さい: ")
  ).then( (pemPath) ->
    osname = os.type().toLowerCase()
    if osname.includes("darwin")
      command = "\"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome\" --pack-extension=#{tmpDir}/debug --pack-extension-key=#{pemPath}"
    else if osname.includes("linux")
      command = "google-chrome --pack-extension=#{tmpDir}/debug --pack-extension-key=#{pemPath}"
    else
      # Windowsの場合、Chromeの場所を環境変数から取得する(設定必)
      chromePath = process.env["CHROME_LOCATION"]
      command = "#{chromePath} --pack-extension=#{tmpDir}/debug --pack-extension-key=#{pemPath}"
    return exec(command)
  ).then( ->
    return fs.rename(path.join(tmpDir,"debug.crx"), "read.crx_2.#{manifest.version}.crx")
  ).then( ->
    return fs.remove(path.join(tmpDir, "debug"))
  )

#compile
##js
gulp.task "js", ["app.js", "cs_addlink.js", "app_core.js", "ui.js", "viewjs", "zombie.js", "writejs"]

gulp.task "app.js", ->
  return gulp.src args.appTsPath
    .pipe(plumber(errorHandler: notify.onError("Error: <%= error.toString() %>")))
    .pipe(ts(args.tsOptions, ts.reporter.defaultReporter()))
    .pipe(gulp.dest(args.outputPath))

gulp.task "cs_addlink.js", ->
  return gulp.src args.csaddlinkCoffeePath
    .pipe(plumber(errorHandler: notify.onError("Error: <%= error.toString() %>")))
    .pipe(changed(args.outputPath, extension: ".js"))
    .pipe(coffee(args.coffeeOptions))
    .pipe(gulp.dest(args.outputPath))

gulp.task "app_core.js", ->
  return merge(
    gulp.src args.appCoreTsPath
      .pipe(plumber(errorHandler: notify.onError("Error: <%= error.toString() %>")))
      .pipe(ts(args.tsOptions, ts.reporter.defaultReporter())),
    gulp.src args.appCoreCoffeePath
      .pipe(plumber(errorHandler: notify.onError("Error: <%= error.toString() %>")))
      .pipe(coffee(args.coffeeOptions))
  ).pipe(sort(sortForExtend))
  .pipe(concat("app_core.js"))
  .pipe(gulp.dest(args.outputPath))

gulp.task "ui.js", ->
  return merge(
    gulp.src args.uiTsPath
      .pipe(plumber(errorHandler: notify.onError("Error: <%= error.toString() %>")))
      .pipe(ts(args.tsOptions, ts.reporter.defaultReporter())),
    gulp.src args.uiCoffeePath
      .pipe(plumber(errorHandler: notify.onError("Error: <%= error.toString() %>")))
      .pipe(coffee(args.coffeeOptions))
  ).pipe(sort(sortForExtend))
  .pipe(concat("ui.js"))
  .pipe(gulp.dest(args.outputPath))

gulp.task "viewjs", ->
  return gulp.src args.viewCoffeePath
    .pipe(plumber(errorHandler: notify.onError("Error: <%= error.toString() %>")))
    .pipe(changed("#{args.outputPath}/view", extension: ".js"))
    .pipe(coffee(args.coffeeOptions))
    .pipe(gulp.dest("#{args.outputPath}/view"))

gulp.task "zombie.js", ->
  return gulp.src args.zombieCoffeePath
    .pipe(plumber(errorHandler: notify.onError("Error: <%= error.toString() %>")))
    .pipe(changed(args.outputPath, extension: ".js"))
    .pipe(coffee(args.coffeeOptions))
    .pipe(gulp.dest(args.outputPath))

gulp.task "writejs", ["cs_write.js", "write.js", "submit_thread.js"]

gulp.task "cs_write.js", ->
  return merge(
    gulp.src args.writeCoffeePath.cs.ts
      .pipe(plumber(errorHandler: notify.onError("Error: <%= error.toString() %>")))
      .pipe(ts(args.tsOptions, ts.reporter.defaultReporter())),
    gulp.src args.writeCoffeePath.cs.coffee
      .pipe(plumber(errorHandler: notify.onError("Error: <%= error.toString() %>")))
      .pipe(coffee(args.coffeeOptions))
  ).pipe(sort(sortForExtend))
  .pipe(concat("cs_write.js"))
  .pipe(gulp.dest("#{args.outputPath}/write"))

gulp.task "write.js", ->
  return merge(
    gulp.src args.writeCoffeePath.write.ts
      .pipe(plumber(errorHandler: notify.onError("Error: <%= error.toString() %>")))
      .pipe(ts(args.tsOptions, ts.reporter.defaultReporter())),
    gulp.src args.writeCoffeePath.write.coffee
      .pipe(plumber(errorHandler: notify.onError("Error: <%= error.toString() %>")))
      .pipe(coffee(args.coffeeOptions))
  ).pipe(sort(sortForExtend))
  .pipe(concat("write.js"))
  .pipe(gulp.dest("#{args.outputPath}/write"))

gulp.task "submit_thread.js", ->
  return merge(
    gulp.src args.writeCoffeePath.submit_thread.ts
      .pipe(plumber(errorHandler: notify.onError("Error: <%= error.toString() %>")))
      .pipe(ts(args.tsOptions, ts.reporter.defaultReporter())),
    gulp.src args.writeCoffeePath.submit_thread.coffee
      .pipe(plumber(errorHandler: notify.onError("Error: <%= error.toString() %>")))
      .pipe(coffee(args.coffeeOptions))
  ).pipe(sort(sortForExtend))
  .pipe(concat("submit_thread.js"))
  .pipe(gulp.dest("#{args.outputPath}/write"))

##css
gulp.task "css", ["ui.css", "viewcss", "writecss"]

gulp.task "ui.css", ->
  return gulp.src args.uiCssPath
    .pipe(plumber(errorHandler: notify.onError("Error: <%= error.toString() %>")))
    .pipe(sass(args.sassOptions))
    .pipe(gulp.dest(args.outputPath))

gulp.task "viewcss", ->
  return gulp.src args.viewCssPath
    .pipe(plumber(errorHandler: notify.onError("Error: <%= error.toString() %>")))
    .pipe(sass(args.sassOptions))
    .pipe(gulp.dest("#{args.outputPath}/view"))

gulp.task "writecss", ->
  return gulp.src args.writeCssPath
    .pipe(plumber(errorHandler: notify.onError("Error: <%= error.toString() %>")))
    .pipe(sass(args.sassOptions))
    .pipe(gulp.dest("#{args.outputPath}/write"))

##html
gulp.task "html", ["viewhtml", "zombie.html", "writehtml"]

gulp.task "viewhtml", ->
  return gulp.src args.viewHtmlPath
    .pipe(plumber(errorHandler: notify.onError("Error: <%= error.toString() %>")))
    .pipe(changed("#{args.outputPath}/view", extension: ".html"))
    .pipe(pug(args.pugOptions))
    .pipe(gulp.dest("#{args.outputPath}/view"))

gulp.task "zombie.html", ->
  return gulp.src args.zombieHtmlPath
    .pipe(plumber(errorHandler: notify.onError("Error: <%= error.toString() %>")))
    .pipe(changed(args.outputPath, extension: ".html"))
    .pipe(pug(args.pugOptions))
    .pipe(gulp.dest(args.outputPath))

gulp.task "writehtml", ->
  return gulp.src args.writeHtmlPath
    .pipe(plumber(errorHandler: notify.onError("Error: <%= error.toString() %>")))
    .pipe(changed("#{args.outputPath}/write", extension: ".html"))
    .pipe(pug(args.pugOptions))
    .pipe(gulp.dest("#{args.outputPath}/write"))

##img
gulp.task "img", ["webp&png", "ico", "logo128", "loading.webp"]

gulp.task "webp&png", ->
  return fs.mkdirp(args.webpBinPath).then( ->
    promiseArray = []
    for img in imgs
      m = img.match(/^(.+)_(\d+)x(\d+)(?:_([a-fA-F0-9]*))?(?:_r(\-?\d+))?\.(?:webp|png)$/)
      src = "#{args.webpSrcPath}/#{m[1]}.svg"
      bin = "#{args.webpBinPath}/#{img}"
      command = "convert -background transparent"
      command += " -fill ##{m[4]} -opaque #333" if m[4]?
      command += " -rotate #{m[5]}" if m[5]?
      command += " -resize #{m[2]}x#{m[3]} #{src} #{bin}"
      promiseArray.push(exec(command))
    return Promise.all(promiseArray)
  )

gulp.task "ico", ->
  return fs.mkdirp(args.webpBinPath).then( ->
    return exec("convert #{args.icoSrcPath} ( -clone 0 -resize 16x16 \) ( -clone 0 -resize 32x32 \) -delete 0 #{args.icoBinPath}")
  )

gulp.task "logo128", ->
  return fs.mkdirp(args.webpBinPath).then( ->
    return exec("convert -background transparent -resize 96x96 -extent 128x128-16-16 #{args.logo128SrcPath} #{args.logo128BinPath}")
  )

gulp.task "loading.webp", ->
  return fs.mkdirp(args.webpBinPath).then( ->
    return exec("convert -background transparent -resize 100x100 #{args.loadingSrcPath} #{args.loadingBinPath}")
  )

##manifest
gulp.task "manifest", ->
  return gulp.src args.manifestPath
    .pipe(changed(args.outputPath))
    .pipe(gulp.dest(args.outputPath))

##lib
gulp.task "lib", ["jQuery", "shortQuery"]

gulp.task "jQuery", ->
  return gulp.src args.jQueryPath
    .pipe(concat("jshortquery.min.js"))
    .pipe(gulp.dest("#{args.outputPath}/lib"))

gulp.task "shortQuery", ->
  return gulp.src args.shortQueryPath
    .pipe(rename("shortQuery.min.js"))
    .pipe(changed("#{args.outputPath}/lib", transformPath: (p) -> return path.join(path.dirname(p), "shortQuery.min.js")))
    .pipe(gulp.dest("#{args.outputPath}/lib"))
