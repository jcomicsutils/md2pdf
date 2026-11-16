export type Inline =
  | { t: 'text'; v: string }
  | { t: 'code'; v: string }
  | { t: 'em' | 'strong' | 'del'; c: Inline[] }
  | { t: 'link'; href: string; c: Inline[] }
  | { t: 'image'; src: string; alt: string; title?: string }
  | { t: 'math'; tex: string }
  | { t: 'br' }
  | { t: 'footnote'; id: string };

export interface BlockBase {
  line?: number;
  keep?: boolean;
}

export type Block = BlockBase &
  (
    | {
        t: 'heading';
        level: 1 | 2 | 3 | 4 | 5 | 6;
        id: string;
        c: Inline[];
        pageBefore?: boolean;
        noBreakBefore?: boolean;
      }
    | { t: 'para'; c: Inline[] }
    | { t: 'list'; ordered: boolean; start?: number; items: Block[][]; task?: (boolean | null)[] }
    | { t: 'quote'; c: Block[] }
    | { t: 'code'; lang?: string; v: string }
    | { t: 'math'; tex: string }
    | {
        t: 'table';
        align: ('left' | 'center' | 'right' | null)[];
        head: Inline[][];
        rows: Inline[][][];
        caption?: Inline[];
      }
    | { t: 'hr' }
    | { t: 'pagebreak' }
    | { t: 'toc' }
    | { t: 'html'; v: string }
    | { t: 'footnotes'; items: { id: string; c: Block[] }[] }
  );

export interface DocIR {
  blocks: Block[];
  meta: { title?: string };
}
