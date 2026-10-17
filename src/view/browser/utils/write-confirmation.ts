import { createLogger } from "src/app/logger";
import type { WriteFormField } from "src/app/platform/types";

const logger = createLogger("view/browser");

const CONFIRMATION_FORM_ATTRIBUTE = "data-chlens-write-form";
const CONFIRMATION_ACTION_ATTRIBUTE = "data-chlens-write-action";
const DANGEROUS_CSS_PATTERN = /(?:@import|url\s*\(|expression\s*\(|behavior\s*:|-moz-binding\s*:)/i;

export interface WriteConfirmationForm {
  id: string;
  action: string;
}

export interface WriteConfirmationPage {
  html: string;
  sourceUrl: string;
  expectedAction: string;
  charset: string;
  forms: readonly WriteConfirmationForm[];
}

export interface WriteConfirmationSubmission {
  formId: string;
  fields: readonly WriteFormField[];
}

function isAllowedWriteAction(action: string, expectedAction: string): boolean {
  try {
    const actual = new URL(action);
    const expected = new URL(expectedAction);
    return actual.origin === expected.origin && actual.pathname === expected.pathname;
  } catch (error) {
    logger.error("確認ページのフォーム送信先を解釈できませんでした:", error);
    return false;
  }
}

function resolveWriteAction(rawAction: string | null, sourceUrl: string): string | null {
  try {
    return new URL(rawAction?.trim() || sourceUrl, sourceUrl).href;
  } catch (error) {
    logger.error("確認ページの相対フォーム送信先を解決できませんでした:", error);
    return null;
  }
}

function sanitizeStyleValue(value: string): string | null {
  return DANGEROUS_CSS_PATTERN.test(value) ? null : value;
}

function sanitizeConfirmationDocument(
  document: Document,
  expectedAction: string,
  sourceUrl: string,
): WriteConfirmationForm[] {
  const forms: WriteConfirmationForm[] = [];
  const dangerousElements = document.querySelectorAll(
    "script, iframe, frame, frameset, object, embed, applet, portal, base, link, meta, audio, video, source, track, svg, math, canvas",
  );
  for (const element of dangerousElements) {
    element.remove();
  }

  let formIndex = 0;
  for (const form of Array.from(document.forms)) {
    const method = (form.getAttribute("method") ?? "get").toLowerCase();
    const action = resolveWriteAction(form.getAttribute("action"), sourceUrl);
    if (method !== "post" || action == null || !isAllowedWriteAction(action, expectedAction)) {
      form.remove();
      continue;
    }

    const id = `form-${formIndex}`;
    formIndex += 1;
    form.setAttribute(CONFIRMATION_FORM_ATTRIBUTE, id);
    form.setAttribute(CONFIRMATION_ACTION_ATTRIBUTE, action);
    // sandboxで通常送信を止め、親画面が取得した成功コントロールをTauri HTTPへ渡す。
    form.setAttribute("action", "about:blank");
    form.setAttribute("method", "post");
    form.removeAttribute("target");
    forms.push({ id, action });
  }

  for (const element of Array.from(document.querySelectorAll("*"))) {
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase();
      if (
        name.startsWith("on") ||
        ["srcdoc", "formaction", "formmethod", "formtarget"].includes(name)
      ) {
        element.removeAttribute(attribute.name);
        continue;
      }

      if (["src", "srcset", "poster", "background", "href"].includes(name)) {
        element.removeAttribute(attribute.name);
        continue;
      }

      if (name === "style") {
        const sanitized = sanitizeStyleValue(attribute.value);
        if (sanitized == null) element.removeAttribute(attribute.name);
      }
    }

    // DOMParserの文書は別Windowになる場合があるため、タグ名で判定して添付ファイル送信を除外する。
    if (element.tagName.toLowerCase() === "input") {
      const inputType = (element.getAttribute("type") ?? "text").toLowerCase();
      if (inputType === "file" || inputType === "image") {
        element.remove();
      }
    }
  }

  for (const style of Array.from(document.querySelectorAll("style"))) {
    if (DANGEROUS_CSS_PATTERN.test(style.textContent ?? "")) {
      style.remove();
    }
  }

  const head =
    document.head ??
    document.documentElement.insertBefore(
      document.createElement("head"),
      document.documentElement.firstChild,
    );
  const csp = document.createElement("meta");
  csp.httpEquiv = "Content-Security-Policy";
  csp.content =
    "default-src 'none'; style-src 'unsafe-inline'; img-src 'none'; form-action 'none'; base-uri 'none'";
  head.prepend(csp);

  return forms;
}

export function createWriteConfirmationPage(
  html: string,
  sourceUrl: string,
  expectedAction: string,
  charset: string,
): WriteConfirmationPage {
  const document = new DOMParser().parseFromString(html, "text/html");
  const forms = sanitizeConfirmationDocument(document, expectedAction, sourceUrl);
  return {
    html: `<!doctype html>${document.documentElement.outerHTML}`,
    sourceUrl,
    expectedAction,
    charset,
    forms,
  };
}

function appendControlValue(
  fields: WriteFormField[],
  name: string,
  value: string,
  type: WriteFormField["type"],
): void {
  fields.push({ name, value, type });
}

export function collectWriteConfirmationFields(
  form: HTMLFormElement,
  submitter: HTMLElement | null,
): WriteFormField[] {
  const fields: WriteFormField[] = [];
  const ownerWindow = form.ownerDocument.defaultView;
  // DOMParserで作った文書にはdefaultViewがないため、画面側のWindowを代替にする。
  const HTMLElementConstructor = ownerWindow?.HTMLElement ?? HTMLElement;
  const HTMLTextAreaElementConstructor = ownerWindow?.HTMLTextAreaElement ?? HTMLTextAreaElement;
  const HTMLSelectElementConstructor = ownerWindow?.HTMLSelectElement ?? HTMLSelectElement;
  const HTMLInputElementConstructor = ownerWindow?.HTMLInputElement ?? HTMLInputElement;
  const HTMLButtonElementConstructor = ownerWindow?.HTMLButtonElement ?? HTMLButtonElement;

  for (const control of Array.from(form.elements)) {
    // 確認ページはiframe内の別Windowで生成されるため、親Windowのinstanceofでは要素を判定できない。
    if (!(control instanceof HTMLElementConstructor) || control.hasAttribute("disabled")) {
      continue;
    }
    const name = control.getAttribute("name") ?? "";
    if (name === "") continue;

    if (control instanceof HTMLTextAreaElementConstructor) {
      appendControlValue(fields, name, control.value, "textarea");
      continue;
    }

    if (control instanceof HTMLSelectElementConstructor) {
      for (const option of Array.from(control.selectedOptions)) {
        appendControlValue(fields, name, option.value, "input");
      }
      continue;
    }

    if (control instanceof HTMLInputElementConstructor) {
      const inputType = control.type.toLowerCase();
      if (["submit", "button", "image", "reset", "file"].includes(inputType)) {
        if (control !== submitter || inputType === "image") continue;
      }
      if (["checkbox", "radio"].includes(inputType) && !control.checked) continue;
      appendControlValue(fields, name, control.value, "input");
      continue;
    }

    if (control instanceof HTMLButtonElementConstructor) {
      if (control !== submitter || control.type.toLowerCase() !== "submit") continue;
      appendControlValue(fields, name, control.value, "input");
    }
  }

  return fields;
}

export function bindWriteConfirmationFrame(
  frame: HTMLIFrameElement,
  onSubmit: (submission: WriteConfirmationSubmission) => void,
): () => void {
  const document = frame.contentDocument;
  if (!document) return () => undefined;
  const frameWindow = document.defaultView;
  if (!frameWindow) return () => undefined;

  const cleanups: Array<() => void> = [];
  for (const form of Array.from(document.forms)) {
    const formId = form.getAttribute(CONFIRMATION_FORM_ATTRIBUTE);
    if (!formId) continue;

    const dispatchSubmission = (event: Event, submitter: HTMLElement | null) => {
      event.preventDefault();
      event.stopPropagation();
      onSubmit({
        formId,
        fields: collectWriteConfirmationFields(form, submitter),
      });
    };
    const handleSubmit = (event: Event) => {
      const submitter = (event as SubmitEvent).submitter;
      dispatchSubmission(event, submitter instanceof frameWindow.HTMLElement ? submitter : null);
    };
    const handleClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof frameWindow.Element)) return;
      const submitter = target.closest("button, input");
      if (
        !(
          submitter instanceof frameWindow.HTMLButtonElement ||
          submitter instanceof frameWindow.HTMLInputElement
        )
      ) {
        return;
      }
      if (submitter.type.toLowerCase() !== "submit") return;
      dispatchSubmission(event, submitter);
    };
    form.addEventListener("submit", handleSubmit);
    form.addEventListener("click", handleClick);
    cleanups.push(() => {
      form.removeEventListener("submit", handleSubmit);
      form.removeEventListener("click", handleClick);
    });
  }

  return () => {
    for (const cleanup of cleanups) cleanup();
  };
}
