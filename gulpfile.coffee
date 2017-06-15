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
sharp = require "sharp"
toIco = require "to-ico"
crx = require "crx"
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
  backgroundCoffeePath: "./src/background.coffee"
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
  writePath:
    cs:
      coffee: "./src/write/cs_write.coffee"
    write:
      ts: "./src/core/URL.ts"
      coffee: [
        "./src/core/Ninja.coffee"
        "./src/core/WriteHistory.coffee"
        "./src/ui/Animate.coffee"
        "./src/write/write.coffee"
      ]
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
    strictNullChecks: true
    noImplicitThis: true
  sassOptions:
    outputStyle: "compressed"
  pugOptions:
    pug: pugCompiler
    locals: manifest
imgs = [
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
    "clean"
    "default"
    "scan"
    "crx"
    cb
  )

gulp.task "watch", ["default"], ->
  gulp.watch([args.appTsPath, "./src/global.d.ts"], ["app.js"])
  gulp.watch(args.backgroundCoffeePath, ["background.js"])
  gulp.watch(args.csaddlinkCoffeePath, ["cs_addlink.js"])
  gulp.watch([args.appCoreTsPath, args.appCoreCoffeePath], ["app_core.js"])
  gulp.watch([args.uiTsPath, args.uiCoffeePath], ["ui.js"])
  gulp.watch(args.viewCoffeePath, ["viewjs"])
  gulp.watch(args.zobieCoffeePath, ["zombie.js"])
  gulp.watch(args.writePath.cs.coffee, ["cs_write.js"])
  gulp.watch([args.writePath.write.ts, args.writePath.write.coffee], ["write.js"])
  gulp.watch([args.writePath.submit_thread.ts, args.writePath.submit_thread.coffee], ["submit_thread.js"])
  gulp.watch("./src/**/*.scss", ["css"])
  gulp.watch(args.viewHtmlPath, ["viewhtml"])
  gulp.watch(args.zombieHtmlPath, ["zombie.html"])
  gulp.watch(args.writeHtmlPath, ["writehtml"])
  gulp.watch(args.webpSrcPath, ["img"])
  gulp.watch(args.manifestPath, ["manifest"])
  gulp.watch(args.jQueryPath, ["jQuery"])
  gulp.watch(args.shortQueryPath, ["shortQuery"])
  return

gulp.task "clean", ->
  return Promise.all([
    fs.remove("./debug"),
    fs.remove("./read.crx_2.zip")
  ])

gulp.task "scan", ->
  return exec("freshclam").then( ->
    return exec("clamscan -ir debug")
  )

gulp.task "crx", (cb) ->
  tmpDir = path.join(os.tmpdir(), "debug")
  return fs.copy(args.outputPath, tmpDir).then( ->
    if process.env["read.crx-2-pem-path"]?
      return Promise.resolve(process.env["read.crx-2-pem-path"])
    return putsPromise("秘密鍵のパスを入力して下さい: ")
  ).then( (pemPath) ->
    return fs.readFile(pemPath)
  ).then( (pem) ->
    rcrx = new crx(privateKey: pem)
    return rcrx.load(tmpDir)
  ).then( (rcrx) ->
    return rcrx.pack()
  ).then( (rcrxBuffer) ->
    return fs.writeFile("./read.crx_2.#{manifest.version}.crx", rcrxBuffer)
  ).then( ->
    return fs.remove(tmpDir)
  )

#compile
##js
gulp.task "js", ["app.js", "background.js", "cs_addlink.js", "app_core.js", "ui.js", "viewjs", "zombie.js", "writejs"]

gulp.task "app.js", ->
  return gulp.src args.appTsPath
    .pipe(plumber(errorHandler: notify.onError("Error: <%= error.toString() %>")))
    .pipe(ts(args.tsOptions, ts.reporter.nullReporter()))
    .pipe(gulp.dest(args.outputPath))

