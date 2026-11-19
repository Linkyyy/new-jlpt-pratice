// Ink follows the character or image under the start of a stroke when the page reflows.
export type InkAnchor = { kind: "text"; node: number; offset: number } | { kind: "image"; index: number } | { kind: "surface" };
export type InkStroke = { anchor: InkAnchor; points: string };

interface PassageTextPart { text: Text; node: number; offset: number }

export function passageTextNodes(content: HTMLElement): PassageTextPart[] {
  const passage = content.querySelector(".question-passage");
  if (!passage) return [];
  const walker = document.createTreeWalker(passage, NodeFilter.SHOW_TEXT);
  const nodes: PassageTextPart[] = [];
  let nextNode = 0;
  while (walker.nextNode()) {
    const text = walker.currentNode as Text;
    if (text.parentElement?.closest("[data-passage-insert]")) continue;
    const original = text.parentElement?.closest<HTMLElement>("[data-passage-node]");
    // Translations split an existing text node without changing stored ink anchors.
    const node = original ? Number(original.dataset.passageNode) : nextNode;
    nodes.push({ text, node, offset: Number(original?.dataset.passageOffset ?? 0) });
    nextNode = node + 1;
  }
  return nodes;
}

export function findInkAnchor(content: HTMLElement, nodes: PassageTextPart[], target: EventTarget, x: number, y: number): InkAnchor {
  if (target instanceof HTMLImageElement) {
    return { kind: "image", index: Array.from(content.querySelectorAll("img")).indexOf(target) };
  }
  const caret = document.caretPositionFromPoint?.(x, y);
  const range = caret ? null : document.caretRangeFromPoint?.(x, y);
  const node = caret?.offsetNode ?? range?.startContainer;
  const part = nodes.find(candidate => candidate.text === node);
  if (!part) return { kind: "surface" };
  return { kind: "text", node: part.node, offset: part.offset + Math.min(caret?.offset ?? range?.startOffset ?? 0, part.text.length - 1) };
}

export function inkFrame(content: HTMLElement, nodes: PassageTextPart[], anchor: InkAnchor) {
  const bounds = content.getBoundingClientRect();
  if (anchor.kind === "text") {
    const part = nodes.find(candidate => candidate.node === anchor.node && candidate.offset <= anchor.offset && anchor.offset < candidate.offset + candidate.text.length);
    if (part) {
      const offset = anchor.offset - part.offset;
      const range = document.createRange();
      range.setStart(part.text, offset);
      range.setEnd(part.text, offset + 1);
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
