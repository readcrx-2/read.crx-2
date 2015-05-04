describe "app.Config", ->
  config = null
  onReady = null
  tmpOnReadyCalled = null

  beforeEach ->
    ready = false

    localStorage.setItem("config____test_migration0", "65f70232")
    localStorage.setItem("config____test_migration1", "994105d3")
    localStorage.setItem("config____test_migration2", "82de3cb1")

    spyOn(chrome.storage.local, "get").andCallFake (key, callback) ->
      get = chrome.storage.local.get
      get.originalValue.call get.baseObj, key, (res) ->
        res.config____test_get0 = "6b2154b9"
        res.config____test_get1 = "e3d91a5f"
        callback(res)
        return
      return

    app.config.destroy()
    config = new app.Config()
    config.ready ->
      ready = true
      return
    app.config = config

    onReady = jasmine.createSpy("onReady")
    config.ready(onReady)
    tmpOnReadyCalled = onReady.wasCalled

    waitsFor -> ready
    return

  afterEach ->
    removed = false

    remove = chrome.storage.local.remove.originalValue
    remove ?= chrome.storage.local.remove

    remove.call chrome.storage.local, [
      "config____test_migration0"
      "config____test_migration1"
      "config____test_migration2"
      "config____test_message"
    ], ->
      removed = true
      return

    waitsFor -> removed
    return

  it "chrome.storage.localから設定値を読み込み、内部キャッシュに保存する", ->
    waitsFor ->
      onReady.wasCalled

    runs ->
      expect(config.get("___test_get0")).toBe("6b2154b9")
      expect(config.get("___test_get1")).toBe("e3d91a5f")
      return
    return

  it "localStorage内にconfig_で始まるキーを見つけた場合、それを削除しchrome.storageに移動する", ->
    expect(config.get("___test_migration0")).toBe("65f70232")
    expect(localStorage.getItem("config____test_migration0")).toBeNull()
    expect(config.get("___test_migration1")).toBe("994105d3")
    expect(localStorage.getItem("config____test_migration1")).toBeNull()
    expect(config.get("___test_migration2")).toBe("82de3cb1")
    expect(localStorage.getItem("config____test_migration2")).toBeNull()

    callback = jasmine.createSpy("callback")
    get = chrome.storage.local.get
    get.originalValue.call(get.baseObj, [
      "config____test_migration0"
      "config____test_migration1"
      "config____test_migration2"
    ], callback)

    waitsFor -> callback.wasCalled

    runs ->
      expect(callback).toHaveBeenCalledWith({
        "config____test_migration0": "65f70232"
        "config____test_migration1": "994105d3"
        "config____test_migration2": "82de3cb1"
      })
      return
    return

  it "chrome.storage.onChangedイベントを監視し、内部キャッシュを更新する", ->
    # 追加
    chrome.storage.local.set("config____test_onchanged": "890")

    waitsFor -> config.get("___test_onchanged")?

    runs ->
      expect(config.get("___test_onchanged")).toBe("890")
      return

    # 変更
    runs ->
      chrome.storage.local.set("config____test_onchanged": "901")
      return

    waitsFor -> config.get("___test_onchanged") is "901"

    runs ->
      expect(config.get("___test_onchanged")).toBe("901")
      return

    # 削除
    runs ->
      chrome.storage.local.remove("config____test_onchanged")
      return

    waitsFor -> not config.get("___test_onchanged")?

    runs ->
      expect(config.get("___test_onchanged")).toBeUndefined()
      return
    return

  it "設定値のキャッシュ更新時に、config_updatedメッセージを送出する", ->
    ready = false
    onMessage = jasmine.createSpy("onMessage")
    app.message.add_listener("config_updated", onMessage)

    # 削除
    runs ->
      chrome.storage.local.remove "config____test_message", ->
        ready = true
        return
      return

    waitsFor -> ready

    # 追加
    runs ->
      chrome.storage.local.set("config____test_message": "890")
      return

    waitsFor -> onMessage.callCount is 1

    runs ->
      expect(onMessage.callCount).toBe(1)
      expect(onMessage).toHaveBeenCalledWith(key: "___test_message", val: "890")
      return

    # 変更
    runs ->
      chrome.storage.local.set("config____test_message": "234")
      return

    waitsFor -> onMessage.callCount is 2

    runs ->
      expect(onMessage.callCount).toBe(2)
      expect(onMessage).toHaveBeenCalledWith(key: "___test_message", val: "234")
      return
    return

  describe "config.ready", ->
    it "初回ロード完了時にcallされる", ->
      expect(tmpOnReadyCalled).toBeFalsy()

      waitsFor -> onReady.wasCalled

      runs ->
        expect(onReady).toHaveBeenCalled()
      return
    return

  describe "::get", ->
    it "内部キャッシュから設定値を返す", ->
      config._cache.config____test_cache = "567"

      expect(config.get("___test_cache")).toBe("567")

      delete config._cache.config____test_cache
      return

    it "内部キャッシュに設定値が存在しない場合、デフォルト設定を返す", ->
      app.Config._default.___test_default = "2012"

      expect(config.get("___test_default")).toBe("2012")

      delete app.Config._default.___test_default
      return

    it "内部キャッシュにもデフォルト設定にも値が無い場合、undefinedを返す", ->
      expect(config.get("___test_default")).toBeUndefined()
      return
    return

  describe "::set", ->
    it "設定値をchrome.storage.localに保存する", ->
      spyOn(chrome.storage.local, "set")

      config.set("___test_set", "test")

      waitsFor -> chrome.storage.local.set.wasCalled

      runs ->
        expect(chrome.storage.local.set.callCount).toBe(1)
        expect(chrome.storage.local.set)
          .toHaveBeenCalledWith({"config____test_set": "test"})
        return
      return
    return

  describe "::del", ->
    it "chrome.storage上から設定値を削除する", ->
      spyOn(chrome.storage.local, "remove")

      config.del("___test_del")

      waitsFor -> chrome.storage.local.remove.wasCalled

      runs ->
        expect(chrome.storage.local.remove.callCount).toBe(1)
        expect(chrome.storage.local.remove)
          .toHaveBeenCalledWith("config____test_del")
        return
      return
    return
  return
