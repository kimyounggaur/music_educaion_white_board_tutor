let nextDialogId = 0;

/** An app-owned modal so confirmation works in embedded browsers and with keyboards. */
export function confirmAction({
  title = '확인',
  message = '',
  confirmLabel = '확인',
  cancelLabel = '취소',
  destructive = false,
  returnFocus = document.activeElement,
} = {}) {
  const dialog = document.createElement('dialog');
  dialog.className = 'wb-confirm';
  dialog.dataset.destructive = String(destructive);

  const heading = document.createElement('h2');
  heading.textContent = title;
  heading.id = `wb-confirm-title-${++nextDialogId}`;
  dialog.setAttribute('aria-labelledby', heading.id);
  dialog.append(heading);
  if (message) {
    const description = document.createElement('p');
    description.textContent = message;
    description.id = `${heading.id}-message`;
    dialog.setAttribute('aria-describedby', description.id);
    dialog.append(description);
  }

  const actions = document.createElement('div');
  actions.className = 'wb-confirm-actions';
  const makeButton = (label, action) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.confirm = action;
    button.textContent = label;
    actions.append(button);
    return button;
  };
  const cancel = makeButton(cancelLabel, 'cancel');
  const accept = makeButton(confirmLabel, 'accept');
  dialog.append(actions);
  document.body.append(dialog);

  return new Promise(resolve => {
    let settled = false;
    const finish = accepted => {
      if (settled) return;
      settled = true;
      if (dialog.open) dialog.close();
      dialog.remove();
      if (returnFocus?.isConnected) returnFocus.focus();
      resolve(accepted);
    };
    accept.addEventListener('click', () => finish(true));
    cancel.addEventListener('click', () => finish(false));
    dialog.addEventListener('cancel', event => {
      event.preventDefault();
      finish(false);
    });
    dialog.addEventListener('close', () => finish(false), { once: true });
    try {
      dialog.showModal();
      (destructive ? cancel : accept).focus();
    } catch {
      finish(false);
    }
  });
}
