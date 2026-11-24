export type TocStyle = 'classic' | 'minimal' | 'clean' | 'boxed';

export interface DocSettings {
  title: string;
  page: {
    size: 'A4' | 'A5' | 'Letter' | 'Legal';
    landscape: boolean;
    marginMm: { t: number; r: number; b: number; l: number };
  };
  breaks: { h1: boolean; h2: boolean };
  numbering: { pages: 'none' | 'n' | 'n/m' | 'n-of-m'; headings: boolean; footnotes: 'number' | 'label' };
  headerText: string;
  footerText: string;
  type: {
    sizePt: number;
    leading: number;
    body: string;
    heading: string;
    mono: string;
    justify: boolean;
    hyphenate: boolean;
    checkboxStyle: 'themed' | 'native';
    tableLayout: 'auto' | 'equal';
  };
  smartKeep: {
    codeLines: number;
    tableRows: number;
    listItems: number;
    quoteBlocks: number;
  };
  toc: { depth: 1 | 2 | 3 | 4; style: TocStyle; pageNumbers: boolean; dots: boolean };
  mathMacros: Record<string, string>;
  docTheme: string;
}

export const DEFAULT_SETTINGS: DocSettings = {
  title: '',
  page: {
    size: 'A4',
    landscape: false,
    marginMm: { t: 20, r: 20, b: 22, l: 20 },
  },
  breaks: { h1: true, h2: false },
  numbering: { pages: 'n-of-m', headings: false, footnotes: 'number' },
  headerText: '',
  footerText: '',
  type: {
    sizePt: 11,
    leading: 1.45,
    body: 'Source Serif 4',
    heading: 'Inter',
    mono: 'JetBrains Mono',
    justify: false,
    hyphenate: false,
    checkboxStyle: 'themed',
    tableLayout: 'auto',
  },
  smartKeep: {
    codeLines: 14,
    tableRows: 8,
    listItems: 6,
    quoteBlocks: 3,
  },
  toc: { depth: 3, style: 'classic', pageNumbers: true, dots: false },
  mathMacros: {},
  docTheme: 'paper',
};

export function cloneSettings(s: DocSettings = DEFAULT_SETTINGS): DocSettings {
  return {
    title: s.title,
    page: {
      size: s.page.size,
      landscape: s.page.landscape,
      marginMm: { ...s.page.marginMm },
    },
    breaks: { ...s.breaks },
    numbering: { ...s.numbering },
    headerText: s.headerText,
    footerText: s.footerText,
    type: { ...s.type },
    smartKeep: { ...s.smartKeep },
    toc: { ...s.toc },
    mathMacros: { ...s.mathMacros },
    docTheme: s.docTheme,
  };
}

export function toSafeFilename(
  title: string | undefined,
  ext: string,
  fallbackBase = 'document'
): string {
  const withoutCtrl = Array.from(title ?? '', (ch) => (ch.charCodeAt(0) < 32 ? ' ' : ch)).join('');
  const cleaned = withoutCtrl
    .replace(/[<>:"/\\|?*]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[.\s]+|[.\s]+$/g, '');
  const base = cleaned || fallbackBase;
  const normalizedExt = ext.startsWith('.') ? ext : `.${ext}`;
  return base.toLowerCase().endsWith(normalizedExt.toLowerCase()) ? base : `${base}${normalizedExt}`;
}
