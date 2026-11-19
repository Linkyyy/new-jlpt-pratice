// Ink follows the character or image under the start of a stroke when the page reflows.
export type InkAnchor = { kind: "text"; node: number; offset: number } | { kind: "image"; index: number } | { kind: "surface" };
export type InkStroke = { anchor: InkAnchor; points: string };

export function passageTextNodes(content: HTMLElement): Text[] {
  const passage = content.querySelector(".question-passage");
  if (!passage) return [];
  const walker = document.createTreeWalker(passage, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);
  return nodes;
}

export function findInkAnchor(content: HTMLElement, nodes: Text[], target: EventTarget, x: number, y: number): InkAnchor {
  if (target instanceof HTMLImageElement) {
    return { kind: "image", index: Array.from(content.querySelectorAll("img")).indexOf(target) };
  }
  const caret = document.caretPositionFromPoint?.(x, y);
  const range = caret ? null : document.caretRangeFromPoint?.(x, y);
  const node = caret?.offsetNode ?? range?.startContainer;
  const index = node instanceof Text ? nodes.indexOf(node) : -1;
  if (index < 0) return { kind: "surface" };
  return { kind: "text", node: index, offset: Math.min(caret?.offset ?? range?.startOffset ?? 0, nodes[index].length - 1) };
}

export function inkFrame(content: HTMLElement, nodes: Text[], anchor: InkAnchor) {
  const bounds = content.getBoundingClientRect();
  if (anchor.kind === "text") {
    const node = nodes[anchor.node];
    if (node && anchor.offset >= 0 && anchor.offset < node.length) {
      const range = document.createRange();
      range.setStart(node, anchor.offset);
      range.setEnd(node, anchor.offset + 1);
      const glyph = range.getBoundingClientRect();
      if (glyph.height > 0) return { x: glyph.left - bounds.left, y: glyph.top - bounds.top, width: glyph.height, height: glyph.height };
    }
  }
  if (anchor.kind === "image") {
    const image = content.querySelectorAll("img")[anchor.index];
    if (image?.naturalWidth && image.naturalHeight) {
      const rect = image.getBoundingClientRect();
      // Question images use object-fit: contain and can have space on either side.
      const scale = Math.min(rect.width / image.naturalWidth, rect.height / image.naturalHeight);
      const width = image.naturalWidth * scale, height = image.naturalHeight * scale;
      return { x: rect.left - bounds.left + (rect.width - width) / 2, y: rect.top - bounds.top + (rect.height - height) / 2, width, height };
    }
  }
  return { x: 0, y: 0, width: bounds.width || 1, height: bounds.height || 1 };
}
