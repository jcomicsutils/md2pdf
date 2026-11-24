import { describe, expect, it } from 'vitest';
import { parseFrontmatter } from '../src/core/frontmatter.ts';
import {
  applyHeadingBreaks,
  attachCaptions,
  collapseBreaks,
  markKeep,
  normalizeDoc,
} from '../src/core/normalize.ts';
import { listThemes, paletteFor, registerCustomTheme } from '../src/core/palette.ts';
import { EXAMPLES } from '../src/examples/index.ts';
import { parseMarkdown } from '../src/core/parse.ts';
import { cloneSettings, DEFAULT_SETTINGS, toSafeFilename } from '../src/core/settings.ts';

describe('Phase 1: Core parser, directives, math, normalizer, frontmatter, palette', () => {
  it('parses directives only as block lines and ignores them inside fenced code and math', () => {
    const src = [
      '# First Heading',
      '',
      '\\newpage',
      '',
      '```tex',
      '\\newpage',
      '\\pagebreak',
      '```',
      '',
      '$$',
      '\\newpage + x = 1',
      '$$',
      '',
      '<!-- newpage -->',
      '',
      '\\toc',
      '',
      'Paragraph with `\\newpage` inline.',
    ].join('\n');

    const ir = parseMarkdown(src);
    const types = ir.blocks.map((b) => b.t);
    expect(types).toEqual([
      'heading',
      'pagebreak',
      'code',
      'math',
      'pagebreak',
      'toc',
      'para',
    ]);
  });

  it('collapses \\newpage followed by # H into one break, not two, and drops leading/trailing breaks', () => {
    const src = [
      '\\newpage',
      '',
      '# First H1',
      '',
      'Some text.',
      '',
      '\\newpage',
      '\\pagebreak',
      '',
      '# Second H1',
      '',
      '\\clearpage',
    ].join('\n');

    const raw = parseMarkdown(src);
    const norm = normalizeDoc(raw, DEFAULT_SETTINGS);

    expect(norm.blocks.map((b) => b.t)).toEqual(['heading', 'para', 'heading']);
    const h1First = norm.blocks[0]!;
    const h1Second = norm.blocks[2]!;
    expect(h1First.t === 'heading' && h1First.pageBefore).toBeUndefined();
    expect(h1Second.t === 'heading' && h1Second.pageBefore).toBe(true);
  });

  it('does not parse currency like "$5 and $10" as math, and handles \\$ escape', () => {
    const src = 'Items cost $5 and $10 respectively, or \\$20 with $x + y = z$ and \\(a^2 + b^2\\).';
    const ir = parseMarkdown(src);
    expect(ir.blocks).toHaveLength(1);
    const para = ir.blocks[0]!;
    expect(para.t).toBe('para');
    if (para.t === 'para') {
      const mathNodes = para.c.filter((n) => n.t === 'math');
      expect(mathNodes).toEqual([
        { t: 'math', tex: 'x + y = z' },
        { t: 'math', tex: 'a^2 + b^2' },
      ]);
      const textContent = para.c
        .filter((n): n is { t: 'text'; v: string } => n.t === 'text')
        .map((n) => n.v)
        .join('');
      expect(textContent).toContain('$5 and $10');
      expect(textContent).toContain('$20');
    }
  });

  it('parses display math in $$, \\[..\\], and \\begin{align}..\\end{align}', () => {
    const src = [
      '$$E = mc^2$$',
      '',
      '\\[',
      '\\int_0^1 x^2 dx = \\frac{1}{3}',
      '\\]',
      '',
      '\\begin{align*}',
      'a &= b + c \\\\',
      'd &= e + f',
      '\\end{align*}',
    ].join('\n');

    const ir = parseMarkdown(src);
    expect(ir.blocks).toEqual([
      { t: 'math', tex: 'E = mc^2', line: 1 },
      { t: 'math', tex: '\\int_0^1 x^2 dx = \\frac{1}{3}', line: 3 },
      { t: 'math', tex: '\\begin{align*}\na &= b + c \\\\\nd &= e + f\n\\end{align*}', line: 7 },
    ]);
  });

  it('unit-tests collapseBreaks, applyHeadingBreaks, markKeep, and attachCaptions individually', () => {
    const raw = parseMarkdown(
      [
        '\\newpage',
        '# Title',
        '\\newpage',
        '\\newpage',
        'Para',
        '\\newpage',
        '## Sub',
        '| A | B |',
        '| - | - |',
        '| 1 | 2 |',
        '',
        'Table: Sample caption',
      ].join('\n')
    );

    const collapsed = collapseBreaks(raw.blocks);
    expect(collapsed[0]?.t).toBe('heading');
    expect(collapsed.filter((b) => b.t === 'pagebreak')).toHaveLength(2);

    const captioned = attachCaptions(collapsed);
    const tbl = captioned.find((b) => b.t === 'table');
    expect(tbl?.t === 'table' && tbl.caption).toEqual([{ t: 'text', v: 'Sample caption' }]);

    const sWithH2 = cloneSettings();
    sWithH2.breaks.h2 = true;
    const withHeadingBreaks = applyHeadingBreaks(captioned, sWithH2);
    const h2 = withHeadingBreaks.find((b) => b.t === 'heading' && b.level === 2);
    expect(h2?.t === 'heading' && h2.pageBefore).toBe(true);

    const kept = markKeep(withHeadingBreaks, sWithH2);
    const keptTbl = kept.find((b) => b.t === 'table');
    expect(keptTbl?.keep).toBe(true);
  });

  it('parses YAML front matter, merges settings, and warns on unknown keys', () => {
    const md = [
      '---',
      'title: Custom Doc',
      'page:',
      '  size: Letter',
      '  landscape: true',
      '  marginMm:',
      '    t: 15',
      'breaks:',
      '  h1: false',
      '  h2: true',
      'unknownKey: 123',
      '---',
      '# Hello',
    ].join('\n');

    const res = parseFrontmatter(md);
    expect(res.title).toBe('Custom Doc');
    expect(res.settings.page.size).toBe('Letter');
    expect(res.settings.page.landscape).toBe(true);
    expect(res.settings.page.marginMm.t).toBe(15);
    expect(res.settings.page.marginMm.r).toBe(20);
    expect(res.settings.breaks.h1).toBe(false);
    expect(res.settings.breaks.h2).toBe(true);
    expect(res.lockedPaths.has('page.size')).toBe(true);
    expect(res.lockedPaths.has('breaks.h1')).toBe(true);
    expect(res.diagnostics).toEqual([
      {
        level: 'warn',
        msg: "Unknown front matter key 'unknownKey'",
        line: 1,
      },
    ]);
    expect(res.body.trim()).toBe('# Hello');
  });

  it('generates unique heading slugs and parses task lists and footnotes', () => {
    const md = [
      '# Section',
      '## Section',
      '',
      '- [x] Done item',
      '- [ ] Pending item',
      '',
      'Text with footnote[^1].',
      '',
      '[^1]: Footnote explanation.',
    ].join('\n');

    const ir = parseMarkdown(md);
    expect(ir.blocks[0]).toMatchObject({ t: 'heading', id: 'section' });
    expect(ir.blocks[1]).toMatchObject({ t: 'heading', id: 'section-1' });
    expect(ir.blocks[2]).toMatchObject({ t: 'list', task: [true, false] });
    expect(ir.blocks[4]).toMatchObject({ t: 'footnotes' });
  });

  it('resolves palettes for paper (light -> white sheetBg) and catppuccin-mocha (dark -> bg0 sheetBg)', () => {
    const paper = paletteFor('paper');
    expect(paper.dark).toBe(false);
    expect(paper.sheetBg).toBe('#FFFFFF');

    const mocha = paletteFor('catppuccin-mocha');
    expect(mocha.dark).toBe(true);
    expect(mocha.sheetBg).toBe('#11111B');
  });

  it('supports nobreak heading markers and standalone \\nobreak directive', () => {
    const md = [
      '# First Chapter',
      '',
      'Intro text.',
      '',
      '# Second Chapter {nobreak}',
      '',
      '\\nobreak',
      '# Third Chapter',
      '',
      '# Fourth Chapter',
    ].join('\n');

    const ir = parseMarkdown(md);
    const normalized = applyHeadingBreaks(ir.blocks, DEFAULT_SETTINGS);
    const headings = normalized.filter((b) => b.t === 'heading');
    expect(headings).toHaveLength(4);
    expect(headings[0]).toMatchObject({ id: 'first-chapter' });
    expect(headings[0]?.t === 'heading' && headings[0].pageBefore).toBeUndefined();
    expect(headings[1]).toMatchObject({ id: 'second-chapter', noBreakBefore: true });
    expect(headings[1]?.t === 'heading' && headings[1].pageBefore).toBeUndefined();
    expect(headings[2]).toMatchObject({ id: 'third-chapter', noBreakBefore: true });
    expect(headings[2]?.t === 'heading' && headings[2].pageBefore).toBeUndefined();
    expect(headings[3]?.t === 'heading' && headings[3].pageBefore).toBe(true);
  });

  it('parses toc.style in front matter and loads plain-bw and custom TOML themes', () => {
    const fm = parseFrontmatter(['---', 'toc:', '  depth: 2', '  style: boxed', '---', '# Doc'].join('\n'));
    expect(fm.settings.toc.depth).toBe(2);
    expect(fm.settings.toc.style).toBe('boxed');

    const plainBw = paletteFor('plain-bw');
    expect(plainBw.dark).toBe(false);
    expect(plainBw.text).toBe('#000000');
    expect(plainBw.sheetBg).toBe('#FFFFFF');

    const customToml = `
format = 1
id = "custom-test"
name = "Custom Test"
dark = false
[colors]
bg0 = "#FFFFFF"
bg1 = "#F0F0F0"
bg2 = "#E0E0E0"
border = "#111111"
border_hi = "#000000"
text = "#111111"
text_dim = "#555555"
accent = "#0055AA"
accent2 = "#008844"
ok = "#117733"
warn = "#AA6600"
err = "#CC0000"
`;
    const def = registerCustomTheme(customToml);
    expect(def.id).toBe('custom-test');
    expect(listThemes().some((t) => t.id === 'custom-test')).toBe(true);
  });

  it('parses all bundled EXAMPLES with zero frontmatter diagnostics', () => {
    expect(EXAMPLES.length).toBeGreaterThanOrEqual(6);
    for (const ex of EXAMPLES) {
      const fm = parseFrontmatter(ex.source);
      expect(fm.diagnostics, `Example ${ex.id} had diagnostics`).toEqual([]);
      const ir = parseMarkdown(fm.body, { lineOffset: fm.bodyStartLine, title: fm.title });
      expect(ir.blocks.length).toBeGreaterThan(0);
    }
  });

  it('parses brace-delimited fenced code blocks with nested fences', () => {
    const md = [
      '```md{',
      '# Title',
      '',
      '```python',
      'print("nested")',
      '```',
      '}```',
    ].join('\n');

    const ir = parseMarkdown(md);
    expect(ir.blocks).toHaveLength(1);
    expect(ir.blocks[0]).toMatchObject({
      t: 'code',
      lang: 'md',
    });
    if (ir.blocks[0]?.t === 'code') {
      expect(ir.blocks[0].v).toContain('```python');
      expect(ir.blocks[0].v).toContain('print("nested")');
    }
  });

  it('resolves title precedence (front matter > settings.title > first # H1) and sanitizes filenames', () => {
    const base = cloneSettings(DEFAULT_SETTINGS);
    base.title = 'Toolbar Custom Title';

    // When no front matter title is present, settings.title wins over # H1
    const fmNoTitle = parseFrontmatter('# Heading Fallback\n\nBody text.', base);
    expect(fmNoTitle.title).toBe('Toolbar Custom Title');
    expect(fmNoTitle.settings.title).toBe('Toolbar Custom Title');
    expect(fmNoTitle.lockedPaths.has('title')).toBe(false);
    const irWithToolbarTitle = parseMarkdown(fmNoTitle.body, {
      lineOffset: fmNoTitle.bodyStartLine,
      title: fmNoTitle.title,
    });
    expect(irWithToolbarTitle.meta.title).toBe('Toolbar Custom Title');

    // When front matter title is present, it overrides settings.title and locks 'title'
    const fmWithTitle = parseFrontmatter(
      ['---', 'title: Front Matter Title', '---', '# Heading Fallback'].join('\n'),
      base
    );
    expect(fmWithTitle.title).toBe('Front Matter Title');
    expect(fmWithTitle.settings.title).toBe('Front Matter Title');
    expect(fmWithTitle.lockedPaths.has('title')).toBe(true);
    const irWithFmTitle = parseMarkdown(fmWithTitle.body, {
      lineOffset: fmWithTitle.bodyStartLine,
      title: fmWithTitle.title,
    });
    expect(irWithFmTitle.meta.title).toBe('Front Matter Title');

    // When neither front matter title nor settings.title is set, first # H1 is used
    const fmEmpty = parseFrontmatter('# Heading Fallback\n\nBody text.', DEFAULT_SETTINGS);
    expect(fmEmpty.title).toBeUndefined();
    const irWithH1 = parseMarkdown(fmEmpty.body, {
      lineOffset: fmEmpty.bodyStartLine,
      title: fmEmpty.title,
    });
    expect(irWithH1.meta.title).toBe('Heading Fallback');

    // Filename sanitization
    expect(toSafeFilename('My Report: Q1/Q2 *Draft*?', '.md')).toBe('My Report Q1 Q2 Draft.md');
    expect(toSafeFilename('   ', '.md', 'document')).toBe('document.md');
    expect(toSafeFilename('notes.md', '.md')).toBe('notes.md');
  });
});
