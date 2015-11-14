# encoding: utf-8

require "tmpdir"

task :watch do
  sh "bundle exec guard"
end

task :default => [
  "debug",
  "debug/manifest.json",
  "debug/lib",
  "debug/app.js",
  "debug/app_core.js",
  "debug/cs_addlink.js",
  "img:build",
  "ui:build",
  "view:build",
  "zombie:build",
  "write:build",
  "test:build",
  "jquery:build",
  "rmappjs"
]

task :clean do
  rm_f "./read.crx_2.zip"
  rm_rf "debug"
  Rake::Task["jquery:clean"].invoke
end

task :pack do
  require "json"

  MANIFEST = JSON.parse(open("src/manifest.json").read)

  Rake::Task[:clean].invoke
  Rake::Task[:default].invoke
  Rake::Task["test:run"].invoke
  Rake::Task[:scan].invoke

  Dir.mktmpdir do |tmpdir|
    cp_r "debug", "#{tmpdir}/debug"
    rm_r "#{tmpdir}/debug/test"

    if defined?(ENV["read.crx-2-pem-path"])
      pem_path = ENV["read.crx-2-pem-path"]
    else
      puts "秘密鍵のパスを入力して下さい"
      pem_path = STDIN.gets
    end

    if RUBY_PLATFORM.include?("darwin")
      sh "\"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome\" --pack-extension=#{tmpdir}/debug --pack-extension-key=#{pem_path}"
    elsif RUBY_PLATFORM.include?("linux")
      sh "google-chrome --pack-extension=#{tmpdir}/debug --pack-extension-key=#{pem_path}"
    else
      # Windowsの場合、Chromeの場所を環境変数から取得する(設定必)
      if pem_path == " "
        sh "#{ENV["CHROME_LOCATION"]} --pack-extension=\"#{tmpdir}/debug\""
      else
        sh "#{ENV["CHROME_LOCATION"]} --pack-extension=\"#{tmpdir}/debug\" --pack-extension-key=\"#{pem_path}\""
      end
    end
    mv "#{tmpdir}/debug.crx", "read.crx_2.#{MANIFEST["version"]}.crx"
  end
end

task :scan do
  sh "freshclam"
  sh "clamscan -ir debug"
end

def debug_id
  require "digest"
  hash = Digest::SHA256.hexdigest(File.absolute_path("debug"))
  hash[0...32].tr("0-9a-f", "a-p")
end

def haml(src, output)
  sh "bundle exec haml -E UTF-8 -r ./haml_requirement.rb -q #{src} #{output}"
end

def scss(src, output)
  sh "bundle exec scss -E UTF-8 -t compressed #{src} #{output}"
end

def coffee(src, output)
  if src.is_a? Array
    src = src.join(" ")
  end

  if RUBY_PLATFORM.include?("darwin") || RUBY_PLATFORM.include?("linux")
    sh "cat #{src} | node_modules/.bin/coffee -cbs > #{output}"
  else
    sh "cat #{src} | \"node_modules/.bin/coffee\" -cbs > #{output}"
  end
end

def typescript(src, output)
  unless src.is_a? Array
    src = [src]
  end

  src.each {|a|
    sh "node_modules/.bin/tsc --target ES5 #{a}"
  }

  tmp = src.map {|a| a.gsub(/\.ts$/, ".js") }
  tmp = tmp.sort {|a, b| a.split(".").length - b.split(".").length }

  sh "cat #{tmp.join " "} > #{output}"
  rm tmp
end

def file_ct(target, src)
  if !src.is_a? Array
    src = [src]
  end

  file target => src do
    Dir.mktmpdir do |tmpdir|
      coffeeSrc = src.clone
      coffeeSrc.reject! {|a| (/\.coffee$/ =~ a) == nil }

      tsSrc = src.clone
      tsSrc.reject! {|a| (/\.ts$/ =~ a) == nil }

      coffee(coffeeSrc, "#{tmpdir}/_coffee.js")
      typescript(tsSrc, "#{tmpdir}/ts.js")
      sh "cat #{tmpdir}/ts.js #{tmpdir}/_coffee.js > #{target}"
    end
  end
end

def file_coffee(target, src)
  file target => src do
    coffee(src, target)
  end
end

def file_copy(target, src)
  file target => src do
    cp src, target
  end
end

def file_typescript(target, src)
  file target => src do
    typescript(src, target)
  end
end

rule ".html" => "%{^debug/,src/}X.haml" do |t|
  haml(t.prerequisites[0], t.name)
end

rule ".css" => "%{^debug/,src/}X.scss" do |t|
  scss(t.prerequisites[0], t.name)
end

rule ".js" => "%{^debug/,src/}X.coffee" do |t|
  coffee(t.prerequisites[0], t.name)
