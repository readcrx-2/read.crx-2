import { useEffect, useLayoutEffect, useState } from "react";
import { useViewSurface } from "src/features/auxiliary-window/browser/use-view-surface";
import { container } from "src/service-container/index";

type ThemeId = "default" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

function parseThemeId(raw: string | null | undefined): ThemeId {
  if (raw === "dark" || raw === "system") return raw;
  // "default" および未知の値はライトとして扱う
  return "default";
}

function resolveSystemTheme(targetWindow: Window): ResolvedTheme {
  return targetWindow.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** theme_id 設定値を監視し、解決済みの light/dark テーマを返すフック */
export function useTheme(): ResolvedTheme {
  const { window: viewWindow } = useViewSurface();
  const [themeId, setThemeId] = useState<ThemeId>(() =>
    parseThemeId(container.config.get("theme_id")),
  );

  // config_updated メッセージを購読し、theme_id の変更をリアルタイムで反映する
  useEffect(() => {
    const syncThemeId = () => {
      // Config は localStorage の読み込み後に確定するため、初回レンダー時の既定値だけで
      // テーマを決めると、再起動後に保存済みの dark 設定を取りこぼしてしまう。
      setThemeId(parseThemeId(container.config.get("theme_id")));
    };
    const handleConfigUpdated = ({ key, val }: { key: string; val: string }) => {
      if (key === "theme_id") {
        setThemeId(parseThemeId(val));
      }
    };
    container.config.ready(syncThemeId);
    container.message.on("config_updated", handleConfigUpdated);
    return () => container.message.off("config_updated", handleConfigUpdated);
  }, []);

  const [resolved, setResolved] = useState<ResolvedTheme>(() => {
    const id = parseThemeId(container.config.get("theme_id"));
    if (id === "dark") return "dark";
    if (id === "system") return resolveSystemTheme(viewWindow);
    return "light";
  });

  useLayoutEffect(() => {
    // 起動時のルート配色も追従させないと、ライトへ戻してもダーク用トークンが継承される。
    const viewDocument = viewWindow.document;
    viewDocument.documentElement.setAttribute("data-theme", resolved);
    viewDocument.querySelector('meta[name="color-scheme"]')?.setAttribute("content", resolved);
  }, [resolved, viewWindow]);

  useEffect(() => {
    if (themeId === "dark") {
      setResolved("dark");
      return;
    }
    if (themeId === "default") {
      setResolved("light");
      return;
    }

    // system: prefers-color-scheme の変化を監視する
    const mq = viewWindow.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => setResolved(mq.matches ? "dark" : "light");
    setResolved(mq.matches ? "dark" : "light");
    mq.addEventListener("change", handleChange);
    return () => mq.removeEventListener("change", handleChange);
  }, [themeId, viewWindow]);

  return resolved;
}
