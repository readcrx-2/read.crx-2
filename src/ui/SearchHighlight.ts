const HIGHLIGHT_CLASS = "search_highlight";

interface CharSource {
  node: Text;
  start: number;
  end: number;
}

type NodeRangeMap = Map<Text, Array<[number, number]>>;

/**
 * Collects all non-empty Text nodes within a root element.
 */
function collectTextNodes(root: HTMLElement): Text[] {
  const nodes: Text[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let current: Node | null;
  while ((current = walker.nextNode()) !== null) {
    const textNode = current as Text;
    if (textNode.data.length > 0) {
      nodes.push(textNode);
    }
  }
  return nodes;
}

/**
 * Adds a range for a given Text node, merging with the previous range if contiguous.
 */
function pushNodeRange(
  nodeRanges: NodeRangeMap,
  node: Text,
  start: number,
  end: number,
): void {
  let list = nodeRanges.get(node);
  if (!list) {
    list = [];
    nodeRanges.set(node, list);
  }
  const prev = list[list.length - 1];
  if (prev && start <= prev[1]) {
    prev[1] = Math.max(prev[1], end);
  } else {
    list.push([start, end]);
  }
}

/**
 * Replaces matched slices of Text nodes with `<mark class="search_highlight">`.
 */
function applyRanges(nodeRanges: NodeRangeMap): void {
  for (const [node, ranges] of nodeRanges) {
    const parent = node.parentNode;
    if (!parent) continue;

    const text = node.data;
    const frag = document.createDocumentFragment();
    let cursor = 0;

    for (const [start, end] of ranges) {
      if (start > cursor) {
        frag.appendChild(document.createTextNode(text.slice(cursor, start)));
      }
      const mark = document.createElement("mark");
      mark.className = HIGHLIGHT_CLASS;
      mark.textContent = text.slice(start, end);
      frag.appendChild(mark);
      cursor = end;
    }

    if (cursor < text.length) {
      frag.appendChild(document.createTextNode(text.slice(cursor)));
    }
    parent.replaceChild(frag, node);
  }
}

/**
 * Highlights matches of a normalized query string inside an article element.
 */
function highlightNormalized(article: HTMLElement, query: string): void {
  if (!query) return;

  const textNodes = collectTextNodes(article);
  const normChunks: string[] = [];
  const charMap: CharSource[] = [];

  for (const node of textNodes) {
    const data = node.data;
    for (let i = 0; i < data.length; ) {
      const cp = data.codePointAt(i) ?? 0;
      const step = cp > 0xffff ? 2 : 1;
      const norm: string = app.util.normalize(data.slice(i, i + step));
      if (norm.length > 0) {
        normChunks.push(norm);
        for (let k = 0; k < norm.length; k++) {
          charMap.push({ node, start: i, end: i + step });
        }
      }
      i += step;
    }
  }

  const fullNorm = normChunks.join("");
  const nodeRanges: NodeRangeMap = new Map();
  let pos = 0;

  while ((pos = fullNorm.indexOf(query, pos)) !== -1) {
    const matchEnd = pos + query.length;
    for (let i = pos; i < matchEnd; i++) {
      const src = charMap[i];
      pushNodeRange(nodeRanges, src.node, src.start, src.end);
    }
    pos = matchEnd;
  }

  applyRanges(nodeRanges);
}

/**
 * Highlights matches of a RegExp inside an article element.
 */
function highlightRegExp(article: HTMLElement, pattern: RegExp): void {
  const textNodes = collectTextNodes(article);
  const segments: Array<{ node: Text; start: number; end: number }> = [];
  let totalLength = 0;

  for (const node of textNodes) {
    const len = node.data.length;
    segments.push({ node, start: totalLength, end: totalLength + len });
    totalLength += len;
  }

  const fullText = textNodes.map((n) => n.data).join("");
  const flags = pattern.flags.includes("g")
    ? pattern.flags
    : `${pattern.flags}g`;
  const reg = new RegExp(pattern.source, flags);
  const nodeRanges: NodeRangeMap = new Map();

  let match: RegExpExecArray | null;
  let segIdx = 0;
  while ((match = reg.exec(fullText)) !== null) {
    if (match[0].length === 0) {
      if (reg.lastIndex >= fullText.length) break;
      reg.lastIndex++;
      continue;
    }

    const matchStart = match.index;
    const matchEnd = matchStart + match[0].length;

    while (segIdx < segments.length && segments[segIdx].end <= matchStart) {
      segIdx++;
    }

    for (let i = segIdx; i < segments.length; i++) {
      const seg = segments[i];
      if (seg.start >= matchEnd) break;
      const localStart = Math.max(0, matchStart - seg.start);
      const localEnd = Math.min(seg.end - seg.start, matchEnd - seg.start);
      if (localEnd > localStart) {
        pushNodeRange(nodeRanges, seg.node, localStart, localEnd);
      }
    }
  }

  applyRanges(nodeRanges);
}

/**
 * Removes all search highlight `<mark>` elements under `container` and merges adjacent Text nodes.
 */
export function clear(container: HTMLElement): void {
  const marks = container.getElementsByClassName(HIGHLIGHT_CLASS);
  if (marks.length === 0) return;

  const parents = new Set<Node>();
  for (let i = marks.length - 1; i >= 0; i--) {
    const mark = marks[i];
    const parent = mark.parentNode;
    if (!parent) continue;
    parents.add(parent);
    parent.replaceChild(document.createTextNode(mark.textContent ?? ""), mark);
  }

  for (const parent of parents) {
    parent.normalize();
  }
}

/**
 * Highlights all occurrences of `query` (normalized string or RegExp) inside `article`.
 */
export function highlight(article: HTMLElement, query: string | RegExp): void {
  if (typeof query === "string") {
    highlightNormalized(article, query);
  } else {
    highlightRegExp(article, query);
  }
}

export default {
  clear,
  highlight,
};
