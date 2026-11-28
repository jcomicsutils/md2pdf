import { syntaxTree } from '@codemirror/language';
import {
  EditorSelection,
  type EditorState,
  type Extension,
  Prec,
  type SelectionRange,
  StateEffect,
  StateField,
  type Text,
} from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import type { AutoClosePair, AutoCloseSettings } from '../core/autoclose.ts';

const CLOSE_BEFORE_CHARS = new Set([
  ')',
  ']',
  '}',
  ':',
  ';',
  ',',
  '>',
  '.',
  '?',
  '"',
  "'",
  '`',
  '$',
  '|',
]);

const ENTER_EXPAND_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ['$$', '$$'],
  ['\\[', '\\]'],
  ['{', '}'],
  ['[', ']'],
  ['(', ')'],
];

const freshDollarEffect = StateEffect.define<ReadonlySet<number>>();

const freshDollarField = StateField.define<ReadonlySet<number>>({
  create: () => new Set(),
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(freshDollarEffect)) {
        return effect.value;
      }
    }
    if (tr.docChanged || tr.selection) {
      return value.size === 0 ? value : new Set();
    }
    return value;
  },
});

function hasOddBackslashesBefore(doc: Text, pos: number): boolean {
  let count = 0;
  let i = pos;
  while (i > 0 && doc.sliceString(i - 1, i) === '\\') {
    count++;
    i--;
  }
  return count % 2 === 1;
}

function isInBraceCodeFence(doc: Text, pos: number): boolean {
  const targetLine = doc.lineAt(pos).number;
  let inBraceFence = false;
  let fenceStartLine = 0;

  for (let lineNum = 1; lineNum <= targetLine; lineNum++) {
    const trimmed = doc.line(lineNum).text.trim();
    if (!inBraceFence) {
      if (/^`{3,}[^`]*\{$/.test(trimmed)) {
        inBraceFence = true;
        fenceStartLine = lineNum;
      }
    } else if (/^\}`{3,}$/.test(trimmed)) {
      if (lineNum === targetLine) return false;
      inBraceFence = false;
    }
  }

  return inBraceFence && targetLine > fenceStartLine;
}

export function isInMarkdownCodeContext(state: EditorState, pos: number): boolean {
  const tree = syntaxTree(state);
  for (let node: ReturnType<typeof tree.resolveInner> | null = tree.resolveInner(pos, -1); node; node = node.parent) {
    if (node.name === 'InlineCode') {
      return node.from < pos && pos < node.to;
    }
    if (node.name === 'CodeBlock') {
      return pos >= node.from;
    }
    if (node.name === 'FencedCode') {
      const openLineEnd = state.doc.lineAt(node.from).to;
      if (pos <= openLineEnd) return false;
      const last = node.lastChild;
      if (last && last.name === 'CodeMark' && last.from > node.from && pos > last.from) {
        return false;
      }
      return true;
    }
  }
  return isInBraceCodeFence(state.doc, pos);
}

function getActivePairsAt(
  state: EditorState,
  pos: number,
  settings: AutoCloseSettings
): AutoClosePair[] {
  const inCode = isInMarkdownCodeContext(state, pos);
  return settings.pairs.filter(
    (p) => p.enabled && p.open.length > 0 && p.close.length > 0 && (!p.notInCode || !inCode)
  );
}

function canCloseBefore(
  doc: Text,
  pos: number,
  activePairs: readonly AutoClosePair[]
): boolean {
  if (pos >= doc.length) return true;
  const nextChar = doc.sliceString(pos, pos + 1);
  if (/\s/.test(nextChar) || CLOSE_BEFORE_CHARS.has(nextChar)) {
    return true;
  }
  return activePairs.some(
    (p) => doc.sliceString(pos, pos + p.close.length) === p.close
  );
}

function findLongestSkipCandidate(
  doc: Text,
  pos: number,
  ch: string,
  activePairs: readonly AutoClosePair[]
): AutoClosePair | null {
  let best: AutoClosePair | null = null;
  for (const p of activePairs) {
    if (!p.close.endsWith(ch)) continue;
    const prefixLen = p.close.length - 1;
    if (pos < prefixLen) continue;
    const prefix = p.close.slice(0, prefixLen);
    if (doc.sliceString(pos - prefixLen, pos) !== prefix) continue;
    if (doc.sliceString(pos, pos + p.close.length) !== p.close) continue;
    if (!p.close.startsWith('\\') && hasOddBackslashesBefore(doc, pos - prefixLen)) {
      continue;
    }
    if (!best || p.close.length > best.close.length) {
      best = p;
    }
  }
  return best;
}

function findLongestOpenCandidate(
  doc: Text,
  pos: number,
  ch: string,
  activePairs: readonly AutoClosePair[]
): AutoClosePair | null {
  let best: AutoClosePair | null = null;
  for (const p of activePairs) {
    if (!p.open.endsWith(ch)) continue;
    const prefixLen = p.open.length - 1;
    if (pos < prefixLen) continue;
    const prefix = p.open.slice(0, prefixLen);
    if (doc.sliceString(pos - prefixLen, pos) !== prefix) continue;
    if (!best || p.open.length > best.open.length) {
      best = p;
    }
  }
  if (!best) return null;

  const prefixLen = best.open.length - 1;
  if (!best.open.startsWith('\\') && hasOddBackslashesBefore(doc, pos - prefixLen)) {
    return null;
  }

  if (best.open === best.close && best.open.length === 1) {
    const prevChar = pos > 0 ? doc.sliceString(pos - 1, pos) : '';
    if (ch === '`' && prevChar === '`') {
      return null;
    }
    if ((ch === '"' || ch === "'" || ch === '`') && /[A-Za-z0-9]/.test(prevChar)) {
      return null;
    }
  }

  if (!canCloseBefore(doc, pos, activePairs)) {
    return null;
  }

  return best;
}

