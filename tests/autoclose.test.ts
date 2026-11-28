// @vitest-environment jsdom
import { markdown } from '@codemirror/lang-markdown';
import { Compartment, EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { afterEach, describe, expect, it } from 'vitest';
import {
  cloneAutoCloseSettings,
  DEFAULT_AUTOCLOSE_SETTINGS,
  deleteCustomProfile,
  isProfileModified,
  resetActiveProfile,
  sanitizeAutoCloseSettings,
  saveCustomProfile,
  selectProfile,
  updateActivePairs,
  type AutoCloseSettings,
} from '../src/core/autoclose.ts';
import {
  createAutoCloseExtension,
  handleAutoCloseBackspace,
  handleAutoCloseEnter,
} from '../src/ui/autoclose-extension.ts';

const activeViews: EditorView[] = [];

afterEach(() => {
  while (activeViews.length > 0) {
    activeViews.pop()?.destroy();
  }
});

if (typeof Range !== 'undefined' && !Range.prototype.getClientRects) {
  Range.prototype.getClientRects = () => ({ length: 0, item: () => null } as unknown as DOMRectList);
}

function createTestView(initialDoc = '', settings: AutoCloseSettings = DEFAULT_AUTOCLOSE_SETTINGS) {
  const host = document.createElement('div');
  const compartment = new Compartment();
  const state = EditorState.create({
    doc: initialDoc,
    extensions: [markdown(), compartment.of(createAutoCloseExtension(settings))],
  });
  const view = new EditorView({ state, parent: host });
  activeViews.push(view);

  function typeText(text: string): void {
    for (const ch of text) {
      const { from, to } = view.state.selection.main;
      const handlers = view.state.facet(EditorView.inputHandler);
      let handled = false;
      for (const h of handlers) {
        if (
          h(view, from, to, ch, () =>
            view.state.update({
              changes: { from, to, insert: ch },
              selection: { anchor: from + ch.length },
              userEvent: 'input.type',
            })
          )
        ) {
          handled = true;
          break;
        }
      }
      if (!handled) {
        view.dispatch({
          changes: { from, to, insert: ch },
          selection: { anchor: from + ch.length },
          userEvent: 'input.type',
        });
      }
    }
  }

  return {
    view,
    typeText,
    doc: () => view.state.doc.toString(),
    cursor: () => view.state.selection.main.head,
    selection: () => ({
      from: view.state.selection.main.from,
      to: view.state.selection.main.to,
    }),
    setCursor: (pos: number) => view.dispatch({ selection: { anchor: pos } }),
    setSelection: (from: number, to: number) =>
      view.dispatch({ selection: { anchor: from, head: to } }),
    reconfigure: (next: AutoCloseSettings) => {
      view.dispatch({ effects: compartment.reconfigure(createAutoCloseExtension(next)) });
    },
  };
}

describe('Auto-Close Core Model & Profiles', () => {
  it('ships with LaTeX + Markdown default profile and supports profile switching, saving, and resetting', () => {
    expect(DEFAULT_AUTOCLOSE_SETTINGS.enabled).toBe(true);
    expect(DEFAULT_AUTOCLOSE_SETTINGS.activeProfileId).toBe('latex');
    expect(DEFAULT_AUTOCLOSE_SETTINGS.pairs.some((p) => p.open === '\\left(' && p.close === '\\right)')).toBe(
      true
    );

    const modified = updateActivePairs(DEFAULT_AUTOCLOSE_SETTINGS, [
      ...DEFAULT_AUTOCLOSE_SETTINGS.pairs,
      { open: '|', close: '|', enabled: true, notInCode: false },
    ]);
    expect(isProfileModified(modified)).toBe(true);

    const saved = saveCustomProfile(modified, 'Physics Notes');
    expect(saved.activeProfileId).toBe('custom-physics-notes');
    expect(saved.customProfiles).toHaveLength(1);
    expect(saved.pairs.some((p) => p.open === '|')).toBe(true);

    const switched = selectProfile(saved, 'minimal');
    expect(switched.activeProfileId).toBe('minimal');
    expect(switched.pairs.map((p) => p.open)).toEqual(['(', '[', '{']);

    const backToLatex = selectProfile(switched, 'latex');
    expect(isProfileModified(backToLatex)).toBe(true);
    const reset = resetActiveProfile(backToLatex);
    expect(isProfileModified(reset)).toBe(false);
    expect(reset.pairs.some((p) => p.open === '|')).toBe(false);

    const deleted = deleteCustomProfile(reset, 'custom-physics-notes');
    expect(deleted.customProfiles).toHaveLength(0);
  });

  it('sanitizes malformed stored settings safely', () => {
    const sanitized = sanitizeAutoCloseSettings({
      enabled: false,
      activeProfileId: 'nonexistent',
      pairs: [
        { open: '', close: ')', enabled: true, notInCode: false },
        { open: '<', close: '>', enabled: true, notInCode: false },
      ],
    });
    expect(sanitized.enabled).toBe(false);
    expect(sanitized.activeProfileId).toBe('latex');
    expect(sanitized.pairs).toEqual([{ open: '<', close: '>', enabled: true, notInCode: false }]);
  });
});

describe('CodeMirror Auto-Close Extension (LaTeX + Custom)', () => {
  it('auto-closes standard brackets, quotes, and backticks without 4th backtick on code fences', () => {
    const t = createTestView();
    t.typeText('(');
    expect(t.doc()).toBe('()');
    expect(t.cursor()).toBe(1);
    t.typeText('x)');
    expect(t.doc()).toBe('(x)');
    expect(t.cursor()).toBe(3);

    const tFence = createTestView();
    tFence.typeText('```ts');
    expect(tFence.doc()).toBe('```ts');
  });

  it('handles inline $...$, upgrades $|$ to $$|$$, and skips over closing $$ cleanly', () => {
    const t = createTestView();
    t.typeText('$');
    expect(t.doc()).toBe('$$');
    expect(t.cursor()).toBe(1);

    // Immediate second $ upgrades to display math $$|$$
    t.typeText('$');
    expect(t.doc()).toBe('$$$$');
    expect(t.cursor()).toBe(2);

    t.typeText('E = mc^2');
    expect(t.doc()).toBe('$$E = mc^2$$');

    // Typing $$ at the end skips over both closing $ without adding extra $
    t.typeText('$$');
    expect(t.doc()).toBe('$$E = mc^2$$');
    expect(t.cursor()).toBe(12);
  });

  it('auto-closes LaTeX delimiters \\(, \\[, \\{, \\left(...\\right) and supports multi-char skip-over', () => {
    const t1 = createTestView();
    t1.typeText('\\(x + \\alpha');
    expect(t1.doc()).toBe('\\(x + \\alpha\\)');
    t1.typeText('\\)');
    expect(t1.doc()).toBe('\\(x + \\alpha\\)');
    expect(t1.cursor()).toBe(t1.doc().length);

    const t2 = createTestView();
    t2.typeText('\\left(a\\right)');
    expect(t2.doc()).toBe('\\left(a\\right)');
    expect(t2.cursor()).toBe(t2.doc().length);

    const t3 = createTestView();
    t3.typeText('\\{1, 2\\}');
    expect(t3.doc()).toBe('\\{1, 2\\}');
  });

  it('respects backslash escapes and apostrophes/primes', () => {
    const t = createTestView();
    t.typeText('\\$50 and \\"quoted\\"');
    expect(t.doc()).toBe('\\$50 and \\"quoted\\"');

    const mdProfile = selectProfile(DEFAULT_AUTOCLOSE_SETTINGS, 'markdown');
    const tPrime = createTestView('', mdProfile);
    tPrime.typeText("don't and f'(x)");
    expect(tPrime.doc()).toBe("don't and f'(x)");
  });

  it('suppresses notInCode LaTeX pairs inside fenced code blocks, brace fences, and inline code', () => {
    const tInline = createTestView('Use `x`');
    tInline.setCursor(5); // inside `x`
    tInline.typeText('$');
    expect(tInline.doc()).toBe('Use `$x`');

    const tFenced = createTestView('```bash\necho \n```');
    tFenced.setCursor(13); // after "echo "
    tFenced.typeText('$HOME (a)');
    expect(tFenced.doc()).toBe('```bash\necho $HOME (a)\n```');

    const tBrace = createTestView('```md{\n\n}```');
    tBrace.setCursor(7);
    tBrace.typeText('$10');
    expect(tBrace.doc()).toBe('```md{\n$10\n}```');
  });

  it('supports selection wrapping, Backspace pair deletion, and Enter block expansion', () => {
    const t = createTestView('x + y');
    t.setSelection(0, 5);
    t.typeText('$');
    expect(t.doc()).toBe('$x + y$');
    expect(t.selection()).toEqual({ from: 1, to: 6 });

    // Wrap again with $ -> $$x + y$$
    t.typeText('$');
    expect(t.doc()).toBe('$$x + y$$');

    // Backspace inside $$|$$ -> $|$ -> |
    const tBs = createTestView();
    tBs.typeText('$$');
    expect(tBs.doc()).toBe('$$$$');
    expect(handleAutoCloseBackspace(tBs.view, DEFAULT_AUTOCLOSE_SETTINGS)).toBe(true);
    expect(tBs.doc()).toBe('$$');
    expect(handleAutoCloseBackspace(tBs.view, DEFAULT_AUTOCLOSE_SETTINGS)).toBe(true);
    expect(tBs.doc()).toBe('');

    // Backspace inside \left(|\right) -> \left|
    const tLeft = createTestView();
    tLeft.typeText('\\left(');
    expect(tLeft.doc()).toBe('\\left(\\right)');
    expect(handleAutoCloseBackspace(tLeft.view, DEFAULT_AUTOCLOSE_SETTINGS)).toBe(true);
    expect(tLeft.doc()).toBe('\\left');

    // Enter inside \[|\]
    const tEnter = createTestView();
    tEnter.typeText('\\[');
    expect(handleAutoCloseEnter(tEnter.view, DEFAULT_AUTOCLOSE_SETTINGS)).toBe(true);
    expect(tEnter.doc()).toBe('\\[\n\n\\]');
    expect(tEnter.cursor()).toBe(3);
  });

  it('supports custom user pairs like | -> | and < -> > and master enable/disable', () => {
    const custom = updateActivePairs(cloneAutoCloseSettings(DEFAULT_AUTOCLOSE_SETTINGS), [
      ...DEFAULT_AUTOCLOSE_SETTINGS.pairs,
      { open: '|', close: '|', enabled: true, notInCode: false },
      { open: '<', close: '>', enabled: true, notInCode: false },
    ]);

    const t = createTestView('', custom);
    t.typeText('|x| and <a, b>');
    expect(t.doc()).toBe('|x| and <a, b>');

    const tOpen = createTestView('', custom);
    tOpen.typeText('|');
    expect(tOpen.doc()).toBe('||');
    tOpen.typeText('x');
    expect(tOpen.doc()).toBe('|x|');

    const tAngle = createTestView('', custom);
    tAngle.typeText('<');
    expect(tAngle.doc()).toBe('<>');

    // Disable globally
    tAngle.reconfigure({ ...custom, enabled: false });
    tAngle.setCursor(2);
    tAngle.typeText('(');
    expect(tAngle.doc()).toBe('<>(');
  });
});
