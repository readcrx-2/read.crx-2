///<reference path="./shortQuery.d.ts" />

interface Window {
  app: any;
}

declare namespace app {
  var config: any;
  var Callbacks: any;
  var log: any;
  var deepCopy: any;
  var message: any;
  var defer: any;

  var bookmark: any;
  var HTTP: any;
  var util: any;
}

declare namespace browser.bookmarks {
  const onImportBegan: EvListener<() => void>;
  const onImportEnded: EvListener<() => void>;
}
