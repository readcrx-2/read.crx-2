do ->
  last_bookmark_updated = 0

  cbel = new app.Bookmark.ChromeBookmarkEntryList("dummy")
  app.bookmark = new app.Bookmark.CompatibilityLayer(cbel)

  chrome.bookmarks.create(
    {title: "test folder for Bookmark.CompatibilityLayer"}
    (node) ->
      cbel.setRootNodeId(node.id)
      return
  )

  module "app.bookmark",
    setup: ->
      @one = (type, listener) ->
        wrapper = ->
          listener.apply(this, arguments)
          app.message.remove_listener(type, wrapper)
        app.message.add_listener(type, wrapper)

      @start = app.bookmark.promise_first_scan

        .pipe ->
          $.Deferred (deferred) ->
            setTimeout ->
              deferred.resolve()
            , 300

        .promise()

      @last_updated = ->
        last_bookmark_updated

  app.message.add_listener "bookmark_updated", ->
    last_bookmark_updated = Date.now()

test "ブックマークオブジェクトをURLに変換する", 10, ->
  fixed_url = "http://__dummy.2ch.net/dummy/"
  base_bookmark =
    type: "board"
    bbs_type: "2ch"
    url: fixed_url
    title: fixed_url
    res_count: null
    read_state: null
    expired: false

  bookmark = app.deep_copy(base_bookmark)
  strictEqual(
    app.bookmark.bookmark_to_url(bookmark)
    fixed_url
    "板ブックマーク"
  )

  fixed_url = "http://__dummy_server.2ch.net/test/read.cgi/__dummy_board/1234567890/"
  base_bookmark =
    type: "thread"
    bbs_type: "2ch"
    url: fixed_url
    title: fixed_url
    res_count: null
    read_state: null
    expired: false

  bookmark = app.deep_copy(base_bookmark)
  strictEqual(
    app.bookmark.bookmark_to_url(bookmark)
    fixed_url
    "スレブックマーク"
  )

  bookmark = app.deep_copy(base_bookmark)
  bookmark.res_count = 123
  strictEqual(
    app.bookmark.bookmark_to_url(bookmark)
    fixed_url + "#res_count=123"
    "スレブックマーク(res_count)"
  )

  bookmark = app.deep_copy(base_bookmark)
  bookmark.expired = true
  strictEqual(
    app.bookmark.bookmark_to_url(bookmark)
    fixed_url + "#expired"
    "スレブックマーク(expired)"
  )

  bookmark = app.deep_copy(base_bookmark)
  bookmark.read_state =
    url: fixed_url
    last: 123
    read: 234
    received: 345
  result = app.bookmark.bookmark_to_url(bookmark)
  deepEqual(
    app.url.parse_hashquery(result), {
      last: "123", read: "234", received: "345"
    }, "スレブックマーク(read_state)")
  strictEqual(app.url.fix(result), fixed_url, "スレブックマーク(read_state)")

  bookmark = app.deep_copy(base_bookmark)
  bookmark.read_state =
    url: fixed_url
    last: 123
    read: 234
    received: 345
  bookmark.expired = true
  result = app.bookmark.bookmark_to_url(bookmark)
  deepEqual(
    app.url.parse_hashquery(result), {
      last: "123", read: "234", received: "345", expired: true
    }, "スレブックマーク(read_state)")
  strictEqual(app.url.fix(result), fixed_url, "スレブックマーク(res_count + read_state)")

  bookmark = app.deep_copy(base_bookmark)
  bookmark.read_state =
    url: fixed_url
    last: 123
    read: 234
    received: 345
  bookmark.expired = true
  bookmark.res_count = 456
  result = app.bookmark.bookmark_to_url(bookmark)
  deepEqual(
    app.url.parse_hashquery(result), {
      last: "123", read: "234", received: "345", expired: true, res_count: "456"
    }, "スレブックマーク(read_state)")
  strictEqual(app.url.fix(result), fixed_url, "スレブックマーク(res_count + read_state + res_count)")

