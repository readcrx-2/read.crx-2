import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useMediaViewerStore } from "src/features/media/browser/use-media-viewer-store";
import { WritePanelContent } from "src/features/write/ui/WritePanelContent";
import { container } from "src/service-container/index";
import type { IConfig, IMessage } from "src/service-container/interfaces";
import { StatusBar, StatusBarProvider } from "src/view/browser/components/StatusBar";
import { ViewSurfaceProvider } from "src/view/browser/hooks/use-view-surface";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  clearWritePanelInsertRequest: vi.fn(),
  closePanel: vi.fn(),
  name: "",
  mail: "",
  message: "本文",
  selectedThreadUrl: null as string | null,
  targets: [] as Array<{ threadUrl: string; title: string; tabId: string }>,
  writePanelInsertRequest: null as { id: number; text: string } | null,
  status: "idle" as "idle" | "submitting" | "confirm" | "success" | "error",
  statusText: "",
  authCode: null as string | null,
  authCodeUrl: null as string | null,
  confirmationPage: null,
  submit: vi.fn().mockResolvedValue(undefined),
  submitConfirmation: vi.fn().mockResolvedValue(undefined),
  setName: vi.fn(),
  setMail: vi.fn(),
  setSage: vi.fn(),
  setMessage: vi.fn(),
  handleSubmit: vi.fn(),
  handleRetry: vi.fn(),
  copyText: vi.fn().mockResolvedValue(undefined),
  readClipboardImage: vi.fn(),
  openWriteWindow: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  toastInfo: vi.fn(),
}));

vi.mock("src/view/browser/utils/clipboard", () => ({
  copyText: mocks.copyText,
  readClipboardImage: mocks.readClipboardImage,
}));

vi.mock("src/app/platform", () => ({
  platform: {
    window: {
      openPopup: vi.fn(() => null),
    },
  },
}));

function renderWritePanel(standalone = false) {
  return render(
    <StatusBarProvider>
      <WritePanelContent standalone={standalone} />
      <StatusBar />
    </StatusBarProvider>,
  );
}

vi.mock("src/features/tabs/browser/use-tab-store", () => ({
  useTabStore: () => ({
    viewPage: {
      type: "thread",
      title: "スレッド",
      threadUrl: "https://example.com/test/read.cgi/software/1/",
    },
  }),
}));

vi.mock("src/view/browser/hooks/use-bottom-panel", () => ({
  useBottomPanel: () => ({
    writePanelInsertRequest: mocks.writePanelInsertRequest,
    clearWritePanelInsertRequest: mocks.clearWritePanelInsertRequest,
    closePanel: mocks.closePanel,
  }),
  useOptionalBottomPanel: () => ({
    writePanelInsertRequest: mocks.writePanelInsertRequest,
    clearWritePanelInsertRequest: mocks.clearWritePanelInsertRequest,
    closePanel: mocks.closePanel,
  }),
}));

vi.mock("src/features/write/browser/use-write", () => ({
  useWrite: () => ({
    name: mocks.name,
    mail: mocks.mail,
    sage: false,
    message: mocks.message,
    status: mocks.status,
    statusText: mocks.statusText,
    authCode: mocks.authCode,
    authCodeUrl: mocks.authCodeUrl,
    confirmationPage: mocks.confirmationPage,
    canSubmit: true,
    iframeRef: { current: null },
    setName: mocks.setName,
    setMail: mocks.setMail,
    setSage: mocks.setSage,
    setMessage: mocks.setMessage,
    submit: mocks.submit,
    submitConfirmation: mocks.submitConfirmation,
    handleSubmit: mocks.handleSubmit,
    handleRetry: mocks.handleRetry,
  }),
}));

vi.mock("src/features/write/browser/use-write-session", () => ({
  useWriteSessionControls: () => ({
    isWindowOpen: false,
    writeWindowRoot: null,
    selectedThreadUrl: mocks.selectedThreadUrl,
    targets: mocks.targets,
    selectThread: vi.fn(),
    appendDraft: vi.fn(),
    openWriteWindow: mocks.openWriteWindow,
    closeWriteWindow: vi.fn(),
  }),
  useWriteDraft: () => "",
  useWriteDraftActions: () => ({ setDraft: vi.fn() }),
}));

