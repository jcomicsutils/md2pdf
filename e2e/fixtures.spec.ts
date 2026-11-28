import fs from 'node:fs';
import path from 'node:path';
import { expect, type Page, test } from '@playwright/test';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

function readFixture(name: string): string {
  return fs.readFileSync(path.join(process.cwd(), 'fixtures', name), 'utf8');
}

async function extractPdfPagesText(pdfBuffer: Buffer): Promise<string[]> {
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(pdfBuffer) });
  const pdfDoc = await loadingTask.promise;
  const pages: string[] = [];
  for (let i = 1; i <= pdfDoc.numPages; i++) {
    const p = await pdfDoc.getPage(i);
    const tc = await p.getTextContent();
    const items = tc.items
      .filter((it): it is typeof it & { str: string; transform: number[] } => 'str' in it)
      .slice()
      .sort((a, b) => {
        const yDiff = (b.transform[5] ?? 0) - (a.transform[5] ?? 0);
        if (Math.abs(yDiff) > 3) return yDiff;
        return (a.transform[4] ?? 0) - (b.transform[4] ?? 0);
      });
    pages.push(items.map((it) => it.str).join(' ').replace(/\s+/g, ' ').trim());
  }
  return pages;
}

async function loadFixtureIntoApp(page: Page, fixtureName: string): Promise<string[]> {
  const md = readFixture(fixtureName);
  await page.goto('/');
  await page.waitForFunction(() => Boolean(window.__md2pdf), null, { timeout: 15000 });
  await page.evaluate(() => window.__md2pdf.ready);
  await page.evaluate((source) => window.__md2pdf.setMarkdown(source), md);
  const pdfBuf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
  return extractPdfPagesText(pdfBuf);
}