test "URLからブックマークオブジェクトを作成する", 16, ->
  fixed_url = "http://__dummy.2ch.net/dummy/"
  deepEqual(
    app.bookmark.url_to_bookmark(fixed_url)
    {
      type: "board"
      bbs_type: "2ch"
      url: fixed_url
      title: fixed_url
      res_count: null
      read_state: null
      expired: false
    }
    "板URL"
  )

  fixed_url = "http://__dummy_server.2ch.net/test/read.cgi/__dummy_board/1234567890/"
  deepEqual(
    app.bookmark.url_to_bookmark(fixed_url)
    {
      type: "thread"
      bbs_type: "2ch"
      url: fixed_url
      title: fixed_url
      res_count: null
      read_state: null
      expired: false
    }
    "スレURL"
  )

  deepEqual(
    app.bookmark.url_to_bookmark(fixed_url + "#res_count=123")
    {
      type: "thread"
      bbs_type: "2ch"
      url: fixed_url
      title: fixed_url
      res_count: 123
      read_state: null
      expired: false
    }
    "スレURL + res_count"
  )

  deepEqual(
    app.bookmark.url_to_bookmark(fixed_url + "#res_count")
    {
      type: "thread"
      bbs_type: "2ch"
      url: fixed_url
      title: fixed_url
      res_count: null
      read_state: null
      expired: false
    }
    "スレURL + 不正なres_count(Boolean)"
  )

  deepEqual(
    app.bookmark.url_to_bookmark(fixed_url + "#res_count=dummy")
    {
      type: "thread"
      bbs_type: "2ch"
      url: fixed_url
      title: fixed_url
      res_count: null
      read_state: null
      expired: false
    }
    "スレURL + 不正なres_count(文字列)"
  )

  deepEqual(
    app.bookmark.url_to_bookmark(fixed_url + "#expired")
    {
      type: "thread"
      bbs_type: "2ch"
      url: fixed_url
      title: fixed_url
      res_count: null
      read_state: null
      expired: true
    }
    "スレURL + expired"
  )

  deepEqual(
    app.bookmark.url_to_bookmark(fixed_url + "#expired=true")
    {
      type: "thread"
      bbs_type: "2ch"
      url: fixed_url
      title: fixed_url
      res_count: null
      read_state: null
      expired: false #一見trueで良さそうだけれど、URLパラメータで指定されているのはあくまで"true"という文字列
    }
    "スレURL + expired(true)"
  )

  deepEqual(
    app.bookmark.url_to_bookmark(fixed_url + "#expired=false")
    {
      type: "thread"
      bbs_type: "2ch"
      url: fixed_url
      title: fixed_url
      res_count: null
      read_state: null
      expired: false
    }
    "スレURL + expired(false)"
  )

  deepEqual(
    app.bookmark.url_to_bookmark(fixed_url + "#expired=123")
    {
      type: "thread"
      bbs_type: "2ch"
      url: fixed_url
      title: fixed_url
      res_count: null
      read_state: null
      expired: false
    }
    "スレURL + 不正なexpired(数値文字列)"
  )

  deepEqual(
    app.bookmark.url_to_bookmark(fixed_url + "#last=123&read=234&received=345")
    {
      type: "thread"
      bbs_type: "2ch"
      url: fixed_url
      title: fixed_url
      res_count: null
      read_state:
        url: fixed_url
        last: 123
        read: 234
        received: 345
      expired: false
    }
    "スレURL + read_state"
  )

  deepEqual(
    app.bookmark.url_to_bookmark(fixed_url + "#last=test&read=234&received=345")
    {
      type: "thread"
      bbs_type: "2ch"
      url: fixed_url
      title: fixed_url
      res_count: null
      read_state: null
      expired: false
    }
    "スレURL + 不正なread_state"
  )

  deepEqual(
    app.bookmark.url_to_bookmark(fixed_url + "#read=234&received=345")
    {
      type: "thread"
      bbs_type: "2ch"
      url: fixed_url
      title: fixed_url
      res_count: null
      read_state: null
      expired: false
    }
    "スレURL + 不完全なread_state"
  )

  deepEqual(
    app.bookmark.url_to_bookmark(fixed_url + "#last=123&read=234&received=345&res_count=456")
    {
      type: "thread"
      bbs_type: "2ch"
      url: fixed_url
      title: fixed_url
      res_count: 456
      read_state:
        url: fixed_url
        last: 123
        read: 234
        received: 345
      expired: false
    }
    "スレURL + read_state + res_count"
  )

  deepEqual(
    app.bookmark.url_to_bookmark(fixed_url + "#last=123&read=234&received=345&res_count=456&expired")
    {
      type: "thread"
      bbs_type: "2ch"
      url: fixed_url
      title: fixed_url
      res_count: 456
      read_state:
        url: fixed_url
        last: 123
        read: 234
        received: 345
      expired: true
    }
    "スレURL + read_state + res_count + expired"
  )

  deepEqual(
    app.bookmark.url_to_bookmark(fixed_url + "123/?test=123#123")
    {
      type: "thread"
      bbs_type: "2ch"
      url: fixed_url
      title: fixed_url
      res_count: null
      read_state: null
      expired: false
    }
    "スレURL + 無関係なオプション"
  )

  deepEqual(
    app.bookmark.url_to_bookmark(fixed_url + "123/?test=123#last=123&read=234&received=345&res_count=456&expired")
    {
      type: "thread"
      bbs_type: "2ch"
      url: fixed_url
      title: fixed_url
      res_count: 456
      read_state:
        url: fixed_url
        last: 123
        read: 234
        received: 345
      expired: true
    }
    "スレURL + read_state + res_count + expired + 無関係なオプション"
  )

