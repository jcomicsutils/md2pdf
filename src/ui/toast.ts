export type ToastLevel = 'info' | 'ok' | 'warn' | 'err';

let toastContainer: HTMLElement | null = null;
let shownPrintHint = false;

function ensureContainer(): HTMLElement {
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.className = 'toast-container';
    toastContainer.setAttribute('role', 'status');
    toastContainer.setAttribute('aria-live', 'polite');
    document.body.appendChild(toastContainer);
  }
  return toastContainer;
}

export function showToast(message: string, level: ToastLevel = 'info', durationMs = 4200): void {
  const container = ensureContainer();
  const item = document.createElement('div');
  item.className = `toast-item toast-${level}`;

  const badge = document.createElement('span');
  badge.className = 'toast-badge';
  badge.textContent = level.toUpperCase();

  const text = document.createElement('span');
  text.className = 'toast-text';
  text.textContent = message;

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'toast-close';
  closeBtn.setAttribute('aria-label', 'Dismiss notification');
  closeBtn.textContent = '×';

  const remove = () => {
    item.remove();
  };
  closeBtn.addEventListener('click', remove);

  item.append(badge, text, closeBtn);
  container.appendChild(item);

  if (durationMs > 0) {
    setTimeout(remove, durationMs);
  }
}

export function showOneTimePrintHint(): void {
  if (shownPrintHint) return;
  shownPrintHint = true;
  showToast('Print Tip: Choose "Save as PDF" and set Margins to "None".', 'info', 6000);
}
