describe "app.Bookmark.ChromeBookmarkEntryList", ->
  ChromeBookmarkEntryList = app.Bookmark.ChromeBookmarkEntryList

  genFakeNodeId = do ->
    count = 0
    -> "FAKE_#{++count}"

  NOT_EXIST_NODE_ID = genFakeNodeId()
  TEST_FOLDER_NODE_ID = null
  testFolderIsReady = false

  dummyEntry = null

  beforeEach ->
    waitsFor ->
      testFolderIsReady

    dummyEntry =
      board0:
        url: "http://__dummy.2ch.net/dummy0/"
        type: "board"
        bbsType: "2ch"
        title: "board0"
        resCount: null
        readState: null
        expired: false
      thread0:
        url: "http://__dummy.2ch.net/test/read.cgi/dummy0/1234567890/"
        type: "thread"
        bbsType: "2ch"
        title: "thread0"
        resCount: 123
        readState: null
        expired: false
      thread1:
        url: "http://__dummy.2ch.net/test/read.cgi/dummy0/9999999999/"
        type: "thread"
        bbsType: "2ch"
        title: "thread1"
        resCount: 999
        readState:
          url: "http://__dummy.2ch.net/test/read.cgi/dummy0/9999999999/"
          received: 999
          read: 999
          last: 999
        expired: true
    return

  afterEach ->
    nodeCount = null

    chrome.bookmarks.getChildren TEST_FOLDER_NODE_ID, (arrayOfNode) ->
      nodeCount = arrayOfNode.length
      for node in arrayOfNode
        if node.url?
          chrome.bookmarks.remove(node.id, -> nodeCount--)
        else
          chrome.bookmarks.removeTree(node.id, -> nodeCount--)
      return

    waitsFor ->
      nodeCount is 0
    return

  createBookmark = (entries, parentId = TEST_FOLDER_NODE_ID) ->
    unless Array.isArray(entries)
      entries = [entries]

    onCreated = jasmine.createSpy("onCreated")
    results = []

    fn = (node) ->
      if node
        results.push(node)

      if target = entries.shift()
        entry = target

        chrome.bookmarks.create({
          parentId
          title: entry.title
          url: ChromeBookmarkEntryList.entryToURL(entry)
        }, fn)
      else
        onCreated()
      return

    fn()

    {onCreated, results}

  chrome.bookmarks.create(
    {title: "test folder for ChromeBookmarkEntryList"},
    (node) ->
      TEST_FOLDER_NODE_ID = node.id
      testFolderIsReady = true
      return
  )

  describe ".entryToURL", ->
    it "EntryをURLに変換する", ->
      # 板ブックマーク
      url = fixedURL = "http://__dummy.2ch.net/dummy/"
      entry =
        type: "board"
        bbsType: "2ch"
        url: fixedURL
        title: fixedURL
        resCount: null
        readState: null
        expired: false
      expect(ChromeBookmarkEntryList.entryToURL(entry)).toBe(url)

      # スレブックマーク
      url = fixedURL = "http://__dummy_server.2ch.net/test/read.cgi/__dummy_board/1234567890/"
      entry =
        type: "thread"
        bbsType: "2ch"
        url: fixedURL
        title: fixedURL
        resCount: null
        readState: null
        expired: false
      expect(ChromeBookmarkEntryList.entryToURL(entry)).toBe(url)

      # スレブックマーク（resCount）
      url = fixedURL + "#res_count=123"
      entry =
        type: "thread"
        bbsType: "2ch"
        url: fixedURL
        title: fixedURL
        resCount: 123
        readState: null
        expired: false
      expect(ChromeBookmarkEntryList.entryToURL(entry)).toBe(url)

      # スレブックマーク（readState）
      url = fixedURL + "#last=123&read=234&received=345"
      entry =
        type: "thread"
        bbsType: "2ch"
        url: fixedURL
        title: fixedURL
        resCount: null
        readState:
          url: fixedURL
          last: 123
          read: 234
          received: 345
        expired: false
      expect(ChromeBookmarkEntryList.entryToURL(entry)).toBe(url)

      # スレブックマーク（expired）
      url = fixedURL + "#expired"
      entry =
        type: "thread"
        bbsType: "2ch"
        url: fixedURL
        title: fixedURL
        resCount: null
        readState: null
        expired: true
      expect(ChromeBookmarkEntryList.entryToURL(entry)).toBe(url)

      # スレブックマーク(resCount + readState)
      entry =
        type: "thread"
        bbsType: "2ch"
        url: fixedURL
        title: fixedURL
        resCount: 456
        readState:
          url: fixedURL
          last: 123
          read: 234
          received: 345
        expired: false

      url = ChromeBookmarkEntryList.entryToURL(entry)

      expect(app.URL.parseHashQuery(url)).toEqual
        res_count: "456"
        last: "123"
        read: "234"
        received: "345"

      # スレブックマーク(readState + expired)
      entry =
        type: "thread"
        bbsType: "2ch"
        url: fixedURL
        title: fixedURL
        resCount: null
        readState:
          url: fixedURL
          last: 123
          read: 234
          received: 345
        expired: true

      url = ChromeBookmarkEntryList.entryToURL(entry)

      expect(app.URL.parseHashQuery(url)).toEqual
        last: "123"
        read: "234"
        received: "345"
        expired: true

      # スレブックマーク(resCount + readState + expired)
      entry =
        type: "thread"
        bbsType: "2ch"
        url: fixedURL
        title: fixedURL
        resCount: 456
        readState:
          url: fixedURL
          last: 123
          read: 234
          received: 345
        expired: true

      url = ChromeBookmarkEntryList.entryToURL(entry)

      expect(app.URL.parseHashQuery(url)).toEqual
        res_count: "456"
        last: "123"
        read: "234"
        received: "345"
        expired: true
      return
    return

  describe ".URLToEntry", ->
    it "URLからEntryを生成する", ->
      # 板URL
      url = fixedURL = "http://__dummy.2ch.net/dummy/"
      expect(ChromeBookmarkEntryList.URLToEntry(url)).toEqual
        type: "board"
        bbsType: "2ch"
        url: fixedURL
        title: fixedURL
        resCount: null
        readState: null
        expired: false

      # スレURL
      url = fixedURL = "http://__dummy_server.2ch.net/test/read.cgi/__dummy_board/1234567890/"
      expect(ChromeBookmarkEntryList.URLToEntry(url)).toEqual
        type: "thread"
        bbsType: "2ch"
        url: fixedURL
        title: fixedURL
        resCount: null
        readState: null
        expired: false

      # スレURL + res_count
      url = fixedURL + "#res_count=123"
      expect(ChromeBookmarkEntryList.URLToEntry(url)).toEqual
        type: "thread"
        bbsType: "2ch"
        url: fixedURL
        title: fixedURL
        resCount: 123
        readState: null
        expired: false

      # スレURL + 不正なres_count(Boolean)
      url = fixedURL + "#res_count"
      expect(ChromeBookmarkEntryList.URLToEntry(url)).toEqual
        type: "thread"
        bbsType: "2ch"
        url: fixedURL
        title: fixedURL
        resCount: null
        readState: null
        expired: false

      # スレURL + 不正なres_count(文字列)"
      url = fixedURL + "#res_count=dummy"
      expect(ChromeBookmarkEntryList.URLToEntry(url)).toEqual
        type: "thread"
        bbsType: "2ch"
        url: fixedURL
        title: fixedURL
        resCount: null
        readState: null
        expired: false

      # スレURL + read_state
      url = fixedURL + "#last=123&read=234&received=345"
      expect(ChromeBookmarkEntryList.URLToEntry(url)).toEqual
        type: "thread"
        bbsType: "2ch"
        url: fixedURL
        title: fixedURL
        resCount: null
        readState:
          url: fixedURL
          last: 123
          read: 234
          received: 345
        expired: false

      # スレURL + 不正なread_state（lastの値が文字列）
      url = fixedURL + "#last=test&read=234&received=345"
      expect(ChromeBookmarkEntryList.URLToEntry(url)).toEqual
        type: "thread"
        bbsType: "2ch"
        url: fixedURL
        title: fixedURL
        resCount: null
        readState: null
        expired: false

      # スレURL + 不正なread_state（lastが欠損）
      url = fixedURL + "#read=234&received=345"
      expect(ChromeBookmarkEntryList.URLToEntry(url)).toEqual
        type: "thread"
        bbsType: "2ch"
        url: fixedURL
        title: fixedURL
        resCount: null
        readState: null
        expired: false

      # スレURL + expired"
      url = fixedURL + "#expired"
      expect(ChromeBookmarkEntryList.URLToEntry(url)).toEqual
        type: "thread"
        bbsType: "2ch"
        url: fixedURL
        title: fixedURL
        resCount: null
        readState: null
        expired: true

      # スレURL + 不正なexpired(文字列のtrue)
      url = fixedURL + "#expired=true"
      expect(ChromeBookmarkEntryList.URLToEntry(url)).toEqual
        type: "thread"
        bbsType: "2ch"
        url: fixedURL
        title: fixedURL
        resCount: null
        readState: null
        expired: false

      # スレURL + 不正なexpired(文字列のfalse)
      url = fixedURL + "#expired=false"
      expect(ChromeBookmarkEntryList.URLToEntry(url)).toEqual
        type: "thread"
        bbsType: "2ch"
        url: fixedURL
        title: fixedURL
        resCount: null
        readState: null
        expired: false

      # スレURL + 不正なexpired(文字列)
      url = fixedURL + "#expired=123"
      expect(ChromeBookmarkEntryList.URLToEntry(url)).toEqual
        type: "thread"
        bbsType: "2ch"
        url: fixedURL
        title: fixedURL
        resCount: null
        readState: null
        expired: false

      # スレURL + res_count + read_state"
      url = fixedURL + "#res_count=456&last=123&read=234&received=345"
      expect(ChromeBookmarkEntryList.URLToEntry(url)).toEqual
        type: "thread"
        bbsType: "2ch"
        url: fixedURL
        title: fixedURL
        resCount: 456
        readState:
          url: fixedURL
          last: 123
          read: 234
          received: 345
        expired: false

      # スレURL + res_count + read_state + expired
      url = fixedURL + "#res_count=456&last=123&read=234&received=345&expired"
      expect(ChromeBookmarkEntryList.URLToEntry(url)).toEqual
        type: "thread"
        bbsType: "2ch"
        url: fixedURL
        title: fixedURL
        resCount: 456
        readState:
          url: fixedURL
          last: 123
          read: 234
          received: 345
        expired: true

      # スレURL + 無関係なオプション
      url = fixedURL + "123/?test=123#123"
      expect(ChromeBookmarkEntryList.URLToEntry(url)).toEqual
        type: "thread"
        bbsType: "2ch"
        url: fixedURL
        title: fixedURL
        resCount: null
        readState: null
        expired: false

      # スレURL + res_count + read_state + expired + 無関係なオプション
      url = fixedURL + "123/?test=123#res_count=456&last=123&read=234&received=345&expired"
      expect(ChromeBookmarkEntryList.URLToEntry(url)).toEqual
        type: "thread"
        bbsType: "2ch"
        url: fixedURL
        title: fixedURL
        resCount: 456
        readState:
          url: fixedURL
          last: 123
          read: 234
          received: 345
        expired: true
      return

    it "Entryに変換出来ない形式のURLが与えられた場合はnullを返す", ->
      url = "http://example.com/"
      expect(ChromeBookmarkEntryList.URLToEntry(url)).toBeNull()

      url = "ftp://__dummy.2ch.net/dummy/"
      expect(ChromeBookmarkEntryList.URLToEntry(url)).toBeNull()

      url = "dummy"
      expect(ChromeBookmarkEntryList.URLToEntry(url)).toBeNull()

      url = ""
      expect(ChromeBookmarkEntryList.URLToEntry(url)).toBeNull()
      return
    return

  describe "constructor", ->
    it "setRootNodeIdを実行する", ->
      spyOn(ChromeBookmarkEntryList::, "setRootNodeId")

      new ChromeBookmarkEntryList(TEST_FOLDER_NODE_ID)

      expect(ChromeBookmarkEntryList::setRootNodeId.callCount)
        .toBe(1)
      expect(ChromeBookmarkEntryList::setRootNodeId)
        .toHaveBeenCalledWith(TEST_FOLDER_NODE_ID)
      return
    return

  describe "::setRootNodeId", ->
    it ".rootNodeIdが存在しなかった場合、.needReconfigureRootNodeIdをcallする", ->
      callback = jasmine.createSpy("callback")

      cbel = new ChromeBookmarkEntryList(NOT_EXIST_NODE_ID)
      cbel.needReconfigureRootNodeId.add(callback)

      waitsFor ->
        callback.wasCalled

      runs ->
        expect(callback.callCount).toBe(1)
        return
      return

    it ".rootNodeIdがフォルダでなかった場合、.needReconfigureRootNodeIdをcallする", ->
      spyOn(chrome.bookmarks, "get").andCallFake (nodeId, callback) ->
        app.defer ->
          callback
            dateAdded: Date.now() - 1000
            id: nodeId
            index: 0
            parentId: "0"
            title: "example.com"
            url: "http://example.com/"
          return
        return

      callback = jasmine.createSpy("callback")

      cbel = new ChromeBookmarkEntryList(NOT_EXIST_NODE_ID)
      cbel.needReconfigureRootNodeId.add(callback)

      waitsFor ->
        callback.wasCalled

      runs ->
        expect(callback.callCount).toBe(1)
        return
      return

    it "::loadFromChromeBookmarkを実行する", ->
      spyOn(ChromeBookmarkEntryList::, "loadFromChromeBookmark")

      new ChromeBookmarkEntryList(TEST_FOLDER_NODE_ID)

      expect(ChromeBookmarkEntryList::loadFromChromeBookmark.callCount)
        .toBe(1)
      return
    return

  describe "::loadFromChromeBookmark", ->
    it "ブックマークを取得し、EntryListにデータを反映する", ->
      onCreated = createBookmark(dummyEntry.board0).onCreated
      cbel = null

      waitsFor ->
        onCreated.wasCalled

      runs ->
        cbel = new ChromeBookmarkEntryList(TEST_FOLDER_NODE_ID)
        spyOn(cbel, "add")
        return

      waitsFor ->
        cbel.ready.wasCalled

      runs ->
        expect(cbel.add.callCount).toBe(1)
        expect(cbel.add).toHaveBeenCalledWith(dummyEntry.board0, false)
        return
      return

    it "実行時、EntryListの既存のEntryは全てEntryListからのみ削除される", ->
      cbel = new ChromeBookmarkEntryList(TEST_FOLDER_NODE_ID)

      waitsFor ->
        cbel.ready.wasCalled

      runs ->
        spyOn(cbel, "createChromeBookmark")
        spyOn(cbel, "remove")
        cbel.add(dummyEntry.thread0)
        cbel.loadFromChromeBookmark()

        expect(cbel.remove.callCount).toBe(1)
        expect(cbel.remove).toHaveBeenCalledWith(dummyEntry.thread0.url, false)
        return
      return

    it """
      同じスレ/板のブックマークが重複していた時、新しいと思われる方のデータのみ
      を使用する
    """, ->
      entries = []

      entry = app.deepCopy(dummyEntry.thread1)
      entry.resCount++
      entry.readState.received++
      entries.push(entry)
      expected = entry

      entry = app.deepCopy(dummyEntry.thread1)
      entries.push(entry)

      entry = app.deepCopy(dummyEntry.thread1)
      entry.resCount++
      entries.push(entry)

      createBookmark(entries)

      cbel = new ChromeBookmarkEntryList(TEST_FOLDER_NODE_ID)

      waitsFor ->
        cbel.ready.wasCalled

      runs ->
        expect(cbel.getAll()).toEqual([expected])
        return
      return
    return

  describe "createChromeBookmark", ->
    it "与えられたentryを表すブックマークを作成する", ->
      cbel = new ChromeBookmarkEntryList(TEST_FOLDER_NODE_ID)

      spyOn(chrome.bookmarks, "create")

      cbel.createChromeBookmark(dummyEntry.board0)

      expect(chrome.bookmarks.create.callCount).toBe(1)
      expect(chrome.bookmarks.create.mostRecentCall.args[0]).toEqual
        parentId: TEST_FOLDER_NODE_ID
        title: dummyEntry.board0.title
        url: dummyEntry.board0.url

      cbel.createChromeBookmark(dummyEntry.thread0)

      expect(chrome.bookmarks.create.callCount).toBe(2)
      expect(chrome.bookmarks.create.mostRecentCall.args[0]).toEqual
        parentId: TEST_FOLDER_NODE_ID
        title: dummyEntry.thread0.title
        url: ChromeBookmarkEntryList.entryToURL(dummyEntry.thread0)
      return
    return

  describe "updateChromeBookmark", ->
    it "与えられたentryに対応するブックマークが存在しない場合は失敗する", ->
      spyOn(chrome.bookmarks, "update")

      callback = jasmine.createSpy("callback")

      cbel = new ChromeBookmarkEntryList(TEST_FOLDER_NODE_ID)
      cbel.updateChromeBookmark(dummyEntry.board0, callback)

      expect(callback.callCount).toBe(1)
      expect(callback).toHaveBeenCalledWith(false)
      expect(chrome.bookmarks.update).not.toHaveBeenCalled()
      return

    it "与えられたentryに従い、既存のブックマークを更新する", ->
      spyOn(chrome.bookmarks, "update").andCallThrough()

      onCreated = jasmine.createSpy("onCreated")

      chrome.bookmarks.onCreated.addListener (nodeId, node) ->
        if node.url is dummyEntry.board0.url
          onCreated()
        return

      updateCallback = jasmine.createSpy("updateCallback")

      cbel = new ChromeBookmarkEntryList(TEST_FOLDER_NODE_ID)
      cbel.createChromeBookmark(dummyEntry.board0)

      waitsFor ->
        onCreated.wasCalled

      runs ->
        dummyEntry.board0.title += "_modified"
        cbel.updateChromeBookmark(dummyEntry.board0, updateCallback)
        return

      waitsFor ->
        updateCallback.wasCalled

      runs ->
        expect(updateCallback.callCount).toBe(1)
        expect(updateCallback).toHaveBeenCalledWith(true)

        expect(chrome.bookmarks.update.callCount).toBe(1)
        expect(chrome.bookmarks.update).toHaveBeenCalledWith(
          jasmine.any(String)
          {title: dummyEntry.board0.title}
          jasmine.any(Function)
        )
        return
      return

    it "必要の無い時はブックマーク更新処理を実行しない", ->
      spyOn(chrome.bookmarks, "update").andCallThrough()

      onCreated = createBookmark(dummyEntry.board0).onCreated

      updateCallback = jasmine.createSpy("updateCallback")

      cbel = new ChromeBookmarkEntryList(TEST_FOLDER_NODE_ID)

      waitsFor ->
        onCreated.wasCalled

      runs ->
        cbel.updateChromeBookmark(dummyEntry.board0, updateCallback)
        return

      waitsFor ->
        updateCallback.wasCalled

      runs ->
        expect(updateCallback.callCount).toBe(1)
        expect(updateCallback).toHaveBeenCalledWith(true)

        expect(chrome.bookmarks.update).not.toHaveBeenCalled()
        return
      return
    return

  describe "removeChromeBookmark", ->
    it "与えられたURLに対応するブックマークが存在しない場合は失敗する", ->
      spyOn(chrome.bookmarks, "remove").andCallThrough()

      callback = jasmine.createSpy("callback")

      cbel = new ChromeBookmarkEntryList(TEST_FOLDER_NODE_ID)
      cbel.updateChromeBookmark(dummyEntry.board0, callback)

      expect(callback.callCount).toBe(1)
      expect(callback).toHaveBeenCalledWith(false)
      expect(chrome.bookmarks.remove).not.toHaveBeenCalled()
      return

    it "与えられたURLに対応するブックマークを全て削除する", ->
      spyOn(chrome.bookmarks, "remove").andCallThrough()

      targetNodeId0 = null
      targetNodeId1 = null
      removeCallback = jasmine.createSpy("removeCallback")

      cbel = new ChromeBookmarkEntryList(TEST_FOLDER_NODE_ID)

      dummyEntry.thread0.url = dummyEntry.thread1.url
      res = createBookmark([dummyEntry.thread0, dummyEntry.thread1])

      waitsFor ->
        res.onCreated.wasCalled

      runs ->
        targetNodeId0 = res.results[0].id
        targetNodeId1 = res.results[1].id
        cbel.removeChromeBookmark(dummyEntry.thread0.url, removeCallback)
        return

      waitsFor ->
        removeCallback.wasCalled

      runs ->
        expect(removeCallback.callCount).toBe(1)
        expect(removeCallback).toHaveBeenCalledWith(true)

        expect(chrome.bookmarks.remove.callCount).toBe(2)
        expect(chrome.bookmarks.remove).toHaveBeenCalledWith(
          targetNodeId0
          jasmine.any(Function)
        )
        expect(chrome.bookmarks.remove).toHaveBeenCalledWith(
          targetNodeId1
          jasmine.any(Function)
        )
        return
      return
    return

  describe "監視ノード直下にブックマークが作成された時", ->
    it "addを呼び、createChromeBookmarkは呼ばない", ->
      cbel = new ChromeBookmarkEntryList(TEST_FOLDER_NODE_ID)

      spyOn(cbel, "add").andCallThrough()
      spyOn(cbel, "createChromeBookmark")

      createBookmark(dummyEntry.board0)

      waitsFor ->
        cbel.add.wasCalled

      runs ->
        expect(cbel.add.callCount).toBe(1)
        expect(cbel.add).toHaveBeenCalledWith(dummyEntry.board0, false)
        expect(cbel.createChromeBookmark).not.toHaveBeenCalled()
        return
      return
    return

  describe "監視ノード直下以外の場所にブックマークが作成された時", ->
    it "何もしない（addを呼ばない）", ->
      cbel = new ChromeBookmarkEntryList(TEST_FOLDER_NODE_ID)
      spyOn(cbel, "add")
      onCreated = {}

      chrome.bookmarks.create({
        parentId: TEST_FOLDER_NODE_ID
        title: "test folder"
      }, (node) ->
        onCreated = createBookmark(dummyEntry.board0, node.id).onCreated
        return
      )

      waitsFor ->
        onCreated.wasCalled

      runs ->
        expect(cbel.add).not.toHaveBeenCalled()
        return
      return
    return

  describe "監視ノード直下のブックマークが更新された時", ->
    targetNode = null

    beforeEach ->
      tmp = createBookmark(dummyEntry.thread0)

      waitsFor ->
        tmp.onCreated.wasCalled

      runs ->
        targetNode = tmp.results[0]
        return
      return

    describe "タイトル更新時", ->
      it "updateを呼び、updateChromeBookmarkは呼ばない", ->
        cbel = new ChromeBookmarkEntryList(TEST_FOLDER_NODE_ID)
        spyOn(cbel, "update").andCallThrough()
        spyOn(cbel, "updateChromeBookmark")

        dummyEntry.thread0.title += "_modified"

        chrome.bookmarks.update(targetNode.id, title: dummyEntry.thread0.title)

        waitsFor ->
          cbel.update.wasCalled

        runs ->
          expect(cbel.update.callCount).toBe(1)
          expect(cbel.update).toHaveBeenCalledWith(dummyEntry.thread0, false)
          expect(cbel.updateChromeBookmark).not.toHaveBeenCalled()
          return
        return
      return

    describe "URL更新時", ->
      it "パラメータを更新する", ->
        cbel = new ChromeBookmarkEntryList(TEST_FOLDER_NODE_ID)
        spyOn(cbel, "update").andCallThrough()
        spyOn(cbel, "updateChromeBookmark")

        dummyEntry.thread0.resCount++

        chrome.bookmarks.update(
          targetNode.id
          url: ChromeBookmarkEntryList.entryToURL(dummyEntry.thread0)
        )

        waitsFor ->
          cbel.update.wasCalled

        runs ->
          expect(cbel.update.callCount).toBe(1)
          expect(cbel.update).toHaveBeenCalledWith(dummyEntry.thread0, false)
          expect(cbel.updateChromeBookmark).not.toHaveBeenCalled()
          return
        return
      return

    describe "別のスレ/板へのURL変更時", ->
      it "旧URLのentryを削除し、新URLのentryを追加する", ->
        cbel = new ChromeBookmarkEntryList(TEST_FOLDER_NODE_ID)

        waitsFor ->
          cbel.ready.wasCalled

        runs ->
          spyOn(cbel, "add").andCallThrough()
          spyOn(cbel, "update").andCallThrough()
          spyOn(cbel, "remove").andCallThrough()
          spyOn(cbel, "createChromeBookmark")
          spyOn(cbel, "updateChromeBookmark")
          spyOn(cbel, "removeChromeBookmark")

          dummyEntry.thread0.resCount++

          chrome.bookmarks.update(
            targetNode.id
            url: ChromeBookmarkEntryList.entryToURL(dummyEntry.thread1)
          )

          dummyEntry.thread1.title = dummyEntry.thread0.title
          return

        waitsFor ->
          cbel.add.wasCalled and cbel.remove.wasCalled

        runs ->
          expect(cbel.add.callCount).toBe(1)
          expect(cbel.add).toHaveBeenCalledWith(dummyEntry.thread1, false)

          expect(cbel.update).not.toHaveBeenCalled()

          expect(cbel.remove.callCount).toBe(1)
          expect(cbel.remove).toHaveBeenCalledWith(dummyEntry.thread0.url, false)

          expect(cbel.createChromeBookmark).not.toHaveBeenCalled()
          expect(cbel.updateChromeBookmark).not.toHaveBeenCalled()
          expect(cbel.removeChromeBookmark).not.toHaveBeenCalled()
          return
        return
      return
    return

  describe "監視ノード直下以外のブックマークが更新された時", ->
    it "何もしない", ->
      targetNode = null

      cbel = new ChromeBookmarkEntryList(TEST_FOLDER_NODE_ID)

      spyOn(cbel, "update")
      onChanged = jasmine.createSpy("onChanged")

      chrome.bookmarks.onChanged.addListener (nodeId, changeInfo) ->
        if nodeId is targetNode.id
          onChanged()
        return

      chrome.bookmarks.create({
        parentId: TEST_FOLDER_NODE_ID
        title: "test folder"
      }, (node) ->
        chrome.bookmarks.create({
          parentId: node.id
          title: dummyEntry.board0.title
          url: dummyEntry.board0.url
        }, (node) ->
          targetNode = node

          dummyEntry.board0.title += "_modified"

          chrome.bookmarks.update(
            targetNode.id,
            title: dummyEntry.board0.title
          )
          return
        )
        return
      )

      waitsFor ->
        onChanged.wasCalled

      runs ->
        expect(cbel.update).not.toHaveBeenCalled()
        return
      return
    return

  describe "監視ノード直下のブックマークが削除された時", ->
    it "removeを呼び、removeChromeBookmarkは呼ばない", ->
      targetNode = null

      cbel = new ChromeBookmarkEntryList(TEST_FOLDER_NODE_ID)

      spyOn(cbel, "add").andCallThrough()
      spyOn(cbel, "remove").andCallThrough()
      spyOn(cbel, "removeChromeBookmark").andCallThrough()

      chrome.bookmarks.create({
        parentId: TEST_FOLDER_NODE_ID
        title: dummyEntry.board0.title
        url: dummyEntry.board0.url
      }, (node) ->
        targetNode = node
        return
      )

      waitsFor ->
        cbel.add.wasCalled

      runs ->
        chrome.bookmarks.remove(targetNode.id)
        return

      waitsFor ->
        cbel.remove.wasCalled

      runs ->
        expect(cbel.remove.callCount).toBe(1)
        expect(cbel.remove).toHaveBeenCalledWith(dummyEntry.board0.url, false)
        expect(cbel.removeChromeBookmark).not.toHaveBeenCalled()
        return
      return
    return

  describe "監視ノード直下以外のブックマークが削除された時", ->
    it "何もしない（removeを呼ばない）", ->
      targetNode = null

      cbel = new ChromeBookmarkEntryList(TEST_FOLDER_NODE_ID)

      spyOn(cbel, "remove")
      onRemoved = jasmine.createSpy("onRemoved")

      chrome.bookmarks.onRemoved.addListener (nodeId, removeInfo) ->
        if nodeId is targetNode.id
          onRemoved()
        return

      chrome.bookmarks.create({
        parentId: TEST_FOLDER_NODE_ID
        title: "test folder"
      }, (node) ->
        chrome.bookmarks.create({
          parentId: node.id
          title: dummyEntry.board0.title
          url: dummyEntry.board0.url
        }, (node) ->
          targetNode = node

          chrome.bookmarks.remove(targetNode.id)
          return
        )
        return
      )

      waitsFor ->
        onRemoved.wasCalled

      runs ->
        expect(cbel.remove).not.toHaveBeenCalled()
        return
      return
    return

  describe "監視ノード直下にブックマークが移動してきた時", ->
    folderId = null

    beforeEach ->
      folderId = null

      chrome.bookmarks.create(
        {title: "folder"}
        (node) ->
          folderId = node.id
          return
      )

      waitsFor ->
        typeof folderId is "string"
      return

    it "作成時と同じ扱いにする", ->
      tmp = createBookmark(dummyEntry.thread0, folderId)
      cbel = null

      waitsFor ->
        tmp.onCreated.wasCalled

      runs ->
        cbel = new ChromeBookmarkEntryList(TEST_FOLDER_NODE_ID)
        spyOn(cbel, "add")
        chrome.bookmarks.move(tmp.results[0].id, parentId: TEST_FOLDER_NODE_ID)
        return

      waitsFor ->
        cbel.add.wasCalled

      runs ->
        expect(cbel.add.callCount).toBe(1)
        expect(cbel.add).toHaveBeenCalledWith(dummyEntry.thread0, false)
        return
      return
    return

  describe "監視ノード直下からブックマークが移動した時", ->
    folderId = null

    beforeEach ->
      folderId = null

      chrome.bookmarks.create(
        {title: "folder"}
        (node) ->
          folderId = node.id
          return
      )

      waitsFor ->
        typeof folderId is "string"
      return

    it "削除時と同じ扱いにする", ->
      tmp = createBookmark(dummyEntry.thread0, TEST_FOLDER_NODE_ID)
      cbel = null

      waitsFor ->
        tmp.onCreated.wasCalled

      runs ->
        cbel = new ChromeBookmarkEntryList(TEST_FOLDER_NODE_ID)
        return

      waitsFor ->
        cbel.ready.wasCalled

      runs ->
        spyOn(cbel, "remove")
        chrome.bookmarks.move(tmp.results[0].id, parentId: folderId)
        return

      waitsFor ->
        cbel.remove.wasCalled

      runs ->
        expect(cbel.remove.callCount).toBe(1)
        expect(cbel.remove).toHaveBeenCalledWith(dummyEntry.thread0.url, false)
        return
      return
      return
    return

  describe "EntryListにEntryがaddされた時", ->
    it "createChromeBookmarkを呼び、onCreatedによるaddは呼ばない", ->
      cbel = new ChromeBookmarkEntryList(TEST_FOLDER_NODE_ID)

      onCreated = jasmine.createSpy("onCreated")

      chrome.bookmarks.onCreated.addListener (nodeId, node) ->
        if node.url is dummyEntry.board0.url
          onCreated()
        return

      waitsFor ->
        cbel.ready.wasCalled

      runs ->
        spyOn(cbel, "add").andCallThrough()
        spyOn(cbel, "createChromeBookmark").andCallThrough()
        cbel.add(dummyEntry.board0)
        return

      waitsFor ->
        onCreated.wasCalled

      runs ->
        expect(cbel.add.callCount).toBe(1)
        expect(cbel.createChromeBookmark.callCount).toBe(1)
        expect(cbel.createChromeBookmark)
          .toHaveBeenCalledWith(dummyEntry.board0)
        return
      return
    return

  describe "EntryListのEntryがupdateされた時", ->
    it "updateChromeBookmarkを呼び、onChangedによるupdateは呼ばない", ->
      createBookmarkRes = null

      cbel = new ChromeBookmarkEntryList(TEST_FOLDER_NODE_ID)

      onChanged = jasmine.createSpy("onChanged")

      chrome.bookmarks.onChanged.addListener (nodeId, changeInfo) ->
        if nodeId is createBookmarkRes.results[0].id
          onChanged()
        return

      waitsFor ->
        cbel.ready.wasCalled

      runs ->
        createBookmarkRes = createBookmark(dummyEntry.board0)
        return

      waitsFor ->
        createBookmarkRes.onCreated.wasCalled

      runs ->
        dummyEntry.board0.title += "_modified"
        spyOn(cbel, "update").andCallThrough()
        spyOn(cbel, "updateChromeBookmark").andCallThrough()

        cbel.update(dummyEntry.board0)
        return

      waitsFor ->
        onChanged.wasCalled

      runs ->
        expect(cbel.update.callCount).toBe(1)
        expect(cbel.updateChromeBookmark.callCount).toBe(1)
        expect(cbel.updateChromeBookmark)
          .toHaveBeenCalledWith(dummyEntry.board0)
        return
      return
    return

  describe "EntryListのEntryがremoveされた時", ->
    it "removeChromeBookmarkを呼び、onRemovedによるremoveは呼ばない", ->
      createBookmarkRes = null

      cbel = new ChromeBookmarkEntryList(TEST_FOLDER_NODE_ID)

      onRemoved = jasmine.createSpy("onRemoved")

      chrome.bookmarks.onRemoved.addListener (nodeId, removeInfo) ->
        if nodeId is createBookmarkRes.results[0].id
          onRemoved()
        return

      waitsFor ->
        cbel.ready.wasCalled

      runs ->
        createBookmarkRes = createBookmark(dummyEntry.board0)
        return

      waitsFor ->
        createBookmarkRes.onCreated.wasCalled

      runs ->
        spyOn(cbel, "remove").andCallThrough()
        spyOn(cbel, "removeChromeBookmark").andCallThrough()

        cbel.remove(dummyEntry.board0.url)
        return

      waitsFor ->
        onRemoved.wasCalled

      runs ->
        expect(cbel.remove.callCount).toBe(1)
        expect(cbel.removeChromeBookmark.callCount).toBe(1)
        expect(cbel.removeChromeBookmark)
          .toHaveBeenCalledWith(dummyEntry.board0.url)
        return
      return
    return

  describe "addによるブックマーク作成完了後にremoveを行った場合", ->
    it "特に問題なし", ->
      createCallback = jasmine.createSpy("createCallback")
      removeCallback = jasmine.createSpy("removeCallback")

      cbel = new ChromeBookmarkEntryList(TEST_FOLDER_NODE_ID)

      spyOn(cbel, "createChromeBookmark").andCallFake (entry, callback) ->
        cbel.createChromeBookmark.originalValue.call(cbel, entry, createCallback)
        return

      spyOn(cbel, "removeChromeBookmark").andCallFake (url, callback) ->
        cbel.removeChromeBookmark.originalValue.call(cbel, url, removeCallback)
        return

      cbel.add(dummyEntry.thread0)

      expect(cbel.get(dummyEntry.thread0.url)).toEqual(dummyEntry.thread0)

      waitsFor ->
        createCallback.wasCalled

      runs ->
        expect(createCallback).toHaveBeenCalledWith(true)

        cbel.remove(dummyEntry.thread0.url)

        expect(cbel.get(dummyEntry.thread0.url)).toBeNull()
        return

      waitsFor ->
        removeCallback.wasCalled

      runs ->
        expect(removeCallback).toHaveBeenCalledWith(true)
        return
      return
    return
  return
