$(function() {
  // 最新バージョン取得(crx)
  $.get({
    url: '//readcrx-2.github.io/read.crx-2/updates.xml',
    dataType: 'xml',
  }).done(function(data) {
    if (data) {
      var download = $('app[appid="eaibgccboimjelecbmgfjhakekfdcpeh"] > updatecheck', data).attr('codebase');
      var filename = download.substring(download.lastIndexOf('/') + 1, download.length);
      $('#downloadcrx').attr('href', download);
      $('#downloadcrx-filename').text(filename);
    }
  });

  // 最新バージョン取得(xpi)
  $.get({
    url: '//readcrx-2.github.io/read.crx-2/updates_firefox.json',
    dataType: 'json',
  }).done(function(data) {
    if (data) {
      var download = data.addons["read.crx2@read.crx"].updates[0].update_link;
      var filename = download.substring(download.lastIndexOf('/') + 1, download.length);
      $('#downloadxpi').attr('href', download);
      $('#downloadxpi-filename').text(filename);
    }
  });
});
