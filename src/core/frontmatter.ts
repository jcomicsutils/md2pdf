import { parseDocument } from 'yaml';
import { z } from 'zod';
import type { Diagnostic } from './backend.ts';
import { cloneSettings, DEFAULT_SETTINGS, type DocSettings } from './settings.ts';

const marginMmSchema = z
  .object({
    t: z.number().min(0).max(100).optional(),
    r: z.number().min(0).max(100).optional(),
    b: z.number().min(0).max(100).optional(),
    l: z.number().min(0).max(100).optional(),
  })
  .strict();

const pageSchema = z
  .object({
    size: z.enum(['A4', 'A5', 'Letter', 'Legal']).optional(),
    landscape: z.boolean().optional(),
    marginMm: marginMmSchema.optional(),
  })
  .strict();

const breaksSchema = z
  .object({
    h1: z.boolean().optional(),
    h2: z.boolean().optional(),
  })
  .strict();

const numberingSchema = z
  .object({
    pages: z.enum(['none', 'n', 'n/m', 'n-of-m']).optional(),
    headings: z.boolean().optional(),
    footnotes: z.enum(['number', 'label']).optional(),
  })
  .strict();

const typeSchema = z
  .object({
    sizePt: z.number().min(6).max(36).optional(),
    leading: z.number().min(1).max(3).optional(),
    body: z.string().optional(),
    heading: z.string().optional(),
    mono: z.string().optional(),
    justify: z.boolean().optional(),
    hyphenate: z.boolean().optional(),
    checkboxStyle: z.enum(['themed', 'native']).optional(),
    tableLayout: z.enum(['auto', 'equal']).optional(),
  })
  .strict();

const smartKeepSchema = z
  .object({
    codeLines: z.number().int().min(0).optional(),
    tableRows: z.number().int().min(0).optional(),
    listItems: z.number().int().min(0).optional(),
    quoteBlocks: z.number().int().min(0).optional(),
  })
  .strict();

const tocSchema = z
  .object({
    depth: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).optional(),
    style: z.enum(['classic', 'minimal', 'clean', 'boxed']).optional(),
    pageNumbers: z.boolean().optional(),
    dots: z.boolean().optional(),
  })
  .strict();

export const frontmatterSchema = z
  .object({
    title: z.string().optional(),
    page: pageSchema.optional(),
    breaks: breaksSchema.optional(),
    numbering: numberingSchema.optional(),
    headerText: z.string().optional(),
    footerText: z.string().optional(),
    type: typeSchema.optional(),
    smartKeep: smartKeepSchema.optional(),
    toc: tocSchema.optional(),
    mathMacros: z.record(z.string(), z.string()).optional(),
    docTheme: z.string().optional(),
  })
  .strict();

export interface FrontmatterResult {
  settings: DocSettings;
  body: string;
  bodyStartLine: number;
  title?: string;
  lockedPaths: Set<string>;
  diagnostics: Diagnostic[];
}

const KNOWN_TOP_KEYS = new Set([
  'title',
  'page',
  'breaks',
  'numbering',
  'headerText',
  'footerText',
  'type',
  'smartKeep',
  'toc',
  'mathMacros',
  'docTheme',
]);

const KNOWN_SUB_KEYS: Record<string, Set<string>> = {
  page: new Set(['size', 'landscape', 'marginMm']),
  'page.marginMm': new Set(['t', 'r', 'b', 'l']),
  breaks: new Set(['h1', 'h2']),
  numbering: new Set(['pages', 'headings', 'footnotes']),
  type: new Set([
    'sizePt',
    'leading',
    'body',
    'heading',
    'mono',
    'justify',
    'hyphenate',
    'checkboxStyle',
    'tableLayout',
  ]),
  smartKeep: new Set(['codeLines', 'tableRows', 'listItems', 'quoteBlocks']),
  toc: new Set(['depth', 'style', 'pageNumbers', 'dots']),
};

