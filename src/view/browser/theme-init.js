// ReactとConfigの起動完了を待たず、初回描画前に保存済みテーマを反映する。
let themeId = null;

try {
  themeId = window.localStorage.getItem("config_theme_id");
} catch (error) {
  console.error("起動時のテーマ設定を読み込めませんでした:", error);
}

const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
const isDark = themeId === "dark" || ((themeId === "system" || themeId === null) && prefersDark);

document.documentElement.dataset.theme = isDark ? "dark" : "light";
