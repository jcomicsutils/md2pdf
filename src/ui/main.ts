import readmeRaw from '../../README.md?raw';
import { PreviewScheduler } from '../backends/html-paged/scheduler.ts';
import { getBackend, listBackends } from '../backends/registry.ts';
import type { Diagnostic, PreviewResult } from '../core/backend.ts';
import { parseFrontmatter } from '../core/frontmatter.ts';
import { normalizeDoc } from '../core/normalize.ts';
import { parseMarkdown } from '../core/parse.ts';
import { cloneSettings, DEFAULT_SETTINGS, type DocSettings } from '../core/settings.ts';
import { createEditor } from './editor.ts';
import {
  runSweepTransition,
  triggerInitialPageReveal,
} from './motion.ts';
import { createSettingsPanel } from './settings-panel.ts';
import { createStatusBar } from './statusbar.ts';
import {
  applyUiThemeVariables,
  clearStoredCustomThemes,
  detectDefaultUiTheme,
  getCurrentUiThemeId,
  importAndSaveCustomTheme,
  loadStoredCustomThemes,
  setUiTheme,
} from './theme.ts';
import { showOneTimePrintHint, showToast } from './toast.ts';
import { createToolbar } from './toolbar.ts';
import './ui.css';

const STORAGE_KEY = 'md2pdf:v1';

const DEFAULT_MARKDOWN = `# Markdown + LaTeX to PDF

Write **Markdown** with inline math like $e^{i\\pi} + 1 = 0$ and display equations:

$$
\\int_{-\\infty}^{\\infty} e^{-x^2}\\,dx = \\sqrt{\\pi}
$$

## Page-Accurate Tables & Code

| Feature | Directive / Syntax | Behaviour |
| :--- | :--- | :--- |
| Explicit Break | \`\\newpage\` | Forces a page break on its own line |
| Top Headings | \`# Heading\` | Starts a new page without blank pages |
| Smart Keep | Code / Tables / Math | Avoids splitting mid-element |

\`\`\`ts
export function paginate(markdown: string): number {
  return 1;
}
\`\`\`
`;

interface StoredState {
  source: string;
  settings: DocSettings;
  uiTheme: string;
}

function loadStoredState(): StoredState {
  const fallback: StoredState = {
    source: DEFAULT_MARKDOWN,
    settings: cloneSettings(DEFAULT_SETTINGS),
    uiTheme: detectDefaultUiTheme(),
  };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<StoredState>;
    const mergedSettings = parseFrontmatter(
      '---\n---\n',
      parsed.settings ? { ...DEFAULT_SETTINGS, ...parsed.settings } : DEFAULT_SETTINGS
    ).settings;
    return {
      source: typeof parsed.source === 'string' ? parsed.source : fallback.source,
      settings: mergedSettings,
      uiTheme: typeof parsed.uiTheme === 'string' ? parsed.uiTheme : fallback.uiTheme,
    };
  } catch {
    return fallback;
  }
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleSaveState(state: StoredState, immediate = false): void {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  const write = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Guard against storage quota errors
    }
  };
  if (immediate) {
    write();
  } else {
    saveTimer = setTimeout(write, 500);
  }
}

export interface Md2PdfTestApi {
  ready: Promise<void>;
  setMarkdown(md: string): Promise<PreviewResult>;
  getSettings(): DocSettings;
  setSettings(partial: Partial<DocSettings>): Promise<PreviewResult>;
  getDiagnostics(): Diagnostic[];
  getPageCount(): number;
}

declare global {
  interface Window {
    __md2pdf: Md2PdfTestApi;
  }
}