test "ブックマークされていないURLを取得しようとした時は、nullを返す", 1, ->
  strictEqual(app.bookmark.get("http://__dummy.2ch.net/dummy/"), null)

asyncTest "板のブックマークを保存/取得/削除出来る", 6, ->
  that = @
  url = "http://__dummy.2ch.net/dummy/"
  title = "ダミー板"
  expect_bookmark =
    type: "board"
    bbs_type: "2ch"
    title: title
    url: url
    res_count: null
    read_state: null
    expired: false
  @start
    .pipe ->
      #追加
      deferred_on_added = $.Deferred()
      that.one "bookmark_updated", (message) ->
        delete message.entry
        deepEqual(message, {type: "added", bookmark: expect_bookmark})
        deferred_on_added.resolve()
      $.when(app.bookmark.add(url, title), deferred_on_added)
    .pipe ->
      #取得確認
      $.Deferred (deferred) ->
        deepEqual(app.bookmark.get(url), expect_bookmark)
        chrome.bookmarks.getChildren app.bookmark.cbel.rootNodeId, (array_of_tree) ->
          if array_of_tree.some((tree) -> tree.url is url)
            ok(true)
            deferred.resolve()
          else
            ok(false)
            deferred.reject()
    .pipe ->
      #削除
      deferred_on_removed = $.Deferred()
      that.one "bookmark_updated", (message) ->
        delete message.entry
        deepEqual(message, {type: "removed", bookmark: expect_bookmark})
        deferred_on_removed.resolve()
      $.when(app.bookmark.remove(url), deferred_on_removed)
    .pipe ->
      #削除確認
      $.Deferred (deferred) ->
        strictEqual(app.bookmark.get(url), null)
        chrome.bookmarks.getChildren app.bookmark.cbel.rootNodeId, (array_of_tree) ->
          if array_of_tree.some((tree) -> tree.url is url)
            ok(false)
            deferred.resolve()
          else
            ok(true)
            deferred.reject()
    .always ->
      start()

