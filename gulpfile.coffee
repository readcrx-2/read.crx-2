gulp = require "gulp"
dir = require "require-dir"
{browsers} = require "./gulp/config"

dir("./gulp")

for browser in browsers
  gulp.task "build:#{browser}", gulp.parallel(
    "js:#{browser}"
    "css:#{browser}"
    "html:#{browser}"
    "img:#{browser}"
    "manifest:#{browser}"
    "lib:#{browser}"
  )
  gulp.task "pack:#{browser}", gulp.series(
    "clean"
    "build:#{browser}"
    "scan:#{browser}"
    "pack-in:#{browser}"
  )
  gulp.task "watch:#{browser}", gulp.series(
    "build:#{browser}"
    "watch-in:#{browser}"
  )
gulp.task "build", gulp.task("build:chrome")
gulp.task "pack", gulp.task("pack:chrome")
gulp.task "watch", gulp.task("watch:chrome")

gulp.task "default", gulp.task("build")

gulp.task "build:all", gulp.parallel("build:chrome", "build:firefox")
gulp.task "pack:all", gulp.parallel("pack:chrome", "pack:firefox")
