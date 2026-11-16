import type { Diagnostic } from '../core/backend.ts';
import { prefersReducedMotion } from './motion.ts';

export interface StatusBarController {
  update(pages: number, diagnostics: Diagnostic[], backendLabel: string): void;
}

export function createStatusBar(
  barHost: HTMLElement,
  drawerHost: HTMLElement,
  onJumpToLine: (line: number) => void
): StatusBarController {
  let drawerOpen = false;
  let closeTimer: ReturnType<typeof setTimeout> | null = null;
  let currentDiagnostics: Diagnostic[] = [];

  barHost.innerHTML = '';
  drawerHost.className = 'diagnostics-drawer';
  drawerHost.hidden = true;

  function openDrawer(): void {
    if (closeTimer) {
      clearTimeout(closeTimer);
      closeTimer = null;
    }
    drawerOpen = true;
    drawerHost.classList.remove('is-closing');
    drawerHost.hidden = false;
    renderDrawer();
  }

  function closeDrawer(): void {
    if (!drawerOpen) return;
    drawerOpen = false;
    if (prefersReducedMotion()) {
      drawerHost.classList.remove('is-closing');
      drawerHost.hidden = true;
      return;
    }
    drawerHost.classList.add('is-closing');
    closeTimer = setTimeout(() => {
      drawerHost.classList.remove('is-closing');
      drawerHost.hidden = true;
      closeTimer = null;
    }, 200);
  }

  const left = document.createElement('div');
  left.className = 'statusbar-group';

  const pagesSpan = document.createElement('span');
  pagesSpan.className = 'statusbar-item';
  pagesSpan.textContent = 'Pages: 1';

  const diagBtn = document.createElement('button');
  diagBtn.type = 'button';
  diagBtn.className = 'statusbar-diag-btn status-ok';
  diagBtn.textContent = '0 warnings / errors';
  diagBtn.addEventListener('click', () => {
    if (drawerOpen) closeDrawer();
    else openDrawer();
  });

  left.append(pagesSpan, diagBtn);

  const right = document.createElement('div');
  right.className = 'statusbar-group';
  const backendSpan = document.createElement('span');
  backendSpan.className = 'statusbar-item';
  right.appendChild(backendSpan);

  barHost.append(left, right);

  function renderDrawer(): void {
    drawerHost.innerHTML = '';
    const hdr = document.createElement('div');
    hdr.className = 'drawer-header';
    const title = document.createElement('span');
    title.className = 'drawer-title';
    title.textContent = `Diagnostics (${currentDiagnostics.length})`;
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'ui-btn ui-btn-icon';
    closeBtn.textContent = '×';
    closeBtn.setAttribute('aria-label', 'Close diagnostics');
    closeBtn.addEventListener('click', () => {
      closeDrawer();
    });
    hdr.append(title, closeBtn);

    const list = document.createElement('ul');
    list.className = 'diagnostics-list';

    if (currentDiagnostics.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'diagnostics-empty';
      empty.textContent = 'No warnings or errors.';
      list.appendChild(empty);
    } else {
      for (const d of currentDiagnostics) {
        const li = document.createElement('li');
        li.className = `diagnostics-item diag-${d.level}`;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'diagnostics-item-btn';

        const lvlBadge = document.createElement('span');
        lvlBadge.className = `diag-badge diag-badge-${d.level}`;
        lvlBadge.textContent = d.level.toUpperCase();

        const loc = document.createElement('span');
        loc.className = 'diag-loc';
        const parts: string[] = [];
        if (d.line !== undefined) parts.push(`Line ${d.line}`);
        if (d.page !== undefined) parts.push(`Page ${d.page}`);
        loc.textContent = parts.length > 0 ? `[${parts.join(', ')}]` : '';

        const msg = document.createElement('span');
        msg.className = 'diag-msg';
        msg.textContent = d.msg;

        btn.append(lvlBadge, loc, msg);
        btn.addEventListener('click', () => {
          if (d.line !== undefined) {
            onJumpToLine(d.line);
          }
        });
        li.appendChild(btn);
        list.appendChild(li);
      }
    }

    drawerHost.append(hdr, list);
  }

  return {
    update(pages: number, diagnostics: Diagnostic[], backendLabel: string) {
      currentDiagnostics = diagnostics;
      pagesSpan.textContent = `Pages: ${pages}`;
      backendSpan.textContent = `Backend: ${backendLabel}`;

      const errCount = diagnostics.filter((d) => d.level === 'error').length;
      const warnCount = diagnostics.filter((d) => d.level === 'warn').length;

      diagBtn.classList.remove('status-ok', 'status-warn', 'status-err');
      if (errCount > 0) {
        diagBtn.classList.add('status-err');
        diagBtn.textContent = `ERROR: ${errCount} error(s), ${warnCount} warning(s)`;
      } else if (warnCount > 0) {
        diagBtn.classList.add('status-warn');
        diagBtn.textContent = `WARN: ${warnCount} warning(s)`;
      } else {
        diagBtn.classList.add('status-ok');
        diagBtn.textContent = 'OK: 0 warnings';
      }

      if (drawerOpen) {
        renderDrawer();
      }
    },
  };
}
