# Windows ビルド手順
[npm][npm], [Bundler][bundler], [ImageMagick][imagemagick]が予め導入されている必要が有ります。

    convert.batをパスの通った場所に置く
    
    git clone --recursive git://github.com/eru/read.crx-2.git

    cd read.crx-2

    npm install
    bundle install
    
    setx ImageMagicP {ImageMagicが入っているパス}
    
    bundle exec rake
    