asyncTest "スレのブックマークを保存/取得/削除出来る", 33, ->
  that = @
  url = "http://__dummy_server.2ch.net/test/read.cgi/__dummy_board/1234567890/"
  title = "ダミースレ"
  expect_bookmark =
    type: "thread"
    bbs_type: "2ch"
    title: title
    url: url
    res_count: null
    read_state: null
    expired: false

  node_id = undefined

  get_deferred_on_message = (type, label) ->
    $.Deferred (deferred) ->
      that.one "bookmark_updated", (message) ->
        delete message.entry
        deepEqual(message, {type: type, bookmark: expect_bookmark}, label)
        deferred.resolve()

  @start
    #ブックマーク追加テスト
    .pipe ->
      deferred_on_added = get_deferred_on_message("added", "ブックマーク追加 - 更新メッセージチェック")

      deferred_on_created = $.Deferred (deferred) ->
        tmp_fn = (id, tree) ->
          chrome.bookmarks.onCreated.removeListener(tmp_fn)
          strictEqual(tree.url, url, "ブックマーク追加 - ブックマーク更新チェック")
          node_id = id
          deferred.resolve()
        chrome.bookmarks.onCreated.addListener(tmp_fn)

      deferred_add = app.bookmark.add(url, title)

      $.when(deferred_add, deferred_on_added, deferred_on_created)
    .pipe ->
      deepEqual(app.bookmark.get(url), expect_bookmark, "ブックマーク追加 - キャッシュ更新チェック")
      deepEqual(app.bookmark.get_by_board(app.url.thread_to_board(url)), [expect_bookmark], "ブックマーク追加 - キャッシュ更新チェック(2)")
    #重複追加テスト
    .pipe ->
      $.Deferred (deferred) ->
        app.bookmark.add(url, title)
          .fail ->
            ok(true, "既に存在するブックマークを追加しようとしても失敗する")
            deferred.resolve()
    #重複ブックマーク作成時テスト
    .pipe ->
      $.Deferred (deferred) ->
        chrome.bookmarks.create({
          parentId: app.bookmark.cbel.rootNodeId
          url: url
          title: "重複テスト"
        }, ((node) -> deferred.resolve(node)))
    .pipe (node) ->
      $.Deferred (deferred) ->
        setTimeout((-> deferred.resolve(node)), 300)
    .pipe (node) ->
      $.Deferred (deferred) ->
        deepEqual(app.bookmark.get(url), expect_bookmark, "重複したブックマークが検出されても既存のブックマークには影響が無い")
        deepEqual(app.bookmark.get_by_board(app.url.thread_to_board(url))
          , [expect_bookmark], "重複したブックマークが検出されても既存のブックマークには影響が無い(2)")
        chrome.bookmarks.remove node.id, ->
          deferred.resolve()
    #res_count付与テスト
    .pipe ->
      deferred_on_message = get_deferred_on_message("res_count", "res_count付与 - 更新メッセージチェック")

      deferred_on_change = $.Deferred (deferred) ->
        tmp_fn = (id, info) ->
          chrome.bookmarks.onChanged.removeListener(tmp_fn)
          tmp_expect = app.deep_copy(expect_bookmark)
          tmp_expect.title = url
          deepEqual(app.bookmark.url_to_bookmark(info.url), tmp_expect, "rescount付与 - ブックマーク更新チェック")
          deferred.resolve()
        chrome.bookmarks.onChanged.addListener(tmp_fn)

      expect_bookmark.res_count = 123
      app.bookmark.update_res_count(url, 123)
      deepEqual(app.bookmark.get(url), expect_bookmark, "res_count付与テスト - キャッシュ更新チェック")

      $.when(deferred_on_message, deferred_on_change)
    #res_count更新テスト
    .pipe ->
      deferred_on_message = get_deferred_on_message("res_count", "res_count更新 - 更新メッセージチェック")

      deferred_on_change = $.Deferred (deferred) ->
        tmp_fn = (id, info) ->
          chrome.bookmarks.onChanged.removeListener(tmp_fn)
          tmp_expect = app.deep_copy(expect_bookmark)
          tmp_expect.title = url
          deepEqual(app.bookmark.url_to_bookmark(info.url), tmp_expect, "rescount更新 - ブックマーク更新チェック")
          deferred.resolve()
        chrome.bookmarks.onChanged.addListener(tmp_fn)

      expect_bookmark.res_count = 234
      app.bookmark.update_res_count(url, 234)
      deepEqual(app.bookmark.get(url), expect_bookmark, "res_count付与テスト - キャッシュ更新チェック")

      $.when(deferred_on_message, deferred_on_change)
    #expired指定テスト
    .pipe ->
      deferred_on_updated = get_deferred_on_message("expired", "expired指定、更新メッセージチェック")

      deferred_on_changed = $.Deferred (deferred) ->
        tmp_fn = (id, info) ->
          chrome.bookmarks.onChanged.removeListener(tmp_fn)
          tmp_expect = app.deep_copy(expect_bookmark)
          tmp_expect.title = url

          deepEqual(app.bookmark.url_to_bookmark(info.url), tmp_expect, "expired指定、ブックマーク更新チェック")

          deferred.resolve()
        chrome.bookmarks.onChanged.addListener(tmp_fn)

      expect_bookmark.expired = true
      app.bookmark.update_expired(url, true)
      strictEqual(app.bookmark.get(url).expired, true, "expired指定、キャッシュ更新チェック")

      $.when(deferred_on_updated, deferred_on_changed)
    #expired指定解除テスト
    .pipe ->
      deferred_on_updated = get_deferred_on_message("expired", "expired解除、更新メッセージチェック")

      deferred_on_changed = $.Deferred()
      tmp_fn = (id, info) ->
        chrome.bookmarks.onChanged.removeListener(tmp_fn)
        tmp_expect = app.deep_copy(expect_bookmark)
        tmp_expect.title = url

        deepEqual(app.bookmark.url_to_bookmark(info.url), tmp_expect, "expired指定、ブックマーク更新チェック")
        deferred_on_changed.resolve()
      chrome.bookmarks.onChanged.addListener(tmp_fn)

      expect_bookmark.expired = false
      app.bookmark.update_expired(url, false)
      strictEqual(app.bookmark.get(url).expired, false, "expired解除、キャッシュ更新チェック")

      $.when(deferred_on_updated, deferred_on_changed)
    #read_state付与テスト
    .pipe ->
      read_state =
        url: url
        read: 50
        last: 25
        received: 100

      deferred_on_change = $.Deferred (deferred) ->
        tmp_fn = (id, info) ->
          chrome.bookmarks.onChanged.removeListener(tmp_fn)
          tmp_expect = app.deep_copy(expect_bookmark)
          tmp_expect.title = url
          deepEqual(app.bookmark.url_to_bookmark(info.url), tmp_expect, "read_state付与 - ブックマーク更新チェック")
          deferred.resolve()
        chrome.bookmarks.onChanged.addListener(tmp_fn)

      deferred_on_message = $.Deferred (deferred) ->
        that.one "read_state_updated", (message) ->
          deepEqual(message, {
            board_url: app.url.thread_to_board(read_state.url)
            read_state: read_state
          }, "read_state付与 - read_state_updatedメッセージチェック")
          deferred.resolve()

      expect_bookmark.read_state = read_state
      app.bookmark.update_read_state(read_state)
      deepEqual(app.bookmark.get(url), expect_bookmark, "read_state付与テスト - キャッシュ更新チェック")

      $.when(deferred_on_change, deferred_on_message)
    #read_state更新テスト
    .pipe ->
      read_state =
        url: url
        read: 119
        last: 118
        received: 120

      deferred_on_change = $.Deferred (deferred) ->
        tmp_fn = (id, info) ->
          chrome.bookmarks.onChanged.removeListener(tmp_fn)
          tmp_expect = app.deep_copy(expect_bookmark)
          tmp_expect.title = url
          deepEqual(app.bookmark.url_to_bookmark(info.url), tmp_expect, "read_state更新 - ブックマーク更新チェック")
          deferred.resolve()
        chrome.bookmarks.onChanged.addListener(tmp_fn)

      deferred_on_message = $.Deferred (deferred) ->
        that.one "read_state_updated", (message) ->
          deepEqual(message, {
            board_url: app.url.thread_to_board(read_state.url)
            read_state: read_state
          }, "read_state更新 - read_state_updatedメッセージチェック")
          deferred.resolve()

      expect_bookmark.read_state = read_state
      app.bookmark.update_read_state(read_state)
      deepEqual(app.bookmark.get(url), expect_bookmark, "read_state更新テスト - キャッシュ更新チェック")

      $.when(deferred_on_change, deferred_on_message)
    #ブックマーク編集(res_count変更)テスト
    .pipe ->
      deferred_on_message = get_deferred_on_message("res_count", "ブックマーク編集(res_count変更)テスト")

      expect_bookmark.res_count = 123
      chrome.bookmarks.update node_id,
        url: app.bookmark.bookmark_to_url(expect_bookmark)

      deferred_on_message
    #ブックマーク編集(expired指定)テスト
    .pipe ->
      deferred_on_message = get_deferred_on_message("expired", "ブックマーク編集(expired指定)テスト")

      expect_bookmark.expired = true
      chrome.bookmarks.update node_id,
        url: app.bookmark.bookmark_to_url(expect_bookmark)

      deferred_on_message
    #ブックマーク編集(expired解除)テスト
    .pipe ->
      deferred_on_message = get_deferred_on_message("expired", "ブックマーク編集(expired解除)テスト")

      expect_bookmark.expired = false
      chrome.bookmarks.update node_id,
        url: app.bookmark.bookmark_to_url(expect_bookmark)

      deferred_on_message
    #ブックマーク編集(タイトル変更)テスト
    .pipe ->
      deferred_on_message = get_deferred_on_message("title", "ブックマーク編集(タイトル変更)テスト")

      expect_bookmark.title += "_test"
      chrome.bookmarks.update(node_id, title: expect_bookmark.title)

      deferred_on_message
    #削除
    .pipe ->
      deferred_on_removed = get_deferred_on_message("removed", "削除メッセージ")
      $.when(app.bookmark.remove(url), deferred_on_removed)
    #削除確認
    .pipe ->
      deferred = $.Deferred (deferred) ->
        strictEqual(app.bookmark.get(url), null)
        chrome.bookmarks.getChildren app.bookmark.cbel.rootNodeId, (array_of_tree) ->
          if(array_of_tree.some((tree) -> tree.url is url))
            ok(false, "削除確認")
            deferred.reject()
          else
            ok(true, "削除確認")
            deferred.resolve()
      deferred
    #存在しないURLの削除テスト
    .pipe ->
      $.Deferred (deferred) ->
        app.bookmark.remove(url)
          .done ->
            ok(false, "存在しないURLの削除テスト")
            deferred.resolve()
          .fail ->
            ok(true, "存在しないURLの削除テスト")
            deferred.resolve()
    .always ->
      start()