async function bootstrap(): Promise<void> {
  loadStoredCustomThemes();
  const stored = loadStoredState();
  let userSettings = cloneSettings(stored.settings);
  let activeBackend = getBackend();
  let isFirstReveal = true;
  let pendingOrientationMorph: { toLandscape: boolean } | null = null;
  let scrollSyncEnabled = true;
  let currentZoomMode = 'fit';
  let currentPageIndex = 1;
  let totalPagesCount = 1;
  let latestDiagnostics: Diagnostic[] = [];

  const themeDef = applyUiThemeVariables(stored.uiTheme);

  const appRoot = document.getElementById('app')!;
  appRoot.className = 'app-shell';
  appRoot.innerHTML = '';

  const toolbarEl = document.createElement('header');
  toolbarEl.className = 'app-toolbar';

  const splitEl = document.createElement('main');
  splitEl.className = 'app-split';

  const editorPane = document.createElement('div');
  editorPane.className = 'editor-pane';

  const divider = document.createElement('div');
  divider.className = 'split-divider';
  divider.setAttribute('role', 'separator');
  divider.setAttribute('aria-orientation', 'vertical');
  divider.tabIndex = 0;

  const previewPane = document.createElement('div');
  previewPane.className = 'preview-pane';

  const progressBar = document.createElement('div');
  progressBar.className = 'preview-progress';
  progressBar.hidden = true;

  const previewHost = document.createElement('div');
  previewHost.className = 'preview-host';

  previewPane.append(progressBar, previewHost);

  const settingsHost = document.createElement('aside');
  const diagDrawerHost = document.createElement('aside');

  splitEl.append(editorPane, divider, previewPane, settingsHost, diagDrawerHost);

  const statusbarEl = document.createElement('footer');
  statusbarEl.className = 'app-statusbar';

  appRoot.append(toolbarEl, splitEl, statusbarEl);

  const scheduler = new PreviewScheduler<PreviewResult>(300);

  function applyZoom(): void {
    if (currentZoomMode === 'fit') {
      const firstPage = previewHost.querySelector('.pagedjs_page') as HTMLElement | null;
      const pageW = firstPage ? firstPage.offsetWidth : 794;
      const availW = Math.max(200, previewPane.clientWidth - 64);
      const ratio = Math.min(1.5, Math.max(0.4, Math.round((availW / Math.max(1, pageW)) * 100) / 100));
      previewHost.style.setProperty('--preview-zoom', String(ratio));
    } else {
      previewHost.style.setProperty('--preview-zoom', currentZoomMode);
    }
  }

  window.addEventListener('resize', () => {
    if (currentZoomMode === 'fit') {
      applyZoom();
    }
  });

  // Draggable split divider
  divider.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    divider.setPointerCapture(e.pointerId);
    divider.classList.add('is-dragging');
    const onMove = (me: PointerEvent) => {
      const rect = splitEl.getBoundingClientRect();
      const pct = Math.min(75, Math.max(20, ((me.clientX - rect.left) / rect.width) * 100));
      splitEl.style.setProperty('--split-left', `${pct}%`);
      if (currentZoomMode === 'fit') applyZoom();
    };
    const onUp = () => {
      divider.classList.remove('is-dragging');
      divider.removeEventListener('pointermove', onMove);
      divider.removeEventListener('pointerup', onUp);
    };
    divider.addEventListener('pointermove', onMove);
    divider.addEventListener('pointerup', onUp);
  });

  const editor = createEditor(editorPane, stored.source, {
    onChange: (newSource) => {
      scheduleSaveState({
        source: newSource,
        settings: userSettings,
        uiTheme: getCurrentUiThemeId(),
      });
      void triggerPreview(false);
    },
    onCursorLine: (line1Based) => {
      if (!scrollSyncEnabled) return;
      syncPreviewToSourceLine(line1Based);
    },
  });

  function syncPreviewToSourceLine(line: number): void {
    const reducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const behavior: ScrollBehavior = reducedMotion ? 'auto' : 'smooth';

    if (line <= 1) {
      previewPane.scrollTo({ top: 0, behavior });
      return;
    }

    const candidates = Array.from(previewHost.querySelectorAll('[data-line]'));
    let best: HTMLElement | null = null;
    let bestDist = Infinity;
    for (const el of candidates) {
      const l = parseInt(el.getAttribute('data-line') ?? '', 10);
      if (!Number.isNaN(l) && l <= line && line - l < bestDist) {
        bestDist = line - l;
        best = el as HTMLElement;
      }
    }
    if (!best) {
      previewPane.scrollTo({ top: 0, behavior });
      return;
    }

    const paneRect = previewPane.getBoundingClientRect();
    const elRect = best.getBoundingClientRect();
    const targetTop = Math.max(0, previewPane.scrollTop + (elRect.top - paneRect.top) - 24);
    previewPane.scrollTo({ top: targetTop, behavior });
  }

  const statusBar = createStatusBar(statusbarEl, diagDrawerHost, (line) => {
    editor.jumpToLine(line);
  });

  const settingsPanel = createSettingsPanel(
    settingsHost,
    userSettings,
    (updated) => {
      if (
        updated.page.landscape !== userSettings.page.landscape ||
        updated.page.size !== userSettings.page.size
      ) {
        pendingOrientationMorph = { toLandscape: updated.page.landscape };
      }
      userSettings = updated;
      scheduleSaveState({
        source: editor.getValue(),
        settings: userSettings,
        uiTheme: getCurrentUiThemeId(),
      });
      void triggerPreview(true);
    },
    (open) => {
      toolbar.setSettingsOpenState(open);
    },
    () => {
      const stripped = readmeRaw
        .replace(/<picture>[\s\S]*?<\/picture>\s*/gi, '')
        .replace(/^---\s*\n+/m, '')
        .replace(/^\[!\[[^\]]*\]\([^)]*\)\]\([^)]*\)\s*\n?/gm, '')
        .replace(/^\n+/, '');
      const cleanedReadme = stripped.startsWith('# ')
        ? stripped.replace(/^(# [^\n]+\s*\n+)/, '$1\\tableofcontents\n\n')
        : `# md2pdf\n\n\\tableofcontents\n\n${stripped}`;
      runSweepTransition(() => {
        editor.setValue(cleanedReadme);
      });
      isFirstReveal = true;
      void triggerPreview(true);
      showToast('Loaded README example');
    },
    (example) => {
      runSweepTransition(() => {
        editor.setValue(example.source);
      });
      isFirstReveal = true;
      void triggerPreview(true);
      showToast(`Loaded example: ${example.label}`);
    },
    () => {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        // Ignore storage errors
      }
      clearStoredCustomThemes();
      userSettings = cloneSettings(DEFAULT_SETTINGS);
      const defaultUiTheme = detectDefaultUiTheme();
      setUiTheme(defaultUiTheme, true);
      toolbar.refreshUiThemes(getCurrentUiThemeId());
      isFirstReveal = true;
      void triggerPreview(true);
      showToast('Cleared cached settings & themes');
    }
  );

  const toolbar = createToolbar(toolbarEl, listBackends(), activeBackend, {
    onNew() {
      runSweepTransition(() => {
        editor.setValue('# Untitled Document\n\n');
      });
      isFirstReveal = true;
      void triggerPreview(true);
    },
    onOpenFile(content, filename) {
      runSweepTransition(() => {
        editor.setValue(content);
      });
      isFirstReveal = true;
      showToast(`Loaded ${filename}`, 'ok');
      void triggerPreview(true);
    },
    onExport() {
      void handleExport();
    },
    onToggleSettings() {
      settingsPanel.toggle();
    },
    onSelectUiTheme(themeId) {
      setUiTheme(themeId, true);
      scheduleSaveState(
        {
          source: editor.getValue(),
          settings: userSettings,
          uiTheme: getCurrentUiThemeId(),
        },
        true
      );
    },
    onSelectBackend(backendId) {
      activeBackend = getBackend(backendId);
      toolbar.updateBackendCapabilities(activeBackend);
      isFirstReveal = true;
      void triggerPreview(true);
    },
    onZoomChange(zoomMode) {
      currentZoomMode = zoomMode;
      applyZoom();
    },
    onPrevPage() {
      scrollToPage(currentPageIndex - 1);
    },
    onNextPage() {
      scrollToPage(currentPageIndex + 1);
    },
    onToggleScrollSync(enabled) {
      scrollSyncEnabled = enabled;
    },
  });

  toolbar.refreshUiThemes(themeDef.id);

  // SyncTeX-style Ctrl/Cmd + Click in preview jumps editor to the corresponding source line
  previewHost.addEventListener('click', (e) => {
    if (!e.ctrlKey && !e.metaKey) return;
    const target = e.target as HTMLElement | null;
    const lineEl = target?.closest('[data-line]') as HTMLElement | null;
    if (!lineEl) return;
    const lineNum = parseInt(lineEl.getAttribute('data-line') ?? '', 10);
    if (!Number.isNaN(lineNum) && lineNum > 0) {
      e.preventDefault();
      editor.jumpToLine(lineNum);
    }
  });

  function scrollToPage(target1Based: number): void {
    const pages = Array.from(previewHost.querySelectorAll('.pagedjs_page'));
    if (pages.length === 0) return;
    const clamped = Math.max(1, Math.min(pages.length, target1Based));
    currentPageIndex = clamped;
    toolbar.updatePageIndicator(currentPageIndex, pages.length);
    pages[clamped - 1]?.scrollIntoView({ behavior: 'auto', block: 'start' });
  }

  previewPane.addEventListener('scroll', () => {
    const pages = Array.from(previewHost.querySelectorAll('.pagedjs_page'));
    if (pages.length === 0) return;
    const paneTop = previewPane.getBoundingClientRect().top;
    let closestIdx = 0;
    let closestDist = Infinity;
    pages.forEach((p, idx) => {
      const dist = Math.abs(p.getBoundingClientRect().top - paneTop);
      if (dist < closestDist) {
        closestDist = dist;
        closestIdx = idx;
      }
    });
    currentPageIndex = closestIdx + 1;
    toolbar.updatePageIndicator(currentPageIndex, pages.length);
  });

  async function runPreviewPass(signal: AbortSignal): Promise<PreviewResult> {
    progressBar.hidden = false;
    try {
      const rawMd = editor.getValue();
      const fm = parseFrontmatter(rawMd, userSettings);
      settingsPanel.sync(fm.settings, fm.lockedPaths);

      const rawIr = parseMarkdown(fm.body, {
        lineOffset: fm.bodyStartLine,
        title: fm.title,
      });
      const normIr = normalizeDoc(rawIr, fm.settings);

      const res = await activeBackend.preview(normIr, fm.settings, previewHost, signal);
      if (signal.aborted) {
        return res;
      }

      const combinedDiagnostics = [...fm.diagnostics, ...res.diagnostics];
      latestDiagnostics = combinedDiagnostics;
      totalPagesCount = Math.max(1, res.pages);
      currentPageIndex = Math.min(currentPageIndex, totalPagesCount);

      toolbar.updatePageIndicator(currentPageIndex, totalPagesCount);
      statusBar.update(totalPagesCount, combinedDiagnostics, activeBackend.label);
      applyZoom();

      if (pendingOrientationMorph) {
        pendingOrientationMorph = null;
        runSweepTransition(() => {}, '.preview-pane');
      } else if (isFirstReveal) {
        isFirstReveal = false;
        triggerInitialPageReveal(previewHost);
      }

      return {
        pages: res.pages,
        diagnostics: combinedDiagnostics,
      };
    } finally {
      progressBar.hidden = true;
    }
  }

  async function triggerPreview(immediate: boolean): Promise<PreviewResult> {
    const res = await scheduler.schedule((signal) => runPreviewPass(signal), immediate);
    return res ?? { pages: totalPagesCount, diagnostics: latestDiagnostics };
  }

  async function handleExport(): Promise<void> {
    await scheduler.waitForIdle();
    const rawMd = editor.getValue();
    const fm = parseFrontmatter(rawMd, userSettings);
    const rawIr = parseMarkdown(fm.body, {
      lineOffset: fm.bodyStartLine,
      title: fm.title,
    });
    const normIr = normalizeDoc(rawIr, fm.settings);

    if (activeBackend.capabilities.needsUserPrintDialog) {
      showOneTimePrintHint();
    }

    const ctrl = new AbortController();
    const res = await activeBackend.export(normIr, fm.settings, ctrl.signal);
    if (res.kind === 'blob') {
      const url = URL.createObjectURL(res.blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = res.filename;
      a.click();
      URL.revokeObjectURL(url);
    }
  }

  function downloadMarkdownSource(): void {
    const rawMd = editor.getValue();
    const blob = new Blob([rawMd], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'document.md';
    a.click();
    URL.revokeObjectURL(url);
    showToast('Downloaded document.md', 'ok');
  }

  window.addEventListener('keydown', (e) => {
    const isMod = e.ctrlKey || e.metaKey;
    if (isMod && e.key.toLowerCase() === 'p') {
      e.preventDefault();
      void handleExport();
    } else if (isMod && e.key.toLowerCase() === 's') {
      e.preventDefault();
      downloadMarkdownSource();
    }
  });

  const initController = new AbortController();
  const readyPromise = (async () => {
    await activeBackend.init(initController.signal);
    await triggerPreview(true);
  })();

  // Global drag-and-drop for .toml theme files
  appRoot.addEventListener('dragover', (e) => {
    const items = e.dataTransfer?.items;
    if (items && items.length > 0) {
      e.preventDefault();
    }
  });

  appRoot.addEventListener('drop', (e) => {
    const files = e.dataTransfer?.files;
    if (!files || files.length === 0) return;
    const tomlFile = Array.from(files).find((f) => f.name.toLowerCase().endsWith('.toml'));
    if (!tomlFile) return;

    e.preventDefault();
    e.stopPropagation();
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') return;
      try {
        const imported = importAndSaveCustomTheme(reader.result);
        userSettings.docTheme = imported.id;
        toolbar.refreshUiThemes(getCurrentUiThemeId());
        scheduleSaveState({
          source: editor.getValue(),
          settings: userSettings,
          uiTheme: getCurrentUiThemeId(),
        });
        void triggerPreview(true);
        showToast(`Imported theme: ${imported.name}`);
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Invalid TOML theme file');
      }
    };
    reader.readAsText(tomlFile);
  });

  window.__md2pdf = {
    ready: readyPromise,
    async setMarkdown(md: string): Promise<PreviewResult> {
      editor.setValue(md);
      const res = await triggerPreview(true);
      await scheduler.waitForIdle();
      return res;
    },
    getSettings(): DocSettings {
      return cloneSettings(userSettings);
    },
    async setSettings(partial: Partial<DocSettings>): Promise<PreviewResult> {
      userSettings = {
        ...userSettings,
        ...partial,
        page: { ...userSettings.page, ...partial.page },
        breaks: { ...userSettings.breaks, ...partial.breaks },
        numbering: { ...userSettings.numbering, ...partial.numbering },
        type: { ...userSettings.type, ...partial.type },
        smartKeep: { ...userSettings.smartKeep, ...partial.smartKeep },
        toc: { ...userSettings.toc, ...partial.toc },
        mathMacros: { ...userSettings.mathMacros, ...partial.mathMacros },
      };
      const res = await triggerPreview(true);
      await scheduler.waitForIdle();
      return res;
    },
    getDiagnostics(): Diagnostic[] {
      return [...latestDiagnostics];
    },
    getPageCount(): number {
      return totalPagesCount;
    },
  };
}

void bootstrap();
