gulp = require "gulp"
fs = require "fs-extra"
os = require "os"
path = require "path"
{other: o} = require "./plugins"
{browsers, paths, manifest} = require "./config"
util = require "./util"

createCrx = (tmpDir, pemPath) ->
  pem = await fs.readFile(pemPath)
  rcrx = new o.crx(privateKey: pem)
  loadedCrx = await rcrx.load(tmpDir)
  rcrxBuffer = await loadedCrx.pack()
  await fs.outputFile("./build/read.crx_2.#{manifest.version}.crx", rcrxBuffer)
  return

createCrx3 = (tmpDir, pemPath) ->
  await o.crx3(
    [tmpDir],
    {
      keyPath: pemPath,
      crxPath: "./build/read.crx_2.#{manifest.version}.crx",
    }
  )
  return

createXpi = (tmpDir, apicrePath) ->
  apicre = await fs.readJson(apicrePath)
  await o.webExt.cmd.sign(
    sourceDir: tmpDir
    artifactsDir: process.cwd()+"/build"
    apiKey: apicre.issuer
    apiSecret: apicre.secret
  )
  return

###
  tasks
###
scan = (browser) ->
  output = path.normalize(paths.output[browser])
  return ->
    await util.exec("freshclam", [])
    await util.exec("clamscan", ["-ir", output])
    return

pack = (browser) ->
  output = paths.output[browser]
  tmpDir = path.join(os.tmpdir(), "debug-#{browser}")
  switch browser
    when "chrome"
      type = "crx"
      createFunc = createCrx3
      secretEnv = "read.crx-2-pem-path"
    when "firefox"
      type = "xpi"
      createFunc = createXpi
      secretEnv = "read.crx-2-apicre-path"
    else
      type = "crx"
      createFunc = createCrx
      secretEnv = "read.crx-2-pem-path"
  return ->
    await fs.copy(output, tmpDir)
    secretPath = process.env[secretEnv] ? await util.puts("秘密鍵のパスを入力して下さい: ")
    await createFunc(tmpDir, secretPath)
    await fs.remove(tmpDir)
    return

###
  gulp task
###
for browser in browsers
  gulp.task "scan:#{browser}", scan(browser)
  gulp.task "pack-in:#{browser}", pack(browser)

gulp.task "scan", gulp.task("scan:chrome")
gulp.task "pack-in", gulp.task("pack-in:chrome")
