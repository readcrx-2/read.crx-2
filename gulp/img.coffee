gulp = require "gulp"
fs = require "fs-extra"
{other: o} = require "./plugins"
{browsers, paths, defaultOptions} = require "./config"
util = require "./util"

###
  tasks
###
imgs = (browser) ->
  output = paths.output[browser]+"/img"
  isChrome = (browser is "chrome")
  func = ->
    await fs.ensureDir(output)
    await Promise.all(paths.img.imgs.map( (img) ->
      img = img.replace(".webp", ".png") unless isChrome
      m = img.match(/^(.+)_(\d+)x(\d+)(?:_([a-fA-F0-9]*))?(?:_r(\-?\d+))?\.(webp|png)$/)
      src = "#{paths.img.imgsSrc}/#{m[1]}.svg"
      bin = "#{output}/#{img}"
      return unless util.isSrcNewer(src, bin)

      data = await fs.readFile(src, "utf-8")
      # 塗りつぶし
      if m[4]?
        data = data.replace(/#333/g, "##{m[4]}")
      buf = Buffer.from(data, "utf8")
      sh = o.sharp(buf)
      # 回転
      if m[5]?
        sh.rotate(parseInt(m[5]))
      sh.resize(parseInt(m[2]), parseInt(m[3]))
      if m[6] is "webp"
        sh.webp(defaultOptions.sharp.webp)
      await sh.toFile(bin)
      return
    ))
    return
  func.displayName = "img:imgs:#{browser}"
  return func

ico = (browser) ->
  output = paths.output[browser]+"/img"
  src = paths.img.icon
  bin = "#{output}/favicon.ico"
  func = ->
    return unless util.isSrcNewer(src, bin)
    filebuf = await Promise.all([
      o.sharp(src)
        .resize(16, 16)
        .png()
        .toBuffer()
      o.sharp(src)
        .resize(32, 32)
        .png()
        .toBuffer()
    ])
    buf = await o.toIco(filebuf)
    await fs.outputFile(bin, buf)
    return
  func.displayName = "img:ico:#{browser}"
  return func

logo128 = (browser) ->
  output = paths.output[browser]+"/img"
  src = paths.img.logo128
  bin = "#{output}/read.crx_128x128.png"
  func = ->
    return unless util.isSrcNewer(src, bin)
    await fs.ensureDir(output)
    await o.sharp(null,
      create:
        width: 128
        height: 128
        channels: 4
        background: { r: 0, g: 0, b: 0, alpha: 0}
    ).overlayWith(src,
      top: 16
      left: 16
    ).toFile(bin)
    return
  func.displayName = "img:logo128:#{browser}"
  return func

loading = (browser) ->
  output = paths.output[browser]+"/img"
  src = paths.img.loading
  if browser is "chrome"
    bin = "#{output}/loading.webp"
    func = ->
      return unless util.isSrcNewer(src, bin)
      await fs.ensureDir(output)
      await o.sharp(src)
        .resize(100, 100)
        .webp(defaultOptions.sharp.webp)
        .toFile(bin)
      return
  else
    bin = "#{output}/loading.png"
    func = ->
      return unless util.isSrcNewer(src, bin)
      await fs.ensureDir(output)
      await o.sharp(src)
        .resize(100, 100)
        .toFile(bin)
      return
  func.displayName = "img:loading:#{browser}"
  return func

###
  gulp task
###
for browser in browsers
  gulp.task "img:#{browser}", gulp.parallel(
    imgs(browser)
    ico(browser)
    logo128(browser)
    loading(browser)
  )

gulp.task "img", gulp.task("img:chrome")
