import { Handler, registerHandlers } from 'pagedjs';

let handlersRegistered = false;

interface LayoutLike {
  maxChars: number;
  bounds: DOMRect;
  forceBreak(): void;
}

class Md2PdfPagedHandler extends Handler {
  private originalTheads = new Map<string, HTMLElement>();
  private sourceRoot: DocumentFragment | HTMLElement | null = null;
  private overflowRow: HTMLElement | null = null;

  constructor(chunker?: unknown, polisher?: unknown, caller?: unknown) {
    super(chunker, polisher, caller);
  }

  afterParsed(parsed: DocumentFragment | HTMLElement): void {
    this.sourceRoot = parsed;
    this.originalTheads.clear();
    this.overflowRow = null;
    const tables = parsed.querySelectorAll('table[data-ref]');
    tables.forEach((tbl) => {
      const ref = tbl.getAttribute('data-ref');
      const thead = tbl.querySelector('thead');
      if (ref && thead) {
        const clone = thead.cloneNode(true) as HTMLElement;
        clone.querySelectorAll('[id]').forEach((el) => el.removeAttribute('id'));
        this.originalTheads.set(ref, clone);
      }
    });
  }

  renderNode(clone: Node, node: Node, layout: LayoutLike): void {
    const el = node as Element | null;
    if (!el || !el.tagName) return;
    if (el.tagName !== 'TD' && el.tagName !== 'TH') return;

    // Never check overflow mid-row while cells are still being appended
    if (el.nextElementSibling) {
      layout.maxChars = 1_000_000;
      return;
    }

    layout.maxChars = 1500;
    const tr = (clone as Element).parentElement as HTMLElement | null;
    if (!tr || tr.tagName !== 'TR' || tr.parentElement?.tagName !== 'TBODY') return;

    const tbl = tr.closest('table');
    if (tbl && tbl.hasAttribute('data-split-from') && !tbl.querySelector('thead')) {
      const ref = tbl.getAttribute('data-ref') || tbl.getAttribute('data-split-from');
      const savedThead = ref ? this.originalTheads.get(ref) : null;
      if (savedThead) {
        tbl.insertBefore(savedThead.cloneNode(true), tbl.firstChild);
      }
    }

    const rect = tr.getBoundingClientRect();
    const tblRect = tbl ? tbl.getBoundingClientRect() : rect;
    const b = layout.bounds;
    const overflows =
      Math.floor(rect.bottom) > Math.round(b.bottom) ||
      Math.floor(rect.right) > Math.round(b.right) ||
      Math.floor(tblRect.bottom) > Math.round(b.bottom) ||
      Math.floor(tblRect.right) > Math.round(b.right);

    if (overflows && tr.style.breakInside !== 'auto') {
      this.overflowRow = tr;
      layout.forceBreak();
    }
  }

  onOverflow(
    overflow: Range | undefined,
    rendered: HTMLElement,
    _bounds: DOMRect
  ): Range | undefined {
    if (!this.overflowRow || !rendered.contains(this.overflowRow)) {
      return overflow;
    }

    const tr = this.overflowRow;
    this.overflowRow = null;
    const tbl = tr.closest('table');
    const rows = tbl ? Array.from(tbl.querySelectorAll('tbody tr')) : [tr];
    const wrapper = (rendered.firstElementChild as HTMLElement | null) ?? rendered;
    const isFirstElementOnPage = wrapper.firstElementChild === tbl;
    const isFirstRowInTable = tr === rows[0];

    // If a single row at the very top of a page is taller than the entire page, let Paged.js split it
    if (isFirstElementOnPage && isFirstRowInTable) {
      return overflow;
    }

    const range = document.createRange();
    if (isFirstRowInTable && tbl) {
      range.selectNode(tbl);
    } else {
      range.selectNode(tr);
    }
    if (rendered.lastChild) {
      range.setEndAfter(rendered.lastChild);
    }
    return range;
  }

  afterPageLayout(
    pageElement: HTMLElement,
    _page: unknown,
    breakToken: { node: Node | null; offset?: number } | undefined,
    _chunker: unknown
  ): void {
    this.overflowRow = null;
    const contentArea = pageElement.querySelector('.pagedjs_page_content') as HTMLElement | null;
    if (!contentArea) return;

    // Ensure repeated <thead> is present on continuation tables
    const splitTables = pageElement.querySelectorAll('table[data-split-from]');
    splitTables.forEach((tbl) => {
      const ref = tbl.getAttribute('data-ref') || tbl.getAttribute('data-split-from');
      if (!ref || tbl.querySelector('thead')) return;
      const savedThead = this.originalTheads.get(ref);
      if (!savedThead) return;
      const theadClone = savedThead.cloneNode(true) as HTMLElement;
      const tbody = tbl.querySelector('tbody');
      if (tbody) {
        tbl.insertBefore(theadClone, tbody);
      } else {
        tbl.appendChild(theadClone);
      }
    });

    // Prevent stranded headings at the very bottom of a page (`break-after: avoid`)
    const wrapper = contentArea.firstElementChild;
    if (wrapper && breakToken && this.sourceRoot) {
      let lastEl = wrapper.lastElementChild as HTMLElement | null;
      while (lastEl && /^H[1-6]$/.test(lastEl.tagName) && wrapper.children.length > 1) {
        const hRef = lastEl.getAttribute('data-ref');
        if (!hRef) break;
        const srcHeading = this.sourceRoot.querySelector(`[data-ref="${hRef}"]`);
        if (!srcHeading) break;
        breakToken.node = srcHeading;
        breakToken.offset = 0;
        const toRemove = lastEl;
        lastEl = lastEl.previousElementSibling as HTMLElement | null;
        toRemove.remove();
      }
    }
  }
}

export function ensurePagedHandlersRegistered(): void {
  if (handlersRegistered) return;
  handlersRegistered = true;
  registerHandlers(Md2PdfPagedHandler);
}
