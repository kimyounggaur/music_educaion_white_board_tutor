import { test, expect } from '@playwright/test';

async function openEditor(page, action) {
  await page.locator('#sceneMenu summary').click();
  await page.locator('#' + action).click();
  const editor = page.locator('dialog.scene-editor');
  await expect(editor).toBeVisible();
  return editor;
}

test('writes a four-note chord and an accidental, then reopens the edited notation after reload', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#sceneTitle')).toHaveText('화음이란 무엇일까요?');
  const editor = await openEditor(page, 'newScene');
  await editor.locator('#ed-title').fill('구성음과 변화음');
  await editor.getByRole('button', { name: '구성음 추가' }).click();

  const chord = editor.locator('[data-column]').first();
  const pitches = ['G4', 'B4', 'D5', 'F5'];
  for (const [index, pitch] of pitches.entries()) {
    await chord.locator('[data-note]').nth(index).selectOption(pitch);
  }
  await expect(chord.locator('[data-theory-readout]')).toContainText('딸림7화음 · V7');
  const memo = chord.getByRole('textbox', { name: '교사 메모' });
  await memo.fill('함께 듣기');

  await editor.getByRole('button', { name: '음표 열 추가' }).click();
  const note = editor.locator('[data-column]').last();
  await expect(note.locator('[data-note]')).toBeFocused();
  await note.locator('[data-note]').selectOption('F4');
  await note.locator('[data-accidental]').selectOption('#');
  await note.locator('[data-label-mode]').selectOption('en');
  const key = editor.locator('#ed-key');
  await key.selectOption('G:major');
  await expect(note.locator('[data-accidental]')).toHaveValue('#');
  await key.selectOption('C:major');
  await note.getByRole('button', { name: '2열 음표 위로' }).click();

  await editor.getByRole('button', { name: '장면 저장', exact: true }).click();
  await expect(editor).toBeHidden();
  await expect(page.locator('#sceneTitle')).toHaveText('구성음과 변화음');
  await page.reload();
  await expect(page.locator('#sceneTitle')).toHaveText('구성음과 변화음');
  const reopened = await openEditor(page, 'editScene');
  const first = reopened.locator('[data-column]').first();
  await expect(first.locator('[data-note]')).toHaveValue('F4');
  await expect(first.locator('[data-accidental]')).toHaveValue('#');
  await expect(first.locator('[data-label-mode]')).toHaveValue('en');
  const second = reopened.locator('[data-column]').last();
  await expect(second.locator('[data-note]')).toHaveCount(4);
  await expect(second.locator('[data-theory-readout]')).toContainText('딸림7화음 · V7');
  await expect(second.getByRole('textbox', { name: '교사 메모' })).toHaveValue('함께 듣기');
});
