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
  addLast: ParentNode.append;
  addFirst: ParentNode.prepend;
  removeChildren<T extends Node>(): T;
  child(): HTMLCollection;
  first(): Element|null;
  last(): Element|null;
}
interface EventTarget {
  on: EventTarget.addEventListener;
  off: EventTarget.removeEventListener;
  emit: EventTarget.dispatchEvent;
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
  addLast: ParentNode.append;
  addFirst: ParentNode.prepend;
  addBefore: ChildNode.before;
  addAfter: ChildNode.after;
  removeChildren<T extends Node>(): T;
  parent(): HTMLElement;
  child(): HTMLCollection;
  prev(): Element;
  next(): Element;
  first(): Element;
  last(): Element;
  getAttr: Element.getAttribute;
  setAttr: Element.setAttribute;
  removeAttr: Element.removeAttribute;
  rmvAttr: Element.removeAttribute;
  hasAttr: boolean;
  attr(name: string, value?: string): string | null | void;
  getClass(): DOMTokenList;
  setClass(value: (string | Array)): Element;
  class(value?: string): DOMTokenList | Element;
  addClass(value: string): Element;
  removeClass(value: string): Element;
  toggleClass(value: string): Element;
  hasClass(value: string): boolean;
}
