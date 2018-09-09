$(function() {
  // 最新バージョン取得
  $.get({
    url: '//readcrx-2.github.io/read.crx-2/updates.xml',
    dataType: 'xml',
  }).done(function(data) {
    if (data) {
      var download = $('app[appid="mglmonflpdcckjdpjnpenfdmkbmggmgm"] > updatecheck', data).attr('codebase');
      var filename = download.substring(download.lastIndexOf('/') + 1, download.length);
      $('#download').attr('href', download);
      $('#download-filename').text(filename);
    }
  });
});
