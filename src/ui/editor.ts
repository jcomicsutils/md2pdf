import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { searchKeymap } from '@codemirror/search';
import { EditorState, RangeSetBuilder } from '@codemirror/state';
import {
  Decoration,
  type DecorationSet,
  EditorView,
  keymap,
  lineNumbers,
  ViewPlugin,
  type ViewUpdate,
} from '@codemirror/view';
import { DIRECTIVE_MAP } from '../core/directives.ts';

const directiveLineDeco = Decoration.line({ class: 'cm-directive-line' });

const directivePlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = this.buildDeco(view);
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = this.buildDeco(update.view);
      }
    }
    buildDeco(view: EditorView): DecorationSet {
      const builder = new RangeSetBuilder<Decoration>();
      for (const { from, to } of view.visibleRanges) {
        let pos = from;
        while (pos <= to) {
          const line = view.state.doc.lineAt(pos);
          const trimmed = line.text.trim();
          if (DIRECTIVE_MAP.has(trimmed)) {
            builder.add(line.from, line.from, directiveLineDeco);
          }
          pos = line.to + 1;
        }
      }
      return builder.finish();
    }
  },
  {
    decorations: (v) => v.decorations,
  }
);

export interface EditorController {
  view: EditorView;
  getValue(): string;
  setValue(text: string): void;
  jumpToLine(lineNumber1Based: number): void;
}

export function createEditor(
  host: HTMLElement,
  initialDoc: string,
  options: {
    onChange: (doc: string) => void;
    onCursorLine?: (line1Based: number) => void;
  }
): EditorController {
  const updateListener = EditorView.updateListener.of((update) => {
    if (update.docChanged) {
      options.onChange(update.state.doc.toString());
    }
    if (update.selectionSet && options.onCursorLine) {
      const head = update.state.selection.main.head;
      const line = update.state.doc.lineAt(head).number;
      options.onCursorLine(line);
    }
  });

  const cursorTheme = EditorView.theme({
    '& .cm-cursor, & .cm-dropCursor': {
      borderLeftColor: 'var(--accent)',
      borderLeftWidth: '2px',
    },
    '& .cm-content': {
      caretColor: 'var(--accent)',
    },
  });

  const state = EditorState.create({
    doc: initialDoc,
    extensions: [
      lineNumbers(),
      history(),
      EditorView.lineWrapping,
      markdown(),
      directivePlugin,
      cursorTheme,
      keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, indentWithTab]),
      updateListener,
    ],
  });

  const view = new EditorView({
    state,
    parent: host,
  });

  // Drag-and-drop file onto editor
  host.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'copy';
    }
  });

  host.addEventListener('drop', (e) => {
    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      const file = files[0]!;
      if (
        !file.name.toLowerCase().endsWith('.toml') &&
        (file.name.endsWith('.md') || file.name.endsWith('.txt') || file.type.startsWith('text/'))
      ) {
        e.preventDefault();
        e.stopPropagation();
        const reader = new FileReader();
        reader.onload = () => {
          if (typeof reader.result === 'string') {
            setValue(reader.result);
          }
        };
        reader.readAsText(file);
      }
    }
  });

  function getValue(): string {
    return view.state.doc.toString();
  }

  function setValue(text: string): void {
    const current = view.state.doc.toString();
    if (current === text) return;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: text },
    });
  }

  function jumpToLine(lineNumber1Based: number): void {
    const maxLines = view.state.doc.lines;
    const clamped = Math.max(1, Math.min(maxLines, lineNumber1Based));
    const lineInfo = view.state.doc.line(clamped);
    view.dispatch({
      selection: { anchor: lineInfo.from },
      effects: EditorView.scrollIntoView(lineInfo.from, { y: 'center' }),
    });
    view.focus();
  }

  return { view, getValue, setValue, jumpToLine };
}
