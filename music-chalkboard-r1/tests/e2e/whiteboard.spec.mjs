import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { test, expect } from '@playwright/test';

const INTRO = '화음이란 무엇일까요?';
const TITLE = '교실 판서 회귀 시험';
const QUESTION = '세 음이 만날 때 무엇을 들을까요?';
const errors = new WeakMap();

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const pageErrors = [];
  errors.set(page, pageErrors);
  page.on('pageerror', error => pageErrors.push(error.message));
});

test.afterEach(({ page }) => {
  expect(errors.get(page)).toEqual([]);
});

async function openBoard(page) {
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true);
  await expect(page.locator('#sceneTitle')).toHaveText(INTRO);
  await expectStage(page, 0);
}

async function expectStage(page, index) {
  await expect(page.locator('#progress')).toHaveText(new RegExp(`^${index}\\s*/\\s*\\d+`));
}

async function openMenu(page, menuId) {
  const menu = page.locator(`#${menuId}`);
  if (!(await menu.evaluate(element => element.open))) await menu.locator('summary').click();
}

async function openEditor(page, buttonId = 'newScene') {
  await openMenu(page, 'sceneMenu');
  await page.locator(`#${buttonId}`).click();
  const editor = page.locator('dialog.scene-editor');
  await expect(editor).toBeVisible();
  return editor;
}

async function saveFromQuestion(page, touch = false) {
  const editor = await openEditor(page);
  await editor.locator('#ed-title').fill(TITLE);
  await editor.locator('#ed-question').fill(QUESTION);
  const save = editor.getByRole('button', { name: '장면 저장', exact: true });
  if (touch) await save.tap();
  else await save.click();
  await expect(editor).toBeHidden();
  await expect(page.locator('#sceneTitle')).toHaveText(TITLE);
  await expect(page.getByRole('status')).toContainText(/저장했습니다|저장했어요/);
}

async function checkSavedQuestion(page) {
  await page.reload();
  await expect(page.locator('#sceneTitle')).toHaveText(TITLE);
  await openMenu(page, 'sceneMenu');
  await page.locator('#openScenes').click();
  const list = page.getByRole('dialog', { name: '장면 목록' });
  await list.getByRole('tab', { name: '내 장면' }).click();
  await expect(list.getByText(TITLE, { exact: true })).toHaveCount(1);
  await list.getByRole('button', { name: '장면 목록 닫기' }).click();
  const editor = await openEditor(page, 'editScene');
  await expect(editor.locator('#ed-question')).toHaveValue(QUESTION);
}

test('keeps the board signature visible through scenes, themes, and resizing', async ({ page }) => {
  await openBoard(page);
  const brand = page.locator('.board-brand');
  const stage = page.locator('#stage');
  const frame = page.locator('#frame');

  async function expectBrand() {
    await expect(brand).toHaveText('레슨 디자이너');
    await expect(brand).toBeVisible();
    await expect(brand).toHaveCSS('pointer-events', 'none');
    const box = await brand.boundingBox();
    const board = await stage.boundingBox();
    expect(box.x).toBeGreaterThan(board.x + board.width / 2);
    expect(box.x + box.width).toBeLessThanOrEqual(board.x + board.width);
    expect(box.y).toBeGreaterThanOrEqual(board.y);
    expect(box.y + box.height).toBeLessThan(board.y + board.height * .1);
  }

  await expectBrand();
  await expect(brand).toHaveCSS('font-family', /WhiteboardHand/);
  await expect(brand).toHaveCSS('color', 'rgb(255, 255, 255)');
  await page.locator('#nextStep').click();
  await expectStage(page, 1);
  await expectBrand();
  await page.keyboard.press('Shift+PageDown');
  await expect(page.locator('#sceneTitle')).not.toHaveText(INTRO);
  await expectBrand();

  await openMenu(page, 'viewMenu');
  await page.locator('[data-opt="theme"] [data-v="white"]').click();
  await expect(frame).toHaveAttribute('data-theme', 'white');
  await expect(brand).toHaveCSS('font-family', /WhiteboardMarkerBrand/);
  await expect(brand).toHaveCSS('color', 'rgb(255, 255, 255)');
  await expectBrand();
  await page.locator('#method').selectOption('canvas');
  await expectBrand();

  await page.setViewportSize({ width: 390, height: 844 });
  await expectBrand();
  await page.reload();
  await expect(frame).toHaveAttribute('data-theme', 'white');
  await expectBrand();
});

