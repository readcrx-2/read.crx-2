import { useEffect, useState } from "react";
import { readConfigValue, subscribeConfigKeys } from "src/view/browser/utils/config-setting";
import { compileImageBlurPattern } from "src/view/browser/utils/thread-emphasis";

export interface ImageBlurConfigState {
  enabled: boolean;
  radius: number;
  harmfulWordPattern: RegExp | null;
}

// 変更理由: ぼかし量を変える利用者はほとんどいないため設定項目から外し、既定の強さに固定する。
// 保存済みの値は読まないため、以前に変更した利用者も既定の強さに戻る。
const IMAGE_BLUR_RADIUS_PX = 4;

const IMAGE_BLUR_CONFIG_KEYS = ["image_blur", "image_blur_word"] as const;

function readImageBlurConfig(): ImageBlurConfigState {
  const enabled = readConfigValue("image_blur") === "on";
  const rawPattern = readConfigValue("image_blur_word");
  const harmfulWordPattern =
    typeof rawPattern === "string" ? compileImageBlurPattern(rawPattern) : null;
  return { enabled, radius: IMAGE_BLUR_RADIUS_PX, harmfulWordPattern };
}

export function useImageBlurConfig(): ImageBlurConfigState {
  const [imageBlurConfig, setImageBlurConfig] = useState<ImageBlurConfigState>(readImageBlurConfig);

  useEffect(() => {
    const applyImageBlurConfig = () => setImageBlurConfig(readImageBlurConfig());
    return subscribeConfigKeys(IMAGE_BLUR_CONFIG_KEYS, applyImageBlurConfig, {
      label: "ImageBlurConfig",
      syncOnUnknownKey: true,
    });
  }, []);

  return imageBlurConfig;
}
