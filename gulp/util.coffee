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

exports.rollupOnWarn = (warning, warn) ->
  return if warning.code is "CIRCULAR_DEPENDENCY"
  warn(warning)
  return

exports.plumberHandler = $.notify.onError("Error: <%= error.toString() %>")


###
  rollup handlers
###
_space = " ".repeat("[hh:mm:ss][Rollup.js] ".length)
GRAY = "\u001b[90m"
CYAN = "\u001b[36m"
RED = "\u001b[31m"
RESET = "\u001b[0m"
toTwoDigit = (str) ->
  return if (""+str).length is 1 then "0"+str else str
getTimeString = ->
  date = new Date()
  return "#{toTwoDigit(date.getHours())}:#{toTwoDigit(date.getMinutes())}:#{toTwoDigit(date.getSeconds())}"
exports.outputError = (filename, type = "Error") ->
  return (e) ->
    prefix = "[#{GRAY}#{getTimeString()}#{RESET}][#{GRAY}Rollup.js#{RESET}] "
    mes = prefix + "#{RED}#{type}(#{e.code})#{RESET} '#{CYAN}#{filename}#{RESET}': #{e.message}"
    mes += "\n" + _space + "#{e.loc.file} L#{e.loc.line}:#{e.loc.column}" if e.loc?
    mes += "\n" + _space + e.frame.replace(/\n/g, "\n"+_space) if e.frame?
    console.error(mes)
    return
exports.rollupOnWatch = (filename) ->
  return (e) ->
    prefix = "[#{GRAY}#{getTimeString()}#{RESET}][#{GRAY}Rollup.js#{RESET}] "
    switch e.code
      when "START", "END" then return
      when "BUNDLE_START" then console.log(prefix + "Starting '#{CYAN}#{filename}#{RESET}'")
      when "BUNDLE_END" then console.log(prefix + "Finished '#{CYAN}#{filename}#{RESET}' in #{e.duration}ms")
      when "FATAL" then outputError(filename, "FatalError")(e.error)
      when "ERROR" then outputError(filename)(e.error)
    return