function handleAutoCloseInput(
  view: EditorView,
  text: string,
  settings: AutoCloseSettings
): boolean {
  if (!settings.enabled || view.composing || text.length !== 1) {
    return false;
  }

  const state = view.state;
  const doc = state.doc;
  const freshDollars = state.field(freshDollarField, false) ?? new Set<number>();
  const nextFreshDollars = new Set<number>();
  let handledAny = false;
  let offsetDelta = 0;

  const transactionSpec = state.changeByRange((range: SelectionRange) => {
    const activePairs = getActivePairsAt(state, range.from, settings);

    // 1. Wrap non-empty selection
    if (range.from < range.to) {
      if (settings.wrapSelection) {
        const pair = activePairs.find((p) => p.open === text);
        if (pair) {
          handledAny = true;
          const innerStart = range.from + offsetDelta + pair.open.length;
          const innerEnd = range.to + offsetDelta + pair.open.length;
          offsetDelta += pair.open.length + pair.close.length;
          return {
            changes: [
              { from: range.from, insert: pair.open },
              { from: range.to, insert: pair.close },
            ],
            range: EditorSelection.range(innerStart, innerEnd),
          };
        }
      }
      const delta = text.length - (range.to - range.from);
      const cursor = range.from + offsetDelta + text.length;
      offsetDelta += delta;
      return {
        changes: { from: range.from, to: range.to, insert: text },
        range: EditorSelection.cursor(cursor),
      };
    }

    const pos = range.from;

    // 2. Upgrade fresh inline $|$ to display $$|$$ on immediate second $
    if (
      text === '$' &&
      freshDollars.has(pos) &&
      activePairs.some((p) => p.open === '$' && p.close === '$') &&
      doc.sliceString(pos - 1, pos + 1) === '$$'
    ) {
      handledAny = true;
      const newCursor = pos + offsetDelta + 1;
      offsetDelta += 2;
      return {
        changes: { from: pos, insert: '$$' },
        range: EditorSelection.cursor(newCursor),
      };
    }

    // 3. Skip closing delimiter (single-char or multi-char LaTeX closer)
    if (settings.skipClosing) {
      const skipPair = findLongestSkipCandidate(doc, pos, text, activePairs);
      if (skipPair) {
        handledAny = true;
        const prefixLen = skipPair.close.length - 1;
        const newCursor = pos + offsetDelta - prefixLen + skipPair.close.length;
        offsetDelta -= prefixLen;
        return {
          changes: prefixLen > 0 ? { from: pos - prefixLen, to: pos, insert: '' } : [],
          range: EditorSelection.cursor(newCursor),
        };
      }
    }

    // 4. Open delimiter auto-close (longest match)
    const openPair = findLongestOpenCandidate(doc, pos, text, activePairs);
    if (openPair) {
      handledAny = true;
      const newCursor = pos + offsetDelta + text.length;
      offsetDelta += text.length + openPair.close.length;
      if (openPair.open === '$' && openPair.close === '$') {
        nextFreshDollars.add(newCursor);
      }
      return {
        changes: { from: pos, insert: text + openPair.close },
        range: EditorSelection.cursor(newCursor),
      };
    }

    // Fallback plain insert for this range if another range matched
    const cursor = pos + offsetDelta + text.length;
    offsetDelta += text.length;
    return {
      changes: { from: pos, insert: text },
      range: EditorSelection.cursor(cursor),
    };
  });

  if (!handledAny) {
    return false;
  }

  view.dispatch({
    ...transactionSpec,
    userEvent: 'input.type',
    scrollIntoView: true,
    effects: freshDollarEffect.of(nextFreshDollars),
  });
  return true;
}