test('saves the last typed question on the first click and retains it after reload', async ({ page }) => {
  await openBoard(page);
  await saveFromQuestion(page);
  await checkSavedQuestion(page);
});

test.describe('touch authoring', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test('saves with a single tap and makes the next step reachable from the header', async ({ page }) => {
    await openBoard(page);
    await page.locator('#togglePlay').tap();
    await expectStage(page, 1);
    await page.locator('#nextStep').tap();
    await expectStage(page, 2);
    await saveFromQuestion(page, true);
    await checkSavedQuestion(page);
  });

  test('opens mobile view settings and remembers the white canvas board', async ({ page }) => {
    await openBoard(page);
    const tools = page.locator('#toolMenu');
    const view = page.locator('#viewMenu');
    const method = view.locator('#method');
    const white = view.locator('[data-opt="theme"] [data-v="white"]');
    const frame = page.locator('#frame');
    const canvas = page.locator('#ink > canvas').first();

    async function openMobileView() {
      await tools.locator('summary').tap();
      await tools.getByRole('button', { name: '보기 설정', exact: true }).tap();
      await expect(tools).toHaveJSProperty('open', false);
      await expect(view).toHaveJSProperty('open', true);
      await expect(method).toBeVisible();
    }

    await expect(frame).toHaveAttribute('data-theme', 'chalk');
    await expect(page.locator('#ink > svg')).toBeVisible();
    await openMobileView();
    await method.selectOption('canvas');
    await expect(canvas).toBeVisible();
    await white.tap();
    await expect(white).toHaveAttribute('aria-pressed', 'true');
    await expect(frame).toHaveAttribute('data-theme', 'white');

    await page.keyboard.press('Escape');
    await expect(view).toHaveJSProperty('open', false);
    await page.locator('#nextStep').tap();
    await expectStage(page, 1);
    await expect(canvas).toBeVisible();

    await page.reload();
    await expect(page.locator('#sceneTitle')).toHaveText(INTRO);
    await expect(frame).toHaveAttribute('data-theme', 'white');
    await expect(canvas).toBeVisible();
    await openMobileView();
    await expect(method).toHaveValue('canvas');
    await expect(white).toHaveAttribute('aria-pressed', 'true');
  });
});

test('keeps the next field focused when tabbing out of a changed question', async ({ page }) => {
  await openBoard(page);
  const editor = await openEditor(page);
  const question = editor.locator('#ed-question');
  const caption = editor.locator('#ed-caption');
  await question.fill(QUESTION);
  await page.keyboard.press('Tab');
  await expect(caption).toBeFocused();
  await page.keyboard.insertText('화음을 함께 들어 봐요.');
  await expect(question).toHaveValue(QUESTION);
  await expect(caption).toHaveValue('화음을 함께 들어 봐요.');
});

