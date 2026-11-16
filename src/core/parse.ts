import MarkdownIt, { type StateBlock, type StateInline, type Token } from 'markdown-it';
import { directivesPlugin } from './directives.ts';
import type { Block, DocIR, Inline } from './ir.ts';
import { mathPlugin } from './math-plugin.ts';

type MdInstance = InstanceType<typeof MarkdownIt>;

function createSlugger() {
  const seen = new Map<string, number>();
  return (rawText: string): string => {
    const base =
      rawText
        .toLowerCase()
        .trim()
        .replace(/[^\p{L}\p{N}\s-]/gu, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '') || 'section';
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count === 0 ? base : `${base}-${count}`;
  };
}

function footnotesPlugin(md: MdInstance): void {
  // Block rule to collect [^id]: definition lines
  md.block.ruler.before(
    'reference',
    'md2pdf_footnote_def',
    (state: StateBlock, startLine: number, endLine: number, silent: boolean) => {
      const pos = (state.bMarks[startLine] ?? 0) + (state.tShift[startLine] ?? 0);
      const max = state.eMarks[startLine] ?? 0;
      const lineText = state.src.slice(pos, max);
      const match = /^\[\^([^\]]+)\]:\s*(.*)$/.exec(lineText);
      if (!match) {
        return false;
      }
      if (silent) {
        return true;
      }
      const id = match[1]!;
      const firstPara = match[2] ?? '';
      const contentLines: string[] = [firstPara];

      let nextLine = startLine + 1;
      while (nextLine < endLine) {
        const lPos = state.bMarks[nextLine] ?? 0;
        const lMax = state.eMarks[nextLine] ?? 0;
        const raw = state.src.slice(lPos, lMax);
        if (raw.trim() === '') {
          break;
        }
        if (/^( {2,}|\t)/.test(raw)) {
          contentLines.push(raw.replace(/^( {1,4}|\t)/, ''));
          nextLine++;
        } else {
          break;
        }
      }

      state.line = nextLine;
      const env = state.env as { footnotes?: { id: string; content: string; line: number }[] };
      if (!env.footnotes) {
        env.footnotes = [];
      }
      env.footnotes.push({
        id,
        content: contentLines.join('\n').trim(),
        line: startLine,
      });
      return true;
    }
  );

  // Inline rule for [^id] references
  md.inline.ruler.before(
    'link',
    'md2pdf_footnote_ref',
    (state: StateInline, silent: boolean) => {
    const src = state.src;
    const pos = state.pos;
    const max = state.posMax;
    if (
      pos + 3 >= max ||
      src.charCodeAt(pos) !== 0x5b /* [ */ ||
      src.charCodeAt(pos + 1) !== 0x5e /* ^ */
    ) {
      return false;
    }
    const closeIdx = src.indexOf(']', pos + 2);
    if (closeIdx === -1 || closeIdx >= max) {
      return false;
    }
    // Must not be followed immediately by ':'
    if (closeIdx + 1 < max && src.charCodeAt(closeIdx + 1) === 0x3a) {
      return false;
    }
    const id = src.slice(pos + 2, closeIdx).trim();
    if (!id || /\s/.test(id)) {
      return false;
    }
    if (!silent) {
      const token = state.push('footnote_ref', '', 0);
      token.content = id;
    }
    state.pos = closeIdx + 1;
    return true;
  });
}

function inlinesToPlainText(inlines: Inline[]): string {
  return inlines
    .map((inl) => {
      switch (inl.t) {
        case 'text':
        case 'code':
          return inl.v;
        case 'math':
          return inl.tex;
        case 'em':
        case 'strong':
        case 'del':
        case 'link':
          return inlinesToPlainText(inl.c);
        case 'image':
          return inl.alt;
        case 'br':
          return ' ';
        case 'footnote':
          return '';
      }
    })
    .join('');
}