end

rule ".png" => "src/image/svg/%{_\\d+x\\d+(?:_[a-fA-F0-9]+)?(?:_r\\-?\\d+)?$,}n.svg" do |t|
  /_(\d+)x(\d+)(?:_([a-fA-F0-9]*))?(?:_r(\-?\d+))?\.png$/ =~ t.name

  command = "convert -background transparent"

  if $3
    if RUBY_PLATFORM.include?("darwin") || RUBY_PLATFORM.include?("linux")
      command += " -fill '##{$3}' -opaque '#333'"
    else
      command += " -fill ##{$3} -opaque #333"
    end
  end

  if $4
    if RUBY_PLATFORM.include?("darwin") || RUBY_PLATFORM.include?("linux")
      command += " -rotate '#{$4}'"
    else
      command += " -rotate #{$4}"
    end
  end

  command += " -resize #{$1}x#{$2} #{t.prerequisites[0]} #{t.name}"

  sh command
end

directory "debug"
directory "debug/lib"

file_copy "debug/manifest.json", "src/manifest.json"

file_typescript "debug/app.js", "src/app.ts"

file_ct "debug/app_core.js", FileList["src/core/*.coffee", "src/core/*.ts"]

task "rmappjs" do
  if File.exist?("src/app.js")
    rm "src/app.js"
  end
end

#img
namespace :img do
  task :build => [
    "debug/img",
    "debug/img/favicon.ico",
    "debug/img/read.crx_128x128.png",
    "debug/img/read.crx_48x48.png",
    "debug/img/read.crx_16x16.png",
    "debug/img/close_16x16.png",
    "debug/img/dummy_1x1.png",
    "debug/img/loading.svg",

    "debug/img/arrow_19x19_333_r90.png",
    "debug/img/arrow_19x19_333_r-90.png",
    "debug/img/search2_19x19_777.png",
    "debug/img/star_19x19_333.png",
    "debug/img/star_19x19_007fff.png",
    "debug/img/reload_19x19_333.png",
    "debug/img/pencil_19x19_333.png",
    "debug/img/menu_19x19_333.png",

    "debug/img/arrow_19x19_ddd_r90.png",
    "debug/img/arrow_19x19_ddd_r-90.png",
    "debug/img/search2_19x19_aaa.png",
    "debug/img/star_19x19_ddd.png",
    "debug/img/star_19x19_f93.png",
    "debug/img/reload_19x19_ddd.png",
    "debug/img/pencil_19x19_ddd.png",
    "debug/img/menu_19x19_ddd.png"
  ]

  directory "debug/img"

  file "debug/img/favicon.ico" => "src/image/svg/read.crx.svg"do |t|
    if RUBY_PLATFORM.include?("darwin") || RUBY_PLATFORM.include?("linux")
      sh "convert #{t.prerequisites[0]}\
          \\( -clone 0 -resize 16x16 \\)\
          \\( -clone 0 -resize 32x32 \\)\
          -delete 0\
          #{t.name}"
    else
      sh "convert #{t.prerequisites[0]} ( -clone 0 -resize 16x16 \) ( -clone 0 -resize 32x32 \) -delete 0 #{t.name}"
    end
  end

  file "debug/img/read.crx_128x128.png" => "src/image/svg/read.crx.svg" do |t|
    sh "convert -background transparent -resize 96x96 -extent 128x128-16-16 src/image/svg/read.crx.svg #{t.name}"
  end

  file_copy "debug/img/loading.svg", "src/image/svg/loading.svg"
end

#ui
namespace :ui do
  task :build => ["debug/ui.css", "debug/ui.js"]

  file "debug/ui.css" => FileList["src/common.scss"].include("src/ui/*.scss") do |t|
    scss("src/ui/ui.scss", t.name)
  end

  file_ct "debug/ui.js", FileList["src/ui/*.coffee", "src/ui/*.ts"]
end

