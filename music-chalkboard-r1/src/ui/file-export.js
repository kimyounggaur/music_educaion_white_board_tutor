import { openDialog, makeButton, paragraph } from './dialog.js';

export function safeFilename(value) {
  return (value || '장면').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').slice(0, 60);
}

export function koreanDate(date = new Date()) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(date);
}

export function downloadJSON(value, filename) {
  const json = JSON.stringify(value);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function fileActions(value, filename, { onRequested } = {}) {
  const wrapper = document.createElement('div');
  const data = JSON.stringify(value);
  wrapper.append(makeButton('파일 내려받기', () => {
    downloadJSON(value, filename);
    onRequested?.();
  }));
  wrapper.append(makeButton('JSON 내용 복사', async () => {
    const copied = await copyText(data, '백업 JSON 복사');
    if (copied) onRequested?.();
  }));
  const file = typeof File === 'function' ? new File([data], filename, { type: 'application/json' }) : null;
  if (file && navigator.canShare?.({ files: [file] })) {
    wrapper.append(makeButton('파일 공유', async () => {
      await navigator.share({ files: [file], title: filename });
      onRequested?.();
    }));
  }
  return wrapper;
}

export async function copyText(text, title = '내용 복사') {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* The selectable text below also works when clipboard access is blocked. */ }
  const view = openDialog(title);
  view.content.append(paragraph('아래 내용을 모두 선택해 복사하고 파일로 보관하세요.'));
  const textarea = document.createElement('textarea');
  textarea.className = 'copy-data';
  textarea.readOnly = true;
  textarea.value = text;
  view.content.append(textarea);
  textarea.focus();
  textarea.select();
  return new Promise(resolve => {
    let confirmed = false;
    view.actions.prepend(makeButton('복사했습니다', () => { confirmed = true; view.close(); }));
    view.dialog.addEventListener('close', () => resolve(confirmed), { once: true });
  });
}

export function exportDialog(value, filename) {
  const view = openDialog('파일 내보내기');
  view.content.append(paragraph(filename), fileActions(value, filename));
}
