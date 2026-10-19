import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TitleBarButtonSettingsPanel } from "src/view/browser/pages/settings/TitleBarButtonSettingsPanel";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { settingsHolder } = vi.hoisted(() => ({
  settingsHolder: {
    value: {
      backEnabled: true,
      forwardEnabled: true,
      refreshEnabled: true,
    },
    setBackEnabled: vi.fn(),
    setForwardEnabled: vi.fn(),
    setRefreshEnabled: vi.fn(),
  },
}));

vi.mock("src/view/browser/hooks/use-title-bar-navigation-setting", () => ({
  useTitleBarButtonSettings: () => ({
    ...settingsHolder.value,
    setBackEnabled: settingsHolder.setBackEnabled,
    setForwardEnabled: settingsHolder.setForwardEnabled,
    setRefreshEnabled: settingsHolder.setRefreshEnabled,
  }),
}));

describe("TitleBarButtonSettingsPanel", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    settingsHolder.value = {
      backEnabled: true,
      forwardEnabled: true,
      refreshEnabled: true,
    };
    settingsHolder.setBackEnabled.mockReset();
    settingsHolder.setForwardEnabled.mockReset();
    settingsHolder.setRefreshEnabled.mockReset();
  });

  it("設定画面のパネルから専用モーダルを開いて各スイッチを変更できる", () => {
    render(<TitleBarButtonSettingsPanel />);

    fireEvent.click(screen.getByRole("button", { name: "タイトルバーのボタン設定" }));

    expect(screen.getByRole("dialog")).toHaveTextContent("タイトルバーのボタン設定");
    fireEvent.click(screen.getByRole("switch", { name: "戻る" }));
    fireEvent.click(screen.getByRole("switch", { name: "進む" }));
    fireEvent.click(screen.getByRole("switch", { name: "更新" }));

    expect(settingsHolder.setBackEnabled).toHaveBeenCalledWith(false);
    expect(settingsHolder.setForwardEnabled).toHaveBeenCalledWith(false);
    expect(settingsHolder.setRefreshEnabled).toHaveBeenCalledWith(false);
  });
});
