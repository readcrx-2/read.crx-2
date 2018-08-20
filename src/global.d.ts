///<reference path="./shortQuery.d.ts" />

interface Window {
  browser: any;
  app: any;
}

declare var BroadcastChannel: any;
declare var browser: any;

declare namespace app {
  var config: any;
  var Callbacks: any;
  var log: any;
  var deepCopy: any;
  var message: any;
  var defer: any;
  var imgExt: string;

  var bookmark: any;
  var HTTP: any;
  var util: any;
}

interface HTMLElement {
  scrollIntoViewIfNeeded: Function;
}