asyncTest "パラメータ付きのスレURLも認識出来る", 2, ->
  that = @
  url = "http://__dummy_server.2ch.net/test/read.cgi/__dummy_board/1234567890/"
  url += "#res_count=123&last=10&read=20&received=100"
  title = "ダミースレ"
  expect_bookmark =
    type: "thread"
    bbs_type: "2ch"
    title: title
    url: app.url.fix(url)
    res_count: 123
    read_state:
      url: app.url.fix(url)
      last: 10
      read: 20
      received: 100
    expired: false

  node_id = undefined

  @start
    .pipe ->
      deferred_added_message = $.Deferred (deferred) ->
        that.one "bookmark_updated", (message) ->
          delete message.entry
          deepEqual(message, {type: "added", bookmark: expect_bookmark})
          deferred.resolve()

      deferred_create = $.Deferred (deferred) ->
        chrome.bookmarks.create {
            parentId: app.bookmark.cbel.rootNodeId
            url: url
            title: title
          }, (node) ->
            node_id = node.id
            deferred.resolve()

      $.when(deferred_create, deferred_added_message)
    .pipe ->
      deferred_removed_message = $.Deferred (deferred) ->
        that.one "bookmark_updated", (message) ->
          delete message.entry
          deepEqual(message, {type: "removed", bookmark: expect_bookmark})
          deferred.resolve()

      deferred_remove = $.Deferred (deferred) ->
        chrome.bookmarks.remove node_id, ->
          deferred.resolve()

      $.when(deferred_remove, deferred_removed_message)
    .always ->
      start()