describe("WritePanelContent", () => {
  let configMock: IConfig;
  let configSetMock: IConfig["set"];
  let messageMock: IMessage;

  beforeEach(() => {
    useMediaViewerStore.setState({
      viewer: null,
      viewerScopeId: null,
      viewerScale: 1,
      isLoading: false,
    });
    mocks.clearWritePanelInsertRequest.mockClear();
    mocks.closePanel.mockClear();
    mocks.name = "";
    mocks.mail = "";
    mocks.message = "本文";
    mocks.selectedThreadUrl = null;
    mocks.targets = [];
    mocks.writePanelInsertRequest = null;
    mocks.status = "idle";
    mocks.statusText = "";
    mocks.authCode = null;
    mocks.authCodeUrl = null;
    mocks.submit.mockClear();
    mocks.setName.mockClear();
    mocks.setMail.mockClear();
    mocks.setSage.mockClear();
    mocks.setMessage.mockClear();
    mocks.handleSubmit.mockClear();
    mocks.handleRetry.mockClear();
    mocks.copyText.mockClear();
    mocks.readClipboardImage.mockClear();
    mocks.toastSuccess.mockClear();
    mocks.toastError.mockClear();
    mocks.toastInfo.mockClear();
    mocks.openWriteWindow.mockClear();
    mocks.openWriteWindow.mockReturnValue(undefined);

    configSetMock = vi.fn().mockResolvedValue(undefined);
    configMock = {
      get: vi.fn((key: string) => {
        if (key === "site_board_settings") return "{}";
        if (key === "write_pre_submit_warnings" || key === "write_sanitize_urls_on_paste") {
          return "on";
        }
        return "off";
      }),
      set: configSetMock,
      getAll: () => ({}),
      ready: (callback: () => void) => callback(),
    };
    messageMock = {
      send: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
    };

    container.config = configMock;
    container.message = messageMock;
    container.toast = {
      notify: vi.fn(),
      success: mocks.toastSuccess,
      error: mocks.toastError,
      info: mocks.toastInfo,
    };
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("本文に画像URLがない場合はサムネイルを表示しない", () => {
    mocks.message = "https://example.com/page https://example.com/video.mp4";
    renderWritePanel();

    expect(screen.queryByRole("group", { name: "投稿画像のプレビュー" })).not.toBeInTheDocument();
  });

  it("本文の画像だけを既存ビューアで開き、重複を除いて前後移動できる", () => {
    const first = "https://example.com/first.jpg";
    const second = "https://example.com/second.png";
    mocks.message = `${first}\nhttps://example.com/page\n${second}\n${first}`;
    renderWritePanel();

    const previews = within(screen.getByRole("group", { name: "投稿画像のプレビュー" }));
    expect(previews.getAllByRole("button")).toHaveLength(2);
    expect(
      previews.getByRole("button", { name: "画像2をプレビュー" }).querySelector("img"),
    ).toHaveAttribute("src", second);
    fireEvent.click(previews.getByRole("button", { name: "画像2をプレビュー" }));
    expect(useMediaViewerStore.getState().viewer?.currentIndex).toBe(1);
    expect(useMediaViewerStore.getState().viewer?.src).toBe(second);
    fireEvent.click(screen.getByTitle("閉じる"));

    fireEvent.click(screen.getByRole("button", { name: "画像1をプレビュー" }));
    fireEvent.load(screen.getByAltText(first));
    expect(screen.getByRole("img", { name: first })).toHaveAttribute("src", first);
    expect(useMediaViewerStore.getState().viewer?.images).toEqual([first, second]);

    fireEvent.click(screen.getByTitle("次の画像"));
    fireEvent.load(screen.getByAltText(second));
    expect(screen.getByRole("img", { name: second })).toHaveAttribute("src", second);
    fireEvent.click(screen.getByTitle("前の画像"));
    fireEvent.load(screen.getByAltText(first));
    expect(screen.getByRole("img", { name: first })).toBeInTheDocument();
    fireEvent.click(screen.getByTitle("閉じる"));
    expect(useMediaViewerStore.getState().viewer).toBeNull();
    expect(mocks.submit).not.toHaveBeenCalled();
    expect(mocks.setMessage).not.toHaveBeenCalled();
  });

  it("本文の編集に合わせてサムネイルを更新し、画像を消したら一覧も消す", () => {
    mocks.message = "https://example.com/first.jpg";
    const { rerender } = renderWritePanel();
    expect(screen.getByRole("button", { name: "画像1をプレビュー" })).toHaveAttribute(
      "title",
      mocks.message,
    );

    mocks.message = "https://example.com/second.png";
    rerender(
      <StatusBarProvider>
        <WritePanelContent />
      </StatusBarProvider>,
    );
    expect(screen.getByRole("button", { name: "画像1をプレビュー" })).toHaveAttribute(
      "title",
      mocks.message,
    );

    mocks.message = "本文だけ";
    rerender(
      <StatusBarProvider>
        <WritePanelContent />
      </StatusBarProvider>,
    );
    expect(screen.queryByRole("group", { name: "投稿画像のプレビュー" })).not.toBeInTheDocument();
  });

  it("投稿先の切り替えと書き込み欄の破棄でプレビューを閉じる", () => {
    mocks.message = "https://example.com/first.jpg";
    const { rerender, unmount } = renderWritePanel();
    fireEvent.click(screen.getByRole("button", { name: "画像1をプレビュー" }));
    expect(useMediaViewerStore.getState().viewer).not.toBeNull();

    mocks.selectedThreadUrl = "https://example.com/test/read.cgi/software/2/";
    rerender(
      <StatusBarProvider>
        <WritePanelContent />
      </StatusBarProvider>,
    );
    expect(useMediaViewerStore.getState().viewer).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "画像1をプレビュー" }));
    unmount();
    expect(useMediaViewerStore.getState().viewer).toBeNull();
  });

  it("別窓の表示環境でプレビューを描画し、その窓のEscapeで閉じる", () => {
    // 変更理由: 別Documentへの描画だけでなく、キーイベントの登録先も検証する。
    const frame = document.createElement("iframe");
    document.body.append(frame);
    const previewWindow = frame.contentWindow!;
    const previewDocument = frame.contentDocument!;
    mocks.message = "https://example.com/first.jpg";
    const { unmount } = render(
      <ViewSurfaceProvider surface={{ window: previewWindow, document: previewDocument }}>
        <StatusBarProvider>
          <WritePanelContent standalone portalContainer={previewDocument.body} />
        </StatusBarProvider>
      </ViewSurfaceProvider>,
      { container: previewDocument.body },
    );
    const previewScreen = within(previewDocument.body);
    fireEvent.click(previewScreen.getByRole("button", { name: "画像1をプレビュー" }));
    fireEvent.load(previewScreen.getByAltText(mocks.message));
    expect(previewScreen.getByRole("img")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(useMediaViewerStore.getState().viewer).not.toBeNull();
    fireEvent.keyDown(previewWindow, { key: "Escape" });
    expect(useMediaViewerStore.getState().viewer).toBeNull();
    unmount();
    frame.remove();
  });

  it("Ctrl+EnterオプションON時はテキストエリアでCtrl+Enter投稿できる", () => {
    configMock.get = vi.fn((key: string) => (key === "write_submit_ctrl_enter" ? "on" : ""));

    renderWritePanel();

    const textarea = screen.getByPlaceholderText("本文を入力...");
    fireEvent.keyDown(textarea, { key: "Enter", ctrlKey: true });

    expect(mocks.submit).toHaveBeenCalledTimes(1);
  });

  it("投稿先バーは別窓の書き込み欄だけに表示する", () => {
    const targetThreadUrl = "https://example.com/test/read.cgi/software/1/";
    mocks.selectedThreadUrl = targetThreadUrl;
    mocks.targets = [
      {
        threadUrl: targetThreadUrl,
        title: "スレッド",
        tabId: "tab-1",
      },
    ];

    const { unmount } = renderWritePanel();
    expect(screen.queryByLabelText("投稿先スレッド")).not.toBeInTheDocument();

    unmount();
    renderWritePanel(true);
    expect(screen.getByLabelText("投稿先スレッド")).toBeInTheDocument();
  });

  it("Ctrl+EnterオプションOFF時はCtrl+Enterしても投稿しない", () => {
    renderWritePanel();

    const textarea = screen.getByPlaceholderText("本文を入力...");
    fireEvent.keyDown(textarea, { key: "Enter", ctrlKey: true });

    expect(mocks.submit).not.toHaveBeenCalled();
  });

  it("Ctrl+Enterとsageの操作欄をパネル内に表示しない", () => {
    renderWritePanel();

    expect(screen.queryByText("Ctrl+Enterで書き込む")).not.toBeInTheDocument();
    expect(screen.queryByText("sage", { selector: "label" })).not.toBeInTheDocument();
  });

  it("歯車ボタンから書き込み設定を開いて各項目を変更できる", async () => {
    renderWritePanel();

    fireEvent.click(screen.getByRole("button", { name: "書き込み設定" }));

    const dialog = screen.getByRole("dialog", { name: "書き込み設定" });
    expect(
      within(dialog).getByRole("checkbox", { name: "Ctrl+Enterで書き込む" }),
    ).toBeInTheDocument();
    expect(within(dialog).getByRole("checkbox", { name: "sageで書き込む" })).toBeInTheDocument();
    expect(
      within(dialog).getByRole("checkbox", { name: "レス後に書き込みパネルを閉じる" }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("checkbox", { name: "貼り付け時にURLパラメータを除去する" }),
    ).toBeChecked();

    fireEvent.click(within(dialog).getByRole("checkbox", { name: "Ctrl+Enterで書き込む" }));
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "sageで書き込む" }));
    fireEvent.click(
      within(dialog).getByRole("checkbox", { name: "レス後に書き込みパネルを閉じる" }),
    );
    fireEvent.click(
      within(dialog).getByRole("checkbox", { name: "貼り付け時にURLパラメータを除去する" }),
    );

    expect(configSetMock).toHaveBeenCalledWith("write_submit_ctrl_enter", "on");
    expect(configSetMock).toHaveBeenCalledWith("write_close_panel_after_submit", "on");
    await waitFor(() =>
      expect(configSetMock).toHaveBeenCalledWith(
        "site_board_settings",
        expect.stringContaining('"write_sanitize_urls_on_paste":"off"'),
      ),
    );
    expect(mocks.setSage).toHaveBeenCalledWith(true);

    fireEvent.click(within(dialog).getByRole("button", { name: "閉じる" }));
    expect(screen.queryByRole("dialog", { name: "書き込み設定" })).not.toBeInTheDocument();
  });

  it("右クリック返信の挿入要求が来たら既存本文へ追記する", async () => {
    mocks.writePanelInsertRequest = {
      id: 1,
      text: ">>10\n",
    };

    renderWritePanel();

    expect(mocks.setMessage).toHaveBeenCalledWith("本文\n>>10\n");
    expect(mocks.clearWritePanelInsertRequest).toHaveBeenCalledWith(1);
  });

  it("書き込みエラーをステータスバーへ表示し、再入力できる", async () => {
    const errorMessage = "書き込み失敗: " + "サーバーから返された長いエラー内容。".repeat(12);
    mocks.status = "error";
    mocks.statusText = errorMessage;

    renderWritePanel();

    expect(await screen.findByRole("alert")).toHaveTextContent(errorMessage);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    const retryButton = screen.getByRole("button", { name: "再入力" });
    expect(retryButton).toBeInTheDocument();
    fireEvent.click(retryButton);
    expect(mocks.handleRetry).toHaveBeenCalledTimes(1);
  });

  it("エラー本文が空でもフォールバックをステータスバーへ表示する", async () => {
    mocks.status = "error";
    mocks.statusText = "";

    renderWritePanel();

    expect(await screen.findByRole("alert")).toHaveTextContent("書き込みに失敗しました");
  });

  it("メール欄の認証トークンだけでは警告を出さず投稿する", () => {
    mocks.mail = "#000673c0853dd270247921bf12109000";

    renderWritePanel();
    fireEvent.click(screen.getByRole("button", { name: "書き込む" }));

    expect(mocks.submit).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByRole("dialog", { name: "投稿内容を確認してください" }),
    ).not.toBeInTheDocument();
  });

  it("設定をOFFにすると警告対象が含まれていても確認を挟まず投稿する", () => {
    configMock.get = vi.fn(() => "off");
    mocks.message = "連絡先は sample.user@example.com です";

    renderWritePanel();
    fireEvent.click(screen.getByRole("button", { name: "書き込む" }));

    expect(mocks.submit).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByRole("dialog", { name: "投稿内容を確認してください" }),
    ).not.toBeInTheDocument();
  });

  it("認証トークンを除外しつつ本文の電話番号を警告し、見直し時は投稿しない", async () => {
    mocks.mail = "#000673c0853dd270247921bf12109000";
    mocks.message = "連絡先は090-1234-5678です";

    renderWritePanel();
    fireEvent.click(screen.getByRole("button", { name: "書き込む" }));

    const dialog = await screen.findByRole("dialog", { name: "投稿内容を確認してください" });
    expect(within(dialog).getByText("電話番号")).toBeInTheDocument();
    expect(within(dialog).queryByText("住所・郵便番号")).not.toBeInTheDocument();
    expect(mocks.submit).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole("button", { name: "内容を見直す" }));

    expect(
      screen.queryByRole("dialog", { name: "投稿内容を確認してください" }),
    ).not.toBeInTheDocument();
    expect(mocks.submit).not.toHaveBeenCalled();
  });

  it("警告を確認して投稿を選ぶと一度だけ投稿する", async () => {
    mocks.message = "連絡先は sample.user@example.com です";

    renderWritePanel();
    fireEvent.click(screen.getByRole("button", { name: "書き込む" }));

    const dialog = await screen.findByRole("dialog", { name: "投稿内容を確認してください" });
    fireEvent.click(within(dialog).getByRole("button", { name: "無視して投稿" }));

    await waitFor(() => expect(mocks.submit).toHaveBeenCalledTimes(1));
    expect(
      screen.queryByRole("dialog", { name: "投稿内容を確認してください" }),
    ).not.toBeInTheDocument();
  });

  it("URLパラメータの除去を選ぶと本文へ反映して除去後の内容を投稿する", async () => {
    mocks.message = "共有URL https://www.youtube.com/watch?v=example&si=tracking#t=30s";

    renderWritePanel();
    fireEvent.click(screen.getByRole("button", { name: "書き込む" }));

    const dialog = await screen.findByRole("dialog", { name: "投稿内容を確認してください" });
    fireEvent.click(within(dialog).getByRole("button", { name: "URLパラメータを除去して投稿" }));

    expect(mocks.setMessage).toHaveBeenCalledWith(
      "共有URL https://www.youtube.com/watch?v=example#t=30s",
    );
    expect(mocks.submit).toHaveBeenCalledWith(
      "共有URL https://www.youtube.com/watch?v=example#t=30s",
    );
    expect(mocks.toastSuccess).toHaveBeenCalledWith(
      "URLパラメータを除去しました",
      expect.objectContaining({ targetWindow: expect.any(Object) }),
    );
  });

  it("投稿前警告をOFFにしても貼り付け時のURL追跡パラメータ除去は行う", () => {
    configMock.get = vi.fn((key: string) =>
      key === "site_board_settings" ? "{}" : key === "write_sanitize_urls_on_paste" ? "on" : "off",
    );

    renderWritePanel();

    const textarea = screen.getByPlaceholderText("本文を入力...") as HTMLTextAreaElement;
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    fireEvent.paste(textarea, {
      clipboardData: {
        getData: () => "https://www.youtube.com/watch?v=example&si=tracking#t=30s",
      },
    });

    // 変更理由: 貼り付け時の変換は投稿前確認設定に依存せず、編集欄にも除去後の本文を反映する。
    expect(mocks.setMessage).toHaveBeenCalledWith(
      "本文https://www.youtube.com/watch?v=example#t=30s",
    );
    expect(mocks.toastSuccess).toHaveBeenCalledWith(
      "貼り付け時にURLパラメータを除去しました",
      expect.objectContaining({ targetWindow: expect.any(Object) }),
    );
  });

  it("貼り付け除去をOFFにすると自動変換を行わない", () => {
    configMock.get = vi.fn((key: string) =>
      key === "site_board_settings" ? "{}" : key === "write_pre_submit_warnings" ? "on" : "off",
    );

    renderWritePanel();

    const textarea = screen.getByPlaceholderText("本文を入力...");
    fireEvent.paste(textarea, {
      clipboardData: {
        getData: () => "https://www.youtube.com/watch?v=example&si=tracking",
      },
    });

    expect(mocks.setMessage).not.toHaveBeenCalled();
  });

  it("貼り付け除去をOFFにしても投稿前のURL警告は独立して表示する", async () => {
    configMock.get = vi.fn((key: string) => {
      if (key === "site_board_settings") return "{}";
      return key === "write_pre_submit_warnings" ? "on" : "off";
    });
    mocks.message = "共有URL https://youtu.be/example?si=tracking";

    renderWritePanel();
    fireEvent.click(screen.getByRole("button", { name: "書き込む" }));

    const dialog = await screen.findByRole("dialog", { name: "投稿内容を確認してください" });
    expect(within(dialog).getByText("URLの追跡パラメータ")).toBeInTheDocument();
  });

  it("eddibb認証コードのエラーでは認証URLを表示してコピーできる", async () => {
    mocks.status = "error";
    mocks.statusText = "認証が必要です。認証ダイアログの案内に従ってください";
    mocks.authCode = "332376";
    mocks.authCodeUrl = "https://example.com/auth-code";

    renderWritePanel();

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByLabelText("認証コード")).toHaveValue("332376");
    fireEvent.click(within(dialog).getByRole("button", { name: "コードをコピー" }));
    await waitFor(() =>
      expect(mocks.copyText).toHaveBeenCalledWith(
        "332376",
        expect.objectContaining({ window: expect.any(Object), document: expect.any(Object) }),
      ),
    );
    expect(mocks.toastSuccess).toHaveBeenCalledWith(
      "認証コードをコピーしました",
      expect.objectContaining({ targetWindow: expect.any(Object) }),
    );
    expect(within(dialog).getByRole("button", { name: "コピーしました" })).toBeInTheDocument();
    expect(within(dialog).getByLabelText("認証ページURL")).toHaveValue(mocks.authCodeUrl);
    fireEvent.click(within(dialog).getByRole("button", { name: "URLをコピー" }));

    await waitFor(() =>
      expect(mocks.copyText).toHaveBeenCalledWith(
        mocks.authCodeUrl,
        expect.objectContaining({
          window: expect.any(Object),
          document: expect.any(Object),
        }),
      ),
    );
    expect(mocks.toastSuccess).toHaveBeenCalledWith(
      "認証URLをコピーしました",
      expect.objectContaining({ targetWindow: expect.any(Object) }),
    );
    await waitFor(() =>
      expect(mocks.copyText).toHaveBeenCalledWith(
        mocks.authCodeUrl,
        expect.objectContaining({ window: expect.any(Object), document: expect.any(Object) }),
      ),
    );
    expect(within(dialog).getAllByRole("button", { name: "コピーしました" })).toHaveLength(2);
  });

  it("書き込み成功時に設定がONならパネルを閉じる", () => {
    configMock.get = vi.fn((key: string) =>
      key === "write_close_panel_after_submit" ? "on" : "off",
    );
    mocks.status = "success";

    renderWritePanel();

    expect(mocks.closePanel).toHaveBeenCalledTimes(1);
  });

  it("別窓を開いたら下部パネルを閉じる", () => {
    renderWritePanel();

    fireEvent.click(screen.getByRole("button", { name: "書き込みを別窓で開く" }));

    expect(mocks.openWriteWindow).toHaveBeenCalledTimes(1);
    expect(mocks.closePanel).toHaveBeenCalledTimes(1);
  });

  it("別窓を開けない場合は下部パネルを閉じない", () => {
    mocks.openWriteWindow.mockReturnValue(false);

    renderWritePanel();

    fireEvent.click(screen.getByRole("button", { name: "書き込みを別窓で開く" }));

    expect(mocks.openWriteWindow).toHaveBeenCalledTimes(1);
    expect(mocks.closePanel).not.toHaveBeenCalled();
  });

  it("書き込み失敗の本文をステータスバーに表示する", () => {
    mocks.status = "error";
    mocks.statusText = "書き込み結果を確認できませんでした";

    renderWritePanel();

    expect(screen.getByRole("alert")).toHaveTextContent(mocks.statusText);
  });
});