export function handleAutoCloseBackspace(
  view: EditorView,
  settings: AutoCloseSettings
): boolean {
  if (!settings.enabled || !settings.deletePairOnBackspace) {
    return false;
  }
  const state = view.state;
  const doc = state.doc;
  if (state.selection.ranges.some((r) => r.from !== r.to)) {
    return false;
  }

  let handledAny = false;
  let offsetDelta = 0;

  const spec = state.changeByRange((range) => {
    const pos = range.from;
    const activePairs = getActivePairsAt(state, pos, settings);

    // Special case: $$|$$ -> $|$
    if (
      activePairs.some((p) => p.open === '$' && p.close === '$') &&
      pos >= 2 &&
      doc.sliceString(pos - 2, pos + 2) === '$$$$'
    ) {
      handledAny = true;
      const newCursor = pos + offsetDelta - 1;
      offsetDelta -= 2;
      return {
        changes: { from: pos - 1, to: pos + 1, insert: '' },
        range: EditorSelection.cursor(newCursor),
      };
    }

    let best: AutoClosePair | null = null;
    for (const p of activePairs) {
      if (pos < p.open.length) continue;
      if (
        doc.sliceString(pos - p.open.length, pos) === p.open &&
        doc.sliceString(pos, pos + p.close.length) === p.close
      ) {
        if (!best || p.open.length + p.close.length > best.open.length + best.close.length) {
          best = p;
        }
      }
    }

    if (best) {
      handledAny = true;
      const removeLen = 1 + best.close.length;
      const newCursor = pos + offsetDelta - 1;
      offsetDelta -= removeLen;
      return {
        changes: { from: pos - 1, to: pos + best.close.length, insert: '' },
        range: EditorSelection.cursor(newCursor),
      };
    }

    if (pos > 0) {
      const newCursor = pos + offsetDelta - 1;
      offsetDelta -= 1;
      return {
        changes: { from: pos - 1, to: pos, insert: '' },
        range: EditorSelection.cursor(newCursor),
      };
    }

    return { changes: [], range };
  });

  if (!handledAny) {
    return false;
  }

  view.dispatch({
    ...spec,
    userEvent: 'delete.backward',
    scrollIntoView: true,
  });
  return true;
}

export function handleAutoCloseEnter(
  view: EditorView,
  settings: AutoCloseSettings
): boolean {
  if (!settings.enabled) {
    return false;
  }
  const state = view.state;
  const doc = state.doc;
  if (state.selection.ranges.some((r) => r.from !== r.to)) {
    return false;
  }

  let handledAny = false;
  let offsetDelta = 0;

  const spec = state.changeByRange((range) => {
    const pos = range.from;
    const activePairs = getActivePairsAt(state, pos, settings);
    const hasDollar = activePairs.some((p) => p.open === '$' && p.close === '$');

    for (const [open, close] of ENTER_EXPAND_PAIRS) {
      const pairEnabled =
        open === '$$'
          ? hasDollar
          : activePairs.some((p) => p.open === open && p.close === close);
      if (!pairEnabled) continue;
      if (pos < open.length) continue;
      if (
        doc.sliceString(pos - open.length, pos) === open &&
        doc.sliceString(pos, pos + close.length) === close
      ) {
        handledAny = true;
        const lineText = doc.lineAt(pos).text;
        const indent = /^[\t ]*/.exec(lineText)?.[0] ?? '';
        const insert = `\n${indent}\n${indent}`;
        const newCursor = pos + offsetDelta + 1 + indent.length;
        offsetDelta += insert.length;
        return {
          changes: { from: pos, insert },
          range: EditorSelection.cursor(newCursor),
        };
      }
    }

    const lineText = doc.lineAt(pos).text;
    const indent = /^[\t ]*/.exec(lineText)?.[0] ?? '';
    const insert = `\n${indent}`;
    const newCursor = pos + offsetDelta + insert.length;
    offsetDelta += insert.length;
    return {
      changes: { from: pos, insert },
      range: EditorSelection.cursor(newCursor),
    };
  });

  if (!handledAny) {
    return false;
  }

  view.dispatch({
    ...spec,
    userEvent: 'input',
    scrollIntoView: true,
  });
  return true;
}

export function createAutoCloseExtension(settings: AutoCloseSettings): Extension {
  if (!settings.enabled) {
    return [freshDollarField];
  }

  return [
    freshDollarField,
    EditorView.inputHandler.of((view, _from, _to, text) =>
      handleAutoCloseInput(view, text, settings)
    ),
    Prec.high(
      keymap.of([
        {
          key: 'Backspace',
          run: (view) => handleAutoCloseBackspace(view, settings),
        },
        {
          key: 'Enter',
          run: (view) => handleAutoCloseEnter(view, settings),
        },
      ])
    ),
  ];
}
