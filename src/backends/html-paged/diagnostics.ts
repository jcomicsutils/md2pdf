import type { Diagnostic } from '../../core/backend.ts';

function findLineNumber(el: Element | null): number | undefined {
  let curr: Element | null = el;
  while (curr) {
    const lineAttr = curr.getAttribute('data-line');
    if (lineAttr) {
      const parsed = parseInt(lineAttr, 10);
      if (!Number.isNaN(parsed)) return parsed;
    }
    curr = curr.parentElement;
  }
  return undefined;
}

export function scanDomDiagnostics(container: HTMLElement): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const pages = Array.from(container.querySelectorAll('.pagedjs_page'));
  const seenRowTallLines = new Set<string>();
  const seenWideMathLines = new Set<string>();

  pages.forEach((pageEl, pageIdx) => {
    const pageNum = pageIdx + 1;
    const contentEl = pageEl.querySelector('.pagedjs_page_content') as HTMLElement | null;
    if (!contentEl) return;

    const contentRect = contentEl.getBoundingClientRect();
    const contentHeight = contentRect.height;
    const contentWidth = contentRect.width;

    // 1. Blank page check
    const text = (contentEl.textContent ?? '').trim();
    const hasMedia = Boolean(contentEl.querySelector('img, svg, hr, table, .katex'));
    if (!text && !hasMedia) {
      diagnostics.push({
        level: 'warn',
        msg: `Page ${pageNum} is blank`,
        page: pageNum,
      });
    }

    // 2. Table row taller than the content area (cannot be kept whole)
    const rows = Array.from(contentEl.querySelectorAll('tr'));
    for (const tr of rows) {
      const trRect = tr.getBoundingClientRect();
      // Also check if row was split across pages by Paged.js (`data-split-from` or `data-split-to` on tr or td)
      const wasRowSplit =
        tr.hasAttribute('data-split-from') ||
        tr.hasAttribute('data-split-to') ||
        Boolean(tr.querySelector('[data-split-from], [data-split-to]'));
      if ((contentHeight > 0 && trRect.height > contentHeight + 1) || wasRowSplit) {
        const line = findLineNumber(tr);
        const key = `${line ?? 'u'}`;
        if (!seenRowTallLines.has(key)) {
          seenRowTallLines.add(key);
          diagnostics.push({
            level: 'warn',
            msg: 'Table row is taller than the page content area and cannot be kept whole',
            line,
            page: pageNum,
          });
        }
      }
    }

    // 3. A page whose only table content is the header
    const tables = Array.from(contentEl.querySelectorAll('table'));
    for (const tbl of tables) {
      const hasThead = Boolean(tbl.querySelector('thead tr'));
      const tbodyRows = tbl.querySelectorAll('tbody tr');
      if (hasThead && tbodyRows.length === 0) {
        diagnostics.push({
          level: 'warn',
          msg: 'Table on this page contains only the header row with no body rows',
          line: findLineNumber(tbl),
          page: pageNum,
        });
      }
    }

    // 4. Images that failed to load
    const images = Array.from(contentEl.querySelectorAll('img'));
    for (const img of images) {
      if (img.complete && img.naturalWidth === 0 && img.getAttribute('src')) {
        diagnostics.push({
          level: 'warn',
          msg: `Image failed to load: ${img.getAttribute('src')}`,
          line: findLineNumber(img),
          page: pageNum,
        });
      }
    }

    // 5. Display equation wider than the text width (suggest splitting with `aligned`)
    const mathBlocks = Array.from(contentEl.querySelectorAll('.math-block'));
    for (const mb of mathBlocks) {
      const katexEl = (mb.querySelector('.katex-html') ?? mb.querySelector('.katex') ?? mb) as HTMLElement;
      const mathWidth = Math.max(katexEl.scrollWidth, katexEl.getBoundingClientRect().width);
      if (contentWidth > 0 && mathWidth > contentWidth + 4) {
        const line = findLineNumber(mb);
        const key = `${line ?? 'u'}-${pageNum}`;
        if (!seenWideMathLines.has(key)) {
          seenWideMathLines.add(key);
          diagnostics.push({
            level: 'warn',
            msg: 'Display equation is wider than the text width; consider splitting across lines with aligned',
            line,
            page: pageNum,
          });
        }
      }
    }
  });

  return diagnostics;
}
