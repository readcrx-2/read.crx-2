# read.crx 2 [![GitHub version](https://badge.fury.io/gh/readcrx-2%2Fread.crx-2.svg)][repolink] [![MIT License](http://img.shields.io/badge/license-MIT-blue.svg?style=flat)](LICENSE)
read.crx 2は[Google Chrome][chrome]/[Mozilla Firefox][firefox] extensionとして作られた2chブラウザです。
[2ch.net(5ch.net)][5ch.net]、[2ch.sc][2ch.sc]、[open2ch.net][open2ch.net]及びその互換BBS、[まちBBS][machi]、[したらば][jbbs]の閲覧に対応しています。

一般の利用者向けの配布は[こちら](https://readcrx-2.github.io/read.crx-2/)

# ビルド手順
[pnpm][pnpm], [ClamAV][clamav]が予め導入されている必要が有ります。

    git clone git://github.com/readcrx-2/read.crx-2.git

    cd read.crx-2

    pnpm install

    pnpm run build
    pnpm run watch
    pnpm run pack
    pnpm run clean

詳細 : [Windows][winbuild]  [macOS][macosbuild]  [Linux][linuxbuild]

# 商用利用時の注意
read.crx 2のソースコードはMITライセンスですが、read.crx 2がアクセスするサービスの中には商用利用に制限が存在する場合が有ります。ご注意下さい。

# 謝辞
「[read.crx総合 part6](http://jbbs.shitaraba.net/bbs/read.cgi/computer/42710/1418134797/)」スレの507さん、663さん、663さん、698さん、708さん、773さん、780さん、835さん、897さんの変更を反映させていただきました。ありがとうございます。

また、作者である[awef](https://github.com/awef)さんにも感謝の意を表します。

# Maintainer
* [Kazuki Hashimoto](https://github.com/eru)
* [S](https://github.com/S--Minecraft)

[5ch.net]: http://www.5ch.net/
[2ch.sc]: http://2ch.sc/
[open2ch.net]: http://open2ch.net/
[chrome]: https://www.google.com/chrome
[firefox]: https://www.mozilla.org/firefox/
[clamav]: http://www.clamav.net/
[jbbs]: http://rentalbbs.livedoor.com/
[machi]: http://www.machi.to/
[pnpm]: https://pnpm.io/
[winbuild]: https://github.com/readcrx-2/read.crx-2/wiki/Windows%E3%81%A7%E3%81%AE%E3%83%93%E3%83%AB%E3%83%89%E6%96%B9%E6%B3%95
[macosbuild]: https://github.com/readcrx-2/read.crx-2/wiki/macOS%E3%81%A7%E3%81%AE%E3%83%93%E3%83%AB%E3%83%89%E6%96%B9%E6%B3%95
[linuxbuild]: https://github.com/readcrx-2/read.crx-2/wiki/Linux%E3%81%A7%E3%81%AE%E3%83%93%E3%83%AB%E3%83%89%E6%96%B9%E6%B3%95
[repolink]: http://badge.fury.io/gh/readcrx-2%2Fread.crx-2
