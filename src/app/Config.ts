import Callbacks from "./Callbacks";
import message from "./Message";
import {log, assertArg} from "./Log";

export default class Config {
  private static readonly _default: ReadonlyMap<string, string> = new Map([
    ["layout", "pane-3"],
    ["theme_id", "default"],
    ["default_scrollbar", "off"],
    ["write_window_x", "0"],
    ["write_window_y", "0"],
    ["always_new_tab", "on"],
    ["button_change_netsc_newtab", "off"],
    ["button_change_scheme_newtab", "off"],
    ["open_all_unread_lazy", "on"],
    ["enable_link_with_res_number", "on"],
    ["bookmark_sort_save_type", "none"],
    ["dblclick_reload", "on"],
    ["auto_load_second", "0"],
    ["auto_load_second_board", "0"],
    ["auto_load_second_bookmark", "0"],
    ["auto_load_all", "off"],
    ["auto_load_move", "off"],
    ["auto_bookmark_notify", "on"],
    ["manual_image_load", "off"],
    ["image_blur", "off"],
    ["image_blur_length", "4"],
    ["image_blur_word", ".{0,5}[^ァ-ヺ^ー]グロ(?:[^ァ-ヺ^ー].{0,5}|$)|.{0,5}死ね.{0,5}"],
    ["image_width", "150"],
    ["image_height", "100"],
    ["audio_supported", "off"],
    ["audio_supported_ogg", "off"],
    ["audio_width", "320"],
    ["video_supported", "off"],
    ["video_supported_ogg", "off"],
    ["video_controls", "on"],
    ["video_width", "360"],
    ["video_height", "240"],
    ["hover_zoom_image", "off"],
    ["zoom_ratio_image", "200"],
    ["hover_zoom_video", "off"],
    ["zoom_ratio_video", "200"],
    ["image_height_fix", "on"],
    ["delay_scroll_time", "600"],
    ["expand_short_url", "none"],
    ["expand_short_url_timeout", "3000"],
    ["aa_font", "aa"],
    ["aa_min_ratio", "40"],
    ["popup_trigger", "click"],
    ["popup_delay_time", "0"],
    ["ngwords", "Title: 5ちゃんねるへようこそ\nTitle:【新着情報】5chブラウザがやってきた！"],
    ["ngobj", "[{\"type\":\"Title\",\"word\":\"5ちゃんねるへようこそ\"},{\"type\":\"Title\",\"word\":\"【新着情報】5chぶらうざがやってきた！\"}]"],
    ["chain_ng", "off"],
    ["chain_ng_id", "off"],
    ["chain_ng_id_by_chain", "off"],
    ["chain_ng_slip", "off"],
    ["chain_ng_slip_by_chain", "off"],
    ["display_ng", "off"],
    ["nothing_id_ng", "off"],
    ["nothing_slip_ng", "off"],
    ["how_to_judgment_id", "first_res"],
    ["repeat_message_ng_count", "0"],
    ["forward_link_ng", "off"],
    ["ng_id_expire", "none"],
    ["ng_id_expire_date", "0"],
    ["ng_id_expire_day", "0"],
    ["ng_slip_expire", "none"],
    ["ng_slip_expire_date", "0"],
    ["ng_slip_expire_day", "0"],
    ["reject_ng_rep", "off"],
    ["bookmark_show_dat", "on"],
    ["default_name", ""],
    ["default_mail", ""],
    ["no_history", "off"],
    ["no_writehistory", "off"],
    ["user_css", ""],
    ["bbsmenu", "https://menu.5ch.net/bbsmenu.html\nhttps://menu.2ch.sc/bbsmenu.html\nhttps://menu.open2ch.net/bbsmenu.html\n"],
    ["bbsmenu_update_interval", "7"],
    ["bbsmenu_option", ""],
    ["useragent", ""],
    ["format_2chnet", "html"],
    ["sage_flag", "on"],
    ["mousewheel_change_tab", "on"],
    ["image_replace_dat_obj", ""],
    ["image_replace_dat", "^https?:\\/\\/(?:www\\.youtube\\.com\\/watch\\?(?:.+&)?v=|youtu\\.be\\/)([\\w\\-]+).*\thttps://img.youtube.com/vi/$1/default.jpg\nhttp:\\/\\/(?:www\\.)?nicovideon?\\.jp\\/(?:(?:watch|thumb)(?:_naisho)?(?:\\?v=|\\/)|\\?p=)(?!am|fz)[a-z]{2}(\\d+)\thttp://tn-skr.smilevideo.jp/smile?i=$1\n\\.(png|jpe?g|gif|bmp|webp)([\\?#:].*)?$\t.$1$2"],
    ["replace_str_txt_obj", "[]"],
    ["replace_str_txt", ""]
  ]);

  private readonly _cache = new Map<string, string>();
  readonly ready: Function;
  private readonly _onChanged: Function;

  constructor() {
    const ready = new Callbacks();
    this.ready = ready.add.bind(ready);

    ( async () => {
      const res = await browser.storage.local.get(null);
      if (this._cache === null) {
        return;
      }

      for (const [key, val] of Object.entries(res)) {
        if (
          key.startsWith("config_") &&
          (typeof val === "string" || typeof val === "number")
        ) {
          this._cache.set(key, val.toString());
        }
      }
      ready.call();
    })();

    this._onChanged = (change, area) => {
      if (area !== "local") {
        return;
      }

      for (const [key, val] of Object.entries(change)) {
        if (!key.startsWith("config_")) continue;
        const {newValue} = <any>val;

        if (typeof newValue === "string") {
          this._cache.set(key, newValue);

          message.send("config_updated", {
            key: key.slice(7),
            val: newValue
          });
        } else {
          this._cache.delete(key);
        }
      }
    };

    browser.storage.onChanged.addListener(<any>this._onChanged);
  }

  get(key: string): string|null {
    if (this._cache.has(`config_${key}`)) {
      return this._cache.get(`config_${key}`);
    }
    if (Config._default.has(key)) {
      return Config._default.get(key);
    }
    return null;
  }

  getAll(): Record<string, string> {
    const object = {};
    for(const [key, val] of Config._default) {
      object[`config_${key}`] = val;
    }
    Object.assign(object, this._cache);
    return object;
  }

  isOn(key: string): boolean {
    return this.get(key) === "on";
  }

  async set(key: string, val: string) {
    if (
      typeof key !== "string" ||
      !(typeof val === "string" || typeof val === "number")
    ) {
      log("error", "app.Config::setに不適切な値が渡されました",
        arguments);
      throw new Error("app.Config::setに不適切な値が渡されました");
    }

    const tmp = {};
    tmp[`config_${key}`] = val;

    await browser.storage.local.set(tmp)
  }

  async del(key: string) {
    if (assertArg("app.Config::del", [[key, "string"]])) {
      throw new Error("app.Config::delにstring以外の値が渡されました");
    }

    await browser.storage.local.remove(`config_${key}`)
  }

  destroy() {
    this._cache.clear();
    browser.storage.onChanged.removeListener(<any>this._onChanged);
  }
}
