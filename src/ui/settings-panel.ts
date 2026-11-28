import {
  cloneAutoCloseSettings,
  DEFAULT_AUTOCLOSE_SETTINGS,
  deleteCustomProfile,
  getAllProfiles,
  getBuiltinProfile,
  isProfileModified,
  resetActiveProfile,
  saveCustomProfile,
  selectProfile,
  updateActivePairs,
  type AutoClosePair,
  type AutoCloseSettings,
} from '../core/autoclose.ts';
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
  syncAutoClose(settings: AutoCloseSettings): void;
}

export function createSettingsPanel(
  host: HTMLElement,
  initialSettings: DocSettings,
  onSettingsChange: (updated: DocSettings) => void,
  onOpenStateChange?: (open: boolean) => void,
  onOpenReadmeExample?: () => void,
  onLoadExample?: (example: ExampleDoc) => void,
  onClearCache?: () => void,
  initialAutoClose: AutoCloseSettings = DEFAULT_AUTOCLOSE_SETTINGS,
  onAutoCloseChange?: (updated: AutoCloseSettings) => void
): SettingsPanelController {
  let openState = false;
  let closeTimer: ReturnType<typeof setTimeout> | null = null;
  let userSettings = cloneSettings(initialSettings);
  let userAutoClose = cloneAutoCloseSettings(initialAutoClose);
  let currentEffective = cloneSettings(initialSettings);
  let currentLocked = new Set<string>();
  let pairsExpanded = false;
  let savingProfileMode = false;

  host.className = 'settings-drawer';
  host.hidden = true;

  const editorSec = document.createElement('section');
  editorSec.className = 'settings-section';
  editorSec.dataset.section = 'editor';

  function emitAutoClose(next: AutoCloseSettings): void {
    userAutoClose = cloneAutoCloseSettings(next);
    onAutoCloseChange?.(cloneAutoCloseSettings(userAutoClose));
    renderEditorSection();
  }

  function makeEditorField(labelText: string, control: HTMLElement | CustomSelectController): HTMLElement {
    const row = document.createElement('div');
    row.className = 'settings-row';
    const labelWrap = document.createElement('div');
    labelWrap.className = 'settings-label-wrap';
    const lbl = document.createElement('label');
    lbl.className = 'settings-label';
    lbl.textContent = labelText;
    labelWrap.appendChild(lbl);
    const ctrlEl = 'element' in control ? control.element : control;
    row.append(labelWrap, ctrlEl);
    return row;
  }

  function renderEditorSection(): void {
    editorSec.innerHTML = '<h3 class="settings-heading">Editor</h3>';

    const masterCheck = document.createElement('input');
    masterCheck.type = 'checkbox';
    masterCheck.checked = userAutoClose.enabled;
    masterCheck.setAttribute('aria-label', 'Auto-close characters');
    masterCheck.addEventListener('change', () => {
      emitAutoClose({ ...userAutoClose, enabled: masterCheck.checked });
    });
    editorSec.appendChild(makeEditorField('Auto-close characters', masterCheck));

    const profiles = getAllProfiles(userAutoClose);
    const profileSelect = createCustomSelect(
      profiles.map((p) => ({
        value: p.id,
        label:
          p.id === userAutoClose.activeProfileId && isProfileModified(userAutoClose)
            ? `${p.name} (modified)`
            : p.name,
      })),
      userAutoClose.activeProfileId,
      (val) => {
        savingProfileMode = false;
        emitAutoClose(selectProfile(userAutoClose, val));
      },
      'Auto-close profile'
    );
    if (!userAutoClose.enabled) {
      profileSelect.setDisabled(true);
    }
    editorSec.appendChild(makeEditorField('Profile', profileSelect));

    const behaviorOptions: ReadonlyArray<{
      key: 'skipClosing' | 'deletePairOnBackspace' | 'wrapSelection';
      label: string;
    }> = [
      { key: 'skipClosing', label: 'Skip closing delimiters' },
      { key: 'deletePairOnBackspace', label: 'Delete pair on Backspace' },
      { key: 'wrapSelection', label: 'Wrap selected text' },
    ];
    for (const opt of behaviorOptions) {
      const chk = document.createElement('input');
      chk.type = 'checkbox';
      chk.checked = userAutoClose[opt.key];
      chk.disabled = !userAutoClose.enabled;
      chk.setAttribute('aria-label', opt.label);
      chk.addEventListener('change', () => {
        emitAutoClose({ ...userAutoClose, [opt.key]: chk.checked });
      });
      editorSec.appendChild(makeEditorField(opt.label, chk));
    }

    const details = document.createElement('details');
    details.className = 'autoclose-details';
    details.open = pairsExpanded;
    details.addEventListener('toggle', () => {
      pairsExpanded = details.open;
    });

    const activeCount = userAutoClose.pairs.filter((p) => p.enabled).length;
    const summary = document.createElement('summary');
    summary.className = 'autoclose-summary';
    summary.textContent = `Closing Pairs (${activeCount} active)`;
    details.appendChild(summary);

    const pairList = document.createElement('div');
    pairList.className = 'autoclose-pair-list';

    userAutoClose.pairs.forEach((pair, idx) => {
      const pairRow = document.createElement('div');
      pairRow.className = 'autoclose-pair-row';

      const enableChk = document.createElement('input');
      enableChk.type = 'checkbox';
      enableChk.checked = pair.enabled;
      enableChk.disabled = !userAutoClose.enabled;
      enableChk.setAttribute('aria-label', `Enable pair ${pair.open} to ${pair.close}`);
      enableChk.addEventListener('change', () => {
        const nextPairs = userAutoClose.pairs.map((p, i) =>
          i === idx ? { ...p, enabled: enableChk.checked } : p
        );
        emitAutoClose(updateActivePairs(userAutoClose, nextPairs));
      });

      const openInp = document.createElement('input');
      openInp.type = 'text';
      openInp.className = 'ui-input autoclose-pair-input';
      openInp.value = pair.open;
      openInp.disabled = !userAutoClose.enabled;
      openInp.setAttribute('aria-label', `Opening delimiter ${idx + 1}`);
      openInp.addEventListener('change', () => {
        if (openInp.value.length === 0) {
          openInp.value = pair.open;
          return;
        }
        const nextPairs = userAutoClose.pairs.map((p, i) =>
          i === idx ? { ...p, open: openInp.value } : p
        );
        emitAutoClose(updateActivePairs(userAutoClose, nextPairs));
      });

      const arrow = document.createElement('span');
      arrow.className = 'autoclose-pair-arrow';
      arrow.textContent = '→';
      arrow.setAttribute('aria-hidden', 'true');

      const closeInp = document.createElement('input');
      closeInp.type = 'text';
      closeInp.className = 'ui-input autoclose-pair-input';
      closeInp.value = pair.close;
      closeInp.disabled = !userAutoClose.enabled;
      closeInp.setAttribute('aria-label', `Closing delimiter ${idx + 1}`);
      closeInp.addEventListener('change', () => {
        if (closeInp.value.length === 0) {
          closeInp.value = pair.close;
          return;
        }
        const nextPairs = userAutoClose.pairs.map((p, i) =>
          i === idx ? { ...p, close: closeInp.value } : p
        );
        emitAutoClose(updateActivePairs(userAutoClose, nextPairs));
      });

      const scopeBtn = document.createElement('button');
      scopeBtn.type = 'button';
      scopeBtn.className = 'ui-btn autoclose-scope-btn';
      scopeBtn.textContent = '!code';
      scopeBtn.disabled = !userAutoClose.enabled;
      scopeBtn.setAttribute('aria-pressed', String(pair.notInCode));
      scopeBtn.title = pair.notInCode
        ? 'Disabled inside Markdown code blocks/inline code (click to allow everywhere)'
        : 'Active everywhere (click to suppress inside Markdown code)';
      scopeBtn.classList.toggle('is-active', pair.notInCode);
      scopeBtn.addEventListener('click', () => {
        const nextPairs = userAutoClose.pairs.map((p, i) =>
          i === idx ? { ...p, notInCode: !p.notInCode } : p
        );
        emitAutoClose(updateActivePairs(userAutoClose, nextPairs));
      });

      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'ui-btn ui-btn-icon autoclose-del-btn';
      delBtn.textContent = '×';
      delBtn.disabled = !userAutoClose.enabled;
      delBtn.setAttribute('aria-label', `Remove pair ${pair.open} to ${pair.close}`);
      delBtn.addEventListener('click', () => {
        const nextPairs = userAutoClose.pairs.filter((_, i) => i !== idx);
        emitAutoClose(updateActivePairs(userAutoClose, nextPairs));
      });

      pairRow.append(enableChk, openInp, arrow, closeInp, scopeBtn, delBtn);
      pairList.appendChild(pairRow);
    });

    details.appendChild(pairList);

    const addRow = document.createElement('div');
    addRow.className = 'autoclose-add-row';

    const newOpenInp = document.createElement('input');
    newOpenInp.type = 'text';
    newOpenInp.className = 'ui-input autoclose-pair-input';
    newOpenInp.placeholder = 'Open (e.g. |)';
    newOpenInp.disabled = !userAutoClose.enabled;
    newOpenInp.setAttribute('aria-label', 'New opening delimiter');

    const newArrow = document.createElement('span');
    newArrow.className = 'autoclose-pair-arrow';
    newArrow.textContent = '→';
    newArrow.setAttribute('aria-hidden', 'true');

    const newCloseInp = document.createElement('input');
    newCloseInp.type = 'text';
    newCloseInp.className = 'ui-input autoclose-pair-input';
    newCloseInp.placeholder = 'Close (e.g. |)';
    newCloseInp.disabled = !userAutoClose.enabled;
    newCloseInp.setAttribute('aria-label', 'New closing delimiter');

    let newNotInCode = false;
    const newScopeBtn = document.createElement('button');
    newScopeBtn.type = 'button';
    newScopeBtn.className = 'ui-btn autoclose-scope-btn';
    newScopeBtn.textContent = '!code';
    newScopeBtn.disabled = !userAutoClose.enabled;
    newScopeBtn.setAttribute('aria-pressed', 'false');
    newScopeBtn.title = 'Suppress inside Markdown code blocks/inline code';
    newScopeBtn.addEventListener('click', () => {
      newNotInCode = !newNotInCode;
      newScopeBtn.setAttribute('aria-pressed', String(newNotInCode));
      newScopeBtn.classList.toggle('is-active', newNotInCode);
    });

    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'ui-btn';
    addBtn.textContent = '+ Add';
    addBtn.disabled = !userAutoClose.enabled;

    const submitNewPair = () => {
      const openVal = newOpenInp.value;
      const closeVal = newCloseInp.value;
      if (!openVal || !closeVal) return;
      const existingIdx = userAutoClose.pairs.findIndex((p) => p.open === openVal);
      const newPair: AutoClosePair = {
        open: openVal,
        close: closeVal,
        enabled: true,
        notInCode: newNotInCode,
      };
      const nextPairs =
        existingIdx >= 0
          ? userAutoClose.pairs.map((p, i) => (i === existingIdx ? newPair : p))
          : [...userAutoClose.pairs, newPair];
      pairsExpanded = true;
      emitAutoClose(updateActivePairs(userAutoClose, nextPairs));
    };

    addBtn.addEventListener('click', submitNewPair);
    for (const inp of [newOpenInp, newCloseInp]) {
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          submitNewPair();
        }
      });
    }

    addRow.append(newOpenInp, newArrow, newCloseInp, newScopeBtn, addBtn);
    details.appendChild(addRow);

    const profileActions = document.createElement('div');
    profileActions.className = 'autoclose-profile-actions';

    const isBuiltin = Boolean(getBuiltinProfile(userAutoClose.activeProfileId));
    if (isBuiltin) {
      const resetProfileBtn = document.createElement('button');
      resetProfileBtn.type = 'button';
      resetProfileBtn.className = 'ui-btn';
      resetProfileBtn.textContent = 'Reset Profile';
      resetProfileBtn.disabled = !userAutoClose.enabled || !isProfileModified(userAutoClose);
      resetProfileBtn.addEventListener('click', () => {
        emitAutoClose(resetActiveProfile(userAutoClose));
      });
      profileActions.appendChild(resetProfileBtn);
    } else {
      const delProfileBtn = document.createElement('button');
      delProfileBtn.type = 'button';
      delProfileBtn.className = 'ui-btn';
      delProfileBtn.textContent = 'Delete Profile';
      delProfileBtn.disabled = !userAutoClose.enabled;
      delProfileBtn.addEventListener('click', () => {
        emitAutoClose(deleteCustomProfile(userAutoClose, userAutoClose.activeProfileId));
      });
      profileActions.appendChild(delProfileBtn);
    }

    if (!savingProfileMode) {
      const saveAsBtn = document.createElement('button');
      saveAsBtn.type = 'button';
      saveAsBtn.className = 'ui-btn';
      saveAsBtn.textContent = 'Save as Profile…';
      saveAsBtn.disabled = !userAutoClose.enabled;
      saveAsBtn.addEventListener('click', () => {
        savingProfileMode = true;
        renderEditorSection();
      });
      profileActions.appendChild(saveAsBtn);
    } else {
      const nameInp = document.createElement('input');
      nameInp.type = 'text';
      nameInp.className = 'ui-input autoclose-profile-name-input';
      nameInp.placeholder = 'Profile name';
      nameInp.setAttribute('aria-label', 'Custom profile name');

      const confirmSaveBtn = document.createElement('button');
      confirmSaveBtn.type = 'button';
      confirmSaveBtn.className = 'ui-btn ui-btn-primary';
      confirmSaveBtn.textContent = 'Save';

      const cancelSaveBtn = document.createElement('button');
      cancelSaveBtn.type = 'button';
      cancelSaveBtn.className = 'ui-btn';
      cancelSaveBtn.textContent = 'Cancel';

      const doSave = () => {
        const trimmed = nameInp.value.trim();
        if (!trimmed) return;
        savingProfileMode = false;
        emitAutoClose(saveCustomProfile(userAutoClose, trimmed));
      };

      confirmSaveBtn.addEventListener('click', doSave);
      cancelSaveBtn.addEventListener('click', () => {
        savingProfileMode = false;
        renderEditorSection();
      });
      nameInp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          doSave();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          savingProfileMode = false;
          renderEditorSection();
        }
      });

      profileActions.append(nameInp, confirmSaveBtn, cancelSaveBtn);
    }

    details.appendChild(profileActions);
    editorSec.appendChild(details);
  }

  renderEditorSection();

  function render(effective: DocSettings, locked: Set<string>): void {
    const prevBody = host.querySelector('.drawer-body');
    const prevScrollTop = prevBody ? prevBody.scrollTop : 0;
    host.innerHTML = '';

    const header = document.createElement('div');
    header.className = 'drawer-header';
    const title = document.createElement('span');
    title.className = 'drawer-title';
    title.textContent = 'Settings';

    const actions = document.createElement('div');
    actions.className = 'drawer-actions';

    const resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.className = 'ui-btn';
    resetBtn.textContent = 'Reset Defaults';
    resetBtn.addEventListener('click', () => {
      userSettings = cloneSettings(DEFAULT_SETTINGS);
      onSettingsChange(cloneSettings(userSettings));
      userAutoClose = cloneAutoCloseSettings(DEFAULT_AUTOCLOSE_SETTINGS);
      savingProfileMode = false;
      onAutoCloseChange?.(cloneAutoCloseSettings(userAutoClose));
      renderEditorSection();
      render(cloneSettings(userSettings), currentLocked);
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

    body.append(editorSec, pageSec, breakSec, typeSec, keepSec);

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
      currentEffective = cloneSettings(effectiveSettings);
      currentLocked = lockedPaths;
      render(currentEffective, currentLocked);
    },
    syncAutoClose(settings: AutoCloseSettings) {
      userAutoClose = cloneAutoCloseSettings(settings);
      savingProfileMode = false;
      renderEditorSection();
    },
  };
}
