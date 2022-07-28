// TODO: This file was created by bulk-decaffeinate.
// Sanity-check the conversion and remove this comment.
/*
 * decaffeinate suggestions:
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
const gulp = require("gulp");
const fs = require("fs-extra");
const {other: o} = require("./plugins");
const {browsers, paths, defaultOptions} = require("./config");
const util = require("./util");

/*
  tasks
*/
const imgs = function(browser) {
  const output = paths.output[browser]+"/img";
  const isChrome = (browser === "chrome");
  const func = async function() {
    await fs.ensureDir(output);
    await Promise.all(paths.img.imgs.map( async function(img) {
      if (!isChrome) { img = img.replace(".webp", ".png"); }
      const m = img.match(/^(.+)_(\d+)x(\d+)(?:_([a-fA-F0-9]*))?(?:_r(\-?\d+))?\.(webp|png)$/);
      const src = `${paths.img.imgsSrc}/${m[1]}.svg`;
      const bin = `${output}/${img}`;
      if (!util.isSrcNewer(src, bin)) { return; }

      let data = await fs.readFile(src, "utf-8");
      // 塗りつぶし
      if (m[4] != null) {
        data = data.replace(/#333/g, `#${m[4]}`);
      }
      const buf = Buffer.from(data, "utf8");
      const sh = o.sharp(buf);
      // 回転
      if (m[5] != null) {
        sh.rotate(parseInt(m[5]));
      }
      sh.resize(parseInt(m[2]), parseInt(m[3]));
      if (m[6] === "webp") {
        sh.webp(defaultOptions.sharp.webp);
      }
      await sh.toFile(bin);
    }));
  };
  func.displayName = `img:imgs:${browser}`;
  return func;
};

const logoBig = function(browser, size) {
  const output = paths.output[browser]+"/img";
  const src = paths.img.logoBig;
  const bin = `${output}/read.crx_${size}x${size}.png`;
  const margin = size/8;
  const firstSize = size - (margin*2);
  const func = async function() {
    if (!util.isSrcNewer(src, bin)) { return; }
    await fs.ensureDir(output);
    await o.sharp(src)
      .resize(firstSize, firstSize)
      .extend({
        top: margin,
        bottom: margin,
        left: margin,
        right: margin,
        background: {
          r: 0,
          g: 0,
          b: 0,
          alpha: 0
        }
      }).toFile(bin);
  };
  func.displayName = `img:logo${size}:${browser}`;
  return func;
};

const loading = function(browser) {
  let bin, func;
  const output = paths.output[browser]+"/img";
  const src = paths.img.loading;
  if (browser === "chrome") {
    bin = `${output}/loading.webp`;
    func = async function() {
      if (!util.isSrcNewer(src, bin)) { return; }
      await fs.ensureDir(output);
      await o.sharp(src)
        .resize(100, 100)
        .webp(defaultOptions.sharp.webp)
        .toFile(bin);
    };
  } else {
    bin = `${output}/loading.png`;
    func = async function() {
      if (!util.isSrcNewer(src, bin)) { return; }
      await fs.ensureDir(output);
      await o.sharp(src)
        .resize(100, 100)
        .toFile(bin);
    };
  }
  func.displayName = `img:loading:${browser}`;
  return func;
};

/*
  gulp task
*/
for (let browser of browsers) {
  gulp.task(`img:${browser}`, gulp.parallel(
    imgs(browser),
    logoBig(browser, 96),
    logoBig(browser, 128),
    loading(browser)
  )
  );
}

gulp.task("img", gulp.task("img:chrome"));
