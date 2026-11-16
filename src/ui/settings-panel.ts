import { listThemes } from '../core/palette.ts';
import { cloneSettings, DEFAULT_SETTINGS, type DocSettings, type TocStyle } from '../core/settings.ts';
import { EXAMPLES, type ExampleDoc } from '../examples/index.ts';
import { createCustomSelect, type CustomSelectController } from './custom-select.ts';
import { prefersReducedMotion } from './motion.ts';

export interface SettingsPanelController {
  isOpen(): boolean;
  open(): void;
  close(): void;
  toggle(): void;
  sync(effectiveSettings: DocSettings, lockedPaths: Set<string>): void;
}

export function createSettingsPanel(
  host: HTMLElement,
  initialSettings: DocSettings,
  onSettingsChange: (updated: DocSettings) => void,
  onOpenStateChange?: (open: boolean) => void,
  onOpenReadmeExample?: () => void,
  onLoadExample?: (example: ExampleDoc) => void,
  onClearCache?: () => void
): SettingsPanelController {
  let openState = false;
  let closeTimer: ReturnType<typeof setTimeout> | null = null;
  let userSettings = cloneSettings(initialSettings);
  let currentLocked = new Set<string>();

  host.className = 'settings-drawer';
  host.hidden = true;

  function render(effective: DocSettings, locked: Set<string>): void {
    const prevBody = host.querySelector('.drawer-body');
    const prevScrollTop = prevBody ? prevBody.scrollTop : 0;
    host.innerHTML = '';

    const header = document.createElement('div');
    header.className = 'drawer-header';
    const title = document.createElement('span');
    title.className = 'drawer-title';
    title.textContent = 'Document Settings';

    const actions = document.createElement('div');
    actions.className = 'drawer-actions';

    const resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.className = 'ui-btn';
    resetBtn.textContent = 'Reset Defaults';
    resetBtn.addEventListener('click', () => {
      userSettings = cloneSettings(DEFAULT_SETTINGS);
      onSettingsChange(cloneSettings(userSettings));
    });

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'ui-btn ui-btn-icon';
    closeBtn.textContent = '×';
    closeBtn.setAttribute('aria-label', 'Close settings');
    closeBtn.addEventListener('click', () => close());

    actions.append(resetBtn, closeBtn);
    header.append(title, actions);

    const body = document.createElement('div');
    body.className = 'drawer-body';

    function makeField(
      labelText: string,
      path: string,
      control: HTMLElement | CustomSelectController
    ): HTMLElement {
      const row = document.createElement('div');
      row.className = 'settings-row';

      const labelWrap = document.createElement('div');
      labelWrap.className = 'settings-label-wrap';
      const lbl = document.createElement('label');
      lbl.className = 'settings-label';
      lbl.textContent = labelText;
      labelWrap.appendChild(lbl);

      const isLocked = locked.has(path) || locked.has(path.split('.')[0]!);
      const ctrlEl = 'element' in control ? control.element : control;
      if (isLocked) {
        const badge = document.createElement('span');
        badge.className = 'fm-badge';
        badge.textContent = 'front matter';
        labelWrap.appendChild(badge);
        if ('setDisabled' in control) {
          control.setDisabled(true);
        } else if (
          control instanceof HTMLInputElement ||
          control instanceof HTMLSelectElement ||
          control instanceof HTMLTextAreaElement
        ) {
          control.disabled = true;
        }
      }

      row.append(labelWrap, ctrlEl);
      return row;
    }

    // Section 1: Page Setup
    const pageSec = document.createElement('section');
    pageSec.className = 'settings-section';
    pageSec.innerHTML = '<h3 class="settings-heading">Page Setup</h3>';

    const sizeSel = createCustomSelect(
      (['A4', 'A5', 'Letter', 'Legal'] as const).map((s) => ({ value: s, label: s })),
      effective.page.size,
      (val) => {
        userSettings.page.size = val as DocSettings['page']['size'];
        onSettingsChange(cloneSettings(userSettings));
      },
      'Page Size'
    );
    pageSec.appendChild(makeField('Page Size', 'page.size', sizeSel));

    const landCheck = document.createElement('input');
    landCheck.type = 'checkbox';
    landCheck.checked = effective.page.landscape;
    landCheck.addEventListener('change', () => {
      userSettings.page.landscape = landCheck.checked;
      onSettingsChange(cloneSettings(userSettings));
    });
    pageSec.appendChild(makeField('Landscape Orientation', 'page.landscape', landCheck));

    for (const [side, label] of [
      ['t', 'Margin Top (mm)'],
      ['r', 'Margin Right (mm)'],
      ['b', 'Margin Bottom (mm)'],
      ['l', 'Margin Left (mm)'],
    ] as const) {
      const inp = document.createElement('input');
      inp.type = 'number';
      inp.className = 'ui-input';
      inp.min = '0';
      inp.max = '80';
      inp.value = String(effective.page.marginMm[side]);
      inp.addEventListener('change', () => {
        const v = Number(inp.value);
        if (!Number.isNaN(v) && v >= 0 && v <= 100) {
          userSettings.page.marginMm[side] = v;
          onSettingsChange(cloneSettings(userSettings));
        }
      });
      pageSec.appendChild(makeField(label, `page.marginMm.${side}`, inp));
    }

    // Section 2: Page Breaks & Numbering
    const breakSec = document.createElement('section');
    breakSec.className = 'settings-section';
    breakSec.innerHTML = '<h3 class="settings-heading">Breaks & Numbering</h3>';

    const h1Check = document.createElement('input');
    h1Check.type = 'checkbox';
    h1Check.checked = effective.breaks.h1;
    h1Check.addEventListener('change', () => {
      userSettings.breaks.h1 = h1Check.checked;
      onSettingsChange(cloneSettings(userSettings));
    });
    breakSec.appendChild(makeField('New page before H1 (#)', 'breaks.h1', h1Check));

    const h2Check = document.createElement('input');
    h2Check.type = 'checkbox';
    h2Check.checked = effective.breaks.h2;
    h2Check.addEventListener('change', () => {
      userSettings.breaks.h2 = h2Check.checked;
      onSettingsChange(cloneSettings(userSettings));
    });
    breakSec.appendChild(makeField('New page before H2 (##)', 'breaks.h2', h2Check));

    const pgNumSel = createCustomSelect(
      [
        { value: 'n', label: 'n' },
        { value: 'n/m', label: 'n/m' },
        { value: 'n-of-m', label: 'n of m' },
        { value: 'none', label: 'None' },
      ],
      effective.numbering.pages,
      (val) => {
        userSettings.numbering.pages = val as DocSettings['numbering']['pages'];
        onSettingsChange(cloneSettings(userSettings));
      },
      'Page Numbers'
    );
    breakSec.appendChild(makeField('Page Numbers', 'numbering.pages', pgNumSel));

    const numHeadingsCheck = document.createElement('input');
    numHeadingsCheck.type = 'checkbox';
    numHeadingsCheck.checked = effective.numbering.headings;
    numHeadingsCheck.addEventListener('change', () => {
      userSettings.numbering.headings = numHeadingsCheck.checked;
      onSettingsChange(cloneSettings(userSettings));
    });
    breakSec.appendChild(makeField('Number headings', 'numbering.headings', numHeadingsCheck));

    const tocStyleSel = createCustomSelect(
      [
        { value: 'classic', label: 'Classic' },
        { value: 'minimal', label: 'Minimal' },
        { value: 'clean', label: 'Clean' },
        { value: 'boxed', label: 'Boxed' },
      ],
      effective.toc.style,
      (val) => {
        userSettings.toc.style = val as TocStyle;
        onSettingsChange(cloneSettings(userSettings));
      },
      'TOC style'
    );
    breakSec.appendChild(makeField('TOC style', 'toc.style', tocStyleSel));

    const tocPagesCheck = document.createElement('input');
    tocPagesCheck.type = 'checkbox';
    tocPagesCheck.checked = effective.toc.pageNumbers;
    tocPagesCheck.addEventListener('change', () => {
      userSettings.toc.pageNumbers = tocPagesCheck.checked;
      onSettingsChange(cloneSettings(userSettings));
    });
    breakSec.appendChild(makeField('TOC page numbers', 'toc.pageNumbers', tocPagesCheck));

    const tocDotsCheck = document.createElement('input');
    tocDotsCheck.type = 'checkbox';
    tocDotsCheck.checked = effective.toc.dots;
    tocDotsCheck.addEventListener('change', () => {
      userSettings.toc.dots = tocDotsCheck.checked;
      onSettingsChange(cloneSettings(userSettings));
    });
    breakSec.appendChild(makeField('TOC leader dots', 'toc.dots', tocDotsCheck));

    const fnStyleSel = createCustomSelect(
      [
        { value: 'number', label: 'Numbered' },
        { value: 'label', label: 'Original label' },
      ],
      effective.numbering.footnotes,
      (val) => {
        userSettings.numbering.footnotes = val as DocSettings['numbering']['footnotes'];
        onSettingsChange(cloneSettings(userSettings));
      },
      'Footnote Style'
    );
    breakSec.appendChild(makeField('Footnote Style', 'numbering.footnotes', fnStyleSel));

    // Section 3: Typography & Theme
    const typeSec = document.createElement('section');
    typeSec.className = 'settings-section';
    typeSec.innerHTML = '<h3 class="settings-heading">Typography & Theme</h3>';

    const docThemeVal =
      effective.docTheme === 'mocha' ? 'catppuccin-mocha' : effective.docTheme;
    const docThemeSel = createCustomSelect(
      listThemes().map((t) => ({ value: t.id, label: t.name })),
      docThemeVal,
      (val) => {
        userSettings.docTheme = val;
        onSettingsChange(cloneSettings(userSettings));
      },
      'Document Theme'
    );
    typeSec.appendChild(makeField('Document Theme', 'docTheme', docThemeSel));

    const fontSizeInp = document.createElement('input');
    fontSizeInp.type = 'number';
    fontSizeInp.className = 'ui-input';
    fontSizeInp.min = '7';
    fontSizeInp.max = '24';
    fontSizeInp.step = '0.5';
    fontSizeInp.value = String(effective.type.sizePt);
    fontSizeInp.addEventListener('change', () => {
      const v = Number(fontSizeInp.value);
      if (!Number.isNaN(v) && v >= 6 && v <= 36) {
        userSettings.type.sizePt = v;
        onSettingsChange(cloneSettings(userSettings));
      }
    });
    typeSec.appendChild(makeField('Font Size (pt)', 'type.sizePt', fontSizeInp));

    const bodyFontSel = createCustomSelect(
      ['Source Serif 4', 'Inter', 'JetBrains Mono'].map((f) => ({ value: f, label: f })),
      effective.type.body,
      (val) => {
        userSettings.type.body = val;
        onSettingsChange(cloneSettings(userSettings));
      },
      'Body Font'
    );
    typeSec.appendChild(makeField('Body Font', 'type.body', bodyFontSel));

    const justifyCheck = document.createElement('input');
    justifyCheck.type = 'checkbox';
    justifyCheck.checked = effective.type.justify;
    justifyCheck.addEventListener('change', () => {
      userSettings.type.justify = justifyCheck.checked;
      onSettingsChange(cloneSettings(userSettings));
    });
    typeSec.appendChild(makeField('Justify Paragraphs', 'type.justify', justifyCheck));

    const hyphCheck = document.createElement('input');
    hyphCheck.type = 'checkbox';
    hyphCheck.checked = effective.type.hyphenate;
    hyphCheck.addEventListener('change', () => {
      userSettings.type.hyphenate = hyphCheck.checked;
      onSettingsChange(cloneSettings(userSettings));
    });
    typeSec.appendChild(makeField('Hyphenation', 'type.hyphenate', hyphCheck));

    const cbStyleSel = createCustomSelect(
      [
        { value: 'themed', label: 'Themed' },
        { value: 'native', label: 'Native' },
      ],
      effective.type.checkboxStyle,
      (val) => {
        userSettings.type.checkboxStyle = val as DocSettings['type']['checkboxStyle'];
        onSettingsChange(cloneSettings(userSettings));
      },
      'Checkbox Style'
    );
    typeSec.appendChild(makeField('Checkbox Style', 'type.checkboxStyle', cbStyleSel));

    const tblLayoutSel = createCustomSelect(
      [
        { value: 'auto', label: 'Auto' },
        { value: 'equal', label: 'Equal' },
      ],
      effective.type.tableLayout,
      (val) => {
        userSettings.type.tableLayout = val as DocSettings['type']['tableLayout'];
        onSettingsChange(cloneSettings(userSettings));
      },
      'Table Columns'
    );
    typeSec.appendChild(makeField('Table Columns', 'type.tableLayout', tblLayoutSel));

    // Section 4: Smart Keep Thresholds & Math Macros
    const keepSec = document.createElement('section');
    keepSec.className = 'settings-section';
    keepSec.innerHTML = '<h3 class="settings-heading">Smart Keep & Math Macros</h3>';

    for (const [key, label] of [
      ['codeLines', 'Keep Code Blocks ≤ Lines'],
      ['tableRows', 'Keep Tables ≤ Rows'],
      ['listItems', 'Keep Lists ≤ Items'],
      ['quoteBlocks', 'Keep Quotes ≤ Blocks'],
    ] as const) {
      const inp = document.createElement('input');
      inp.type = 'number';
      inp.className = 'ui-input';
      inp.min = '0';
      inp.max = '100';
      inp.value = String(effective.smartKeep[key]);
      inp.addEventListener('change', () => {
        const v = parseInt(inp.value, 10);
        if (!Number.isNaN(v) && v >= 0) {
          userSettings.smartKeep[key] = v;
          onSettingsChange(cloneSettings(userSettings));
        }
      });
      keepSec.appendChild(makeField(label, `smartKeep.${key}`, inp));
    }

    const macrosArea = document.createElement('textarea');
    macrosArea.className = 'ui-textarea';
    macrosArea.rows = 3;
    macrosArea.placeholder = '\\R: \\mathbb{R}';
    macrosArea.value = Object.entries(effective.mathMacros)
      .map(([k, v]) => `${k}: ${v}`)
      .join('\n');
    macrosArea.addEventListener('change', () => {
      const nextMacros: Record<string, string> = {};
      for (const line of macrosArea.value.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const colonIdx = trimmed.indexOf(':');
        if (colonIdx > 0) {
          const k = trimmed.slice(0, colonIdx).trim();
          const v = trimmed.slice(colonIdx + 1).trim();
          if (k.startsWith('\\')) nextMacros[k] = v;
        }
      }
      userSettings.mathMacros = nextMacros;
      onSettingsChange(cloneSettings(userSettings));
    });
    keepSec.appendChild(makeField('Math Macros (\\cmd: expansion)', 'mathMacros', macrosArea));

    body.append(pageSec, breakSec, typeSec, keepSec);

    if (onOpenReadmeExample || onLoadExample) {
      const exampleSec = document.createElement('section');
      exampleSec.className = 'settings-section';
      exampleSec.innerHTML = '<h3 class="settings-heading">Examples</h3>';

      if (onOpenReadmeExample) {
        const exampleBtn = document.createElement('button');
        exampleBtn.type = 'button';
        exampleBtn.className = 'ui-btn';
        exampleBtn.textContent = 'Open README Example';
        exampleBtn.addEventListener('click', () => {
          onOpenReadmeExample();
        });
        exampleSec.appendChild(
          makeField('Load documentation as sample', 'examples.readme', exampleBtn)
        );
      }

      if (onLoadExample) {
        for (const example of EXAMPLES) {
          const row = document.createElement('div');
          row.className = 'settings-row settings-example-row';
          row.dataset.example = example.id;

          const labelWrap = document.createElement('div');
          labelWrap.className = 'settings-label-wrap settings-label-wrap--stacked';
          const name = document.createElement('span');
          name.className = 'settings-label';
          name.textContent = example.label;
          const hint = document.createElement('span');
          hint.className = 'settings-hint';
          hint.textContent = example.description;
          labelWrap.append(name, hint);

          const loadBtn = document.createElement('button');
          loadBtn.type = 'button';
          loadBtn.className = 'ui-btn';
          loadBtn.textContent = 'Load';
          loadBtn.setAttribute('aria-label', `Load example: ${example.label}`);
          loadBtn.addEventListener('click', () => {
            onLoadExample(example);
          });

          row.append(labelWrap, loadBtn);
          exampleSec.appendChild(row);
        }
      }

      body.appendChild(exampleSec);
    }

    if (onClearCache) {
      const storageSec = document.createElement('section');
      storageSec.className = 'settings-section';
      storageSec.innerHTML = '<h3 class="settings-heading">Storage</h3>';

      const clearBtn = document.createElement('button');
      clearBtn.type = 'button';
      clearBtn.className = 'ui-btn';
      clearBtn.textContent = 'Clear Cache';
      clearBtn.addEventListener('click', () => {
        onClearCache();
      });
      storageSec.appendChild(
        makeField('Clear cached settings & themes', 'storage.clearCache', clearBtn)
      );
      body.appendChild(storageSec);
    }

    host.append(header, body);
    body.scrollTop = prevScrollTop;
  }

  function open(): void {
    if (closeTimer) {
      clearTimeout(closeTimer);
      closeTimer = null;
    }
    openState = true;
    host.classList.remove('is-closing');
    host.hidden = false;
    onOpenStateChange?.(true);
  }

  function close(): void {
    if (!openState) return;
    openState = false;
    onOpenStateChange?.(false);
    if (prefersReducedMotion()) {
      host.classList.remove('is-closing');
      host.hidden = true;
      return;
    }
    host.classList.add('is-closing');
    closeTimer = setTimeout(() => {
      host.classList.remove('is-closing');
      host.hidden = true;
      closeTimer = null;
    }, 200);
  }

  function toggle(): void {
    if (openState) close();
    else open();
  }

  return {
    isOpen: () => openState,
    open,
    close,
    toggle,
    sync(effectiveSettings: DocSettings, lockedPaths: Set<string>) {
      currentLocked = lockedPaths;
      render(effectiveSettings, currentLocked);
    },
  };
}
