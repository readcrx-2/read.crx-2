/*
 * decaffeinate suggestions:
 * DS205: Consider reworking code to avoid use of IIFEs
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
app.boot("/zombie.html", function() {
  const close = async function() {
    const {id} = await browser.tabs.getCurrent();
    await browser.runtime.sendMessage({type: "zombie_done"});
    await browser.tabs.remove(id);
    // Vivaldiで閉じないことがあるため遅延してもう一度閉じる
    setTimeout( async function() {
      await browser.tabs.remove(id);
    }
    , 1000);
  };

  const save = async function() {
    let rs;
    const arrayOfReadState = JSON.parse(localStorage.zombie_read_state);

    app.bookmark = new app.Bookmark(app.config.get("bookmark_id"));

    try {
      await app.bookmark.promiseFirstScan;

      const rsarray = ((() => {
        const result = [];
        for (rs of arrayOfReadState) {           result.push(app.ReadState.set(rs).catch(function() {  }));
        }
        return result;
      })());
      const bkarray = ((() => {
        const result1 = [];
        for (rs of arrayOfReadState) {           result1.push(app.bookmark.updateReadState(rs));
        }
        return result1;
      })());
      await Promise.all(rsarray.concat(bkarray));
    } catch (error) {}

    await app.LocalStorage.del("zombie_read_state");

    close();

    delete localStorage.zombie_read_state;
  };

  browser.runtime.sendMessage({type: "zombie_ping"});

  let alreadyRun = false;
  browser.runtime.onMessage.addListener( function({type}) {
    if (alreadyRun || (type !== "rcrx_exit")) { return; }
    alreadyRun = true;
    if (localStorage.zombie_read_state != null) {
      const $script = $__("script");
      $script.on("load", save);
      $script.src = "/app_core.js";
      document.head.addLast($script);
    } else {
      close();
    }
  });
});