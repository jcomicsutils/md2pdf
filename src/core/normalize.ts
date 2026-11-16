import type { Block, DocIR, Inline } from './ir.ts';
import { DEFAULT_SETTINGS, type DocSettings } from './settings.ts';

/**
 * Consecutive `pagebreak` nodes become one; leading and trailing ones are dropped.
 */
export function collapseBreaks(blocks: Block[]): Block[] {
  const out: Block[] = [];
  for (const b of blocks) {
    if (b.t === 'pagebreak') {
      if (out.length === 0) {
        continue; // drop leading
      }
      if (out[out.length - 1]!.t === 'pagebreak') {
        continue; // collapse consecutive
      }
      out.push({ ...b });
    } else {
      out.push({ ...b });
    }
  }
  while (out.length > 0 && out[out.length - 1]!.t === 'pagebreak') {
    out.pop();
  }
  return out;
}

/**
 * Set `pageBefore` on h1 (and h2 if enabled), except for the first block.
 * Remove a `pagebreak` that immediately precedes a heading with `pageBefore`.
 */
export function applyHeadingBreaks(
  blocks: Block[],
  settings: DocSettings = DEFAULT_SETTINGS
): Block[] {
  const collapsed = collapseBreaks(blocks);
  const out: Block[] = [];

  for (let i = 0; i < collapsed.length; i++) {
    const b = collapsed[i]!;
    if (b.t === 'heading') {
      const shouldBreak =
        !b.noBreakBefore &&
        ((b.level === 1 && settings.breaks.h1) || (b.level === 2 && settings.breaks.h2));
      const prevIsPagebreak = out.length > 0 && out[out.length - 1]!.t === 'pagebreak';

      if (shouldBreak && out.length > 0) {
        if (prevIsPagebreak) {
          out.pop();
        }
        out.push({ ...b, pageBefore: true });
      } else if (prevIsPagebreak) {
        out.pop();
        out.push({ ...b, pageBefore: true });
      } else {
        out.push({ ...b });
      }
    } else {
      out.push({ ...b });
    }
  }
  return out;
}

function isImageOnlyPara(inlines: Inline[]): boolean {
  if (inlines.length === 0) return false;
  let hasImage = false;
  for (const inl of inlines) {
    if (inl.t === 'image') {
      hasImage = true;
    } else if (inl.t === 'text' && inl.v.trim() === '') {
      continue;
    } else {
      return false;
    }
  }
  return hasImage;
}

/**
 * `keep: true` for code up to `codeLines` lines, tables up to `tableRows` rows,
 * lists up to `listItems` items, quotes up to `quoteBlocks` blocks, all display math,
 * and image-only paragraphs.
 */
export function markKeep(blocks: Block[], settings: DocSettings = DEFAULT_SETTINGS): Block[] {
  const { codeLines, tableRows, listItems, quoteBlocks } = settings.smartKeep;
  return blocks.map((b): Block => {
    switch (b.t) {
      case 'code': {
        const lineCount = b.v === '' ? 1 : b.v.split('\n').length;
        return lineCount <= codeLines ? { ...b, keep: true } : { ...b };
      }
      case 'table': {
        return b.rows.length <= tableRows ? { ...b, keep: true } : { ...b };
      }
      case 'list': {
        return b.items.length <= listItems ? { ...b, keep: true } : { ...b };
      }
      case 'quote': {
        const inner = markKeep(b.c, settings);
        return b.c.length <= quoteBlocks
          ? { ...b, c: inner, keep: true }
          : { ...b, c: inner };
      }
      case 'math': {
        return { ...b, keep: true };
      }
      case 'para': {
        return isImageOnlyPara(b.c) ? { ...b, keep: true } : { ...b };
      }
      default:
        return { ...b };
    }
  });
}

function stripTableCaptionPrefix(inlines: Inline[]): Inline[] | null {
  if (inlines.length === 0) return null;
  const first = inlines[0]!;
  if (first.t !== 'text') return null;
  const match = /^Table:\s*/.exec(first.v);
  if (!match) return null;
  const restText = first.v.slice(match[0].length);
  const out: Inline[] = [];
  if (restText.length > 0) {
    out.push({ t: 'text', v: restText });
  }
  for (let i = 1; i < inlines.length; i++) {
    out.push(inlines[i]!);
  }
  return out;
}

/**
 * A paragraph starting with `Table:` directly after a table becomes its `caption`.
 */
export function attachCaptions(blocks: Block[]): Block[] {
  const out: Block[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i]!;
    if (b.t === 'para' && out.length > 0) {
      const prev = out[out.length - 1]!;
      if (prev.t === 'table' && !prev.caption) {
        const captionInlines = stripTableCaptionPrefix(b.c);
        if (captionInlines !== null) {
          out[out.length - 1] = { ...prev, caption: captionInlines };
          continue;
        }
      }
    }
    out.push({ ...b });
  }
  return out;
}

export function normalizeDoc(doc: DocIR, settings: DocSettings = DEFAULT_SETTINGS): DocIR {
  let blocks = collapseBreaks(doc.blocks);
  blocks = attachCaptions(blocks);
  blocks = applyHeadingBreaks(blocks, settings);
  blocks = markKeep(blocks, settings);
  return {
    blocks,
    meta: { ...doc.meta },
  };
}
