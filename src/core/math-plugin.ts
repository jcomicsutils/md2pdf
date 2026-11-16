import type MarkdownIt from 'markdown-it';
import type { StateBlock, StateInline } from 'markdown-it';

const MATH_ENV_NAMES = new Set([
  'equation',
  'equation*',
  'align',
  'align*',
  'gather',
  'gather*',
  'multline',
  'multline*',
]);

function isWhitespace(code: number): boolean {
  return code === 0x20 || code === 0x09 || code === 0x0a || code === 0x0d;
}

function isDigit(code: number): boolean {
  return code >= 0x30 && code <= 0x39;
}

export function mathPlugin(md: InstanceType<typeof MarkdownIt>): void {
  // Block math rule before 'fence' / 'paragraph'
  md.block.ruler.before(
    'fence',
    'md2pdf_math_block',
    (state: StateBlock, startLine: number, endLine: number, silent: boolean) => {
      const pos = (state.bMarks[startLine] ?? 0) + (state.tShift[startLine] ?? 0);
      const max = state.eMarks[startLine] ?? 0;
      const firstLine = state.src.slice(pos, max).trim();

      // Case 1: $$ ... $$
      if (firstLine.startsWith('$$')) {
        if (silent) return true;
        const afterOpen = firstLine.slice(2);
        // Single-line $$ ... $$
        if (afterOpen.endsWith('$$') && afterOpen.length >= 2) {
          const tex = afterOpen.slice(0, -2).trim();
          state.line = startLine + 1;
          const token = state.push('math_block', 'div', 0);
          token.block = true;
          token.content = tex;
          token.map = [startLine, state.line];
          return true;
        }
        // Multi-line $$
        let nextLine = startLine;
        const lines: string[] = [];
        if (afterOpen.trim().length > 0) {
          lines.push(afterOpen);
        }
        let foundClose = false;
        while (++nextLine < endLine) {
          const lPos = (state.bMarks[nextLine] ?? 0) + (state.tShift[nextLine] ?? 0);
          const lMax = state.eMarks[nextLine] ?? 0;
          const rawLine = state.src.slice(lPos, lMax);
          const trimmed = rawLine.trim();
          if (trimmed.endsWith('$$')) {
            const beforeClose = trimmed.slice(0, -2);
            if (beforeClose.trim().length > 0) {
              lines.push(beforeClose);
            }
            foundClose = true;
            break;
          }
          lines.push(rawLine);
        }
        if (!foundClose) {
          return false;
        }
        state.line = nextLine + 1;
        const token = state.push('math_block', 'div', 0);
        token.block = true;
        token.content = lines.join('\n').trim();
        token.map = [startLine, state.line];
        return true;
      }

      // Case 2: \[ ... \]
      if (firstLine.startsWith('\\[')) {
        if (silent) return true;
        const afterOpen = firstLine.slice(2);
        if (afterOpen.endsWith('\\]') && afterOpen.length >= 2) {
          const tex = afterOpen.slice(0, -2).trim();
          state.line = startLine + 1;
          const token = state.push('math_block', 'div', 0);
          token.block = true;
          token.content = tex;
          token.map = [startLine, state.line];
          return true;
        }
        let nextLine = startLine;
        const lines: string[] = [];
        if (afterOpen.trim().length > 0) {
          lines.push(afterOpen);
        }
        let foundClose = false;
        while (++nextLine < endLine) {
          const lPos = (state.bMarks[nextLine] ?? 0) + (state.tShift[nextLine] ?? 0);
          const lMax = state.eMarks[nextLine] ?? 0;
          const rawLine = state.src.slice(lPos, lMax);
          const trimmed = rawLine.trim();
          if (trimmed.endsWith('\\]')) {
            const beforeClose = trimmed.slice(0, -2);
            if (beforeClose.trim().length > 0) {
              lines.push(beforeClose);
            }
            foundClose = true;
            break;
          }
          lines.push(rawLine);
        }
        if (!foundClose) {
          return false;
        }
        state.line = nextLine + 1;
        const token = state.push('math_block', 'div', 0);
        token.block = true;
        token.content = lines.join('\n').trim();
        token.map = [startLine, state.line];
        return true;
      }

      // Case 3: \begin{X} ... \end{X}
      const beginMatch = /^\\begin\{([a-zA-Z]+\*?)\}/.exec(firstLine);
      if (beginMatch) {
        const envName = beginMatch[1]!;
        if (!MATH_ENV_NAMES.has(envName)) {
          return false;
        }
        if (silent) return true;
        const endMarker = `\\end{${envName}}`;
        if (firstLine.endsWith(endMarker)) {
          state.line = startLine + 1;
          const token = state.push('math_block', 'div', 0);
          token.block = true;
          token.content = firstLine;
          token.map = [startLine, state.line];
          return true;
        }
        let nextLine = startLine;
        const lines: string[] = [state.src.slice(pos, max)];
        let foundClose = false;
        while (++nextLine < endLine) {
          const lPos = (state.bMarks[nextLine] ?? 0) + (state.tShift[nextLine] ?? 0);
          const lMax = state.eMarks[nextLine] ?? 0;
          const rawLine = state.src.slice(lPos, lMax);
          lines.push(rawLine);
          if (rawLine.trim().endsWith(endMarker)) {
            foundClose = true;
            break;
          }
        }
        if (!foundClose) {
          return false;
        }
        state.line = nextLine + 1;
        const token = state.push('math_block', 'div', 0);
        token.block = true;
        token.content = lines.join('\n').trim();
        token.map = [startLine, state.line];
        return true;
      }

      return false;
    },
    { alt: ['paragraph', 'reference', 'blockquote', 'list'] }
  );

  // Inline rule before 'escape' so \(..\) and \$ are handled properly
  md.inline.ruler.before(
    'escape',
    'md2pdf_math_inline',
    (state: StateInline, silent: boolean) => {
    const src = state.src;
    const pos = state.pos;
    const max = state.posMax;

    // 1. Escaped dollar \$ -> literal '$'
    if (src.charCodeAt(pos) === 0x5c /* \ */ && pos + 1 < max && src.charCodeAt(pos + 1) === 0x24 /* $ */) {
      if (!silent) {
        state.pending += '$';
      }
      state.pos = pos + 2;
      return true;
    }

    // 2. \( ... \) inline math
    if (
      src.charCodeAt(pos) === 0x5c /* \ */ &&
      pos + 1 < max &&
      src.charCodeAt(pos + 1) === 0x28 /* ( */
    ) {
      const closeIdx = src.indexOf('\\)', pos + 2);
      if (closeIdx === -1 || closeIdx >= max) {
        return false;
      }
      const tex = src.slice(pos + 2, closeIdx).trim();
      if (!tex) {
        return false;
      }
      if (!silent) {
        const token = state.push('math_inline', 'span', 0);
        token.content = tex;
      }
      state.pos = closeIdx + 2;
      return true;
    }

    // 3. $ ... $ inline math
    if (src.charCodeAt(pos) === 0x24 /* $ */) {
      // Do not match $$ in inline math
      if (pos + 1 < max && src.charCodeAt(pos + 1) === 0x24) {
        return false;
      }
      if (pos + 1 >= max) {
        return false;
      }
      const nextCode = src.charCodeAt(pos + 1);
      // Opening $ cannot be followed by whitespace
      if (isWhitespace(nextCode)) {
        return false;
      }

      let match = pos + 1;
      let found = -1;
      while (match < max) {
        const ch = src.charCodeAt(match);
        if (ch === 0x5c /* \ */) {
          match += 2;
          continue;
        }
        if (ch === 0x24 /* $ */) {
          const prevCode = src.charCodeAt(match - 1);
          const afterCode = match + 1 < max ? src.charCodeAt(match + 1) : 0;
          // Closing $ is not preceded by whitespace and not followed by a digit (nor another $)
          if (!isWhitespace(prevCode) && !isDigit(afterCode) && afterCode !== 0x24) {
            found = match;
          }
          break;
        }
        match++;
      }

      if (found === -1) {
        return false;
      }

      const tex = src.slice(pos + 1, found);
      if (!silent) {
        const token = state.push('math_inline', 'span', 0);
        token.content = tex;
      }
      state.pos = found + 1;
      return true;
    }

    return false;
  });
}
