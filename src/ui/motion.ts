export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) {
    return false;
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function runSweepTransition(applyFn: () => void, selector = '.app-split'): void {
  if (prefersReducedMotion()) {
    applyFn();
    return;
  }
  const el = document.querySelector(selector) as HTMLElement | null;
  if (!el) {
    applyFn();
    return;
  }
  el.classList.remove('sweep-wipe');
  // Force reflow so rapid consecutive triggers restart the sweep
  void el.offsetWidth;
  el.classList.add('sweep-wipe');
  applyFn();
  setTimeout(() => {
    el.classList.remove('sweep-wipe');
  }, 320);
}

export function runThemeTransition(applyFn: () => void): void {
  if (prefersReducedMotion()) {
    applyFn();
    return;
  }
  const docWithVT = document as Document & {
    startViewTransition?: (cb: () => void) => { ready: Promise<void> };
  };
  if (typeof docWithVT.startViewTransition === 'function') {
    docWithVT.startViewTransition(() => {
      applyFn();
    });
  } else {
    runSweepTransition(applyFn, '.app-shell');
  }
}

export function triggerInitialPageReveal(previewHost: HTMLElement): void {
  if (prefersReducedMotion()) return;
  const pages = Array.from(previewHost.querySelectorAll('.pagedjs_page')).slice(0, 6);
  pages.forEach((p, idx) => {
    const el = p as HTMLElement;
    el.style.setProperty('--page-stagger', `${idx * 35}ms`);
    el.classList.add('page-reveal');
    setTimeout(() => {
      el.classList.remove('page-reveal');
      el.style.removeProperty('--page-stagger');
    }, 220 + idx * 35);
  });
}