asyncTest "ノードのURL変更にも追随する", 4, ->
  that = @
  url = "http://__dummy_server.2ch.net/test/read.cgi/__dummy_board/1234567890/"
  url += "#res_count=123&last=10&read=20&received=100"
  title = "ダミースレ"
  expect_bookmark =
    type: "thread"
    bbs_type: "2ch"
    title: title
    url: app.url.fix(url)
    res_count: 123
    read_state:
      url: app.url.fix(url)
      last: 10
      read: 20
      received: 100
    expired: false

  node_id = undefined

  @start
    .pipe ->
      deferred_added_message = $.Deferred (deferred) ->
        that.one "bookmark_updated", (message) ->
          delete message.entry
          deepEqual(message, {type: "added", bookmark: expect_bookmark})
          deferred.resolve()

      deferred_create = $.Deferred (deferred) ->
        chrome.bookmarks.create {
            parentId: app.bookmark.cbel.rootNodeId
            url: url
            title: title
          }, (node) ->
            node_id = node.id
            deferred.resolve()

      $.when(deferred_create, deferred_added_message)
    #他鯖・他板・他スレへの変更
    .pipe ->
      old_expect = app.deep_copy(expect_bookmark)
      url = "http://__dummy_server2.2ch.net/test/read.cgi/__dummy_board2/0987654321/"
      url += "#res_count=123&last=10&read=20&received=100"
      title = "ダミースレ2"
      expect_bookmark.url = expect_bookmark.read_state.url = app.url.fix(url)
      expect_bookmark.title = title

      #chrome.bookmarks.update時にtitleとurlの両方を変更すると、onChanged
      #がtitleとurlの変更で別々に呼ばれてしまう
      #そのため、url変更が検出されてブックマークがremoved扱いにされた時、
      #既にtitleの変更が反映されている
      old_expect.title = expect_bookmark.title

      deferred_on_removed = $.Deferred (deferred) ->
        tmp = (message) ->
          if message.type is "removed"
            delete message.entry
            deepEqual(message, {type: "removed", bookmark: old_expect})
            app.message.remove_listener("bookmark_updated", tmp)
            deferred.resolve()
        app.message.add_listener("bookmark_updated", tmp)

      deferred_on_added = $.Deferred (deferred) ->
        tmp = (message) ->
          if message.type is "added"
            delete message.entry
            deepEqual(message, {type: "added", bookmark: expect_bookmark})
            app.message.remove_listener("bookmark_updated", tmp)
            deferred.resolve()
        app.message.add_listener("bookmark_updated", tmp)

      chrome.bookmarks.update(node_id, {url: url, title: title})

      $.when(deferred_on_removed, deferred_on_added)
    .pipe ->
      deferred_removed_message = $.Deferred (deferred) ->
        that.one "bookmark_updated", (message) ->
          delete message.entry
          deepEqual(message, {type: "removed", bookmark: expect_bookmark})
          deferred.resolve()

      deferred_remove = $.Deferred (deferred) ->
        chrome.bookmarks.remove node_id, ->
          deferred.resolve()

      $.when(deferred_remove, deferred_removed_message)
    .always ->
      start()

