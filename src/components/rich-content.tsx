import { createElement, Fragment, type ReactNode } from "react";

interface TextNode { type: "text"; value: string }
interface ElementNode { type: "element"; tag: string; children: ContentNode[]; colSpan?: number; rowSpan?: number }
type ContentNode = TextNode | ElementNode;
interface TextInsert { original: string; content: ReactNode }
interface NodeInsert { at: number; content: ReactNode }
type InsertPlan = Map<TextNode, { sourceIndex: number; inserts: NodeInsert[] }>;
const allowedTags = new Set(["p", "div", "span", "u", "b", "strong", "em", "br", "ul", "ol", "li", "table", "thead", "tbody", "tr", "td", "th", "h3", "h4", "h5", "ruby", "rt", "sup", "sub"]);
const blockTags = new Set(["p", "div", "ul", "ol", "table", "h3", "h4", "h5"]);

function decodeEntities(value: string): string {
  const entities: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: "\u00a0", ensp: "\u2002", emsp: "\u2003" };
  return value.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (match: string, entity: string) => {
    if (entity.startsWith("#")) {
      const code = entity[1].toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : match;
    }
    return entities[entity.toLowerCase()] ?? match;
  });
}

function parseContent(html: string): ContentNode[] {
  const root: ElementNode = { type: "element", tag: "root", children: [] };
  const stack = [root];
  // 不注入原始 HTML；仅生成白名单 React 元素，丢弃事件、样式、链接等外部属性。
  const safeInput = html.replace(/<!--[^]*?-->/g, "").replace(/<(script|style|iframe|object)\b[^>]*>[^]*?<\/\1\s*>/gi, "").replace(/<\/[a-z][a-z0-9]*\s*$/i, "");
  for (const token of safeInput.match(/<\/?[a-z][^>]*>|[^<]+|</gi) ?? []) {
    const tagMatch = token.match(/^<(\/?)([a-z0-9]+)/i);
    if (!tagMatch) { stack[stack.length - 1].children.push({ type: "text", value: decodeEntities(token) }); continue; }
    const tag = tagMatch[2].toLowerCase();
    if (!allowedTags.has(tag)) {
      if (/^<https?:\/\//i.test(token)) stack[stack.length - 1].children.push({ type: "text", value: token });
      continue;
    }
    if (tagMatch[1]) {
      let index = -1;
      for (let position = stack.length - 1; position > 0; position--) { if (stack[position].tag === tag) { index = position; break; } }
      if (index > 0) stack.splice(index);
      continue;
    }
    if (blockTags.has(tag)) {
      const paragraph = stack.findIndex((node) => node.tag === "p");
      if (paragraph > 0) stack.splice(paragraph);
    }
    const element: ElementNode = { type: "element", tag, children: [] };
    for (const [attribute, key] of [["colspan", "colSpan"], ["rowspan", "rowSpan"]] as const) {
      const match = token.match(new RegExp(`\\b${attribute}\\s*=\\s*["']?(\\d+)`, "i"));
      if (match) element[key] = Math.min(20, Math.max(1, Number(match[1])));
    }
    stack[stack.length - 1].children.push(element);
    if (tag !== "br" && !/\/\s*>$/.test(token)) stack.push(element);
  }
  return root.children;
}

function childrenInRenderOrder(node: ElementNode): readonly ContentNode[] {
  const rows = node.tag === "table" ? node.children.filter((child) => child.type === "element" && child.tag === "tr") : [];
  return rows.length ? [...node.children.filter((child) => !rows.includes(child)), { type: "element", tag: "tbody", children: rows }] : node.children;
}

function collectText(nodes: readonly ContentNode[]): TextNode[] {
  return nodes.flatMap(node => node.type === "element" ? collectText(childrenInRenderOrder(node)) : node.value ? [node] : []);
}

function planInserts(nodes: readonly ContentNode[], inserts: readonly TextInsert[]): InsertPlan | undefined {
  const textNodes = collectText(nodes);
  const compact = (text: string) => text.replace(/\s/gu, "");
  const parts = inserts.map(part => compact(part.original));
  if (parts.some(part => !part) || compact(textNodes.map(node => node.value).join("")) !== parts.join("")) return undefined;

  const result: InsertPlan = new Map();
  let next = 0, end = parts[0].length, offset = 0;
  textNodes.forEach((node, sourceIndex) => {
    const additions: NodeInsert[] = [];
    for (const char of node.value.matchAll(/\S/gu)) {
      offset += char[0].length;
      if (offset !== end) continue;
      additions.push({ at: char.index + char[0].length, content: inserts[next].content });
      next++;
      end += parts[next]?.length ?? 0;
    }
    if (additions.length) result.set(node, { sourceIndex, inserts: additions });
  });
  return result;
}

function renderNodes(nodes: readonly ContentNode[], plan?: InsertPlan): ReactNode[] {
  return nodes.map((node, index) => {
    if (node.type === "text") {
      const entry = plan?.get(node);
      if (!entry) return node.value;
      let start = 0;
      const fragment = (from: number, to: number) => <span data-passage-node={entry.sourceIndex} data-passage-offset={from}>{node.value.slice(from, to)}</span>;
      const parts = entry.inserts.map(({ at, content }) => {
        const piece = <Fragment key={at}>{fragment(start, at)}{content}</Fragment>;
        start = at;
        return piece;
      });
      return <Fragment key={index}>{parts}{start < node.value.length && fragment(start, node.value.length)}</Fragment>;
    }
    const content = createElement(node.tag, { key: index, ...(node.colSpan ? { colSpan: node.colSpan } : {}), ...(node.rowSpan ? { rowSpan: node.rowSpan } : {}) }, ...renderNodes(childrenInRenderOrder(node), plan));
    return node.tag === "table" ? <div key={index} className="my-3 max-w-full overflow-x-auto">{content}</div> : content;
  });
}

export default function RichContent({ text, html = false, className = "", lang, insertAfter }: { text: string; html?: boolean; className?: string; lang?: string; insertAfter?: readonly TextInsert[] }) {
  const nodes = html ? parseContent(text) : [{ type: "text", value: text } satisfies TextNode];
  const plan = insertAfter?.length ? planInserts(nodes, insertAfter) : undefined;
  return <div lang={lang} className={`min-w-0 max-w-full break-words [&_p]:my-2 [&_u]:underline [&_table]:border-collapse [&_td]:border [&_td]:border-slate-300 [&_td]:p-2 [&_th]:border [&_th]:border-slate-300 [&_th]:p-2 [&_ul]:list-inside [&_ul]:list-disc ${className}`}>{renderNodes(nodes, plan)}</div>;
}
