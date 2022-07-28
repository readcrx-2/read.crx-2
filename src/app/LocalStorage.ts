export default class LocalStorage {
  static async get(key: string, isJson = false): Promise<string | null> {
    const val = await browser.storage.local.get(key);
    if (!val[key]) return null;

    if (isJson) {
      return JSON.parse(<string>val[key]);
    }
    return <string>val[key];
  }

  static async getAll(): Promise<Record<string, string | number>> {
    return await browser.storage.local.get(null);
  }

  static async set(key: string, val: string, isJson = false) {
    const obj: Record<string, string> = {};
    obj[key] = isJson ? JSON.stringify(val) : val;
    await browser.storage.local.set(obj);
  }

  static async del(key: string) {
    await browser.storage.local.remove(key);
  }
}
