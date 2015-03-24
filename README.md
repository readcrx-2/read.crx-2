# read.crx 2
read.crx 2は[Google Chrome][chrome]アプリとして作られた2chブラウザです。
[2ch][2ch.net]及びその互換BBS、[まちBBS][machi]、[したらば][jbbs]の閲覧に対応しています。

一般の利用者向けの配布は[こちら](http://eru.github.io/read.crx-2/)

# ビルド手順
[npm][npm], [Bundler][bundler], [ImageMagick][imagemagick]が予め導入されている必要が有ります。

    git clone --recursive git://github.com/eru/read.crx-2.git

    cd read.crx-2

    npm install
    bundle install

    bundle exec rake pack
    bundle exec rake clean

# 商用利用時の注意
read.crx 2のソースコードはMITライセンスですが、read.crx 2がアクセスするサービスの中には商用利用に制限が存在する場合が有ります。ご注意下さい。

[2ch.net]: http://www.2ch.net/
[2ch.sc]: http://2ch.sc/
[open2ch.net]: http://open2ch.net/
[bundler]: http://gembundler.com/
[chrome]: https://www.google.com/chrome
[imagemagick]: http://www.imagemagick.org/
[jbbs]: http://rentalbbs.livedoor.com/
[machi]: http://www.machi.to/
[npm]: https://npmjs.org/