test('preserves menu keyboard behavior and restores presentation keys after search', async ({ page }) => {
  await openBoard(page);

  await openMenu(page, 'sceneMenu');
  await page.keyboard.press('Escape');
  await expect.poll(() => page.locator('#sceneMenu').evaluate(element => element.open)).toBe(false);
  await page.keyboard.press('ArrowRight');
  await expectStage(page, 1);
  await page.keyboard.press('PageDown');
  await expectStage(page, 2);

  await openMenu(page, 'sceneMenu');
  const search = page.locator('#sceneSearch');
  await search.fill('화음이란');
  await search.press('End');
  const before = await search.evaluate(element => element.selectionStart);
  await search.press('ArrowLeft');
  await expect.poll(() => search.evaluate(element => element.selectionStart)).toBe(before - 1);
  await expectStage(page, 2);
  await search.press('Enter');
  const list = page.getByRole('dialog', { name: '장면 목록' });
  const result = list.getByRole('listitem').filter({ hasText: INTRO });
  await result.getByRole('button', { name: '열기', exact: true }).click();
  await expect(list).toBeHidden();

  await expectStage(page, 0);
  await page.keyboard.press('PageDown');
  await expectStage(page, 1);
  await page.locator('#nextStep').focus();
  await page.keyboard.press('Space');
  await expectStage(page, 2);
});

test('keeps preview separate from scene navigation', async ({ page }) => {
  await openBoard(page);
  const editor = await openEditor(page);
  await editor.locator('#ed-title').fill(TITLE);
  const preview = editor.locator('[data-action="preview"]');
  await preview.click();
  const closePreview = page.locator('#returnPreview');
  await expect(closePreview).toBeVisible();
  const previewTitle = await page.locator('#sceneTitle').textContent();
  await page.keyboard.press('Shift+PageDown');
  await expect(page.locator('#sceneTitle')).toHaveText(previewTitle);
  await closePreview.click();
  await expect(editor).toBeVisible();
  await expect(editor.locator('#ed-title')).toHaveValue(TITLE);
});

test('exports a scene and imports the file as a separate copy', async ({ page }) => {
  await openBoard(page);
  await saveFromQuestion(page);
  await openMenu(page, 'sceneMenu');
  await page.locator('#exportScene').click();
  const exportDialog = page.getByRole('dialog', { name: '파일 내보내기' });
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    exportDialog.getByRole('button', { name: '파일 내려받기' }).click(),
  ]);
  const file = await readFile(await download.path());
  const backup = JSON.parse(file.toString());
  expect(backup).toMatchObject({
    format: 'music-whiteboard-package', kind: 'scene-bundle',
    scenes: [{ title: TITLE, question: QUESTION }],
  });

  await exportDialog.getByRole('button', { name: '닫기', exact: true }).click();
  await page.locator('#fileImport').setInputFiles({
    name: 'scene-backup.json', mimeType: 'application/json', buffer: file,
  });
  const importDialog = page.getByRole('dialog', { name: '파일 가져오기' });
  await importDialog.getByRole('button', { name: '새 사본으로 가져오기' }).click();
  await expect(importDialog).toBeHidden();
  await expect(page.getByRole('status')).toContainText(/가져왔습니다|가져왔어요/);
  await openMenu(page, 'sceneMenu');
  await page.locator('#openScenes').click();
  const list = page.getByRole('dialog', { name: '장면 목록' });
  await list.getByRole('tab', { name: '내 장면' }).click();
  await expect(list.getByText(TITLE, { exact: true })).toHaveCount(2);
});