test.describe('Section 7 Fixtures & Phase 3 UI Acceptance', () => {
  test('h1-breaks.md: each H1 is the first text on its own page; page count is 3', async ({
    page,
  }) => {
    const pages = await loadFixtureIntoApp(page, 'h1-breaks.md');
    expect(pages).toHaveLength(3);
    expect(pages[0]?.startsWith('First Chapter')).toBe(true);
    expect(pages[1]?.startsWith('Second Chapter')).toBe(true);
    expect(pages[2]?.startsWith('Third Chapter')).toBe(true);
  });

  test('newpage.md: one \\newpage gives one break; \\newpage in code block is literal; \\newpage before H1 gives no blank page', async ({
    page,
  }) => {
    const pages = await loadFixtureIntoApp(page, 'newpage.md');
    expect(pages).toHaveLength(3);
    expect(pages[0]).toContain('Section One');
    expect(pages[1]).toContain('Paragraph on the second page');
    expect(pages[1]).toContain('\\newpage');
    expect(pages[2]).toContain('Section Two');
  });

  test('long-table.md: header repeats on every page table spans; rows stay whole; no header-only page', async ({
    page,
  }) => {
    const pages = await loadFixtureIntoApp(page, 'long-table.md');
    expect(pages.length).toBeGreaterThanOrEqual(3);

    for (const pText of pages) {
      expect(pText).toContain('ColAlpha');
      expect(pText).toContain('ColEpsilon');
      // Must have at least one body row on every page the table spans
      expect(/R\d+\s*_\s*C1/.test(pText)).toBe(true);
    }

    // Check every row 1..120 has its first cell and last cell on the same page
    for (let r = 1; r <= 120; r++) {
      const c1 = new RegExp(`\\bR${r}\\s*_\\s*C1\\b`);
      const c5 = new RegExp(`\\bR${r}\\s*_\\s*C5\\b`);
      const pageIdxC1 = pages.findIndex((t) => c1.test(t));
      const pageIdxC5 = pages.findIndex((t) => c5.test(t));
      expect(pageIdxC1).toBeGreaterThanOrEqual(0);
      expect(pageIdxC1).toBe(pageIdxC5);
    }
  });

  test('tall-row.md: produces a row-taller-than-page diagnostic, no crash', async ({ page }) => {
    await loadFixtureIntoApp(page, 'tall-row.md');
    const diags = await page.evaluate(() => window.__md2pdf.getDiagnostics());
    expect(
      diags.some((d) => d.msg.toLowerCase().includes('taller than the page content area'))
    ).toBe(true);
  });

  test('math.md: formula text present, no KaTeX error nodes, display equation never split', async ({
    page,
  }) => {
    const pages = await loadFixtureIntoApp(page, 'math.md');
    expect(pages).toHaveLength(1);
    expect(pages[0]).toContain('Mathematical Typesetting');
    expect(pages[0]).toContain('f ( x )');

    const errorNodes = await page.locator('.math-error').count();
    expect(errorNodes).toBe(0);

    const splitMath = await page.locator('.math-block[data-split-from], .katex-display[data-split-from]').count();
    expect(splitMath).toBe(0);
  });

  test('keep.md: a small code block that would straddle a boundary moves whole to the next page', async ({
    page,
  }) => {
    const pages = await loadFixtureIntoApp(page, 'keep.md');
    expect(pages.length).toBeGreaterThanOrEqual(2);
    const startPage = pages.findIndex((t) => t.includes('KEEP_BLOCK_START_MARKER'));
    const endPage = pages.findIndex((t) => t.includes('KEEP_BLOCK_END_MARKER'));
    expect(startPage).toBeGreaterThanOrEqual(1);
    expect(startPage).toBe(endPage);
  });

  test('dark-doc.md: page-1 background pixel equals Mocha bg0 (#11111B)', async ({ page }) => {
    await loadFixtureIntoApp(page, 'dark-doc.md');
    const bgRgb = await page.evaluate(() => {
      const page1 = document.querySelector('.pagedjs_page')!;
      return window.getComputedStyle(page1).backgroundColor;
    });
    // #11111B in RGB is rgb(17, 17, 27)
    expect(bgRgb).toBe('rgb(17, 17, 27)');

    // Also verify rendered screenshot pixel on page-1 sheet
    const page1Loc = page.locator('.pagedjs_page').first();
    const box = await page1Loc.boundingBox();
    expect(box).not.toBeNull();
    const shot = await page1Loc.screenshot();
    // PNG IHDR + pixel check or canvas check inside browser
    const rgbHex = await page.evaluate(async (b64) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await new Promise((r) => {
        img.onload = r;
      });
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(10, 10, 1, 1).data;
      return `#${[data[0]!, data[1]!, data[2]!]
        .map((x) => x.toString(16).padStart(2, '0'))
        .join('')
        .toUpperCase()}`;
    }, shot.toString('base64'));
    expect(rgbHex).toBe('#11111B');
  });

  test('UI acceptance: computed border-radius is 0 on every element, theme choice survives reload, 20-page doc re-previews fast', async ({
    page,
  }) => {
    await page.goto('/');
    await page.waitForFunction(() => Boolean(window.__md2pdf), null, { timeout: 15000 });
    await page.evaluate(() => window.__md2pdf.ready);

    // Open settings, diagnostics drawers, and Ctrl+F search panel so all UI elements are in DOM
    await page.getByRole('button', { name: 'Settings' }).click();
    await page.locator('.statusbar-diag-btn').click();
    await page.locator('.cm-content').click();
    await page.keyboard.press('ControlOrMeta+f');
    const searchPanel = page.locator('.editor-pane .cm-panel.cm-search');
    await expect(searchPanel).toBeVisible();
    const searchBtnBgImage = await searchPanel
      .locator('button.cm-button')
      .first()
      .evaluate((el) => window.getComputedStyle(el).backgroundImage);
    expect(searchBtnBgImage).toBe('none');

    const nonZeroRadius = await page.evaluate(() => {
      const all = Array.from(document.querySelectorAll('*'));
      for (const el of all) {
        const cs = window.getComputedStyle(el);
        if (
          cs.borderTopLeftRadius !== '0px' ||
          cs.borderTopRightRadius !== '0px' ||
          cs.borderBottomLeftRadius !== '0px' ||
          cs.borderBottomRightRadius !== '0px'
        ) {
          return { tag: el.tagName, cls: el.className, radius: cs.borderRadius };
        }
      }
      return null;
    });
    expect(nonZeroRadius).toBeNull();
    await searchPanel.locator('button[name="close"]').click();
    await expect(searchPanel).toBeHidden();

    // Theme toggle persistence across reload + toolbar buttons stay at exact same X position
    const syncCheckbox = page.getByRole('checkbox', { name: 'Toggle scroll sync' });
    await expect(syncCheckbox).toBeChecked();
    const syncBtnBoxBefore = await page.locator('.ui-btn-sync').boundingBox();
    const initialTheme = await page.evaluate(() =>
      document.documentElement.getAttribute('data-ui-theme')
    );
    const nextTheme = initialTheme === 'paper' ? 'catppuccin-mocha' : 'paper';
    const nextThemeLabel = nextTheme === 'paper' ? 'Paper' : 'Catppuccin Mocha';
    await page.getByRole('combobox', { name: 'UI theme' }).click();
    await page.locator('.toolbar-theme-select').getByRole('option', { name: nextThemeLabel }).click();
    await expect(page.locator('html')).toHaveAttribute('data-ui-theme', nextTheme);
    const syncBtnBoxAfter = await page.locator('.ui-btn-sync').boundingBox();
    expect(syncBtnBoxBefore?.x).toBe(syncBtnBoxAfter?.x);

    // Verify Number headings & TOC style controls exist in Settings drawer
    await expect(page.getByText('Number headings')).toBeVisible();
    await expect(page.getByText('TOC style')).toBeVisible();
    await expect(page.getByText('TOC page numbers')).toBeVisible();
    await expect(page.getByText('TOC leader dots')).toBeVisible();

    // Toggling Number headings must not number Settings drawer headings
    await page.locator('.settings-row', { hasText: 'Number headings' }).locator('input[type="checkbox"]').check();
    const settingsHeadingBefore = await page.evaluate(() => {
      const h = document.querySelector('.settings-heading');
      return h ? window.getComputedStyle(h, '::before').content : null;
    });
    expect(settingsHeadingBefore).toBe('none');

    // Verify Clear Cache button is visible in Settings
    await expect(page.getByRole('button', { name: 'Clear Cache' })).toBeVisible();

    // Verify bundled examples appear in Settings drawer and Load works
    await expect(page.locator('.settings-example-row[data-example="math-notes"]')).toBeVisible();
    await page.getByRole('button', { name: 'Load example: Math lecture notes' }).click();
    await expect(page.locator('.cm-content')).toContainText('Eigenvalues and Eigenvectors');

    // Open README Example loads README with TOC and without badges
    await page.getByRole('button', { name: 'Open README Example' }).click();
    await expect(page.locator('.cm-content')).toContainText('# md2pdf');
    await expect(page.locator('.cm-content')).toContainText('\\tableofcontents');
    await expect(page.locator('.cm-content')).not.toContainText('img.shields.io');
    await expect(page.locator('.preview-host .doc-toc')).toBeVisible();
    await expect(page.locator('.preview-host .heading-num').first()).toContainText('1.');

    // Long multi-page code block preserves .code-line structure across pages
    const longCode = ['```yaml', ...Array.from({ length: 70 }, (_, i) => `  key_${i}: value_${i}`), '```'].join('\n');
    await page.evaluate((md) => window.__md2pdf.setMarkdown(md), longCode);
    expect(await page.evaluate(() => window.__md2pdf.getPageCount())).toBeGreaterThan(1);
    const secondPageCodeLines = await page.locator('.pagedjs_page').nth(1).locator('pre code .code-line').count();
    expect(secondPageCodeLines).toBeGreaterThan(0);

    // 8-row multi-sentence table after H1 + intro + H2 starts on Page 1 (no blank page before table)
    const eightRowTableMd = [
      '# Sequência de Vídeos Curtos: Por que $0,999\\ldots = 1$?',
      '',
      '**Premissas assumidas:** Público curioso com base de ensino médio, mas aberto a subir degrau por degrau até ideias de graduação em Matemática (Análise Real e construção de $\\mathbb{R}$), desde que a intuição venha antes do formalismo. Cada episódio foi desenhado para ter **entre 2min30s e 4min**.',
      '',
      '## Mapa de Progressão da Sequência',
      '',
      '| Episódio | Título Provisório | Demonstração / Ferramenta Central | Objeções e Dificuldades Sanadas | Nível de Rigor | Duração Estimada |',
      '| :--- | :--- | :--- | :--- | :--- | :--- |',
      ...Array.from(
        { length: 8 },
        (_, i) =>
          `| **Ep. ${i + 1}** | Por que $0,999\\ldots = 1$ parece uma trapaça? | Frações ($3 \\times 1/3$) e álgebra elementar ($10x - x = 9x$) | "Mas $1 - 0,999 = 0,0001$"; "Então $1,999\\ldots = 2$?"; parar vs. continuar para sempre | Nível ${i + 1}: Aritmética e Álgebra Escolar | 3min00s |`
      ),
    ].join('\n');
    await page.evaluate((md) => window.__md2pdf.setMarkdown(md), eightRowTableMd);
    const page1TableRows = await page.locator('.pagedjs_page').first().locator('table tbody tr').count();
    expect(page1TableRows).toBeGreaterThan(0);
    expect(await page.evaluate(() => window.__md2pdf.getDiagnostics())).toEqual([]);

    // Verify toolbar document title input, front matter lock, and PDF /Title metadata
    const titleInput = page.getByRole('textbox', { name: 'Document title' });
    await expect(titleInput).toBeVisible();
    await page.evaluate((md) => window.__md2pdf.setMarkdown(md), '# Heading Fallback Title\n\nHello');
    await expect(titleInput).toHaveAttribute('placeholder', 'Title');
    await expect(page).toHaveTitle('Heading Fallback Title');

    await titleInput.fill('Custom Toolbar PDF Title');
    await page.waitForTimeout(350);
    await expect(page).toHaveTitle('Custom Toolbar PDF Title');

    const titledPdfBuf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
    const titledPdfDoc = await pdfjsLib.getDocument({ data: new Uint8Array(titledPdfBuf) }).promise;
    const pdfMeta = await titledPdfDoc.getMetadata();
    expect((pdfMeta.info as { Title?: string })?.Title).toBe('Custom Toolbar PDF Title');

    // Front matter title overrides and locks toolbar title input
    await page.evaluate(
      (md) => window.__md2pdf.setMarkdown(md),
      '---\ntitle: Locked Front Matter Title\n---\n# Heading Fallback Title\n\nBody'
    );
    await expect(titleInput).toBeDisabled();
    await expect(titleInput).toHaveValue('Locked Front Matter Title');
    await expect(page.locator('.toolbar-title-badge')).toBeVisible();
    await expect(page).toHaveTitle('Locked Front Matter Title');

    // Empty editor still renders 1 blank sheet
    await page.evaluate(() => window.__md2pdf.setMarkdown(''));
    expect(await page.evaluate(() => window.__md2pdf.getPageCount())).toBe(1);
    const toggledTheme = await page.evaluate(() =>
      document.documentElement.getAttribute('data-ui-theme')
    );
    expect(toggledTheme).not.toBe(initialTheme);

    // Wait 600ms for debounced localStorage save
    await page.waitForTimeout(600);
    await page.reload();
    await page.waitForFunction(() => Boolean(window.__md2pdf), null, { timeout: 15000 });
    const afterReloadTheme = await page.evaluate(() =>
      document.documentElement.getAttribute('data-ui-theme')
    );
    expect(afterReloadTheme).toBe(toggledTheme);

    // 20-page document re-preview timing check
    const twentyPageMd = Array.from(
      { length: 20 },
      (_, i) => `# Chapter ${i + 1}\n\nParagraph text for chapter ${i + 1}.\n`
    ).join('\n');
    const elapsedMs = await page.evaluate(async (md) => {
      const t0 = performance.now();
      await window.__md2pdf.setMarkdown(md);
      return performance.now() - t0;
    }, twentyPageMd);
    const pageCount = await page.evaluate(() => window.__md2pdf.getPageCount());
    expect(pageCount).toBe(20);
    expect(elapsedMs).toBeLessThan(2000);
  });

  test('Editor auto-close: LaTeX defaults, custom pairs (|, <), profile saving, and reload persistence', async ({
    page,
  }) => {
    await page.goto('/');
    await page.waitForFunction(() => Boolean(window.__md2pdf), null, { timeout: 15000 });
    await page.evaluate(() => window.__md2pdf.ready);
    await page.evaluate(() => window.__md2pdf.setMarkdown(''));

    // Focus editor and type LaTeX math
    const cmContent = page.locator('.cm-content');
    await cmContent.click();
    await page.keyboard.type('$x^2$');
    await page.keyboard.press('Enter');
    await page.keyboard.type('$$');
    await page.keyboard.press('Enter');
    await page.keyboard.type('\\left(a');

    const textAfterDefaults = await cmContent.innerText();
    expect(textAfterDefaults).toContain('$x^2$');
    expect(textAfterDefaults).toContain('$$');
    expect(textAfterDefaults).toContain('\\left(a\\right)');

    // Open Settings -> Editor, expand Closing Pairs, add | -> | and < -> >
    await page.getByRole('button', { name: 'Settings' }).click();
    await page.locator('.autoclose-summary').click();

    await page.getByLabel('New opening delimiter').fill('|');
    await page.getByLabel('New closing delimiter').fill('|');
    await page.getByRole('button', { name: '+ Add' }).click();
    await expect(page.getByLabel('Remove pair | to |')).toBeVisible();

    await page.getByLabel('New opening delimiter').fill('<');
    await page.getByLabel('New closing delimiter').fill('>');
    await page.getByRole('button', { name: '+ Add' }).click();
    await expect(page.getByLabel('Remove pair < to >')).toBeVisible();

    // Save as custom profile
    await page.getByRole('button', { name: 'Save as Profile…' }).click();
    await page.getByLabel('Custom profile name').fill('My Math Profile');
    await page.getByRole('button', { name: 'Save', exact: true }).click();

    // Verify zero border-radius still holds with pairs list expanded
    const nonZeroRadius = await page.evaluate(() => {
      for (const el of Array.from(document.querySelectorAll('*'))) {
        const cs = window.getComputedStyle(el);
        if (
          cs.borderTopLeftRadius !== '0px' ||
          cs.borderTopRightRadius !== '0px' ||
          cs.borderBottomLeftRadius !== '0px' ||
          cs.borderBottomRightRadius !== '0px'
        ) {
          return cs.borderRadius;
        }
      }
      return null;
    });
    expect(nonZeroRadius).toBeNull();

    // Test custom | and < auto-closing in editor
    await page.evaluate(() => window.__md2pdf.setMarkdown(''));
    await cmContent.click();
    await page.keyboard.type('|');
    await page.keyboard.type('x');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.type(' <');
    const textCustom = await cmContent.innerText();
    expect(textCustom).toContain('|x| <>');

    // Toggle master auto-close off and verify '(' does not auto-close
    await page.getByLabel('Auto-close characters').uncheck();
    await cmContent.click();
    await page.keyboard.type('(');
    const textDisabled = await cmContent.innerText();
    expect(textDisabled).toContain('|x| <>(');

    // Re-enable and verify persistence across reload
    await page.getByLabel('Auto-close characters').check();
    await page.waitForTimeout(600);
    await page.reload();
    await page.waitForFunction(() => Boolean(window.__md2pdf), null, { timeout: 15000 });
    const persisted = await page.evaluate(() => window.__md2pdf.getAutoCloseSettings());
    expect(persisted.enabled).toBe(true);
    expect(persisted.activeProfileId).toBe('custom-my-math-profile');
    expect(persisted.pairs.some((p) => p.open === '|' && p.close === '|')).toBe(true);
    expect(persisted.pairs.some((p) => p.open === '<' && p.close === '>')).toBe(true);
  });
});
