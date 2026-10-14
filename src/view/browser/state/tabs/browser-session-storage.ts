import { getStore2String, setStore2String } from "src/app/Store2Storage";

export const BROWSER_SESSION_STORAGE_KEY = "chlens_browser_session";

export function getBrowserSessionJson(): string | null {
  return getStore2String(BROWSER_SESSION_STORAGE_KEY);
}

export function setBrowserSessionJson(value: string): Promise<void> {
  return setStore2String(BROWSER_SESSION_STORAGE_KEY, value);
}
