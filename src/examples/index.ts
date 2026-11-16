import codeGallery from './code-gallery.md?raw';
import darkCheatsheet from './dark-cheatsheet.md?raw';
import mathLectureNotes from './math-lecture-notes.md?raw';
import meetingNotes from './meeting-notes.md?raw';
import paginationControls from './pagination-controls.md?raw';
import technicalReport from './technical-report.md?raw';

export interface ExampleDoc {
  /** Stable identifier, also used for DOM hooks. */
  id: string;
  /** Short name shown in the Examples section of the settings drawer. */
  label: string;
  /** One line describing what the example demonstrates. */
  description: string;
  /** Full Markdown source, including YAML front matter. */
  source: string;
}

export const EXAMPLES: readonly ExampleDoc[] = [
  {
    id: 'math-notes',
    label: 'Math lecture notes',
    description:
      'LaTeX math with custom macros, aligned equations, footnotes, justified and hyphenated text.',
    source: mathLectureNotes,
  },
  {
    id: 'report',
    label: 'Report with contents page',
    description:
      'Boxed table of contents with dotted leaders, numbered sections, captioned tables, task lists, header and footer.',
    source: technicalReport,
  },
  {
    id: 'cheatsheet',
    label: 'Dark landscape cheat sheet',
    description:
      'Landscape A4 with the Catppuccin Mocha theme, tight margins, compact type and no page numbers.',
    source: darkCheatsheet,
  },
  {
    id: 'pagination',
    label: 'Page-break controls',
    description:
      'A guided tour of \\newpage, \\nobreak, automatic heading breaks and keeping blocks together.',
    source: paginationControls,
  },
  {
    id: 'meeting-notes',
    label: 'Meeting notes (A5)',
    description:
      'Small A5 pages in the ink-friendly Plain B&W theme with an agenda table, decisions and action items.',
    source: meetingNotes,
  },
  {
    id: 'code-gallery',
    label: 'Code highlighting gallery',
    description:
      'Syntax-highlighted blocks in every supported language, plus a long block that splits across pages.',
    source: codeGallery,
  },
];
