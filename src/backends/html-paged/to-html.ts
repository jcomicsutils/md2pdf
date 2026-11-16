import DOMPurify from 'dompurify';
import hljs from 'highlight.js/lib/core';
import bash from 'highlight.js/lib/languages/bash';
import c from 'highlight.js/lib/languages/c';
import cpp from 'highlight.js/lib/languages/cpp';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import latex from 'highlight.js/lib/languages/latex';
import markdown from 'highlight.js/lib/languages/markdown';
import python from 'highlight.js/lib/languages/python';
import rust from 'highlight.js/lib/languages/rust';
import typescript from 'highlight.js/lib/languages/typescript';
import yaml from 'highlight.js/lib/languages/yaml';
import katex from 'katex';
import type { Diagnostic } from '../../core/backend.ts';
import type { Block, DocIR, Inline } from '../../core/ir.ts';
import type { DocSettings } from '../../core/settings.ts';

hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('js', javascript);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('ts', typescript);
hljs.registerLanguage('python', python);
hljs.registerLanguage('py', python);
hljs.registerLanguage('bash', bash);
hljs.registerLanguage('sh', bash);
hljs.registerLanguage('json', json);
hljs.registerLanguage('c', c);
hljs.registerLanguage('cpp', cpp);
hljs.registerLanguage('rust', rust);
hljs.registerLanguage('rs', rust);
hljs.registerLanguage('yaml', yaml);
hljs.registerLanguage('yml', yaml);
hljs.registerLanguage('latex', latex);
hljs.registerLanguage('tex', latex);
hljs.registerLanguage('markdown', markdown);
hljs.registerLanguage('md', markdown);

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderMath(
  tex: string,
  displayMode: boolean,
  macros: Record<string, string>,
  diagnostics: Diagnostic[],
  line?: number
): string {
  try {
    return katex.renderToString(tex, {
      displayMode,
      throwOnError: true,
      strict: 'warn',
      trust: false,
      output: 'html',
      macros: { ...macros },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    diagnostics.push({
      level: 'error',
      msg: `KaTeX error: ${msg}`,
      line,
    });
    return `<code class="math-error">${escapeHtml(tex)}</code>`;
  }
}

function renderInlines(
  inlines: Inline[],
  settings: DocSettings,
  diagnostics: Diagnostic[],
  line?: number,
  footnoteNumbers?: Map<string, number>
): string {
  return inlines
    .map((inl) => {
      switch (inl.t) {
        case 'text':
          return escapeHtml(inl.v);
        case 'code':
          return `<code>${escapeHtml(inl.v)}</code>`;
        case 'em':
          return `<em>${renderInlines(inl.c, settings, diagnostics, line, footnoteNumbers)}</em>`;
        case 'strong':
          return `<strong>${renderInlines(inl.c, settings, diagnostics, line, footnoteNumbers)}</strong>`;
        case 'del':
          return `<del>${renderInlines(inl.c, settings, diagnostics, line, footnoteNumbers)}</del>`;
        case 'link':
          return `<a href="${escapeHtml(inl.href)}">${renderInlines(inl.c, settings, diagnostics, line, footnoteNumbers)}</a>`;
        case 'image': {
          const titleAttr = inl.title ? ` title="${escapeHtml(inl.title)}"` : '';
          return `<img src="${escapeHtml(inl.src)}" alt="${escapeHtml(inl.alt)}"${titleAttr} />`;
        }
        case 'math':
          return renderMath(inl.tex, false, settings.mathMacros, diagnostics, line);
        case 'br':
          return '<br />';
        case 'footnote': {
          const safeId = escapeHtml(inl.id);
          const displayLabel =
            settings.numbering.footnotes === 'number' && footnoteNumbers?.has(inl.id)
              ? String(footnoteNumbers.get(inl.id))
              : safeId;
          return `<sup class="footnote-ref"><a href="#fn-${safeId}" id="fnref-${safeId}">[${displayLabel}]</a></sup>`;
        }
      }
    })
    .join('');
}

function splitHighlightedLines(html: string): string {
  const openTags: string[] = [];
  const rawLines = html.split('\n');
  return rawLines
    .map((line) => {
      const prefix = openTags.join('');
      const tagRe = /<(\/?)span\b([^>]*)>/g;
      let m: RegExpExecArray | null;
      while ((m = tagRe.exec(line)) !== null) {
        if (m[1] === '/') {
          openTags.pop();
        } else {
          openTags.push(`<span${m[2]}>`);
        }
      }
      const suffix = '</span>'.repeat(openTags.length);
      const balanced = `${prefix}${line}${suffix}`;
      return `<span class="code-line">${balanced || '&#8203;'}</span>`;
    })
    .join('');
}

function buildTocHtml(
  allBlocks: Block[],
  settings: DocSettings,
  diagnostics: Diagnostic[],
  lineAttr: string,
  clsAttr: string
): string {
  const maxDepth = settings.toc.depth;
  const styleClass = `doc-toc--${settings.toc.style}`;
  const pagesClass = settings.toc.pageNumbers ? ' doc-toc--pages' : '';
  const dotsClass = settings.toc.dots ? ' doc-toc--dots' : '';
  const headings = allBlocks.filter(
    (b): b is Extract<Block, { t: 'heading' }> => b.t === 'heading' && b.level <= maxDepth
  );
  if (headings.length === 0) {
    return `<nav class="doc-toc ${styleClass}${pagesClass}${dotsClass}${clsAttr ? ` ${clsAttr}` : ''}"${lineAttr}><p class="toc-empty">No headings</p></nav>`;
  }
  let c1 = 0;
  let c2 = 0;
  let c3 = 0;
  const items = headings
    .map((h) => {
      let numHtml = '';
      if (settings.numbering.headings) {
        if (h.level === 1) {
          c1++;
          c2 = 0;
          c3 = 0;
          numHtml = `<span class="toc-num">${c1}. </span>`;
        } else if (h.level === 2) {
          c2++;
          c3 = 0;
          numHtml = `<span class="toc-num">${c1}.${c2} </span>`;
        } else if (h.level === 3) {
          c3++;
          numHtml = `<span class="toc-num">${c1}.${c2}.${c3} </span>`;
        }
      }
      const textHtml = renderInlines(h.c, settings, diagnostics, h.line);
      return `<li class="toc-item toc-level-${h.level}"><a href="#${escapeHtml(h.id)}"><span class="toc-label">${numHtml}${textHtml}</span><span class="toc-leader" aria-hidden="true"></span></a></li>`;
    })
    .join('\n');
  return `<nav class="doc-toc ${styleClass}${pagesClass}${dotsClass}${clsAttr ? ` ${clsAttr}` : ''}"${lineAttr}><div class="toc-title">Contents</div><ul class="toc-list">\n${items}\n</ul></nav>`;
}

export interface HtmlRenderResult {
  html: string;
  diagnostics: Diagnostic[];
}

export function irToHtml(doc: DocIR, settings: DocSettings): HtmlRenderResult {
  const diagnostics: Diagnostic[] = [];
  const footnoteNumbers = new Map<string, number>();
  let fnIdx = 1;
  for (const b of doc.blocks) {
    if (b.t === 'footnotes') {
      for (const fn of b.items) {
        if (!footnoteNumbers.has(fn.id)) {
          footnoteNumbers.set(fn.id, fnIdx++);
        }
      }
    }
  }
  let h1Count = 0;
  let h2Count = 0;
  let h3Count = 0;

  function renderBlocks(blocks: Block[], rootBlocks: Block[]): string {
    const out: string[] = [];
    let pendingPageBreak = false;

    for (const b of blocks) {
      if (b.t === 'pagebreak') {
        pendingPageBreak = true;
        continue;
      }

      const classes: string[] = [];
      if (pendingPageBreak || ('pageBefore' in b && b.pageBefore)) {
        classes.push('pb');
      }
      pendingPageBreak = false;

      if (b.keep) {
        classes.push('keep');
      }

      const lineAttr = b.line !== undefined ? ` data-line="${b.line}"` : '';
      const clsStr = classes.join(' ');
      const classAttr = clsStr ? ` class="${clsStr}"` : '';

      switch (b.t) {
        case 'heading': {
          const tag = `h${b.level}`;
          let numHtml = '';
          if (settings.numbering.headings) {
            if (b.level === 1) {
              h1Count++;
              h2Count = 0;
              h3Count = 0;
              numHtml = `<span class="heading-num">${h1Count}. </span>`;
            } else if (b.level === 2) {
              h2Count++;
              h3Count = 0;
              numHtml = `<span class="heading-num">${h1Count}.${h2Count} </span>`;
            } else if (b.level === 3) {
              h3Count++;
              numHtml = `<span class="heading-num">${h1Count}.${h2Count}.${h3Count} </span>`;
            }
          }
          const inner = renderInlines(b.c, settings, diagnostics, b.line, footnoteNumbers);
          out.push(`<${tag} id="${escapeHtml(b.id)}"${classAttr}${lineAttr}>${numHtml}${inner}</${tag}>`);
          break;
        }

        case 'para': {
          const inner = renderInlines(b.c, settings, diagnostics, b.line, footnoteNumbers);
          out.push(`<p${classAttr}${lineAttr}>${inner}</p>`);
          break;
        }

        case 'code': {
          let codeHtml: string;
          const lang = b.lang?.toLowerCase();
          if (lang && hljs.getLanguage(lang)) {
            codeHtml = hljs.highlight(b.v, { language: lang, ignoreIllegals: true }).value;
          } else {
            codeHtml = escapeHtml(b.v);
          }
          const langClass = lang ? ` class="language-${escapeHtml(lang)}"` : '';
          out.push(
            `<pre${classAttr}${lineAttr}><code${langClass}>${splitHighlightedLines(codeHtml)}</code></pre>`
          );
          break;
        }

        case 'math': {
          const mathHtml = renderMath(b.tex, true, settings.mathMacros, diagnostics, b.line);
          const mathClasses = ['math-block', ...classes].join(' ');
          out.push(`<div class="${mathClasses}"${lineAttr}>${mathHtml}</div>`);
          break;
        }

        case 'quote': {
          const inner = renderBlocks(b.c, rootBlocks);
          out.push(`<blockquote${classAttr}${lineAttr}>\n${inner}\n</blockquote>`);
          break;
        }

        case 'list': {
          const tag = b.ordered ? 'ol' : 'ul';
          const startAttr = b.ordered && b.start !== undefined && b.start !== 1 ? ` start="${b.start}"` : '';
          const isTaskList = Boolean(b.task);
          const listClasses = [...classes];
          if (isTaskList) listClasses.push('task-list');
          const listClassAttr = listClasses.length > 0 ? ` class="${listClasses.join(' ')}"` : '';

          const itemsHtml = b.items
            .map((itemBlocks, idx) => {
              const taskState = b.task ? b.task[idx] : null;
              const checkbox =
                taskState !== null && taskState !== undefined
                  ? `<input type="checkbox" disabled${taskState ? ' checked' : ''} /> `
                  : '';
              if (itemBlocks.length === 1 && itemBlocks[0]?.t === 'para') {
                const p = itemBlocks[0];
                const pLine = p.line !== undefined ? ` data-line="${p.line}"` : '';
                return `<li${pLine}>${checkbox}${renderInlines(p.c, settings, diagnostics, p.line)}</li>`;
              }
              return `<li>${checkbox}${renderBlocks(itemBlocks, rootBlocks)}</li>`;
            })
            .join('\n');

          out.push(`<${tag}${listClassAttr}${startAttr}${lineAttr}>\n${itemsHtml}\n</${tag}>`);
          break;
        }

        case 'table': {
          const captionHtml = b.caption
            ? `<caption>${renderInlines(b.caption, settings, diagnostics, b.line)}</caption>\n`
            : '';
          const headCells = b.head
            .map((cell, cIdx) => {
              const align = b.align[cIdx];
              const alignStyle = align ? ` style="text-align: ${align}"` : '';
              return `<th${alignStyle}>${renderInlines(cell, settings, diagnostics, b.line)}</th>`;
            })
            .join('');
          const theadHtml = b.head.length > 0 ? `<thead><tr>${headCells}</tr></thead>\n` : '';
          const bodyRows = b.rows
            .map((row) => {
              const cells = row
                .map((cell, cIdx) => {
                  const align = b.align[cIdx];
                  const alignStyle = align ? ` style="text-align: ${align}"` : '';
                  return `<td${alignStyle}>${renderInlines(cell, settings, diagnostics, b.line)}</td>`;
                })
                .join('');
              return `<tr>${cells}</tr>`;
            })
            .join('\n');
          const tbodyHtml = `<tbody>\n${bodyRows}\n</tbody>`;
          out.push(`<table${classAttr}${lineAttr}>\n${captionHtml}${theadHtml}${tbodyHtml}\n</table>`);
          break;
        }

        case 'hr': {
          out.push(`<hr${classAttr}${lineAttr} />`);
          break;
        }

        case 'toc': {
          out.push(buildTocHtml(rootBlocks, settings, diagnostics, lineAttr, clsStr));
          break;
        }

        case 'html': {
          const clean =
            typeof window !== 'undefined' ? DOMPurify.sanitize(b.v) : escapeHtml(b.v);
          out.push(`<div${classAttr}${lineAttr}>${clean}</div>`);
          break;
        }

        case 'footnotes': {
          const fnClasses = ['footnotes-section', ...classes].join(' ');
          const useLabels = settings.numbering.footnotes === 'label';
          const items = b.items
            .map((fn) => {
              const safeId = escapeHtml(fn.id);
              const inner = renderBlocks(fn.c, rootBlocks);
              const labelPrefix = useLabels
                ? `<span class="footnote-label">[${safeId}]</span> `
                : '';
              return `<li id="fn-${safeId}">${labelPrefix}${inner} <a href="#fnref-${safeId}" class="footnote-backref">&#8617;</a></li>`;
            })
            .join('\n');
          const listTag = useLabels ? 'ul' : 'ol';
          const listCls = useLabels ? 'footnotes-list footnotes-list--labeled' : 'footnotes-list';
          out.push(
            `<section class="${fnClasses}"${lineAttr}><hr /><${listTag} class="${listCls}">\n${items}\n</${listTag}></section>`
          );
          break;
        }
      }
    }

    return out.join('\n');
  }

  const html = renderBlocks(doc.blocks, doc.blocks);
  return { html, diagnostics };
}