gulp.task "background.js", ->
  return gulp.src args.backgroundCoffeePath
    .pipe(plumber(errorHandler: notify.onError("Error: <%= error.toString() %>")))
    .pipe(changed(args.outputPath, extension: ".js"))
    .pipe(coffee(args.coffeeOptions))
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
      .pipe(ts(args.tsOptions, ts.reporter.nullReporter())),
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
      .pipe(ts(args.tsOptions, ts.reporter.nullReporter())),
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
  return gulp.src args.writePath.cs.coffee
    .pipe(plumber(errorHandler: notify.onError("Error: <%= error.toString() %>")))
    .pipe(changed("#{args.outputPath}/write", extension: ".js"))
    .pipe(coffee(args.coffeeOptions))
    .pipe(gulp.dest("#{args.outputPath}/write"))

gulp.task "write.js", ->
  return merge(
    gulp.src args.writePath.write.ts
      .pipe(plumber(errorHandler: notify.onError("Error: <%= error.toString() %>")))
      .pipe(ts(args.tsOptions, ts.reporter.nullReporter())),
    gulp.src args.writePath.write.coffee
      .pipe(plumber(errorHandler: notify.onError("Error: <%= error.toString() %>")))
      .pipe(coffee(args.coffeeOptions))
  ).pipe(sort(sortForExtend))
  .pipe(concat("write.js"))
  .pipe(gulp.dest("#{args.outputPath}/write"))

gulp.task "submit_thread.js", ->
  return merge(
    gulp.src args.writePath.submit_thread.ts
      .pipe(plumber(errorHandler: notify.onError("Error: <%= error.toString() %>")))
      .pipe(ts(args.tsOptions, ts.reporter.nullReporter())),
    gulp.src args.writePath.submit_thread.coffee
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
      do ->
        m = img.match(/^(.+)_(\d+)x(\d+)(?:_([a-fA-F0-9]*))?(?:_r(\-?\d+))?\.(webp|png)$/)
        src = "#{args.webpSrcPath}/#{m[1]}.svg"
        bin = "#{args.webpBinPath}/#{img}"

        promise = fs.readFile(src).then( (data) ->
          buf = new Buffer(data)
          if m[4]?
            str = buf.toString("utf8").replace(/#333/g, "##{m[4]}")
            buf = Buffer.from(str, "utf8")
          sh = sharp(buf)
          if m[5]?
            degrees = parseInt(m[5])
            degrees = 270 if degrees is -90
            sh.rotate(degrees)
          sh.resize(parseInt(m[2]), parseInt(m[3]))
          sh[m[6]]()
          sh.toBuffer()
          return sh.toFile(bin)
        )
        promiseArray.push(promise)
        return
    return Promise.all(promiseArray)
  )

gulp.task "ico", ->
  return fs.mkdirp(args.webpBinPath).then( ->
    return Promise.all([
      sharp(args.icoSrcPath)
        .resize(16, 16)
        .png()
        .toBuffer(),
      sharp(args.icoSrcPath)
        .resize(32, 32)
        .png()
        .toBuffer()
    ]).then( (filebuf) ->
      return toIco(filebuf)
    ).then( (buf) ->
      return fs.writeFile(args.icoBinPath, buf)
    )
  )

gulp.task "logo128", ->
  return fs.mkdirp(args.webpBinPath).then( ->
    return sharp(null,
      create:
        width: 128
        height: 128
        channels: 4
        background: { r: 0, g: 0, b: 0, alpha: 0}
    ).overlayWith(args.logo128SrcPath,
      top: 16
      left: 16
    ).toFile(args.logo128BinPath)
  )

gulp.task "loading.webp", ->
  return fs.mkdirp(args.webpBinPath).then( ->
    return sharp(args.loadingSrcPath)
      .resize(100, 100)
      .toFile(args.loadingBinPath)
  )

##manifest
gulp.task "manifest", ->
  return gulp.src args.manifestPath
    .pipe(changed(args.outputPath))
    .pipe(gulp.dest(args.outputPath))

##lib
gulp.task "lib", ["shortQuery"]

gulp.task "shortQuery", ->
  return gulp.src args.shortQueryPath
    .pipe(rename("shortQuery.min.js"))
    .pipe(changed("#{args.outputPath}/lib", transformPath: (p) -> return path.join(path.dirname(p), "shortQuery.min.js")))
    .pipe(gulp.dest("#{args.outputPath}/lib"))
