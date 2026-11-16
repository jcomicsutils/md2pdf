export interface CustomSelectOption {
  value: string;
  label: string;
}

export interface CustomSelectController {
  element: HTMLElement;
  setOptions(options: CustomSelectOption[], selectedValue?: string): void;
  setValue(value: string): void;
  setDisabled(disabled: boolean): void;
  getValue(): string;
}

export function createCustomSelect(
  options: CustomSelectOption[],
  initialValue: string,
  onChange: (value: string) => void,
  ariaLabel?: string
): CustomSelectController {
  let currentOpts = [...options];
  let currentValue = initialValue;
  let isOpen = false;
  let isDisabled = false;

  const root = document.createElement('div');
  root.className = 'ui-dropdown';

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'ui-select-trigger';
  trigger.setAttribute('role', 'combobox');
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');
  if (ariaLabel) {
    trigger.setAttribute('aria-label', ariaLabel);
  }

  const labelSpan = document.createElement('span');
  labelSpan.className = 'ui-select-value';

  const caret = document.createElement('span');
  caret.className = 'ui-select-caret';
  caret.textContent = '>';
  caret.setAttribute('aria-hidden', 'true');

  trigger.append(labelSpan, caret);

  const menu = document.createElement('ul');
  menu.className = 'ui-select-menu';
  menu.setAttribute('role', 'listbox');
  menu.hidden = true;

  function syncLabel(): void {
    const found = currentOpts.find((o) => o.value === currentValue) ?? currentOpts[0];
    labelSpan.textContent = found ? found.label : '';
  }

  function renderMenu(): void {
    menu.innerHTML = '';
    for (const opt of currentOpts) {
      const li = document.createElement('li');
      li.className = 'ui-select-option';
      li.setAttribute('role', 'option');
      li.dataset.value = opt.value;
      const selected = opt.value === currentValue;
      li.setAttribute('aria-selected', String(selected));
      if (selected) li.classList.add('is-selected');
      li.textContent = opt.label;
      li.addEventListener('click', (e) => {
        e.stopPropagation();
        if (opt.value !== currentValue) {
          currentValue = opt.value;
          syncLabel();
          renderMenu();
          onChange(currentValue);
        }
        closeMenu();
        trigger.focus();
      });
      menu.appendChild(li);
    }
  }

  function openMenu(): void {
    if (isDisabled || isOpen) return;
    isOpen = true;
    root.classList.add('is-open');
    trigger.setAttribute('aria-expanded', 'true');
    menu.hidden = false;
  }

  function closeMenu(): void {
    if (!isOpen) return;
    isOpen = false;
    root.classList.remove('is-open');
    trigger.setAttribute('aria-expanded', 'false');
    menu.hidden = true;
  }

  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    if (isOpen) closeMenu();
    else openMenu();
  });

  trigger.addEventListener('keydown', (e) => {
    if (isDisabled) return;
    if (e.key === 'Escape') {
      closeMenu();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!isOpen) {
        openMenu();
        return;
      }
      const idx = currentOpts.findIndex((o) => o.value === currentValue);
      const delta = e.key === 'ArrowDown' ? 1 : -1;
      const nextIdx = (idx + delta + currentOpts.length) % currentOpts.length;
      const next = currentOpts[nextIdx];
      if (next) {
        currentValue = next.value;
        syncLabel();
        renderMenu();
        onChange(currentValue);
      }
    }
  });

  document.addEventListener('click', (e) => {
    if (isOpen && !root.contains(e.target as Node)) {
      closeMenu();
    }
  });

  syncLabel();
  renderMenu();
  root.append(trigger, menu);

  return {
    element: root,
    setOptions(nextOptions: CustomSelectOption[], selectedValue?: string) {
      currentOpts = [...nextOptions];
      if (selectedValue !== undefined) {
        currentValue = selectedValue;
      }
      syncLabel();
      renderMenu();
    },
    setValue(value: string) {
      currentValue = value;
      syncLabel();
      renderMenu();
    },
    setDisabled(disabled: boolean) {
      isDisabled = disabled;
      trigger.disabled = disabled;
      if (disabled) closeMenu();
    },
    getValue() {
      return currentValue;
    },
  };
}