#View
namespace :view do
  directory "debug/view"

  view = [
    "debug/view",
    "debug/view/module.js"
  ]

  FileList["src/view/*.haml"].each {|x|
    view.push(x.sub(/^src\//, "debug/").sub(/\.haml$/, ".html"))
  }

  FileList["src/view/*.coffee"].each {|x|
    view.push(x.sub(/^src\//, "debug/").sub(/\.coffee$/, ".js"))
  }

  FileList["src/view/*.scss"].each {|scss_path|
    css_path = scss_path.sub(/^src\//, "debug/").sub(/\.scss$/, ".css")
    view.push(css_path)
    file css_path => ["src/common.scss", scss_path] do |t|
      scss(scss_path, t.name)
    end
  }

  task :build => view
end

#Zombie
namespace :zombie do
  task :build => ["debug/zombie.html", "debug/zombie.js"]
end

#Write
namespace :write do
  task :build => [
    "debug/write",
    "debug/write/write.html",
    "debug/write/write.css",
    "debug/write/write.js",
    "debug/write/cs_write.js"
  ]

  directory "debug/write"

  file "debug/write/write.css" => [
      "src/common.scss",
      "src/write/write.scss"
    ] do |t|
    scss("src/write/write.scss", t.name)
  end

  file_ct "debug/write/write.js", [
    "src/core/URL.ts",
    "src/core/Ninja.coffee",
    "src/write/write.coffee"
  ]

  file_ct "debug/write/cs_write.js", [
    "debug/app.js",
    "src/core/URL.ts",
    "src/write/cs_write.coffee"
  ]
end

namespace :test do
  task :build => [
    "debug/test",
    "debug/test/jasmine",
    "debug/test/jasmine/jasmine.js",
    "debug/test/jasmine/jasmine-html.js",
    "debug/test/jasmine/jasmine.css",

    "debug/test/qunit",
    "debug/test/qunit/qunit.js",
    "debug/test/qunit/qunit.css",
    "debug/test/qunit/qunit-step.js",

    "debug/test/jquery.mockjax.js",

    "debug/test/test.html",
    "debug/test/jasmine-exec.js",
    "debug/test/test.js",
    "debug/test/spec.js",
    "debug/test/message_test.html",
    "debug/test/message_test.js"
  ]

  task :run, :filter do |t, args|
    require "cgi"

    if defined?(ENV["read.crx-2-id"])
      url = "chrome-extension://#{ENV["read.crx-2-id"]}/test/test.html"
    else
      url = "chrome-extension://#{debug_id}/test/test.html"
    end

    if args[:filter]
      tmp = CGI.escape(args[:filter]).gsub("\+", "%20")
      url += "?filter=#{tmp}&spec=#{tmp}"
    end
    if RUBY_PLATFORM.include?("darwin")
      # sh "\"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome\" '#{url}'"
    elsif RUBY_PLATFORM.include?("linux")
      sh "google-chrome '#{url}'"
    else
      # Windowsの場合、Chromeの場所を環境変数から取得する(設定必)
      sh "#{ENV["CHROME_LOCATION"]} #{url}"
    end
  end

  directory "debug/test"

  file_copy "debug/test/jquery.mockjax.js", "lib/jquery-mockjax/jquery.mockjax.js"

  directory "debug/test/jasmine"
  file_copy "debug/test/jasmine/jasmine.js", "lib/jasmine/lib/jasmine-core/jasmine.js"
  file_copy "debug/test/jasmine/jasmine-html.js", "lib/jasmine/lib/jasmine-core/jasmine-html.js"
  file_copy "debug/test/jasmine/jasmine.css", "lib/jasmine/lib/jasmine-core/jasmine.css"

  file_coffee "debug/test/spec.js", FileList["src/test/*.spec.coffee"]

  directory "debug/test/qunit"
  file_copy "debug/test/qunit/qunit.js", "lib/qunit/qunit/qunit.js"
  file_copy "debug/test/qunit/qunit.css", "lib/qunit/qunit/qunit.css"
  file_copy "debug/test/qunit/qunit-step.js", "lib/qunit/addons/step/qunit-step.js"

  file_coffee "debug/test/test.js", FileList["src/test/test_*.coffee"]
end

namespace :jquery do
  task :build => "debug/lib/jquery/jquery.min.js"

  task :clean do
    rm_rf "debug/lib/jquery"
    cd "lib/jquery" do
      sh "git checkout -f"
      sh "git clean -fdx -e node_modules/"
    end
  end

  file "debug/lib/jquery/jquery.min.js" => "lib/jquery_delegate_middle_click.patch" do
    Rake::Task["jquery:clean"].invoke
    cd "lib/jquery" do
      sh "npm install"
      sh "git apply ../jquery_delegate_middle_click.patch --whitespace=fix"
      sh "git apply ../jquery_delete_map.patch --whitespace=fix"
      if RUBY_PLATFORM.match(/darwin|linux/)
        sh "env PATH=$PATH:../../node_modules/.bin/ grunt"
      else
        zpath = File.expand_path('../lib/jquery/node_modules/.bin', __FILE__)
        sh "#{zpath}/grunt.cmd"
      end
      sh "sed -i -e \"3a /* このファイルはread.crx 2用にawefが改造した物です */\" dist/jquery.min.js"
    end

    mkdir_p "debug/lib/jquery"
    cp "lib/jquery/dist/jquery.min.js", "debug/lib/jquery/jquery.min.js"
  end
end