asyncTest "detected_ch_server_moveメッセージを受信すると、板やスレのブックマークを移転に対応して変更する", 8, ->
  that = @
  board_title = "ダミー板（移転テスト）"
  before_board_url = "http://__dummy_before.2ch.net/dummy/"
  after_board_url = "http://__dummy_after.2ch.net/dummy/"
  before_board_expect_bookmark =
    type: "board"
    bbs_type: "2ch"
    title: board_title
    url: before_board_url
    res_count: null
    read_state: null
    expired: false
  after_board_expect_bookmark = app.deep_copy(before_board_expect_bookmark)
  after_board_expect_bookmark.url = after_board_url

  before_thread_url = "http://__dummy_before.2ch.net/test/read.cgi/dummy/1234567890/#res_count=123"
  thread_title = "ダミースレ"
  before_thread_expect_bookmark =
    type: "thread"
    bbs_type: "2ch"
    title: thread_title
    url: app.url.fix(before_thread_url)
    res_count: 123
    read_state: null
    expired: false
  after_thread_url = "http://__dummy_after.2ch.net/test/read.cgi/dummy/1234567890/"
  after_thread_expect_bookmark = app.deep_copy(before_thread_expect_bookmark)
  after_thread_expect_bookmark.url = after_thread_url

  @start
    #板ブックマーク追加
    .pipe ->
      deferred_added_message = $.Deferred (deferred) ->
        that.one "bookmark_updated", (message) ->
          delete message.entry
          deepEqual(message, {type: "added", bookmark: before_board_expect_bookmark})
          deferred.resolve()
      app.bookmark.add(before_board_url, board_title)
      deferred_added_message
    #スレブックマーク追加
    .pipe ->
      deferred_added_message = $.Deferred (deferred) ->
        that.one "bookmark_updated", (message) ->
          delete message.entry
          deepEqual(message, {type: "added", bookmark: before_thread_expect_bookmark})
          deferred.resolve()
      app.bookmark.add(before_thread_url, thread_title)
      deferred_added_message
    #板ブックマーク移転確認
    .pipe ->
      message_check = (message) ->
        delete message.entry
        if message.type is "removed"
          if message.bookmark.title is board_title
            deepEqual(message, {type: "removed", bookmark: before_board_expect_bookmark})
          else
            deepEqual(message, {type: "removed", bookmark: before_thread_expect_bookmark})
        else
          if message.bookmark.title is board_title
            deepEqual(message, {type: "added", bookmark: after_board_expect_bookmark})
          else
            deepEqual(message, {type: "added", bookmark: after_thread_expect_bookmark})
      deferred_message_check = $.Deferred (deferred) ->
        count = 0
        listener = (message) ->
          message_check(message)
          if ++count is 4
            app.message.remove_listener("bookmark_updated", listener)
            deferred.resolve()
        app.message.add_listener("bookmark_updated", listener)
      app.message.send "detected_ch_server_move",
        before: before_board_url
        after: after_board_url
      deferred_message_check
    #板ブックマーク削除
    .pipe ->
      deferred_removed_message = $.Deferred (deferred) ->
        that.one "bookmark_updated", (message) ->
          delete message.entry
          deepEqual(message, {type: "removed", bookmark: after_board_expect_bookmark})
          deferred.resolve()
      app.bookmark.remove(after_board_url)
      deferred_removed_message
    #スレブックマーク削除
    .pipe ->
      deferred_removed_message = $.Deferred (deferred) ->
        that.one "bookmark_updated", (message) ->
          delete message.entry
          deepEqual(message, {type: "removed", bookmark: after_thread_expect_bookmark})
          deferred.resolve()
      app.bookmark.remove(after_thread_url)
      deferred_removed_message
    .always ->
      start()

