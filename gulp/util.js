const fs = require("fs-extra");
const path = require("path");
const { spawn } = require("child_process");
const readline = require("readline");
const { gulp: $ } = require("./plugins");

/*
  compile
*/
exports.exec = function (command, args, shell) {
  if (shell == null) {
    shell = false;
  }
  return new Promise(function (resolve, reject) {
    const cp = spawn(command, args, { stdio: "inherit", shell });
    cp.on("close", function () {
      resolve();
    });
  });
};
exports.puts = (mes) =>
  new Promise(function (resolve, reject) {
    console.log(mes);
    const reader = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false,
    });
    reader.on("line", function (l) {
      resolve(l);
      reader.close();
    });
    reader.prompt();
  });

/*
  util
*/
exports.getExt = function (browser) {
  if (browser === "chrome") {
    return "webp";
  }
  return "png";
};

exports.isSrcNewer = function (src, bin) {
  let binTime;
  const srcTime = fs.statSync(src).mtimeMs;
  try {
    binTime = fs.statSync(bin).mtimeMs;
  } catch (e) {
    // 出力先にファイルが存在しないとき
    if (e.code === "ENOENT") {
      return true;
    }
  }
  return srcTime > binTime;
};

/*
  console
*/
const GRAY = "\u001b[90m";
const CYAN = "\u001b[36m";
const RED = "\u001b[31m";
const RESET = "\u001b[0m";
const toTwoDigit = function (str) {
  if (("" + str).length === 1) {
    return "0" + str;
  } else {
    return str;
  }
};
const getTimeString = function () {
  const date = new Date();
  return `${toTwoDigit(date.getHours())}:${toTwoDigit(
    date.getMinutes()
  )}:${toTwoDigit(date.getSeconds())}`;
};

exports.rollupOnWarn = function (warning, warn) {
  if (warning.code === "CIRCULAR_DEPENDENCY") {
    return;
  }
  warn(warning);
};

const _spaceR = " ".repeat("[hh:mm:ss][Rollup.js] ".length);
const onRollupError = function (filename, type) {
  if (type == null) {
    type = "Error";
  }
  return function (e) {
    const prefix = `[${GRAY}${getTimeString()}${RESET}][${GRAY}Rollup.js${RESET}] `;
    let mes =
      prefix +
      `${RED}${type}(${e.code})${RESET} '${CYAN}${filename}${RESET}': ${e.message}`;
    if (e.loc != null) {
      mes += "\n" + _spaceR + `${e.loc.file} L${e.loc.line}:${e.loc.column}`;
    }
    if (e.location != null) {
      const file = path.relative(process.cwd(), e.id);
      if (e.location != null) {
        mes +=
          "\n" +
          _spaceR +
          `${file} L${e.location.first_line + 1}:${
            e.location.first_column + 1
          }-${e.location.last_column + 1}`;
      }
    }
    if (e.frame != null) {
      mes += "\n" + _spaceR + e.frame.replace(/\n/g, "\n" + _spaceR);
    }
    console.error(mes);
  };
};
exports.onRollupError = onRollupError;
exports.onRollupWatch = (filename) =>
  function (e) {
    const prefix = `[${GRAY}${getTimeString()}${RESET}][${GRAY}Rollup.js${RESET}] `;
    switch (e.code) {
      case "START":
      case "END":
        return;
        break;
      case "BUNDLE_START":
        console.log(prefix + `Starting '${CYAN}${filename}${RESET}'`);
        break;
      case "BUNDLE_END":
        console.log(
          prefix + `Finished '${CYAN}${filename}${RESET}' in ${e.duration}ms`
        );
        break;
      case "FATAL":
        onRollupError(filename, "FatalError")(e.error);
        break;
      case "ERROR":
        onRollupError(filename)(e.error);
        break;
    }
  };

const _spaceP = " ".repeat("[hh:mm:ss][pug] ".length);
exports.onPugError = $.notify.onError(function (e) {
  let mes;
  const prefix = `[${GRAY}${getTimeString()}${RESET}][${GRAY}pug${RESET}] `;
  if (e.code != null) {
    mes =
      prefix + `${RED}Error(${e.code})${RESET} '${CYAN}${e.plugin}${RESET}':`;
    mes += "\n" + _spaceP + e.message.replace(/\n/g, "\n" + _spaceP);
  } else {
    mes =
      prefix +
      `${RED}Error(${e.name})${RESET} '${CYAN}${e.plugin}${RESET}': ${e.message}`;
    if (e.stack != null) {
      mes += "\n" + _spaceP + e.stack.replace(/\n/g, "\n" + _spaceP);
    }
  }
  console.error(mes);
  return {
    title: `Error pug ${e.code != null ? e.code : e.name}`,
    message: e.message != null ? e.message : e.stack,
  };
});

const _spaceS = " ".repeat("[hh:mm:ss][sass] ".length);
exports.onScssError = $.notify.onError(function (e) {
  const prefix = `[${GRAY}${getTimeString()}${RESET}][${GRAY}sass${RESET}] `;
  let mes =
    prefix +
    `${RED}Error${RESET} '${CYAN}${e.plugin}${RESET}': ${e.relativePath} L${e.line}:${e.column}`;
  mes += "\n" + _spaceS + e.messageFormatted.replace(/\n/g, "\n" + _spaceS);
  console.error(mes);
  return {
    title: `Error sass ${e.relativePath} L${e.line}:${e.column}`,
    message: e.message,
  };
});
