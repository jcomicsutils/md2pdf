# Phase 0: Paged.js Spike Findings (`spike-notes.md`)

Evaluated Paged.js (`0.4.3`), KaTeX (`0.16.x`), `@fontsource` fonts (Source Serif 4, Inter, JetBrains Mono), and Chromium print-to-PDF via Playwright (`page.pdf({ preferCSSPageSize: true, printBackground: true })`).

## Questions & Answers

### (a) Does `<thead>` repeat on continuation pages?
- **Finding:** **No.** When Paged.js splits a `<table>` across pages, the continuation fragments (`table[data-split-from]`) only contain a cloned `<tbody data-split-from="...">` with the remaining `<tr>` elements. They lack a `<thead>`.
- **Workaround (Task 2.5):** Implement a custom Paged.js `Handler` in `src/backends/html-paged/paged-handlers.ts`:
  - In `afterParsed(parsed)`, record all `table[data-ref]` elements that have a `<thead>`.
  - In `afterPageLayout(pageElement, page, breakToken, chunker)`, locate any `table[data-split-from]` on `pageElement` that lacks a `<thead>`, clone the original `<thead>` (stripping duplicate `id` attributes), and prepend it before `<tbody>`.
  - After prepending `<thead>`, check if the page content overflows `pageElement.querySelector('.pagedjs_page_content')` bounds (because adding the header pushed the last row(s) past the bottom of the page). If overflow occurs or if only the `<thead>` fits with zero `<tbody>` rows, adjust or handle the break token accordingly so no rows overflow the bottom margin and no header is stranded alone.

### (b) Are `tr` rows kept whole, and are `break-after: avoid`, `orphans` and `widows` honoured?
- **Finding:**
  - `tr, th, td { break-inside: avoid; }`: **Honoured** for rows shorter than the page content height (`Layout.findOverflow` detects `insideTableCell` with `break-inside: avoid` and sets the overflow range before the parent `<tr>`). If a single `<tr>` is taller than the page height, Paged.js falls back to splitting or reporting an overflow error; `diagnostics.ts` scans for rows taller than `--text-h` and emits a warning.
  - `h1..h6 { break-after: avoid; break-inside: avoid; }` and `tbody tr:first-child { break-after: avoid; }` / `tbody tr:last-child { break-before: avoid; }`: Paged.js `Breaks` handler converts CSS `break-before` and `break-after` rules into `data-break-before` and `data-previous-break-after` attributes on matching elements during `afterParsed`, **provided the selectors are simple enough to match in the unsplit DOM**. However, when a heading is at the very bottom of a page and the next sibling is a large block (like a paragraph, list, or table) whose *second* line/row overflows rather than its first node, Paged.js's built-in `findOverflow` only checks `node.dataset.previousBreakAfter === 'avoid'` when the *first node itself* overflows. If the first line of a paragraph or the `<thead>` of a table fits at the bottom of the page after an `<h2>`, Paged.js splits inside the paragraph/table, stranding the heading or table header!
  - `orphans: 3; widows: 3;`: Paged.js does **not** implement CSS `orphans` and `widows` line-counting in its `Layout.findOverflow` text walker (it splits at the exact word/line that crosses `vEnd`), though Chromium honours `orphans` and `widows` inside CSS columns if column layout is used.
- **Workarounds (Task 2.2 & Task 2.5):**
  1. Keep `break-after: avoid`, `break-inside: avoid`, `orphans: 3`, and `widows: 3` in `print.css`.
  2. In `paged-handlers.ts`, handle:
     - **Repeating `<thead>`** and re-checking page overflow when a `<thead>` is inserted into a continuation table (`table[data-split-from]`).
     - **Header-only table prevention**: if a table starts near the bottom of a page and only its `<thead>` (or `<thead>` + 0 rows, or fewer than 2 rows when the table has ≥2 rows) fits on that page, push the entire `<table>` to the next page.
     - **Single-row table widow prevention**: if a continuation table on a page would leave only 1 row on the next page, or if a heading (`h1..h6`) is the last element on a page with no following content (or followed only by a split fragment with < 2 lines), push the heading before the page break.
  3. Clean up `Polisher` injected `<style data-pagedjs-inserted-styles>` elements between preview runs so global `@page` rules never accumulate.

### (c) Does KaTeX render with correct fonts, and is the page count stable across reloads?
- **Finding:** **Yes.** Importing `katex/dist/katex.min.css` and awaiting `document.fonts.load(...)` + `document.fonts.ready` before running `Previewer.preview()` produces deterministic dimensions and identical page counts across reloads (verified: 3 pages on initial load and 3 pages on reload).

### (d) Does `window.print()` from the paginated DOM give the same page boundaries as the preview?
- **Finding:** **Yes**, when `@media print` hides all app UI chrome, resets preview zoom/transforms/margins/shadows/gaps on `.pagedjs_pages` and `.pagedjs_page`, and `preferCSSPageSize: true` is used. Verified with Playwright `page.pdf()`: the generated PDF had the exact 3 pages and identical per-page row ranges (`1..20`, `21..49`, `50..60`) as the `.pagedjs_page` DOM preview.
