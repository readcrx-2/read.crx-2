module "bbsmenu",
  setup: ->
    bbsmenu_url = "http://kita.jikkyo.org/cbm/cbm.cgi/20.p0.m0.jb.vs.op.sc.nb.bb/-all/bbsmenu.html"

    cache_clear = (callback) ->
      app.module null, ["cache"], (Cache) ->
        (new Cache(bbsmenu_url)).delete().done(callback)
        return
      return

    @test = (status, html, expected) ->
      $.mockjax
        url: bbsmenu_url
        status: status
        responseText: html
        response: ->
          ok(true)
          return

      app.module null, ["jquery", "bbsmenu"], ($, BBSMenu) ->
        cache_clear ->
          BBSMenu.get (res) ->
            deepEqual(res, expected)
            cache_clear(start)
            return
          return
        return
      return

    return

  teardown: $.mockjaxClear

asyncTest "板一覧を取得出来る", 2,  ->
  @test 200, """
      <html><awe,,>2,,qf,mp[]5[@:]
      <A HREF=http://headline.2ch.net/bbynamazu/>地震headline</A><br> 
      test
      <A HREF=http://headline.2ch.net/bbynamazu/>地震headline</A><br> 
      <BR><BR><B>地震</B><BR> 
      <A HREF=http://headline.2ch.net/bbynamazu/>地震headline</A><br> 
      
      <BR><BR><B>地震</B><BR> 
        
      <BR><BR><B>地震</B><BR> 
      <A HREF=http://headline.2ch.net/bbynamazu/>地震headline</A><br> 
      <A HREF=http://toki.2ch.net/namazuplus/>地震速報</A><br> 
      <A HREF=http://hayabusa.2ch.net/eq/>臨時地震</A><br> 
      <A HREF=http://hayabusa.2ch.net/eqplus/>臨時地震+</A><br> 
      <A HREF=http://hato.2ch.net/lifeline/>緊急自然災害</A> 
      <BR><BR><B>おすすめ</B><BR> 
      <A HREF=http://yuzuru.2ch.net/ftax/>ふるさと納税</A><br> 

    """, {
      status: "success"
      data: [
        {
          title: "地震"
          board: [
            {url: "http://headline.2ch.net/bbynamazu/", title: "地震headline"}
          ]
        }
        {
          title: "地震"
          board: [
            {url: "http://headline.2ch.net/bbynamazu/", title: "地震headline"}
            {url: "http://toki.2ch.net/namazuplus/", title: "地震速報"}
            {url: "http://hayabusa.2ch.net/eq/", title: "臨時地震"}
            {url: "http://hayabusa.2ch.net/eqplus/", title: "臨時地震+"}
            {url: "http://hato.2ch.net/lifeline/", title: "緊急自然災害"}
          ]
        }
        {
          title: "おすすめ"
          board: [
            {url: "http://yuzuru.2ch.net/ftax/", title: "ふるさと納税"}
          ]
        }
      ]
    }
  return

asyncTest "実際には板ではない項目は除外される", 2, ->
  @test 200, """
    <BR><BR><B>dummy</B><BR> 
    <A HREF=http://headline.2ch.net/dummy/>dummy</A><br> 
    <A HREF=http://info.2ch.net/wiki/>2chプロジェクト</A><br> 
    <A HREF=http://info.2ch.net/rank/>いろいろランク</A><br> 
    <A HREF=http://info.2ch.net/guide/adv.html>ガイドライン</A><br> 
    <A HREF=http://www.monazilla.org/ TARGET=_blank>2chツール</A><br> 
    <A HREF=http://www.domo2.net/ TARGET=_blank>domo2</A><br> 
    <A HREF=http://tatsu01.sakura.ne.jp/ TARGET=_blank>DAT2HTML</A><br> 
    <A HREF=http://monahokan.web.fc2.com/AAE/ TARGET=_blank>AAエディタ</A><br> 
    <A HREF=http://info.2ch.net/mag.html>2chメルマガ</A><BR> 
    <A HREF=http://www.megabbs.com/ TARGET=_blank>megabbs</A><br> 
    <A HREF=http://www.milkcafe.net/ TARGET=_blank>MILKCAFE</A><br> 
    <A HREF=http://svnews.jp/ TARGET=_blank>レンサバ比較</A><br> 
    <A HREF=http://ma-na.biz/ TARGET=_blank>ペンフロ</A><br> 
    <A HREF=http://headline.2ch.net/dummy/>dummy</A><br> 
    <BR><BR><B>dummy2</B><BR> 
    <A HREF=http://headline.2ch.net/dummy/>dummy</A><br> 
  """,  {
    status: "success"
    data: [
      {
        title: "dummy"
        board: [
          {url: "http://headline.2ch.net/dummy/", title: "dummy"}
          {url: "http://headline.2ch.net/dummy/", title: "dummy"}
        ]
      }
      {
        title: "dummy2",
        board: [
          {url: "http://headline.2ch.net/dummy/", title: "dummy"}
        ]
      }
    ]
  }

  return

asyncTest "パース結果が0件の場合はエラー扱いにする", 2, ->
  @test 200, "", {
    status: "error"
    message: "板一覧の取得に失敗しました。"
  }
  return

asyncTest "通信失敗時はステータスコードerrorとエラーメッセージを返す", 2, ->
  @test 404, "", {
    status: "error"
    message: "板一覧の取得に失敗しました。"
  }
  return
