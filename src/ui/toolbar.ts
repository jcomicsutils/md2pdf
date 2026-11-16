import type { Backend } from '../core/backend.ts';
import { listThemes } from '../core/palette.ts';
import { createCustomSelect } from './custom-select.ts';
import iconDarkUrl from '../../logo/icon-dark.svg';
import iconLightUrl from '../../logo/icon-light.svg';

export interface ToolbarCallbacks {
  onNew(): void;
  onOpenFile(content: string, filename: string): void;
  onExport(): void;
  onToggleSettings(): void;
  onSelectUiTheme(themeId: string): void;
  onSelectBackend(backendId: string): void;
  onZoomChange(zoomMode: string): void;
  onPrevPage(): void;
  onNextPage(): void;
  onToggleScrollSync(enabled: boolean): void;
}

export interface ToolbarController {
  updateBackendCapabilities(backend: Backend): void;
  updatePageIndicator(currentPage: number, totalPages: number): void;
  refreshUiThemes(selectedId: string): void;
  setSettingsOpenState(open: boolean): void;
}

export function createToolbar(
  host: HTMLElement,
  backends: Backend[],
  activeBackend: Backend,
  callbacks: ToolbarCallbacks
): ToolbarController {
  host.innerHTML = '';

  const brand = document.createElement('div');
  brand.className = 'toolbar-brand';

  const brandIconDark = document.createElement('img');
  brandIconDark.className = 'toolbar-brand-icon toolbar-brand-icon--dark';
  brandIconDark.src = iconDarkUrl;
  brandIconDark.alt = '';
  brandIconDark.width = 20;
  brandIconDark.height = 20;

  const brandIconLight = document.createElement('img');
  brandIconLight.className = 'toolbar-brand-icon toolbar-brand-icon--light';
  brandIconLight.src = iconLightUrl;
  brandIconLight.alt = '';
  brandIconLight.width = 20;
  brandIconLight.height = 20;

  const brandText = document.createElement('span');
  brandText.textContent = 'md2pdf';

  brand.append(brandIconDark, brandIconLight, brandText);

  const leftGroup = document.createElement('div');
  leftGroup.className = 'toolbar-group toolbar-group-left';

  const newBtn = document.createElement('button');
  newBtn.type = 'button';
  newBtn.className = 'ui-btn';
  newBtn.textContent = 'New';
  newBtn.addEventListener('click', () => callbacks.onNew());

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.md,.markdown,.txt';
  fileInput.className = 'sr-only';
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        callbacks.onOpenFile(reader.result, file.name);
      }
      fileInput.value = '';
    };
    reader.readAsText(file);
  });

  const openBtn = document.createElement('button');
  openBtn.type = 'button';
  openBtn.className = 'ui-btn';
  openBtn.textContent = 'Open';
  openBtn.addEventListener('click', () => fileInput.click());

  leftGroup.append(brand, newBtn, openBtn, fileInput);

  // Center group: Preview controls (zoom, page prev/next, scroll-sync)
  const centerGroup = document.createElement('div');
  centerGroup.className = 'toolbar-group toolbar-group-center';

  const prevPageBtn = document.createElement('button');
  prevPageBtn.type = 'button';
  prevPageBtn.className = 'ui-btn ui-btn-icon';
  prevPageBtn.textContent = '◀';
  prevPageBtn.setAttribute('aria-label', 'Previous page');
  prevPageBtn.addEventListener('click', () => callbacks.onPrevPage());

  const pageIndicator = document.createElement('span');
  pageIndicator.className = 'toolbar-page-indicator';
  pageIndicator.textContent = '1 / 1';

  const nextPageBtn = document.createElement('button');
  nextPageBtn.type = 'button';
  nextPageBtn.className = 'ui-btn ui-btn-icon';
  nextPageBtn.textContent = '▶';
  nextPageBtn.setAttribute('aria-label', 'Next page');
  nextPageBtn.addEventListener('click', () => callbacks.onNextPage());

  const zoomSelect = createCustomSelect(
    [
      { value: 'fit', label: 'Fit Width' },
      { value: '0.5', label: '50%' },
      { value: '0.75', label: '75%' },
      { value: '1', label: '100%' },
      { value: '1.25', label: '125%' },
      { value: '1.5', label: '150%' },
      { value: '2', label: '200%' },
    ],
    'fit',
    (val) => callbacks.onZoomChange(val),
    'Preview zoom'
  );

  const syncLabel = document.createElement('label');
  syncLabel.className = 'ui-btn ui-btn-sync';
  syncLabel.setAttribute('title', 'Toggle scroll sync');

  const syncCheckbox = document.createElement('input');
  syncCheckbox.type = 'checkbox';
  syncCheckbox.checked = true;
  syncCheckbox.setAttribute('aria-label', 'Toggle scroll sync');

  const syncText = document.createElement('span');
  syncText.textContent = 'Sync';

  syncLabel.append(syncCheckbox, syncText);
  syncCheckbox.addEventListener('change', () => {
    callbacks.onToggleScrollSync(syncCheckbox.checked);
  });

  centerGroup.append(prevPageBtn, pageIndicator, nextPageBtn, zoomSelect.element, syncLabel);

  // Right group: Backend select (hidden if <= 1), UI Theme, Settings, Export
  const rightGroup = document.createElement('div');
  rightGroup.className = 'toolbar-group toolbar-group-right';

  const backendSelect = createCustomSelect(
    backends.map((b) => ({ value: b.id, label: b.label })),
    activeBackend.id,
    (val) => callbacks.onSelectBackend(val),
    'Rendering backend'
  );
  if (backends.length <= 1) {
    backendSelect.element.hidden = true;
  }

  const themeSelect = createCustomSelect(
    listThemes().map((t) => ({ value: t.id, label: t.name })),
    'catppuccin-mocha',
    (val) => callbacks.onSelectUiTheme(val),
    'UI theme'
  );
  themeSelect.element.classList.add('toolbar-theme-select');

  function populateUiThemes(selectedId: string): void {
    themeSelect.setOptions(
      listThemes().map((t) => ({ value: t.id, label: t.name })),
      selectedId
    );
  }

  const settingsBtn = document.createElement('button');
  settingsBtn.type = 'button';
  settingsBtn.className = 'ui-btn';
  settingsBtn.textContent = 'Settings';
  settingsBtn.setAttribute('aria-expanded', 'false');
  settingsBtn.addEventListener('click', () => callbacks.onToggleSettings());

  const exportBtn = document.createElement('button');
  exportBtn.type = 'button';
  exportBtn.className = 'ui-btn ui-btn-primary';
  exportBtn.addEventListener('click', () => callbacks.onExport());

  function updateBackendCapabilities(backend: Backend): void {
    exportBtn.textContent = backend.capabilities.download
      ? 'Download PDF'
      : 'Print / Save as PDF';
  }
  updateBackendCapabilities(activeBackend);

  rightGroup.append(backendSelect.element, themeSelect.element, settingsBtn, exportBtn);
  host.append(leftGroup, centerGroup, rightGroup);

  return {
    updateBackendCapabilities,
    updatePageIndicator(currentPage: number, totalPages: number) {
      pageIndicator.textContent = `${Math.max(1, currentPage)} / ${Math.max(1, totalPages)}`;
    },
    refreshUiThemes(selectedId: string) {
      populateUiThemes(selectedId);
    },
    setSettingsOpenState(open: boolean) {
      settingsBtn.setAttribute('aria-expanded', String(open));
      settingsBtn.classList.toggle('is-active', open);
    },
  };
}
