import {deepCopy} from "./Util";

type logLevel = "log" | "debug" | "info" | "warn" | "error";
var logLevels = <Set<logLevel>>new Set(["log", "debug", "info", "warn", "error"]);

export async function criticalError (message:string):Promise<void> {
  new Notification(
    "深刻なエラーが発生したのでread.crxを終了します",
    { body: `詳細 : ${message}` }
  );

  var {id} = await (<any>parent).browser.tabs.getCurrent();
  (<any>parent).browser.tabs.remove(id);
}

export function log (level:logLevel, ...data:any[]) {
  if (logLevels.has(level)) {
    console[level](...data);
  } else {
    log("error", "app.log: 引数levelが不正な値です", level);
  }
}

export function assertArg (name:string, rules:[any, string, boolean|undefined][]):boolean {
  for (let [val, type, canbeNull] of rules) {
    if (
      !(canbeNull && (val === null || val === void 0)) &&
      typeof val !== type
    ) {
      log("error", `${name}: 不正な引数(予期していた型: ${type}, 受け取った型: ${typeof val})`, deepCopy(val));
      return true
    }
  }
  return false;
}
