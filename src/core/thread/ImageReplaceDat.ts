import type { CorePorts } from "src/core/ports/registry";
import { corePorts } from "src/core/ports/registry";

/** 画像置換の設定の読み書きと通知に必要なサービス。呼び出し側が渡す（C-2）。 */
export type ImageReplaceDeps = Pick<CorePorts, "config" | "message">;

// 移行理由: 設定の保存形式と処理順を保ったまま、実行時エントリと返却値の形を型で固定する。
interface DatEntry {
  baseUrl: string;
  replaceUrl: string;
  referrerUrl: string;
  userAgent: string;
  param?: { type?: string; pattern?: string; referrerUrl?: string };
  /** 正規表現が不正な行では未設定のままにして、その行を無効化する。 */
  baseUrlReg?: RegExp;
}

interface ReplaceResult {
  type?: string;
  text?: string;
  extract?: string;
  extractReferrer?: string;
  pattern?: string;
  userAgent?: string;
  cookie?: string;
  cookieReferrer?: string;
  referrer?: string;
}

/** 置換DATの状態を持つインスタンスを作る。状態は作成したインスタンスごとに分かれる。 */
export function createImageReplaceDat(deps: ImageReplaceDeps) {
  let _dat: Set<DatEntry> | null = null;
  const _CONFIG_NAME = "image_replace_dat_obj";
  const _CONFIG_STRING_NAME = "image_replace_dat";
  const _INVALID_URL = "invalid://invalid";

  const _setupReg = (dat: Set<DatEntry>): void => {
    for (const entry of dat) {
      try {
        entry.baseUrlReg = new RegExp(entry.baseUrl, "i");
      } catch (error) {
        console.error("[ImageReplaceDat] 正規表現の読み込みに失敗しました:", error);
        deps.message.send("notify", {
          message: `\
  ImageViewURLReplace.datの一致URLの正規表現(${entry.baseUrl})を読み込むのに失敗しました
  この行は無効化されます\
  `,
          background_color: "red",
        });
        entry.baseUrl = _INVALID_URL;
      }
    }
  };

  const _config = {
    get(): unknown {
      // 設定未保存時 (null) は従来の JSON.parse(null) と同じく null を返す。
      return JSON.parse(deps.config.get(_CONFIG_NAME) ?? "null") as unknown;
    },
    set(value: unknown): void {
      void deps.config.set(_CONFIG_NAME, JSON.stringify(value));
    },
    getString(): string | null {
      return deps.config.get(_CONFIG_STRING_NAME);
    },
    setString(value: string): void {
      void deps.config.set(_CONFIG_STRING_NAME, value);
    },
  };

  function get(): Set<DatEntry> {
    if (_dat == null) {
      if (deps.config.get(_CONFIG_NAME) === "") {
        // 設定文字列も未保存 (null) の場合は空文字として「エントリなし」で初期化する。
        set(_config.getString() ?? "");
      }
      // 保存済みJSONの形は旧実装と同じ前提で扱い、正規表現だけを起動時に再構築する。
      const dat = new Set(_config.get() as DatEntry[] | null);
      _setupReg(dat);
      _dat = dat;
    }
    return _dat;
  }

  const parse = (value: string): Set<DatEntry> => {
    const dat = new Set<DatEntry>();
    if (value === "") {
      return dat;
    }
    const lines = value.split("\n");
    for (const line of lines) {
      if (line === "") {
        continue;
      }
      if (["//", ";", "'"].some((prefix) => line.startsWith(prefix))) {
        continue;
      }
      const fields = line.split("\t");
      if (fields[0] == null) {
        continue;
      }
      const entry: DatEntry = {
        baseUrl: fields[0],
        replaceUrl: fields[1] != null ? fields[1] : "",
        referrerUrl: fields[2] != null ? fields[2] : "",
        userAgent: fields[5] != null ? fields[5] : "",
      };

      if (fields[3] != null) {
        entry.param = {};
        const referrerUrl = fields[3].split("=")[1];
        if (fields[3].includes("$EXTRACT")) {
          entry.param = {
            type: "extract",
            pattern: fields[4],
            referrerUrl: referrerUrl != null ? referrerUrl : "",
          };
        } else if (fields[4]!.includes("$COOKIE")) {
          // 旧実装と同様、COOKIE指定の必須フィールドが欠けた行は設定不正として例外にする。
          entry.param = {
            type: "cookie",
            referrerUrl: referrerUrl != null ? referrerUrl : "",
          };
        }
      }
      dat.add(entry);
    }
    return dat;
  };

  function set(value: string): void {
    const dat = parse(value);
    _config.set([...dat]);
    _setupReg(dat);
    _dat = dat;
  }

  function replace(value: string): { res: ReplaceResult; err?: string } {
    const dat = get();
    const res: ReplaceResult = {};
    for (const entry of dat) {
      // 不正な正規表現の行は baseUrlReg が未設定なので、無効なURL判定と併せてスキップする。
      if (entry.baseUrl === _INVALID_URL || entry.baseUrlReg == null) {
        continue;
      }
      if (!entry.baseUrlReg.test(value)) {
        continue;
      }
      if (entry.replaceUrl === "") {
        return { res, err: "No parsing" };
      }
      if (entry.param != null && entry.param.type === "extract") {
        res.type = "extract";
        res.text = value.replace(entry.baseUrlReg, entry.replaceUrl);
        res.extract = value.replace(entry.baseUrlReg, entry.referrerUrl);
        res.extractReferrer = entry.param.referrerUrl;
        res.pattern = entry.param.pattern;
        res.userAgent = entry.userAgent;
        return { res };
      } else if (entry.param != null && entry.param.type === "cookie") {
        res.type = "cookie";
        res.text = value.replace(entry.baseUrlReg, entry.replaceUrl);
        res.cookie = value.replace(entry.baseUrlReg, entry.referrerUrl);
        res.cookieReferrer = entry.param.referrerUrl;
        res.userAgent = entry.userAgent;
        return { res };
      } else {
        res.type = "default";
        res.text = value.replace(entry.baseUrlReg, entry.replaceUrl);
        if (entry.referrerUrl !== "" || entry.userAgent !== "") {
          res.type = "referrer";
          res.referrer = value.replace(entry.baseUrlReg, entry.referrerUrl);
          res.userAgent = entry.userAgent;
        }
        return { res };
      }
    }
    return { res, err: "Fail noBaseUrlReg" };
  }

  return { get, set, replace };
}

// 既存の import 先（app.ts の公開 API）を維持するため、登録済みのサービスで組み立てた既定のインスタンスを公開する。
// 依存は関数が呼ばれた時点で参照されるため、ここでの組み立てで未登録の例外は出ない。
const defaultImageReplaceDat = createImageReplaceDat(corePorts);

export const { get, set, replace } = defaultImageReplaceDat;
