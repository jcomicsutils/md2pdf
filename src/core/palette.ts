import { parse as parseToml } from 'smol-toml';
import catppuccinMochaRaw from '../themes/catppuccin-mocha.toml?raw';
import paperRaw from '../themes/paper.toml?raw';
import plainBwRaw from '../themes/plain-bw.toml?raw';

export interface ThemeColors {
  bg0: string;
  bg1: string;
  bg2: string;
  border: string;
  border_hi: string;
  text: string;
  text_dim: string;
  accent: string;
  accent2: string;
  ok: string;
  warn: string;
  err: string;
}

export interface ThemeDefinition {
  format: 1;
  id: string;
  name: string;
  description: string;
  author: string;
  dark: boolean;
  colors: ThemeColors;
}

export interface DocPalette extends ThemeColors {
  sheetBg: string;
  dark: boolean;
  themeId: string;
}

const COLOR_KEYS: (keyof ThemeColors)[] = [
  'bg0',
  'bg1',
  'bg2',
  'border',
  'border_hi',
  'text',
  'text_dim',
  'accent',
  'accent2',
  'ok',
  'warn',
  'err',
];

const HEX_RE = /^#[0-9A-Fa-f]{6}$/;

export function parseAndValidateTheme(rawToml: string): ThemeDefinition {
  const data = parseToml(rawToml) as Record<string, unknown>;
  if (data.format !== 1) {
    throw new Error(`Invalid theme format: expected 1, got ${String(data.format)}`);
  }
  if (typeof data.id !== 'string' || !data.id) {
    throw new Error('Invalid theme: missing id');
  }
  if (typeof data.name !== 'string' || !data.name) {
    throw new Error(`Invalid theme ${data.id}: missing name`);
  }
  if (typeof data.dark !== 'boolean') {
    throw new Error(`Invalid theme ${data.id}: dark must be boolean`);
  }
  const colorsObj = data.colors as Record<string, unknown> | undefined;
  if (!colorsObj || typeof colorsObj !== 'object') {
    throw new Error(`Invalid theme ${data.id}: missing [colors] table`);
  }
  const colors = {} as ThemeColors;
  for (const key of COLOR_KEYS) {
    const val = colorsObj[key];
    if (typeof val !== 'string' || !HEX_RE.test(val)) {
      throw new Error(`Invalid theme ${data.id}: color '${key}' must be #RRGGBB, got ${String(val)}`);
    }
    colors[key] = val;
  }
  return {
    format: 1,
    id: data.id,
    name: data.name,
    description: typeof data.description === 'string' ? data.description : '',
    author: typeof data.author === 'string' ? data.author : '',
    dark: data.dark,
    colors,
  };
}

function loadThemes(): Map<string, ThemeDefinition> {
  const map = new Map<string, ThemeDefinition>();
  // Ensure deterministic order: catppuccin-mocha, paper, plain-bw, then any additional themes
  const rawEntries: [string, string][] = [
    ['catppuccin-mocha.toml', catppuccinMochaRaw],
    ['paper.toml', paperRaw],
    ['plain-bw.toml', plainBwRaw],
  ];
  try {
    const globbed = import.meta.glob('../themes/*.toml', {
      query: '?raw',
      import: 'default',
      eager: true,
    }) as Record<string, string>;
    for (const [k, v] of Object.entries(globbed)) {
      if (
        !k.endsWith('catppuccin-mocha.toml') &&
        !k.endsWith('paper.toml') &&
        !k.endsWith('plain-bw.toml')
      ) {
        rawEntries.push([k, v]);
      }
    }
  } catch {
    // Fallback to static imports when import.meta.glob is unavailable
  }

  for (const [, raw] of rawEntries) {
    const def = parseAndValidateTheme(raw);
    map.set(def.id, def);
  }
  return map;
}

const THEMES = loadThemes();

export function listThemes(): ThemeDefinition[] {
  return Array.from(THEMES.values());
}

export function registerCustomTheme(rawToml: string): ThemeDefinition {
  const def = parseAndValidateTheme(rawToml);
  THEMES.set(def.id, def);
  return def;
}

export function getTheme(idOrDef: string | ThemeDefinition): ThemeDefinition {
  if (typeof idOrDef !== 'string') {
    return idOrDef;
  }
  const direct = THEMES.get(idOrDef);
  if (direct) return direct;
  if (idOrDef === 'mocha') {
    const mocha = THEMES.get('catppuccin-mocha');
    if (mocha) return mocha;
  }
  return THEMES.get('paper') ?? Array.from(THEMES.values())[0]!;
}

export function paletteFor(theme: string | ThemeDefinition): DocPalette {
  const def = getTheme(theme);
  return {
    ...def.colors,
    sheetBg: def.dark ? def.colors.bg0 : '#FFFFFF',
    dark: def.dark,
    themeId: def.id,
  };
}
