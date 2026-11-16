import { describe, expect, it } from 'vitest';
import { buildPrintCss } from '../src/backends/html-paged/print-css.ts';
import { irToHtml } from '../src/backends/html-paged/to-html.ts';
import { normalizeDoc } from '../src/core/normalize.ts';
import { paletteFor } from '../src/core/palette.ts';
import { parseMarkdown } from '../src/core/parse.ts';
import { cloneSettings, DEFAULT_SETTINGS } from '../src/core/settings.ts';

describe('Phase 2: HtmlPagedBackend serializer and print CSS', () => {
  it('converts IR to HTML with data-line, pb, keep, KaTeX math, and syntax highlighting', () => {
    const md = [
      '# First Section',
      '',
      'Some inline math $x^2 + 1 = 0$.',
      '',
      '\\newpage',
      '',
      'Paragraph after explicit break.',
      '',
      '```ts',
      'const x: number = 42;',
      '```',
      '',
      '$$\\invalidmacroxyz$$',
    ].join('\n');

    const ir = normalizeDoc(parseMarkdown(md), DEFAULT_SETTINGS);
    const { html, diagnostics } = irToHtml(ir, DEFAULT_SETTINGS);

    expect(html).toContain('data-line="1"');
    expect(html).toContain('<p class="pb" data-line="7">Paragraph after explicit break.</p>');
    expect(html).toContain('class="katex"');
    expect(html).toContain('hljs-keyword');
    expect(html).toContain('class="code-line"');
    expect(html).toContain('<code class="math-error">\\invalidmacroxyz</code>');
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.level).toBe('error');
  });

  it('builds print CSS from settings and palette', () => {
    const palette = paletteFor('catppuccin-mocha');
    const css = buildPrintCss(DEFAULT_SETTINGS, palette);
    expect(css).toContain('size: A4;');
    expect(css).toContain('margin: 20mm 20mm 22mm 20mm;');
    expect(css).toContain('background-color: #11111B !important;');
    expect(css).toContain('--text-h: 255mm;');
  });

  it('renders numbered TOC entries, dotted leader spans, page numbers, and scoped heading counters', () => {
    const settings = cloneSettings(DEFAULT_SETTINGS);
    settings.numbering.headings = true;
    settings.toc.style = 'clean';
    settings.toc.pageNumbers = true;
    settings.toc.dots = true;

    const md = ['\\toc', '', '# Intro', '## Details'].join('\n');
    const ir = normalizeDoc(parseMarkdown(md), settings);
    const { html } = irToHtml(ir, settings);

    expect(html).toContain('doc-toc--clean doc-toc--pages doc-toc--dots');
    expect(html).toContain('<span class="toc-num">1. </span>Intro');
    expect(html).toContain('<span class="toc-num">1.1 </span>Details');
    expect(html).toContain('<span class="heading-num">1. </span>Intro');
    expect(html).toContain('<span class="heading-num">1.1 </span>Details');
    expect(html).toContain('class="toc-leader"');

    const css = buildPrintCss(settings, paletteFor('paper'));
    expect(css).not.toMatch(/^h3::before/m);
    expect(css).toContain('font-variant-ligatures: none;');
    expect(css).toContain('pre code .code-line');
    expect(css).toContain('.doc-toc--dots .toc-leader');
    expect(css).toContain('target-counter(attr(href), page)');
    expect(css).toContain("counter(page) ' of ' counter(pages)");
    expect(css).toContain('.pagedjs_pages input[type="checkbox"]');

    const slashSettings = cloneSettings(DEFAULT_SETTINGS);
    slashSettings.numbering.pages = 'n/m';
    slashSettings.type.tableLayout = 'equal';
    const slashCss = buildPrintCss(slashSettings, paletteFor('paper'));
    expect(slashCss).toContain("counter(page) ' / ' counter(pages)");
    expect(slashCss).toContain('table-layout: fixed;');
    expect(slashCss).toContain('overflow-wrap: break-word;');
  });

  it('supports numbered and labeled footnote modes', () => {
    const md = 'Claim[^coeff].\n\n[^coeff]: Coefficient note.';
    const numSettings = cloneSettings(DEFAULT_SETTINGS);
    numSettings.numbering.footnotes = 'number';
    const numHtml = irToHtml(normalizeDoc(parseMarkdown(md), numSettings), numSettings).html;
    expect(numHtml).toContain('[1]</a>');
    expect(numHtml).toContain('<ol class="footnotes-list">');

    const lblSettings = cloneSettings(DEFAULT_SETTINGS);
    lblSettings.numbering.footnotes = 'label';
    const lblHtml = irToHtml(normalizeDoc(parseMarkdown(md), lblSettings), lblSettings).html;
    expect(lblHtml).toContain('[coeff]</a>');
    expect(lblHtml).toContain('<ul class="footnotes-list footnotes-list--labeled">');
    expect(lblHtml).toContain('<span class="footnote-label">[coeff]</span>');
  });
});
