sassCompiler = require "node-sass"
sass = require "gulp-sass"
sass.compiler = sassCompiler

module.exports =
  compiler:
    ts: require "typescript"
    coffee: require "coffeescript"
    sass: sassCompiler
    pug: require "pug"
  gulp:
    gulp: require "gulp"
    plumber: require "gulp-plumber"
    changed: require "gulp-changed"
    concat: require "gulp-concat"
    notify: require "gulp-notify"
    merge: require "merge2"
    rename: require "gulp-rename"
    coffee: require "gulp-coffee"
    replace: require "gulp-replace"
    sass: sass
    postcss: require "gulp-postcss"
    pug: require "gulp-pug"
  rollup:
    rollup: require "rollup"
    ts: require "rollup-plugin-typescript2"
    coffee: require "rollup-plugin-coffee-script"
    replace: require "rollup-plugin-replace"
  postcss:
    autoprefixer: require "autoprefixer"
  other:
    sharp: require "sharp"
    toIco: require "to-ico"
    crx: require "crx"
    webExt: require("web-ext").default
