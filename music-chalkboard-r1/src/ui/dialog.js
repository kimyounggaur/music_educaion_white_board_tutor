/** A temporary, keyboard-accessible workspace opened from the header. */
export function openDialog(title, { onClose } = {}) {
  const previousFocus = document.activeElement;
  const dialog = document.createElement('dialog');
  dialog.className = 'draft-dialog';
  dialog.setAttribute('aria-label', title);
  const heading = document.createElement('h2');
  heading.textContent = title;
  const content = document.createElement('div');
  const error = document.createElement('p');
  error.className = 'dialog-error';
  error.setAttribute('role', 'alert');
  const actions = document.createElement('div');
  actions.className = 'dialog-actions';
  const closeButton = makeButton('닫기', () => dialog.close());
  actions.append(closeButton);
  dialog.append(heading, content, error, actions);
  dialog.addEventListener('close', () => {
    dialog.remove();
    const target = previousFocus?.isConnected ? previousFocus : document.getElementById('nextStep');
    if (target && !target.closest('[inert]')) {
      const menu = target.closest('details');
      (menu && !menu.open ? menu.querySelector('summary') : target).focus();
    }
    onClose?.();
  }, { once: true });
  document.body.append(dialog);
  dialog.showModal();
  closeButton.focus();
  return { dialog, content, error, actions, close: () => dialog.close() };
}

export function makeButton(label, handler, className = '') {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.className = className;
  button.addEventListener('click', async () => {
    if (button.disabled) return;
    button.disabled = true;
    try {
      await handler();
    } catch (error) {
      const target = button.closest('dialog')?.querySelector('.dialog-error');
      if (target) target.textContent = error.message;
      else throw error;
    } finally {
      button.disabled = false;
    }
  });
  return button;
}

export function paragraph(text, className = '') {
  const element = document.createElement('p');
  element.textContent = text;
  element.className = className;
  return element;
}

export function checkbox(label, checked = false) {
  const row = document.createElement('label');
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = checked;
  row.append(input, document.createTextNode(label));
  return { row, input };
}
