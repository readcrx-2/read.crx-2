fs = require "fs-extra"
path = require "path"
spawn = require("child_process").spawn
readline = require "readline"
{gulp: $} = require "./plugins"

###
  compile
###
exports.exec = (command, args, shell = false) ->
  return new Promise( (resolve, reject) ->
    cp = spawn(command, args, {stdio: "inherit", shell})
    cp.on("close", ->
      resolve()
      return
    )
    return
  )
exports.puts = (mes) ->
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

###
  util
###
exports.getExt = (browser) ->
  if browser is "chrome"
    return "webp"
  return"png"

exports.isSrcNewer = (src, bin) ->
  srcTime = fs.statSync(src).mtimeMs
  try
    binTime = fs.statSync(bin).mtimeMs
  catch e
    # 出力先にファイルが存在しないとき
    return true if e.code is "ENOENT"
  return (srcTime > binTime)

###
  console
###
GRAY = "\u001b[90m"
CYAN = "\u001b[36m"
RED = "\u001b[31m"
RESET = "\u001b[0m"
toTwoDigit = (str) ->
  return if (""+str).length is 1 then "0"+str else str
getTimeString = ->
  date = new Date()
  return "#{toTwoDigit(date.getHours())}:#{toTwoDigit(date.getMinutes())}:#{toTwoDigit(date.getSeconds())}"

exports.rollupOnWarn = (warning, warn) ->
  return if warning.code is "CIRCULAR_DEPENDENCY"
  warn(warning)
  return

_spaceR = " ".repeat("[hh:mm:ss][Rollup.js] ".length)
onRollupError = (filename, type = "Error") ->
  return (e) ->
    prefix = "[#{GRAY}#{getTimeString()}#{RESET}][#{GRAY}Rollup.js#{RESET}] "
    mes = prefix + "#{RED}#{type}(#{e.code})#{RESET} '#{CYAN}#{filename}#{RESET}': #{e.message}"
    mes += "\n" + _spaceR + "#{e.loc.file} L#{e.loc.line}:#{e.loc.column}" if e.loc?
    if e.location?
      file = path.relative(process.cwd(), e.id)
      mes += "\n" + _spaceR + "#{file} L#{e.location.first_line+1}:#{e.location.first_column+1}-#{e.location.last_column+1}" if e.location?
    mes += "\n" + _spaceR + e.frame.replace(/\n/g, "\n"+_spaceR) if e.frame?
    console.error(mes)
    return
exports.onRollupError = onRollupError
exports.onRollupWatch = (filename) ->
  return (e) ->
    prefix = "[#{GRAY}#{getTimeString()}#{RESET}][#{GRAY}Rollup.js#{RESET}] "
    switch e.code
      when "START", "END" then return
      when "BUNDLE_START" then console.log(prefix + "Starting '#{CYAN}#{filename}#{RESET}'")
      when "BUNDLE_END" then console.log(prefix + "Finished '#{CYAN}#{filename}#{RESET}' in #{e.duration}ms")
      when "FATAL" then onRollupError(filename, "FatalError")(e.error)
      when "ERROR" then onRollupError(filename)(e.error)
    return

_spaceP = " ".repeat("[hh:mm:ss][pug] ".length)
exports.onPugError = $.notify.onError( (e) ->
  prefix = "[#{GRAY}#{getTimeString()}#{RESET}][#{GRAY}pug#{RESET}] "
  if e.code?
    mes = prefix + "#{RED}Error(#{e.code})#{RESET} '#{CYAN}#{e.plugin}#{RESET}':"
    mes += "\n" + _spaceP + e.message.replace(/\n/g, "\n"+_spaceP)
  else
    mes = prefix + "#{RED}Error(#{e.name})#{RESET} '#{CYAN}#{e.plugin}#{RESET}': #{e.message}"
    mes += "\n" + _spaceP + e.stack.replace(/\n/g, "\n"+_spaceP) if e.stack?
  console.error(mes)
  return {
    title: "Error pug #{e.code ? e.name}"
    message: e.message ? e.stack
  }
)

_spaceS = " ".repeat("[hh:mm:ss][sass] ".length)
exports.onScssError = $.notify.onError( (e) ->
  prefix = "[#{GRAY}#{getTimeString()}#{RESET}][#{GRAY}sass#{RESET}] "
  mes = prefix + "#{RED}Error#{RESET} '#{CYAN}#{e.plugin}#{RESET}': #{e.relativePath} L#{e.line}:#{e.column}"
  mes += "\n" + _spaceS + e.messageFormatted.replace(/\n/g, "\n"+_spaceS)
  console.error(mes)
  return {
    title: "Error sass #{e.relativePath} L#{e.line}:#{e.column}"
    message: e.message
  }
)
