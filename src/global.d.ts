///<reference path="./shortQuery.d.ts" />

interface Window {
  chrome: any;
}

declare var BroadcastChannel: any;
declare var chrome: any;

declare namespace UI {
  var Animate: any;
}
declare namespace app {
  var Cache: any;
  var BBSMenu: any;
  var config: any;
  var Callbacks: any;
  var log: any;
  var deepCopy: any;
  var message: any;
  var defer: any;
}
