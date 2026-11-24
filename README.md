<picture>
  <source media="(prefers-color-scheme: dark)" srcset="logo/lockup-dark.svg" />
  <source media="(prefers-color-scheme: light)" srcset="logo/lockup-light.svg" />
  <img alt="md2pdf logo" src="logo/lockup-light.svg" width="260" />
</picture>

---

[![Live App](https://img.shields.io/badge/Live%20App-GitHub%20Pages-F5C2E7?style=flat-square&labelColor=11111B&color=F5C2E7)](https://jcomicsutils.github.io/md2pdf/)
[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-CBA6F7?style=flat-square&labelColor=11111B&color=CBA6F7)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-89B4FA?style=flat-square&labelColor=11111B&color=89B4FA)](https://www.typescriptlang.org/)
[![Paged.js](https://img.shields.io/badge/Paged.js-CSS%20Paged%20Media-94E2D5?style=flat-square&labelColor=11111B&color=94E2D5)](https://pagedjs.org/)
[![KaTeX](https://img.shields.io/badge/KaTeX-LaTeX%20Math-A6E3A1?style=flat-square&labelColor=11111B&color=A6E3A1)](https://katex.org/)

Static single-page application for writing Markdown with LaTeX math, inspecting a page-accurate paginated preview, and exporting to PDF via CSS Paged Media (`Paged.js`) and the browser print pipeline. Structured around a strict Intermediate Representation (`DocIR`) so additional backends (such as Typst WASM) can be added without modifying the parser, normalizer, UI, or settings model.

## Usage

```bash
npm ci
npm run dev      # Start Vite dev server
npm run check    # Run TypeScript typecheck, ESLint, Stylelint, and Vitest unit tests
npm run build    # Build production bundle to ./dist
npm run preview  # Rebuild and serve production preview
npm run test:e2e # Run Playwright Chromium PDF pagination verification suite
```

### Keyboard Shortcuts & Navigation
- `Document title` (top toolbar): Sets the PDF title metadata and default filename for `Print / Save as PDF` and `Ctrl/Cmd + S` (overrides the automatic `# H1` fallback; locked when `title:` is set in YAML front matter).
- `Ctrl/Cmd + P`: Trigger PDF export (`Print / Save as PDF`).
- `Ctrl/Cmd + S`: Download the current Markdown source as `<title>.md`.
- `Ctrl/Cmd + Click` (in preview): Jump the editor cursor to the clicked block's source line.

### Directives

Place directives alone on their own line (outside fenced code blocks and math blocks):

| Directive | Effect |
| :--- | :--- |
| `\newpage` | Forces a page break before the following block |
| `\nobreak` | Prevents an automatic heading break on the immediately following heading (or append `{nobreak}` / `{.nobreak}` to the heading) |
| `\pagebreak` | Alias for `\newpage` |
| `\clearpage` | Alias for `\newpage` |
| `<!-- newpage -->` | HTML comment alias for `\newpage` |
| `\tableofcontents` | Inserts a Table of Contents up to `toc.depth` |
| `\toc` | Alias for `\tableofcontents` |
| `[TOC]` | Alias for `\tableofcontents` |

Consecutive page breaks collapse into one, leading and trailing breaks are stripped, and `\newpage` immediately preceding a heading that already breaks (`# H1` by default) produces a single break with no blank page.

To embed Markdown containing nested ```` ``` ```` code fences inside a code block, open the fence with a trailing `{` (e.g., ```` ```md{ ````) and close it with ```` }``` ````.

### YAML Front Matter Reference

Front matter keys map 1:1 onto `DocSettings`. Any field specified in YAML front matter overrides user settings and displays a `front matter` badge in the Settings drawer:

```yaml
---
title: Optional Document Title
page:
  size: A4          # 'A4' | 'A5' | 'Letter' | 'Legal'
  landscape: false
  marginMm:
    t: 20
    r: 20
    b: 22
    l: 20
breaks:
  h1: true
  h2: false
numbering:
  pages: n-of-m     # 'none' | 'n' | 'n/m' | 'n-of-m'
  headings: false
  footnotes: number # 'number' | 'label'
headerText: ""
footerText: ""
type:
  sizePt: 11
  leading: 1.45
  body: Source Serif 4
  heading: Inter
  mono: JetBrains Mono
  justify: false
  hyphenate: false
  checkboxStyle: themed # 'themed' | 'native'
  tableLayout: auto     # 'auto' | 'equal'
smartKeep:
  codeLines: 14
  tableRows: 8
  listItems: 6
  quoteBlocks: 3
toc:
  depth: 3          # 1 | 2 | 3 | 4
  style: classic    # 'classic' | 'minimal' | 'clean' | 'boxed'
  pageNumbers: true
  dots: false
mathMacros:
  "\\R": "\\mathbb{R}"
docTheme: paper     # 'paper' | 'plain-bw' | 'catppuccin-mocha'
---
```

### Built-in Examples

The **Examples** section at the bottom of the Settings drawer loads ready-made documents into the editor. Each one sets its own look through YAML front matter, so it doubles as a template to copy from. Loading an example replaces the editor content; press `Ctrl/Cmd + Z` to get your previous text back.

| Example | Shows |
| :--- | :--- |
| Math lecture notes | `mathMacros`, aligned equations, footnotes, justified and hyphenated text |
| Report with contents page | Boxed TOC with leader dots, numbered headings, captioned tables, task lists, header and footer |
| Dark landscape cheat sheet | `docTheme`, `page.landscape`, tight margins, compact type, no page numbers |
| Page-break controls | `\newpage`, `\nobreak`, `{nobreak}`, `breaks.h2` and `smartKeep.*` |
| Meeting notes (A5) | A5 pages, Plain B&W theme, agenda table, strikethrough, action-item checklists |
| Code highlighting gallery | Every supported highlight language and a long block that splits across pages |

To add another example, put a Markdown file in `src/examples/` and register it in `src/examples/index.ts`.

### Adding a Theme

Drag and drop any valid format-1 `.toml` theme file directly onto the browser window to import and apply it immediately (stored in `localStorage`; use **Clear Cache** in Settings to reset). To bundle a theme in the build, drop the `.toml` file into `src/themes/*.toml` with `format = 1`, `id`, `name`, `dark`, and all 12 hex colors (`#RRGGBB`) under `[colors]`: `bg0`, `bg1`, `bg2`, `border`, `border_hi`, `text`, `text_dim`, `accent`, `accent2`, `ok`, `warn`, `err`. It is automatically discovered via `import.meta.glob`.

### Adding a Backend

Implement the `Backend` interface in `src/core/backend.ts` (`id`, `label`, `capabilities`, `init`, `preview`, `export`) and register it in `src/backends/registry.ts` via `registerBackend(...)`. When more than one backend is registered, the backend selector automatically appears in the toolbar and updates the Export button label based on `capabilities`.

### Known Limitations

- **Browser Support:** CSS Paged Media polyfill (`Paged.js`) and `@page` print fidelity are most reliable in Chromium-based browsers (Chrome, Edge, Chromium). Use a Chromium browser when exporting to PDF, select **Save as PDF**, and set **Margins: None** in the print dialog.
- **Oversized Table Rows:** A single table row taller than the printable page height (`--text-h`) cannot be kept whole on one page; it is allowed to split across pages and reported in the Diagnostics drawer.

## License

This project's own source code is licensed under the GNU General Public License v3.0 (see [LICENSE](LICENSE)). This license applies solely to the code written for `md2pdf` and does not cover third-party libraries, fonts, or tools used by this project (such as Paged.js, KaTeX, CodeMirror, markdown-it, and bundled typefaces), each of which remains governed by its own respective license.
