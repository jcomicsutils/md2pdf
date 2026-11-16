import type { DocPalette } from '../../core/palette.ts';
import type { DocSettings } from '../../core/settings.ts';

const PAGE_DIMENSIONS_MM: Record<DocSettings['page']['size'], { w: number; h: number }> = {
  A4: { w: 210, h: 297 },
  A5: { w: 148, h: 210 },
  Letter: { w: 215.9, h: 279.4 },
  Legal: { w: 215.9, h: 355.6 },
};

function escapeCssString(str: string): string {
  return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

export function getContentHeightMm(settings: DocSettings): number {
  const dim = PAGE_DIMENSIONS_MM[settings.page.size];
  const pageH = settings.page.landscape ? dim.w : dim.h;
  return Math.max(20, pageH - settings.page.marginMm.t - settings.page.marginMm.b);
}

export function getContentWidthMm(settings: DocSettings): number {
  const dim = PAGE_DIMENSIONS_MM[settings.page.size];
  const pageW = settings.page.landscape ? dim.h : dim.w;
  return Math.max(20, pageW - settings.page.marginMm.l - settings.page.marginMm.r);
}

export function buildPrintCss(settings: DocSettings, palette: DocPalette): string {
  const { size, landscape, marginMm } = settings.page;
  const sizeValue = landscape ? `${size} landscape` : size;
  const textHMm = getContentHeightMm(settings);

  let bottomCenterContent = "''";
  if (settings.numbering.pages === 'n') {
    bottomCenterContent = 'counter(page)';
  } else if (settings.numbering.pages === 'n/m') {
    bottomCenterContent = "counter(page) ' / ' counter(pages)";
  } else if (settings.numbering.pages === 'n-of-m') {
    bottomCenterContent = "counter(page) ' of ' counter(pages)";
  }

  const topCenterContent = settings.headerText
    ? `'${escapeCssString(settings.headerText)}'`
    : "''";
  const bottomLeftContent = settings.footerText
    ? `'${escapeCssString(settings.footerText)}'`
    : "''";

  const alignRule = settings.type.justify ? 'justify' : 'left';
  const hyphensRule = settings.type.hyphenate ? 'auto' : 'manual';

  const headingCountersCss = '';

  return `
@page {
  size: ${sizeValue};
  margin: ${marginMm.t}mm ${marginMm.r}mm ${marginMm.b}mm ${marginMm.l}mm;
  background-color: ${palette.sheetBg};
  @top-center {
    content: ${topCenterContent};
    font-family: '${settings.type.heading}', sans-serif;
    font-size: 8.5pt;
    color: ${palette.text_dim};
  }
  @bottom-left {
    content: ${bottomLeftContent};
    font-family: '${settings.type.heading}', sans-serif;
    font-size: 8.5pt;
    color: ${palette.text_dim};
  }
  @bottom-center {
    content: ${bottomCenterContent};
    font-family: '${settings.type.heading}', sans-serif;
    font-size: 9pt;
    color: ${palette.text_dim};
  }
}

:root {
  --text-h: ${textHMm}mm;
  --doc-sheet-bg: ${palette.sheetBg};
  --doc-bg1: ${palette.bg1};
  --doc-bg2: ${palette.bg2};
  --doc-border: ${palette.border};
  --doc-text: ${palette.text};
  --doc-text-dim: ${palette.text_dim};
  --doc-accent: ${palette.accent};
  --doc-accent2: ${palette.accent2};
  --doc-ok: ${palette.ok};
  --doc-warn: ${palette.warn};
  --doc-err: ${palette.err};
}

.pagedjs_page {
  background-color: ${palette.sheetBg} !important;
  color: ${palette.text};
  font-family: '${settings.type.body}', serif;
  font-size: ${settings.type.sizePt}pt;
  line-height: ${settings.type.leading};
  text-align: ${alignRule};
  hyphens: ${hyphensRule};
  print-color-adjust: exact;
  -webkit-print-color-adjust: exact;
}

.pagedjs_margin-content {
  color: ${palette.text_dim};
  font-family: '${settings.type.heading}', sans-serif;
  font-size: 9pt;
}

h1.pb, h2.pb, .pb { break-before: page; }
h1, h2, h3, h4, h5, h6 {
  font-family: '${settings.type.heading}', sans-serif;
  font-weight: 700;
  line-height: 1.25;
  margin-top: 14pt;
  margin-bottom: 6pt;
  text-align: left;
  hyphens: none;
  break-after: avoid;
  break-inside: avoid;
}
h1 { font-size: ${Math.round(settings.type.sizePt * 1.8 * 10) / 10}pt; color: ${palette.accent}; margin-top: 0; }
h2 { font-size: ${Math.round(settings.type.sizePt * 1.4 * 10) / 10}pt; color: ${palette.accent}; }
h3 { font-size: ${Math.round(settings.type.sizePt * 1.2 * 10) / 10}pt; color: ${palette.accent2}; }
h4, h5, h6 { font-size: ${settings.type.sizePt}pt; color: ${palette.accent2}; }

p {
  margin-top: 0;
  margin-bottom: 8pt;
  orphans: 3;
  widows: 3;
}

a {
  color: ${palette.accent};
  text-decoration: underline;
}

.keep, figure, img, .katex-display, .math-block {
  break-inside: avoid;
}

.math-block {
  margin: 10pt 0;
  overflow-x: visible;
}

code, pre {
  font-family: '${settings.type.mono}', monospace;
  font-size: ${Math.round(settings.type.sizePt * 0.88 * 10) / 10}pt;
  font-variant-ligatures: none;
}

p code, li code, td code, th code {
  background-color: ${palette.bg2};
  padding: 1pt 3pt;
  border: 1px solid ${palette.border};
  overflow-wrap: anywhere;
  word-break: break-word;
}

code.math-error {
  color: ${palette.err};
  border-color: ${palette.err};
  background-color: ${palette.bg1};
}

pre {
  background-color: ${palette.bg1};
  border: 1px solid ${palette.border};
  padding: 8pt 10pt;
  margin: 8pt 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  text-align: left;
  hyphens: none;
}

pre code {
  background: transparent;
  border: none;
  padding: 0;
}

pre code .code-line {
  display: block;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  break-inside: avoid;
}

blockquote {
  background-color: ${palette.bg1};
  border-left: 3pt solid ${palette.accent};
  color: ${palette.text_dim};
  margin: 8pt 0;
  padding: 6pt 10pt;
}

blockquote > *:last-child {
  margin-bottom: 0;
}

hr {
  border: none;
  border-top: 1px solid ${palette.border};
  margin: 12pt 0;
}

ul, ol {
  margin-top: 0;
  margin-bottom: 8pt;
  padding-left: 18pt;
}

ul.task-list {
  list-style: none;
  padding-left: 4pt;
}

${
  settings.type.checkboxStyle === 'native'
    ? `
.pagedjs_pages input[type="checkbox"] {
  appearance: auto;
  accent-color: ${palette.accent};
  margin-right: 4pt;
}
`
    : `
.pagedjs_pages input[type="checkbox"] {
  appearance: none;
  width: 9pt;
  height: 9pt;
  margin: 0 5pt 0 0;
  background-color: ${palette.bg2};
  border: 1pt solid ${palette.border};
  display: inline-grid;
  place-content: center;
  vertical-align: -1pt;
}
.pagedjs_pages input[type="checkbox"]::before {
  content: "";
  width: 4.5pt;
  height: 4.5pt;
  background-color: ${palette.accent};
  transform: scale(0);
}
.pagedjs_pages input[type="checkbox"]:checked {
  border-color: ${palette.border_hi};
}
.pagedjs_pages input[type="checkbox"]:checked::before {
  transform: scale(1);
}
`
}

.footnotes-list--labeled {
  list-style: none;
  padding-left: 0;
}
.footnotes-list--labeled li {
  display: flex;
  gap: 6pt;
  align-items: baseline;
}
.footnote-label {
  font-weight: 600;
  color: ${palette.accent};
  flex-shrink: 0;
}
.footnotes-list--labeled li > p {
  margin: 0;
}

table {
  border-collapse: collapse;
  width: 100%;
  table-layout: ${settings.type.tableLayout === 'equal' ? 'fixed' : 'auto'};
  margin: 10pt 0;
  font-size: ${Math.round(settings.type.sizePt * 0.94 * 10) / 10}pt;
}
thead { display: table-header-group; }
tfoot { display: table-footer-group; }
tr, th, td { break-inside: avoid; }
tbody tr:first-child { break-after: avoid; }
tbody tr:last-child { break-before: avoid; }
table.keep { break-inside: avoid; }
td, th {
  border: 1px solid ${palette.border};
  padding: 4pt 6pt;
  overflow-wrap: break-word;
  vertical-align: top;
}
thead th {
  background-color: ${palette.bg2};
  font-family: '${settings.type.heading}', sans-serif;
  font-weight: 600;
  color: ${palette.text};
}
caption {
  caption-side: top;
  break-after: avoid;
  color: ${palette.text_dim};
  font-size: ${Math.round(settings.type.sizePt * 0.9 * 10) / 10}pt;
  margin-bottom: 4pt;
  text-align: left;
}
table[data-split-from] caption::after {
  content: ' (continued)';
}

img {
  max-width: 100%;
  max-height: var(--text-h);
  display: block;
}

.doc-toc {
  margin: 10pt 0;
}
.toc-title {
  font-family: '${settings.type.heading}', sans-serif;
  font-weight: 700;
  color: ${palette.accent};
  margin-bottom: 6pt;
}
.toc-list {
  list-style: none;
  padding-left: 0;
  margin: 0;
}
.toc-item a {
  display: flex;
  align-items: baseline;
  width: 100%;
  color: ${palette.text};
  text-decoration: none;
}
.toc-label {
  flex: 0 1 auto;
}
.toc-leader {
  display: none;
}
.doc-toc--pages .toc-item a::after {
  content: target-counter(attr(href), page);
  margin-left: 6pt;
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
  color: ${palette.text_dim};
}
.doc-toc--pages .toc-leader {
  display: block;
  flex: 1;
  min-width: 10pt;
}
.toc-level-1 { font-weight: 600; }
.toc-level-2 { padding-left: 12pt; }
.toc-level-3 { padding-left: 24pt; font-size: 0.94em; color: ${palette.text_dim}; }
.toc-level-4 { padding-left: 36pt; font-size: 0.9em; color: ${palette.text_dim}; }

.doc-toc--classic {
  background-color: ${palette.bg1};
  border: 1px solid ${palette.border};
  border-left: 3pt solid ${palette.accent};
  padding: 8pt 12pt;
}
.doc-toc--minimal {
  border-top: 1px solid ${palette.border};
  border-bottom: 1px solid ${palette.border};
  padding: 8pt 0;
}
.doc-toc--minimal .toc-title {
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-size: 0.85em;
}
.doc-toc--clean {
  padding: 6pt 0;
}
.doc-toc--dots .toc-leader {
  display: block;
  flex: 1;
  min-width: 12pt;
  border-bottom: 1pt dotted ${palette.border};
  margin: 0 4pt;
}
.doc-toc--boxed {
  border: 1.5pt solid ${palette.border_hi};
  padding: 0;
}
.doc-toc--boxed .toc-title {
  background-color: ${palette.bg2};
  color: ${palette.text};
  padding: 6pt 10pt;
  margin-bottom: 0;
  border-bottom: 1px solid ${palette.border};
}
.doc-toc--boxed .toc-list {
  padding: 8pt 10pt;
}

.hljs-keyword, .hljs-selector-tag, .hljs-built_in, .hljs-name, .hljs-tag { color: ${palette.accent2}; font-weight: 600; }
.hljs-string, .hljs-title, .hljs-section, .hljs-attribute, .hljs-literal, .hljs-template-tag, .hljs-template-variable, .hljs-type, .hljs-addition { color: ${palette.ok}; }
.hljs-comment, .hljs-quote, .hljs-meta { color: ${palette.text_dim}; font-style: italic; }
.hljs-number, .hljs-symbol, .hljs-bullet, .hljs-link, .hljs-variable { color: ${palette.warn}; }
.hljs-deletion, .hljs-regexp { color: ${palette.err}; }
${headingCountersCss}
`;
}