function convertInlineTokens(tokens: Token[]): Inline[] {
  const result: Inline[] = [];
  let i = 0;

  function parseUntil(closeType: string): Inline[] {
    const inner: Inline[] = [];
    while (i < tokens.length) {
      const tok = tokens[i]!;
      if (tok.type === closeType) {
        i++;
        break;
      }
      const converted = nextInline();
      if (converted) {
        inner.push(converted);
      }
    }
    return inner;
  }

  function nextInline(): Inline | null {
    const tok = tokens[i++]!;
    switch (tok.type) {
      case 'text':
        return tok.content ? { t: 'text', v: tok.content } : null;
      case 'code_inline':
        return { t: 'code', v: tok.content };
      case 'math_inline':
        return { t: 'math', tex: tok.content };
      case 'softbreak':
        return { t: 'text', v: '\n' };
      case 'hardbreak':
        return { t: 'br' };
      case 'em_open':
        return { t: 'em', c: parseUntil('em_close') };
      case 'strong_open':
        return { t: 'strong', c: parseUntil('strong_close') };
      case 's_open':
        return { t: 'del', c: parseUntil('s_close') };
      case 'link_open': {
        const href = String(tok.attrGet('href') ?? '');
        const c = parseUntil('link_close');
        return { t: 'link', href, c };
      }
      case 'image': {
        const src = String(tok.attrGet('src') ?? '');
        const rawTitle = tok.attrGet('title');
        const title = rawTitle !== null && rawTitle !== undefined ? String(rawTitle) : undefined;
        const alt = tok.children ? inlinesToPlainText(convertInlineTokens(tok.children)) : tok.content;
        return title ? { t: 'image', src, alt, title } : { t: 'image', src, alt };
      }
      case 'footnote_ref':
        return { t: 'footnote', id: tok.content };
      default:
        return tok.content ? { t: 'text', v: tok.content } : null;
    }
  }

  while (i < tokens.length) {
    const item = nextInline();
    if (item) {
      // Coalesce adjacent text nodes
      const prev = result[result.length - 1];
      if (item.t === 'text' && prev && prev.t === 'text') {
        prev.v += item.v;
      } else {
        result.push(item);
      }
    }
  }

  return result;
}

function bracedFencePlugin(md: MdInstance): void {
  md.block.ruler.before(
    'fence',
    'md2pdf_braced_fence',
    (state: StateBlock, startLine: number, endLine: number, silent: boolean) => {
      const pos = (state.bMarks[startLine] ?? 0) + (state.tShift[startLine] ?? 0);
      const max = state.eMarks[startLine] ?? 0;
      const openLine = state.src.slice(pos, max);
      const openMatch = /^(`{3,})\s*([^\s`]+)\{\s*$/.exec(openLine);
      if (!openMatch) {
        return false;
      }
      const fenceTicks = openMatch[1]!;
      const lang = openMatch[2]!;
      const closeRe = new RegExp(`^\\s*\\}${fenceTicks}\\s*$`);

      let nextLine = startLine + 1;
      let foundClose = false;
      while (nextLine < endLine) {
        const lPos = state.bMarks[nextLine] ?? 0;
        const lMax = state.eMarks[nextLine] ?? 0;
        if (closeRe.test(state.src.slice(lPos, lMax))) {
          foundClose = true;
          break;
        }
        nextLine++;
      }
      if (!foundClose) {
        return false;
      }
      if (silent) {
        return true;
      }

      const contentLines: string[] = [];
      for (let ln = startLine + 1; ln < nextLine; ln++) {
        const lPos = state.bMarks[ln] ?? 0;
        const lMax = state.eMarks[ln] ?? 0;
        contentLines.push(state.src.slice(lPos, lMax));
      }

      state.line = nextLine + 1;
      const token = state.push('fence', 'code', 0);
      token.info = lang;
      token.markup = fenceTicks;
      token.content = contentLines.length > 0 ? `${contentLines.join('\n')}\n` : '';
      token.map = [startLine, state.line];
      return true;
    },
    { alt: ['paragraph', 'reference', 'blockquote', 'list'] }
  );
}

function createMarkdownIt(): MdInstance {
  const md = new MarkdownIt({
    html: false,
    linkify: true,
    typographer: false,
  });
  directivesPlugin(md);
  mathPlugin(md);
  footnotesPlugin(md);
  bracedFencePlugin(md);
  return md;
}

const mdInstance = createMarkdownIt();

