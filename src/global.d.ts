///<reference path="./shortQuery.d.ts" />

interface Window {
  app: any;
}

declare namespace app {
  const config: any;
  const Callbacks: any;
  const log: any;
  const deepCopy: any;
  const message: any;
  const defer: any;

  const bookmark: any;
  const HTTP: any;
  const util: any;
}

declare namespace browser.bookmarks {
  const onImportBegan: EvListener<() => void>;
  const onImportEnded: EvListener<() => void>;
}