function collectKnownAndWarnUnknown(
  raw: Record<string, unknown>,
  diagnostics: Diagnostic[],
  lockedPaths: Set<string>
): Record<string, unknown> {
  const cleaned: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (!KNOWN_TOP_KEYS.has(k)) {
      diagnostics.push({
        level: 'warn',
        msg: `Unknown front matter key '${k}'`,
        line: 1,
      });
      continue;
    }
    if (k === 'mathMacros' && v && typeof v === 'object' && !Array.isArray(v)) {
      lockedPaths.add('mathMacros');
      cleaned[k] = v;
      continue;
    }
    const subSet = KNOWN_SUB_KEYS[k];
    if (subSet && v && typeof v === 'object' && !Array.isArray(v)) {
      const subClean: Record<string, unknown> = {};
      for (const [sk, sv] of Object.entries(v as Record<string, unknown>)) {
        if (!subSet.has(sk)) {
          diagnostics.push({
            level: 'warn',
            msg: `Unknown front matter key '${k}.${sk}'`,
            line: 1,
          });
          continue;
        }
        if (k === 'page' && sk === 'marginMm' && sv && typeof sv === 'object' && !Array.isArray(sv)) {
          const marginSet = KNOWN_SUB_KEYS['page.marginMm']!;
          const marginClean: Record<string, unknown> = {};
          for (const [mk, mv] of Object.entries(sv as Record<string, unknown>)) {
            if (!marginSet.has(mk)) {
              diagnostics.push({
                level: 'warn',
                msg: `Unknown front matter key 'page.marginMm.${mk}'`,
                line: 1,
              });
              continue;
            }
            marginClean[mk] = mv;
            lockedPaths.add(`page.marginMm.${mk}`);
          }
          subClean[sk] = marginClean;
          lockedPaths.add('page.marginMm');
        } else {
          subClean[sk] = sv;
          lockedPaths.add(`${k}.${sk}`);
        }
      }
      cleaned[k] = subClean;
    } else {
      cleaned[k] = v;
      lockedPaths.add(k);
    }
  }
  return cleaned;
}

