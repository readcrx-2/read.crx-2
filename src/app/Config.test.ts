import Config from "src/app/Config";
import { getStore2String, removeStore2Value, setStore2String } from "src/app/Store2Storage";
import { afterEach, describe, expect, it } from "vite-plus/test";

function waitReady(config: Config): Promise<void> {
  return new Promise((resolve) => config.ready(() => resolve()));
}

describe("Configのテーマ設定の移行", () => {
  let config: Config | null = null;

  afterEach(async () => {
    config?.destroy();
    config = null;
    await removeStore2Value("config_theme_id");
  });

  it("保存済みのライトの旧ID defaultを lightへ書き換える", async () => {
    await setStore2String("config_theme_id", "default");
    config = new Config();
    await waitReady(config);

    expect(config.get("theme_id")).toBe("light");
    expect(getStore2String("config_theme_id")).toBe("light");
  });

  it("旧ID以外の保存値はそのまま読む", async () => {
    await setStore2String("config_theme_id", "dark");
    config = new Config();
    await waitReady(config);

    expect(config.get("theme_id")).toBe("dark");
    expect(getStore2String("config_theme_id")).toBe("dark");
  });

  it("未設定なら既定のsystemを返す", async () => {
    config = new Config();
    await waitReady(config);

    expect(config.get("theme_id")).toBe("system");
  });
});