test('keeps stage controls and the painted board visible at classroom viewport sizes', async ({ page }, testInfo) => {
  test.setTimeout(45_000);
  const sizes = [[320, 568], [390, 844], [844, 390], [768, 1024], [1024, 768], [1366, 768], [1920, 1080], [3840, 2160]];
  await openBoard(page);
  await page.locator('#nextStep').click();
  await expectStage(page, 1);

  for (const [width, height] of sizes) {
    await test.step(`${width} × ${height}`, async () => {
      await page.setViewportSize({ width, height });
      const stage = page.locator('#stage');
      const next = page.locator('#nextStep');
      await expect(stage).toBeInViewport({ ratio: 0.99 });
      await expect(next).toBeInViewport({ ratio: 0.99 });
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      const nextBounds = await next.boundingBox();
      expect(nextBounds.height).toBeGreaterThanOrEqual(44);

      await openMenu(page, 'sceneMenu');
      const search = page.locator('#sceneSearchForm button[type="submit"]');
      await expect(search).toBeVisible();
      await expect(search).toHaveCSS('white-space', 'nowrap');
      await page.keyboard.press('Escape');
      await expect(stage).toBeInViewport({ ratio: 0.99 });

      if (width === 844 || width === 768) {
        await expect.poll(async () => {
          const rect = await stage.boundingBox();
          return (rect.width * rect.height) / (width * height);
        }).toBeGreaterThan(width === 844 ? 0.31 : 0.42);
      }
      if (width === 390 || width === 844 || width === 1366 || width === 3840) {
        await page.screenshot({ path: testInfo.outputPath(`board-${width}x${height}.png`) });
      }
    });
  }
});

test('opens a restored lesson and judges an ordered piano exercise', async ({ page }) => {
  await openBoard(page);
  await openMenu(page, 'sceneMenu');
  await page.locator('#openLessons').click();
  const lessons = page.getByRole('dialog', { name: '수업 열기·관리' });
  const scale = lessons.getByRole('listitem').filter({ hasText: '다장조 음계' });
  await expect(lessons.getByRole('listitem')).toHaveCount(4);
  await expect(scale).toContainText('교사 검토 전');
  await scale.getByRole('button', { name: '수업 열기', exact: true }).click();
  await expect(page.locator('#sceneTitle')).toHaveText('다장조 음계 · 1단계');
  for (let index = 2; index <= 6; index++) {
    await openMenu(page, 'toolMenu');
    await page.locator('#nextScene').click();
    await expect(page.locator('#sceneTitle')).toHaveText(`다장조 음계 · ${index}단계`);
  }

  await page.locator('#nextStep').click();
  await expectStage(page, 1);
  await openMenu(page, 'sceneMenu');
  await page.locator('#openPractice').click();
  const practice = page.getByRole('dialog', { name: '해보기 · 건반' });
  const note = pitch => practice.getByRole('button', { name: pitch, exact: true });
  await expect(note('C4')).toBeFocused();
  await note('C4').press('ArrowRight');
  await expect(note('C#4')).toBeFocused();
  await note('D4').click();
  await expect(practice.getByRole('status')).toContainText('순서가 달라요');
  for (const pitch of ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5']) {
    await note(pitch).click();
  }
  await expect(practice.getByRole('status')).toHaveText('맞아요!');
  await page.keyboard.press('Escape');
  await expect(practice).toBeHidden();
  await expect(page.locator('#sceneTitle')).toHaveText('다장조 음계 · 6단계');
});

