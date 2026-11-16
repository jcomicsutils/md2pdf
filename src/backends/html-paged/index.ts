import 'katex/dist/katex.min.css';
import { Previewer } from 'pagedjs';
import type { Backend, ExportResult, PreviewResult } from '../../core/backend.ts';
import type { DocIR } from '../../core/ir.ts';
import { paletteFor } from '../../core/palette.ts';
import type { DocSettings } from '../../core/settings.ts';
import { loadManifestFonts } from '../../fonts/manifest.ts';
import { scanDomDiagnostics } from './diagnostics.ts';
import { ensurePagedHandlersRegistered } from './paged-handlers.ts';
import { buildPrintCss, getContentHeightMm, getContentWidthMm } from './print-css.ts';
import { irToHtml } from './to-html.ts';

export class HtmlPagedBackend implements Backend {
  readonly id = 'html-paged';
  readonly label = 'HTML + Paged.js (Browser Print)';
  readonly capabilities = {
    download: false,
    pageModel: true,
    needsUserPrintDialog: true,
  };

  private activePolisher: { destroy(): void } | null = null;
  private previewMutex: Promise<void> = Promise.resolve();

  async init(_signal: AbortSignal): Promise<void> {
    ensurePagedHandlersRegistered();
    await loadManifestFonts();
  }

  async preview(
    doc: DocIR,
    s: DocSettings,
    host: HTMLElement,
    signal: AbortSignal
  ): Promise<PreviewResult> {
    // Serialize execution so two Paged.js runs never overlap
    let releaseMutex!: () => void;
    const prevMutex = this.previewMutex;
    this.previewMutex = new Promise<void>((resolve) => {
      releaseMutex = resolve;
    });

    await prevMutex;
    try {
      if (signal.aborted) {
        return { pages: 0, diagnostics: [] };
      }

      ensurePagedHandlersRegistered();
      await loadManifestFonts();

      const palette = paletteFor(s.docTheme);
      const { html, diagnostics: htmlDiagnostics } = irToHtml(doc, s);
      const cssText = buildPrintCss(s, palette);

      // Create an off-screen container positioned in the document so Paged.js can measure layout accurately
      const offscreen = document.createElement('div');
      offscreen.className = 'md2pdf-offscreen-staging';
      offscreen.style.cssText =
        'position: fixed; left: -10000px; top: 0; visibility: hidden; pointer-events: none; z-index: -1;';
      document.body.appendChild(offscreen);

      // Clean up any previous polisher styles before starting a new Previewer run
      if (this.activePolisher) {
        try {
          this.activePolisher.destroy();
        } catch {
          // ignore cleanup error
        }
        this.activePolisher = null;
      }
      document.querySelectorAll('style[data-pagedjs-inserted-styles]').forEach((el) => el.remove());

      const previewer = new Previewer();
      const onAbort = () => {
        try {
          previewer.chunker.stop();
        } catch {
          // ignore
        }
      };
      signal.addEventListener('abort', onAbort, { once: true });

      try {
        // Pre-scan for oversized table rows before Paged.js splits/hangs on a single row taller than page height
        const preDiagnostics = [...htmlDiagnostics];
        const processedHtml = this.mitigateTallTableRows(html, s, preDiagnostics);
        const renderInput = processedHtml.trim() === '' ? '<div class="doc-empty-page">&nbsp;</div>' : processedHtml;

        await previewer.preview(renderInput, [{ 'print.css': cssText }], offscreen);
        this.activePolisher = previewer.polisher;

        if (signal.aborted) {
          offscreen.remove();
          return { pages: 0, diagnostics: [] };
        }

        const domDiagnostics = scanDomDiagnostics(offscreen);
        const pageEls = offscreen.querySelectorAll('.pagedjs_page');
        const pageCount = pageEls.length;

        // Atomic swap into host (double buffer)
        const pagesContainer = offscreen.querySelector('.pagedjs_pages');
        host.innerHTML = '';
        if (pagesContainer) {
          host.appendChild(pagesContainer);
        }
        offscreen.remove();

        // Deduplicate diagnostics by level+msg+line
        const allDiagnostics = [...preDiagnostics, ...domDiagnostics];
        const deduped = allDiagnostics.filter((d, idx, arr) => {
          return (
            arr.findIndex(
              (other) => other.level === d.level && other.msg === d.msg && other.line === d.line
            ) === idx
          );
        });

        return {
          pages: pageCount,
          diagnostics: deduped,
        };
      } catch (err) {
        offscreen.remove();
        throw err;
      } finally {
        signal.removeEventListener('abort', onAbort);
      }
    } finally {
      releaseMutex();
    }
  }

  private mitigateTallTableRows(
    html: string,
    settings: DocSettings,
    diagnostics: PreviewResult['diagnostics']
  ): string {
    // Measure unpaginated rows in a temporary width-constrained container so if a single <tr>
    // is taller than the page content height, we allow that specific row to break inside
    // (avoiding Paged.js infinite loop / layout error) and emit the tall-row diagnostic.
    const contentHeightMm = getContentHeightMm(settings);
    const contentWidthMm = getContentWidthMm(settings);
    const maxPx = (contentHeightMm / 25.4) * 96;

    const probe = document.createElement('div');
    probe.style.cssText = `position: fixed; left: -20000px; top: 0; width: ${contentWidthMm}mm; font-family: '${settings.type.body}', serif; font-size: ${settings.type.sizePt}pt; line-height: ${settings.type.leading}; visibility: hidden;`;
    probe.innerHTML = `<style>
      .probe-scope table { border-collapse: collapse; width: 100%; table-layout: ${settings.type.tableLayout === 'equal' ? 'fixed' : 'auto'}; font-size: ${Math.round(settings.type.sizePt * 0.94 * 10) / 10}pt; }
      .probe-scope td, .probe-scope th { border: 1px solid #000; padding: 4pt 6pt; overflow-wrap: break-word; vertical-align: top; }
    </style><div class="probe-scope">${html}</div>`;
    document.body.appendChild(probe);

    try {
      const scope = probe.querySelector('.probe-scope')!;
      // Un-keep tables whose total height exceeds 35% of a page so Paged.js can start them on the current page
      for (const tbl of Array.from(scope.querySelectorAll('table.keep'))) {
        if (tbl.getBoundingClientRect().height > maxPx * 0.35) {
          tbl.classList.remove('keep');
        }
      }
      const rows = Array.from(scope.querySelectorAll('tbody tr'));
      for (const tr of rows) {
        const rect = tr.getBoundingClientRect();
        if (rect.height > maxPx * 0.92) {
          // Find line number from parent table
          const tbl = tr.closest('table');
          const lineAttr = tbl?.getAttribute('data-line');
          const line = lineAttr ? parseInt(lineAttr, 10) : undefined;
          diagnostics.push({
            level: 'warn',
            msg: 'Table row is taller than the page content area and cannot be kept whole',
            line,
          });
          // Allow this oversized row and its cells to split across pages so Paged.js does not abort
          (tr as HTMLElement).style.breakInside = 'auto';
          tr.querySelectorAll('td, th').forEach((cell) => {
            (cell as HTMLElement).style.breakInside = 'auto';
          });
        }
      }
      return scope.innerHTML;
    } finally {
      probe.remove();
    }
  }

  async export(_doc: DocIR, _s: DocSettings, _signal: AbortSignal): Promise<ExportResult> {
    await this.previewMutex;
    document.body.classList.add('printing');
    try {
      window.print();
    } finally {
      document.body.classList.remove('printing');
    }
    return { kind: 'print-dialog' };
  }
}
