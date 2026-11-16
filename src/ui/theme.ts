import { getTheme, listThemes, registerCustomTheme, type ThemeDefinition } from '../core/palette.ts';
import { runThemeTransition } from './motion.ts';

const CUSTOM_THEMES_STORAGE_KEY = 'md2pdf.customThemes.v1';

export function loadStoredCustomThemes(): ThemeDefinition[] {
  const loaded: ThemeDefinition[] = [];
  try {
    const raw = localStorage.getItem(CUSTOM_THEMES_STORAGE_KEY);
    if (!raw) return loaded;
    const list = JSON.parse(raw) as unknown;
    if (!Array.isArray(list)) return loaded;
    for (const item of list) {
      if (typeof item === 'string') {
        try {
          loaded.push(registerCustomTheme(item));
        } catch {
          // Ignore invalid stored custom theme
        }
      }
    }
  } catch {
    // Ignore storage errors
  }
  return loaded;
}

export function importAndSaveCustomTheme(rawToml: string): ThemeDefinition {
  const def = registerCustomTheme(rawToml);
  try {
    const raw = localStorage.getItem(CUSTOM_THEMES_STORAGE_KEY);
    const existing = raw ? (JSON.parse(raw) as unknown) : [];
    const entries = Array.isArray(existing)
      ? existing.filter((x): x is string => typeof x === 'string')
      : [];
    // Replace any existing custom theme with the same id
    const filtered = entries.filter((entry) => {
      try {
        return !entry.includes(`id = "${def.id}"`) && !entry.includes(`id = '${def.id}'`);
      } catch {
        return true;
      }
    });
    filtered.push(rawToml);
    localStorage.setItem(CUSTOM_THEMES_STORAGE_KEY, JSON.stringify(filtered));
  } catch {
    // Ignore storage errors
  }
  return def;
}

let currentUiThemeId = 'catppuccin-mocha';

export function clearStoredCustomThemes(): void {
  try {
    localStorage.removeItem(CUSTOM_THEMES_STORAGE_KEY);
  } catch {
    // Ignore storage errors
  }
}

export function detectDefaultUiTheme(): string {
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: light)').matches
      ? 'paper'
      : 'catppuccin-mocha';
  }
  return 'catppuccin-mocha';
}

export function applyUiThemeVariables(themeId: string): ThemeDefinition {
  const def = getTheme(themeId);
  currentUiThemeId = def.id;
  const root = document.documentElement;
  for (const [k, v] of Object.entries(def.colors)) {
    root.style.setProperty(`--${k}`, v);
  }
  root.setAttribute('data-ui-theme', def.id);
  return def;
}

export function setUiTheme(themeId: string, animated = true): ThemeDefinition {
  const def = getTheme(themeId);
  currentUiThemeId = def.id;
  if (animated) {
    runThemeTransition(() => {
      applyUiThemeVariables(def.id);
    });
  } else {
    applyUiThemeVariables(def.id);
  }
  return def;
}

export function toggleUiTheme(onChanged?: (newThemeId: string) => void): string {
  const themes = listThemes();
  const idx = themes.findIndex((t) => t.id === currentUiThemeId);
  const next = themes[(idx + 1) % themes.length] ?? themes[0]!;
  setUiTheme(next.id, true);
  onChanged?.(next.id);
  return next.id;
}

export function getCurrentUiThemeId(): string {
  return currentUiThemeId;
}