export function parseMarkdown(
  markdown: string,
  options: { lineOffset?: number; title?: string } = {}
): DocIR {
  const lineOffset = options.lineOffset ?? 0;
  const slugify = createSlugger();
  const env: { footnotes?: { id: string; content: string; line: number }[] } = {};
  const tokens = mdInstance.parse(markdown, env);

  function mapLine(token: Token): number | undefined {
    return token.map ? token.map[0] + 1 + lineOffset : undefined;
  }

  function stripNoBreakMarker(inlines: Inline[]): { inlines: Inline[]; noBreak: boolean } {
    if (inlines.length === 0) return { inlines, noBreak: false };
    const last = inlines[inlines.length - 1]!;
    if (last.t === 'text') {
      const m = last.v.match(/\s*(?:\{\.?nobreak\}|<!--\s*nobreak\s*-->)\s*$/i);
      if (m) {
        const trimmed = last.v.slice(0, m.index).replace(/\s+$/, '');
        const next = trimmed ? [...inlines.slice(0, -1), { t: 'text' as const, v: trimmed }] : inlines.slice(0, -1);
        return { inlines: next, noBreak: true };
      }
    }
    return { inlines, noBreak: false };
  }

  function tokensToBlocks(toks: Token[], startIdx = 0, closeType?: string): { blocks: Block[]; nextIdx: number } {
    const blocks: Block[] = [];
    let i = startIdx;
    let pendingNoBreak = false;

    while (i < toks.length) {
      const tok = toks[i]!;
      if (closeType && tok.type === closeType) {
        return { blocks, nextIdx: i + 1 };
      }

      if (tok.type !== 'nobreak' && tok.type !== 'heading_open') {
        pendingNoBreak = false;
      }

      switch (tok.type) {
        case 'nobreak': {
          pendingNoBreak = true;
          i++;
          break;
        }

        case 'heading_open': {
          const level = Number(tok.tag.slice(1)) as 1 | 2 | 3 | 4 | 5 | 6;
          const line = mapLine(tok);
          const inlineTok = toks[i + 1];
          const rawInlines = inlineTok?.children ? convertInlineTokens(inlineTok.children) : [];
          const { inlines, noBreak: inlineNoBreak } = stripNoBreakMarker(rawInlines);
          const noBreakBefore = pendingNoBreak || inlineNoBreak;
          pendingNoBreak = false;
          const id = slugify(inlinesToPlainText(inlines));
          blocks.push(
            noBreakBefore
              ? { t: 'heading', level, id, c: inlines, noBreakBefore: true, line }
              : { t: 'heading', level, id, c: inlines, line }
          );
          i += 3; // heading_open, inline, heading_close
          break;
        }

        case 'paragraph_open': {
          const line = mapLine(tok);
          const inlineTok = toks[i + 1];
          const inlines = inlineTok?.children ? convertInlineTokens(inlineTok.children) : [];
          blocks.push({ t: 'para', c: inlines, line });
          i += 3;
          break;
        }

        case 'fence':
        case 'code_block': {
          const line = mapLine(tok);
          const lang = tok.info ? tok.info.trim().split(/\s+/)[0] : undefined;
          const v = tok.content.replace(/\n$/, '');
          blocks.push(lang ? { t: 'code', lang, v, line } : { t: 'code', v, line });
          i++;
          break;
        }

        case 'math_block': {
          const line = mapLine(tok);
          blocks.push({ t: 'math', tex: tok.content, line });
          i++;
          break;
        }

        case 'pagebreak': {
          const line = mapLine(tok);
          blocks.push({ t: 'pagebreak', line });
          i++;
          break;
        }

        case 'toc': {
          const line = mapLine(tok);
          blocks.push({ t: 'toc', line });
          i++;
          break;
        }

        case 'hr': {
          const line = mapLine(tok);
          blocks.push({ t: 'hr', line });
          i++;
          break;
        }

        case 'blockquote_open': {
          const line = mapLine(tok);
          const inner = tokensToBlocks(toks, i + 1, 'blockquote_close');
          blocks.push({ t: 'quote', c: inner.blocks, line });
          i = inner.nextIdx;
          break;
        }

        case 'bullet_list_open':
        case 'ordered_list_open': {
          const ordered = tok.type === 'ordered_list_open';
          const closeListType = ordered ? 'ordered_list_close' : 'bullet_list_close';
          const line = mapLine(tok);
          const startAttr = tok.attrGet('start');
          const start = startAttr !== null && startAttr !== undefined ? parseInt(String(startAttr), 10) : undefined;
          const items: Block[][] = [];
          const taskFlags: (boolean | null)[] = [];
          let hasAnyTask = false;

          i++;
          while (i < toks.length && toks[i]!.type !== closeListType) {
            if (toks[i]!.type === 'list_item_open') {
              const itemRes = tokensToBlocks(toks, i + 1, 'list_item_close');
              const itemBlocks = itemRes.blocks;
              let taskState: boolean | null = null;

              const firstBlock = itemBlocks[0];
              if (firstBlock && firstBlock.t === 'para' && firstBlock.c.length > 0) {
                const firstInline = firstBlock.c[0];
                if (firstInline && firstInline.t === 'text') {
                  const taskMatch = /^\[([ xX])\]\s+/.exec(firstInline.v);
                  if (taskMatch) {
                    hasAnyTask = true;
                    taskState = taskMatch[1]!.toLowerCase() === 'x';
                    firstInline.v = firstInline.v.slice(taskMatch[0].length);
                    if (firstInline.v === '' && firstBlock.c.length > 1) {
                      firstBlock.c.shift();
                    }
                  }
                }
              }

              taskFlags.push(taskState);
              items.push(itemBlocks);
              i = itemRes.nextIdx;
            } else {
              i++;
            }
          }
          i++; // skip closeListType

          const listBlock: Block = {
            t: 'list',
            ordered,
            ...(start !== undefined && start !== 1 ? { start } : {}),
            items,
            ...(hasAnyTask ? { task: taskFlags } : {}),
            line,
          };
          blocks.push(listBlock);
          break;
        }

        case 'table_open': {
          const line = mapLine(tok);
          const align: ('left' | 'center' | 'right' | null)[] = [];
          const head: Inline[][] = [];
          const rows: Inline[][][] = [];

          i++;
          let inThead = false;
          let currentRow: Inline[][] | null = null;

          while (i < toks.length && toks[i]!.type !== 'table_close') {
            const t = toks[i]!;
            if (t.type === 'thead_open') {
              inThead = true;
              i++;
            } else if (t.type === 'thead_close') {
              inThead = false;
              i++;
            } else if (t.type === 'tbody_open' || t.type === 'tbody_close') {
              i++;
            } else if (t.type === 'tr_open') {
              currentRow = [];
              i++;
            } else if (t.type === 'tr_close') {
              if (currentRow) {
                if (inThead) {
                  head.push(...currentRow);
                } else {
                  rows.push(currentRow);
                }
              }
              currentRow = null;
              i++;
            } else if (t.type === 'th_open' || t.type === 'td_open') {
              if (inThead) {
                const style = String(t.attrGet('style') ?? '');
                if (style.includes('left')) align.push('left');
                else if (style.includes('center')) align.push('center');
                else if (style.includes('right')) align.push('right');
                else align.push(null);
              }
              const inlineTok = toks[i + 1];
              const cellInlines =
                inlineTok && inlineTok.type === 'inline' && inlineTok.children
                  ? convertInlineTokens(inlineTok.children)
                  : [];
              currentRow?.push(cellInlines);
              i += 3; // th/td_open, inline, th/td_close
            } else {
              i++;
            }
          }
          i++; // skip table_close
          blocks.push({ t: 'table', align, head, rows, line });
          break;
        }

        default:
          i++;
          break;
      }
    }

    return { blocks, nextIdx: i };
  }

  const { blocks } = tokensToBlocks(tokens);

  if (env.footnotes && env.footnotes.length > 0) {
    const fnItems = env.footnotes.map((fn) => {
      const subIr = parseMarkdown(fn.content, { lineOffset: fn.line + lineOffset });
      return { id: fn.id, c: subIr.blocks };
    });
    blocks.push({
      t: 'footnotes',
      items: fnItems,
      line: env.footnotes[0]!.line + 1 + lineOffset,
    });
  }

  let title = options.title;
  if (!title) {
    const firstH1 = blocks.find(
      (b): b is Extract<Block, { t: 'heading' }> => b.t === 'heading' && b.level === 1
    );
    if (firstH1) {
      title = inlinesToPlainText(firstH1.c);
    }
  }

  return {
    blocks,
    meta: title ? { title } : {},
  };
}