asyncTest "ノードのフォルダ内での移動は無視する", 2, ->
  that = @
  url = "http://__dummy_server.2ch.net/test/read.cgi/__dummy_board/1234567890/"
  title = "ダミースレ"
  expect_bookmark =
    type: "thread"
    bbs_type: "2ch"
    title: title
    url: app.url.fix(url)
    res_count: null
    read_state: null
    expired: false

  node_id = undefined

  this.start
    .pipe ->
      deferred_added_message = $.Deferred (deferred) ->
        that.one "bookmark_updated", (message) ->
          delete message.entry
          deepEqual(message, {type: "added", bookmark: expect_bookmark})
          deferred.resolve()

      deferred_create = $.Deferred (deferred) ->
        chrome.bookmarks.create {
            parentId: app.bookmark.cbel.rootNodeId
            url: url
            title: title
          }, (node) ->
            node_id = node.id
            deferred.resolve()

      $.when(deferred_create, deferred_added_message)
    .pipe ->
      deferred_removed_message = $.Deferred (deferred) ->
        that.one "bookmark_updated", (message) ->
          delete message.entry
          deepEqual(message, {type: "removed", bookmark: expect_bookmark})
          deferred.resolve()

      $.Deferred (deferred) ->
        chrome.bookmarks.move node_id, {parentId: app.bookmark.cbel.rootNodeId, index: 0}, ->
          deferred.resolve()
      .done ->
        chrome.bookmarks.remove(node_id)

      deferred_removed_message
    .always ->
      start()

asyncTest "ブックマークフォルダ中のフォルダに関する変更は無視する", 6, ->
  node_id = null

  fn = do =>
    tmp = @last_updated()
    (deferred) =>
      setTimeout =>
        ok(tmp is @last_updated())
        deferred.resolve()
      , 1000

  @start
    #フォルダ作成
    .pipe => $.Deferred (deferred) =>
      chrome.bookmarks.create {
          parentId: app.bookmark.cbel.rootNodeId
          title: "ダミースレ"
        }, (tree) =>
          node_id = tree.id
          fn(deferred)

    #フォルダタイトル変更
    .pipe => $.Deferred (deferred) =>
      chrome.bookmarks.update node_id, {title: "ダミースレ_"}, =>
        fn(deferred)

    #フォルダ移動（ブックマークフォルダ→外部）
    .pipe => $.Deferred (deferred) =>
      chrome.bookmarks.move node_id, {parentId: "1"}, =>
        fn(deferred)

    #フォルダ移動（外部→ブックマークフォルダ）
    .pipe => $.Deferred (deferred) =>
      chrome.bookmarks.move node_id, {
          parentId: app.bookmark.cbel.rootNodeId
        }, =>
          fn(deferred)

    #フォルダ移動(ブックマークフォルダ内)
    #TODO: 予めフォルダ内にブックマークが存在している事前提なのをなんとかする
    .pipe => $.Deferred (deferred) =>
      chrome.bookmarks.move node_id, {
          parentId: app.bookmark.cbel.rootNodeId
          index: 0
        }, =>
          fn(deferred)

    #フォルダ削除
    .pipe => $.Deferred (deferred) =>
      chrome.bookmarks.removeTree node_id, =>
        fn(deferred)

    .done ->
      start()
