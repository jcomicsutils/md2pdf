import type MarkdownIt from 'markdown-it';
import type { StateBlock } from 'markdown-it';

export type DirectiveKind = 'pagebreak' | 'toc' | 'nobreak';

export const DIRECTIVE_MAP: ReadonlyMap<string, DirectiveKind> = new Map([
  ['\\newpage', 'pagebreak'],
  ['\\pagebreak', 'pagebreak'],
  ['\\clearpage', 'pagebreak'],
  ['<!-- newpage -->', 'pagebreak'],
  ['\\nobreak', 'nobreak'],
  ['<!-- nobreak -->', 'nobreak'],
  ['\\tableofcontents', 'toc'],
  ['\\toc', 'toc'],
  ['[TOC]', 'toc'],
]);

export function directivesPlugin(md: InstanceType<typeof MarkdownIt>): void {
  md.block.ruler.before(
    'paragraph',
    'md2pdf_directives',
    (state: StateBlock, startLine: number, _endLine: number, silent: boolean) => {
      const pos = (state.bMarks[startLine] ?? 0) + (state.tShift[startLine] ?? 0);
      const max = state.eMarks[startLine] ?? 0;
      const lineText = state.src.slice(pos, max).trim();
      const kind = DIRECTIVE_MAP.get(lineText);
      if (!kind) {
        return false;
      }
      if (silent) {
        return true;
      }
      state.line = startLine + 1;
      const token = state.push(kind, '', 0);
      token.map = [startLine, state.line];
      token.content = lineText;
      return true;
    },
    { alt: ['paragraph', 'reference', 'blockquote', 'list'] }
  );
}
