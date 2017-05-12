///<reference path="./shortQuery.d.ts" />

interface Window {
  chrome: any;
}

declare var requestIdleCallback: any;
declare var chrome: any;

declare namespace UI {
  var Animate: any;
}
declare namespace app {
  var Cache: any;
}
