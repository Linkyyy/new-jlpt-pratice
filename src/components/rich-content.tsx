import { createElement, type ReactNode } from "react";

interface TextNode { type: "text"; value: string }
interface ElementNode { type: "element"; tag: string; children: ContentNode[]; colSpan?: number; rowSpan?: number }
type ContentNode = TextNode | ElementNode;
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
  const safeInput = html.replace(/<!--[^]*?-->/g, "").replace(/<(script|style|iframe|object)\b[^>]*>[^]*?<\/\1\s*>/gi, "");
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

function renderNodes(nodes: readonly ContentNode[]): ReactNode[] {
  return nodes.map((node, index) => {
    if (node.type === "text") return node.value;
    const directRows = node.tag === "table" ? node.children.filter((child) => child.type === "element" && child.tag === "tr") : [];
    const children: readonly ContentNode[] = directRows.length > 0 ? [...node.children.filter((child) => !directRows.includes(child)), { type: "element", tag: "tbody", children: directRows }] : node.children;
    const content = createElement(node.tag, { key: index, ...(node.colSpan ? { colSpan: node.colSpan } : {}), ...(node.rowSpan ? { rowSpan: node.rowSpan } : {}) }, ...renderNodes(children));
    return node.tag === "table" ? <div key={index} className="my-3 max-w-full overflow-x-auto">{content}</div> : content;
  });
}

export default function RichContent({ text, html = false, className = "", lang }: { text: string; html?: boolean; className?: string; lang?: string }) {
  return <div lang={lang} className={`min-w-0 max-w-full break-words [&_p]:my-2 [&_u]:underline [&_table]:border-collapse [&_td]:border [&_td]:border-slate-300 [&_td]:p-2 [&_th]:border [&_th]:border-slate-300 [&_th]:p-2 [&_ul]:list-inside [&_ul]:list-disc ${className}`}>{html ? renderNodes(parseContent(text)) : text}</div>;
}
