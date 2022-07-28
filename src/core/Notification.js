/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS206: Consider reworking classes to avoid initClass
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
let Notification;
export default Notification = (function() {
  let createNotification = undefined;
  Notification = class Notification {
    static initClass() {
  
      createNotification = (title, message, tag) => new window.Notification(
        title,
        {
          tag,
          body: message,
          icon: "../img/read.crx_128x128.png"
        }
      );
    }
    constructor(title, message, url, tag) {
      this.title = title;
      this.message = message;
      this.url = url;
      this.tag = tag;
      this.notify = null;
      if (window.Notification.permission === "granted") {
        this.notify = createNotification(this.title, this.message, this.tag);
      } else {
        window.Notification.requestPermission( function(permission) {
          if (permission === "granted") {
            return this.notify = createNotification(this.title, this.message, this.tag);
          }
        });
      }
      if (this.notify && (this.url !== "")) {
        this.notify.on("click", async () => {
          const tab = await browser.tabs.getCurrent();
          browser.tabs.update(tab.id, {active: true});
          app.message.send("open", {url: this.url});
          this.notify.close();
        });
      }
    }
  };
  Notification.initClass();
  return Notification;
})();
