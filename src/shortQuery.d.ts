declare namespace shortQuery {
  interface Static {
    constructor: NodeSelector.querySelectorAll;
    id: Document.getElementById;
    class: Document.getElementsByClassName;
    tag: Document.getElementsByTagName;
    query: NodeSelector.querySelector;
    queryAll: NodeSelector.querySelectorAll;
    I: Document.getElementById;
    C: Document.getElementsByClassName;
    T: Document.getElementsByTagName;
    $: NodeSelector.querySelector;
    $$: NodeSelector.querySelectorAll;
    create: Document.createElement;
    createFragment: Document.createDocumentFragment;
  }
}

declare var shortQuery: shortQuery.Static;
declare var $$: shortQuery.Static;
declare var $__: Document.createElement;
declare var $_F: Document.createDocumentFragment;

interface HTMLCollection {
  [Symbol.iterator](): IterableIterator<HTMLElement>;
}

interface Document {
  id: Document.getElementById;
  class: Document.getElementsByClassName;
  tag: Document.getElementsByTagName;
  query: NodeSelector.querySelector;
  queryAll: NodeSelector.querySelectorAll;
  I: Document.getElementById;
  C: Document.getElementsByClassName;
  T: Document.getElementsByTagName;
  $: NodeSelector.querySelector;
  $$: NodeSelector.querySelectorAll;
  create: Document.createElement;
  $__: Document.createElement;
  createFragment: Document.createDocumentFragment;
  $_F: Document.createDocumentFragment;
}
interface DocumentFragment {
  id: Document.getElementById;
  query: NodeSelector.querySelector;
  queryAll: NodeSelector.querySelectorAll;
  I: Document.getElementById;
  $: NodeSelector.querySelector;
  $$: NodeSelector.querySelectorAll;
  addLast: Node.appendChild;
  addFirst<T extends Node>(newChild: T); T;
  removeChildren<T extends Node>(); T;
  child(): HTMLCollection;
}
interface EventTarget {
  on: EventTarget.addEventListener
  off: EventTarget.removeEventListener
}
interface Element {
  childClass: Element.getElementsByClassName;
  childTag: Element.getElementsByTagName;
  query: Element.querySelector;
  queryAll: Element.querySelectorAll;
  C: Element.getElementsByClassName;
  T: Element.getElementsByTagName;
  $: Element.querySelector;
  $$: Element.querySelectorAll;
  addLast: Node.appendChild;
  addFirst<T extends Node>(newChild: T); T;
  addBefore<T extends Node>(newChild: T); T;
  addAfter<T extends Node>(newChild: T); T;
  remove<T extends Node>(); T;
  removeChildren<T extends Node>(); T;
  parent(): HTMLElement;
  child(): HTMLCollection;
  prev(): Element;
  next(): Element;
  getAttr: Element.getAttribute;
  setAttr: Element.setAttribute;
  removeAttr: Element.removeAttribute;
  rmvAttr: Element.removeAttribute;
  attr(name: string, value?: string): string | null | void;
  getClass(): DOMTokenList;
  setClass(value: (string | Array)): DOMTokenList | void;
  class(value?: string): DOMTokenList | void;
  addClass(value: string): DOMTokenList;
  removeClass(value: string): DOMTokenList;
  toggleClass(value: string): DOMTokenList;
  hasClass(value: string): boolean;
}