export function parseFrontmatter(
  markdown: string,
  baseSettings: DocSettings = DEFAULT_SETTINGS
): FrontmatterResult {
  const settings = cloneSettings(baseSettings);
  const diagnostics: Diagnostic[] = [];
  const lockedPaths = new Set<string>();
  const baseTitle = settings.title.trim() || undefined;

  if (!markdown.startsWith('---')) {
    return { settings, body: markdown, bodyStartLine: 0, title: baseTitle, lockedPaths, diagnostics };
  }

  const lines = markdown.split(/\r?\n/);
  if (lines[0]?.trim() !== '---') {
    return { settings, body: markdown, bodyStartLine: 0, title: baseTitle, lockedPaths, diagnostics };
  }

  let endIdx = -1;
  for (let i = 1; i < lines.length; i++) {
    const trimmed = lines[i]!.trim();
    if (trimmed === '---' || trimmed === '...') {
      endIdx = i;
      break;
    }
  }

  if (endIdx === -1) {
    return { settings, body: markdown, bodyStartLine: 0, title: baseTitle, lockedPaths, diagnostics };
  }

  const yamlText = lines.slice(1, endIdx).join('\n');
  const body = lines.slice(endIdx + 1).join('\n');
  const bodyStartLine = endIdx + 1;

  const doc = parseDocument(yamlText);
  if (doc.errors.length > 0) {
    for (const err of doc.errors) {
      diagnostics.push({
        level: 'error',
        msg: `Front matter YAML error: ${err.message}`,
        line: 1,
      });
    }
    return { settings, body, bodyStartLine, title: baseTitle, lockedPaths, diagnostics };
  }

  const parsed = doc.toJS() as unknown;
  if (parsed === null || parsed === undefined) {
    return { settings, body, bodyStartLine, title: baseTitle, lockedPaths, diagnostics };
  }

  if (typeof parsed !== 'object' || Array.isArray(parsed)) {
    diagnostics.push({
      level: 'warn',
      msg: 'Front matter must be a YAML mapping',
      line: 1,
    });
    return { settings, body, bodyStartLine, title: baseTitle, lockedPaths, diagnostics };
  }

  const cleaned = collectKnownAndWarnUnknown(
    parsed as Record<string, unknown>,
    diagnostics,
    lockedPaths
  );

  const validated = frontmatterSchema.safeParse(cleaned);
  let validData: z.infer<typeof frontmatterSchema>;
  if (!validated.success) {
    for (const issue of validated.error.issues) {
      diagnostics.push({
        level: 'warn',
        msg: `Invalid front matter '${issue.path.join('.')}': ${issue.message}`,
        line: 1,
      });
    }
    // Attempt partial merge of valid fields by validating top-level keys individually
    const partial: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(cleaned)) {
      const subRes = frontmatterSchema.safeParse({ [k]: v });
      if (subRes.success) {
        partial[k] = v;
      }
    }
    validData = partial as z.infer<typeof frontmatterSchema>;
  } else {
    validData = validated.data;
  }

  if (validData.title !== undefined) {
    settings.title = validData.title.trim();
  }
  if (validData.page) {
    if (validData.page.size !== undefined) settings.page.size = validData.page.size;
    if (validData.page.landscape !== undefined) settings.page.landscape = validData.page.landscape;
    if (validData.page.marginMm) {
      if (validData.page.marginMm.t !== undefined)
        settings.page.marginMm.t = validData.page.marginMm.t;
      if (validData.page.marginMm.r !== undefined)
        settings.page.marginMm.r = validData.page.marginMm.r;
      if (validData.page.marginMm.b !== undefined)
        settings.page.marginMm.b = validData.page.marginMm.b;
      if (validData.page.marginMm.l !== undefined)
        settings.page.marginMm.l = validData.page.marginMm.l;
    }
  }
  if (validData.breaks) {
    if (validData.breaks.h1 !== undefined) settings.breaks.h1 = validData.breaks.h1;
    if (validData.breaks.h2 !== undefined) settings.breaks.h2 = validData.breaks.h2;
  }
  if (validData.numbering) {
    if (validData.numbering.pages !== undefined)
      settings.numbering.pages = validData.numbering.pages;
    if (validData.numbering.headings !== undefined)
      settings.numbering.headings = validData.numbering.headings;
    if (validData.numbering.footnotes !== undefined)
      settings.numbering.footnotes = validData.numbering.footnotes;
  }
  if (validData.headerText !== undefined) settings.headerText = validData.headerText;
  if (validData.footerText !== undefined) settings.footerText = validData.footerText;
  if (validData.type) {
    if (validData.type.sizePt !== undefined) settings.type.sizePt = validData.type.sizePt;
    if (validData.type.leading !== undefined) settings.type.leading = validData.type.leading;
    if (validData.type.body !== undefined) settings.type.body = validData.type.body;
    if (validData.type.heading !== undefined) settings.type.heading = validData.type.heading;
    if (validData.type.mono !== undefined) settings.type.mono = validData.type.mono;
    if (validData.type.justify !== undefined) settings.type.justify = validData.type.justify;
    if (validData.type.hyphenate !== undefined) settings.type.hyphenate = validData.type.hyphenate;
    if (validData.type.checkboxStyle !== undefined)
      settings.type.checkboxStyle = validData.type.checkboxStyle;
    if (validData.type.tableLayout !== undefined)
      settings.type.tableLayout = validData.type.tableLayout;
  }
  if (validData.smartKeep) {
    if (validData.smartKeep.codeLines !== undefined)
      settings.smartKeep.codeLines = validData.smartKeep.codeLines;
    if (validData.smartKeep.tableRows !== undefined)
      settings.smartKeep.tableRows = validData.smartKeep.tableRows;
    if (validData.smartKeep.listItems !== undefined)
      settings.smartKeep.listItems = validData.smartKeep.listItems;
    if (validData.smartKeep.quoteBlocks !== undefined)
      settings.smartKeep.quoteBlocks = validData.smartKeep.quoteBlocks;
  }
  if (validData.toc) {
    if (validData.toc.depth !== undefined) settings.toc.depth = validData.toc.depth;
    if (validData.toc.style !== undefined) settings.toc.style = validData.toc.style;
    if (validData.toc.pageNumbers !== undefined) settings.toc.pageNumbers = validData.toc.pageNumbers;
    if (validData.toc.dots !== undefined) settings.toc.dots = validData.toc.dots;
  }
  if (validData.mathMacros) {
    settings.mathMacros = { ...settings.mathMacros, ...validData.mathMacros };
  }
  if (validData.docTheme !== undefined) {
    settings.docTheme = validData.docTheme;
  }

  const effectiveTitle =
    validData.title !== undefined ? validData.title.trim() || undefined : baseTitle;

  return {
    settings,
    body,
    bodyStartLine,
    title: effectiveTitle,
    lockedPaths,
    diagnostics,
  };
}