test('checks WCAG A and AA accessibility across seven whiteboard states', async ({ page }) => {
  test.setTimeout(60_000);
  await openBoard(page);
  const resolve = createRequire(import.meta.url).resolve;
  const axeSource = await readFile(resolve('axe-core/axe.min.js'), 'utf8');
  await page.evaluate(axeSource);

  async function audit(state) {
    await test.step(state, async () => {
      const violations = await page.evaluate(async () => {
        const result = await window.axe.run(document, {
          runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
        });
        return result.violations
          .filter(violation => ['critical', 'serious'].includes(violation.impact))
          .map(({ id, impact, help, nodes }) => ({
            id,
            impact,
            help,
            nodes: nodes.map(({ target, failureSummary }) => ({ target, failureSummary })),
          }));
      });
      expect.soft(violations, state).toEqual([]);
    });
  }

  await audit('빈 칠판');
  await openMenu(page, 'sceneMenu');
  await expect(page.locator('#sceneSearch')).toBeVisible();
  await audit('장면 메뉴');
  const editor = await openEditor(page);
  await expect(editor.locator('#ed-title')).toBeFocused();
  await audit('새 장면 편집기');
  const template = editor.locator('#ed-template');
  await template.selectOption('text-explanation');
  const confirmation = page.getByRole('dialog', { name: '장면 템플릿 변경' });
  await expect(confirmation).toBeVisible();
  await audit('템플릿 변경 확인');
  await confirmation.getByRole('button', { name: '템플릿 변경', exact: true }).click();
  await expect(confirmation).toBeHidden();
  await expect(template).toHaveValue('text-explanation');
  await editor.locator('#ed-title').fill(TITLE);
  await editor.locator('#ed-question').fill(QUESTION);
  await editor.getByRole('button', { name: '장면 저장', exact: true }).click();
  await expect(editor).toBeHidden();
  await expect(page.locator('#sceneTitle')).toHaveText(TITLE);
  await openMenu(page, 'toolMenu');
  await page.locator('#finish').click();
  await expect(page.locator('#nextStep')).toBeDisabled();
  await audit('판서가 완료된 저장 장면');

  await openMenu(page, 'sceneMenu');
  await page.locator('#openScenes').click();
  const list = page.getByRole('dialog', { name: '장면 목록' });
  await list.getByRole('tab', { name: '내 장면' }).click();
  await expect(list.getByText(TITLE, { exact: true })).toBeVisible();
  await audit('내 장면 목록');
  await list.getByRole('button', { name: '장면 목록 닫기' }).click();
  await expect(list).toBeHidden();

  await openMenu(page, 'helpMenu');
  await expect(page.locator('#fontLicenses')).toBeVisible();
  await audit('도움말');
});

test('preserves both edits when two tabs save the same scene revision', async ({ page, context }) => {
  await openBoard(page);
  await saveFromQuestion(page);
  const first = await openEditor(page, 'editScene');
  const other = await context.newPage();
  other.on('pageerror', error => errors.get(page).push(error.message));
  try {
    await other.emulateMedia({ reducedMotion: 'reduce' });
    await other.goto('/');
    await expect(other.locator('#sceneTitle')).toHaveText(TITLE);
    const second = await openEditor(other, 'editScene');
    await first.locator('#ed-title').fill('첫째 탭 변경');
    await first.locator('#ed-question').fill('먼저 저장한 질문을 보존할까요?');
    await second.locator('#ed-title').fill('둘째 탭 변경');
    await second.locator('#ed-question').fill('두 번째 변경도 보관할까요?');
    await first.getByRole('button', { name: '장면 저장', exact: true }).click();
    await expect(first).toBeHidden();
    await expect(page.locator('#sceneTitle')).toHaveText('첫째 탭 변경');

    await second.getByRole('button', { name: '장면 저장', exact: true }).click();
    const conflict = other.getByRole('dialog', { name: '다른 탭에서 원본 변경', exact: true });
    await expect(conflict).toBeVisible();
    await conflict.getByRole('button', { name: '사본 저장', exact: true }).click();
    await expect(second).toBeHidden();
    await expect(other.locator('#sceneTitle')).toHaveText('둘째 탭 변경 사본');
    await other.reload();
    await expect(other.locator('#sceneTitle')).toHaveText('둘째 탭 변경 사본');
    await openMenu(other, 'sceneMenu');
    await other.locator('#openScenes').click();
    const list = other.getByRole('dialog', { name: '장면 목록' });
    await list.getByRole('tab', { name: '내 장면' }).click();
    await expect(list.getByText('첫째 탭 변경', { exact: true })).toHaveCount(1);
    await expect(list.getByText('둘째 탭 변경 사본', { exact: true })).toHaveCount(1);
    await list.getByRole('listitem').filter({ hasText: '첫째 탭 변경' }).getByRole('button', { name: '열기', exact: true }).click();
    const saved = await openEditor(other, 'editScene');
    await expect(saved.locator('#ed-question')).toHaveValue('먼저 저장한 질문을 보존할까요?');
  } finally {
    await other.close();
  }
});
