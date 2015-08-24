$(function() {
  // 最新バージョン取得
  $.get('//readcrx-2.github.io/read.crx-2/updates.xml', function(data) {
    if (data) {
      var download = $('app[appid="mglmonflpdcckjdpjnpenfdmkbmggmgm"] > updatecheck', data).attr('codebase');
      var filename = download.substring(download.lastIndexOf('/') + 1, download.length);
      $('#download').attr('href', download);
      $('#download-filename').text(filename);
    }
  }, 'xml');
});
