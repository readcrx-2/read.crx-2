///<reference path="../node_modules/@types/jquery/index.d.ts" />

interface Window {
  chrome: any;
}

declare var requestIdleCallback: any;
declare var chrome: any;

declare namespace UI {
  var Animate: any;
}
