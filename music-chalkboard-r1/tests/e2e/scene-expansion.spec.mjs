import { test, expect } from '@playwright/test';

const errors = new WeakMap();

test.beforeEach(async ({ page }) => {
  const failures = [];
  errors.set(page, failures);
  page.on('pageerror', error => failures.push(error.message));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  // Record the fundamental oscillator only: its overtones are not extra notes.
  // This verifies actual synthesis requests without claiming acoustic listening.
  await page.addInitScript(() => {
    globalThis.__noteRequests = [];
    const parameter = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {},
      setTargetAtTime() {}, cancelAndHoldAtTime() {}, cancelScheduledValues() {} });
    const node = () => ({ connect() {}, disconnect() {}, addEventListener() {},
      gain: parameter(), frequency: parameter(), Q: parameter(), threshold: parameter(),
      knee: parameter(), ratio: parameter(), attack: parameter(), release: parameter() });
    class TestAudioContext {
      constructor() { this.state = 'running'; this.destination = node(); }
      get currentTime() { return performance.now() / 1000; }
      resume() { this.state = 'running'; return Promise.resolve(); }
      createGain() { return node(); }
      createDynamicsCompressor() { return node(); }
      createBiquadFilter() { return node(); }
      createOscillator() {
        const oscillator = node();
        oscillator.stop = () => {};
        oscillator.start = at => {
          if (oscillator.type === 'triangle') globalThis.__noteRequests.push({
            midi: Math.round(69 + 12 * Math.log2(oscillator.frequency.value / 440)), at,
          });
        };
        return oscillator;
      }
    }
    globalThis.AudioContext = TestAudioContext;
    globalThis.webkitAudioContext = TestAudioContext;
  });
});

test.afterEach(({ page }) => {
  expect(errors.get(page)).toEqual([]);
});

async function openMenu(page, id) {
  const menu = page.locator('#' + id);
  if (!(await menu.evaluate(element => element.open))) await menu.locator('summary').click();
}

async function openBoard(page) {
  await page.goto('/');
  await expect(page.locator('#sceneTitle')).toHaveText('화음이란 무엇일까요?');
}

async function openBuiltinLesson(page, title) {
  await openMenu(page, 'sceneMenu');
  await page.locator('#openLessons').click();
  const manager = page.getByRole('dialog', { name: '수업 열기·관리' });
  const row = manager.getByRole('listitem').filter({ has: page.getByText(title, { exact: true }) });
  await expect(row).toContainText('교사 검토 전');
  await row.getByRole('button', { name: '수업 열기', exact: true }).click();
  await expect(manager).toBeHidden();
  await expect(page.locator('#sceneTitle')).toHaveText(title + ' · 1단계');
}

async function openTopic(page, id) {
  await openMenu(page, 'sceneMenu');
  await page.locator('#createFromTopic').click();
  const picker = page.getByRole('dialog', { name: '주제로 만들기' });
  await expect(picker).toBeVisible();
  await picker.locator(`[data-card-id="${id}"]`).click();
  return picker;
}

async function saveEditor(page, title) {
  const editor = page.locator('dialog.scene-editor');
  await expect(editor).toBeVisible();
  if (title) await editor.locator('#ed-title').fill(title);
  await editor.getByRole('button', { name: '장면 저장', exact: true }).click();
  await expect(editor).toBeHidden();
  return title || await page.locator('#sceneTitle').textContent();
}

async function storedRecords(page, storeName) {
  return page.evaluate(store => new Promise((resolve, reject) => {
    const opening = indexedDB.open('music-whiteboard-authoring');
    opening.onerror = () => reject(opening.error);
    opening.onsuccess = () => {
      const db = opening.result;
      const request = db.transaction(store).objectStore(store).getAll();
      request.onerror = () => { db.close(); reject(request.error); };
      request.onsuccess = () => { db.close(); resolve(request.result); };
    };
  }), storeName);
}

for (const [title, length, key] of [
  ['음이름과 계이름', 7, 'ArrowRight'],
  ['다장조 음계', 6, 'PageDown'],
  ['다장조 주요 3화음', 9, 'ArrowRight'],
  ['딸림7화음과 마침꼴', 7, 'PageDown'],
]) {
  test(`finishes ${title} in exactly ${length} forward commands`, async ({ page }) => {
    await openBoard(page);
    await openBuiltinLesson(page, title);
    await expect(page.locator('#progress')).toContainText(`1/${length} · 0 / 1단계`);
    for (let position = 1; position <= length; position++) {
      await page.keyboard.press(key);
      await expect(page.locator('#sceneTitle')).toHaveText(`${title} · ${position}단계`);
      await expect(page.locator('#progress')).toContainText(`${position}/${length} · 1 / 1단계`);
      await expect.poll(async () => (await storedRecords(page, 'settings'))
        .find(record => record.key === 'lastSceneId')?.value?.endsWith(`-s${position}`)).toBe(true);
      if (position < length) await expect(page.locator('#togglePlay')).toHaveText('다음 장면');
    }
    await expect(page.locator('#nextStep')).toBeDisabled();
    await expect(page.locator('#togglePlay')).toBeDisabled();
    await expect(page.locator('.board-brand')).toHaveText('레슨 디자이너');
  });
}

test('carries visible notes into menu navigation, reads them, and opens the previous scene silently', async ({ page }) => {
  await openBoard(page);
  await openBuiltinLesson(page, '다장조 음계');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#progress')).toContainText('2/6 · 1 / 1단계');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await openMenu(page, 'toolMenu');
  await page.locator('#nextScene').click();
  await expect(page.locator('#sceneTitle')).toHaveText('다장조 음계 · 3단계');
  await expect(page.locator('#progress')).toContainText('3/6 · 0 / 1단계');
  await expect(page.locator('#hearNotes')).toBeEnabled();
  await expect(page.locator('#stage')).toHaveAttribute('aria-label', /음표/);
  await expect(page.locator('#boardDescription')).not.toHaveText('시작을 눌러 첫 단계를 판서하세요.');
  await openMenu(page, 'toolMenu');
  await page.locator('#readBoard').click();
  const transcript = page.getByRole('dialog', { name: '칠판 내용', exact: true });
  await expect(transcript.locator('.board-transcript')).toContainText(/도|다|C4/);
  await transcript.getByRole('button', { name: '닫기', exact: true }).click();
  await page.evaluate(() => { globalThis.__noteRequests = []; });
  await page.keyboard.press('PageUp');
  await expect(page.locator('#sceneTitle')).toHaveText('다장조 음계 · 2단계');
  await expect(page.locator('#progress')).toContainText('2/6 · 1 / 1단계');
  expect(await page.evaluate(() => globalThis.__noteRequests)).toEqual([]);
  await openMenu(page, 'toolMenu');
  await page.locator('#restart').click();
  await expect(page.locator('#progress')).toContainText('2/6 · 0 / 1단계');
  await expect(page.locator('#hearNotes')).toBeDisabled();
});

test('keeps all eight listening notes through resize, feedback expiry, and repeated replay', async ({ page }) => {
  test.setTimeout(60_000);
  await openBoard(page);
  await openBuiltinLesson(page, '다장조 음계');
  const board = page.locator('.board-area');
  const before = await board.boundingBox();
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => page.evaluate(() => globalThis.__noteRequests.length)).toBeGreaterThan(0);
  expect(await board.boundingBox()).toEqual(before);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await expect.poll(() => page.evaluate(() => globalThis.__noteRequests.length), { timeout: 8_000 }).toBe(8);
  const expected = [60, 62, 64, 65, 67, 69, 71, 72];
  expect(await page.evaluate(() => globalThis.__noteRequests.map(note => note.midi))).toEqual(expected);
  const afterResize = await board.boundingBox();
  await expect(page.locator('#status')).toHaveText('', { timeout: 8_000 });
  expect(await board.boundingBox()).toEqual(afterResize);

  for (const delay of [2_000, 9_000]) {
    await page.waitForTimeout(delay);
    await page.evaluate(() => { globalThis.__noteRequests = []; });
    await openMenu(page, 'toolMenu');
    await page.locator('#replay').click();
    await page.setViewportSize(delay === 2_000 ? { width: 1024, height: 768 } : { width: 390, height: 844 });
    await expect.poll(() => page.evaluate(() => globalThis.__noteRequests.length), { timeout: 8_000 }).toBe(8);
    expect(await page.evaluate(() => globalThis.__noteRequests.map(note => note.midi))).toEqual(expected);
  }
});

test('creates a transposed card, preserves its saved content, and regenerates a separate scene', async ({ page }) => {
  await openBoard(page);
  const picker = await openTopic(page, 'major-scale');
  await picker.getByLabel('조', { exact: true }).selectOption('G:major');
  await expect(picker.getByRole('button', { name: '장면 만들기', exact: true })).toBeEnabled();
  await picker.getByRole('button', { name: '장면 만들기', exact: true }).click();
  const editor = page.locator('dialog.scene-editor');
  await expect(editor.locator('#ed-key')).toHaveValue('G:major');
  await expect(editor.locator('[data-source-notice]')).toContainText('주제 카드로 만든 장면');
  await saveEditor(page, '사장조 카드 보존');
  await page.reload();
  await expect(page.locator('#sceneTitle')).toHaveText('사장조 카드 보존');
  await openMenu(page, 'sceneMenu');
  await page.locator('#editScene').click();
  await editor.getByRole('button', { name: '조건 바꿔 다시 만들기', exact: true }).click();
  const confirmation = page.getByRole('dialog', { name: '조건 바꿔 다시 만들기', exact: true });
  await confirmation.getByRole('button', { name: '조건 고르기', exact: true }).click();
  const nextPicker = page.getByRole('dialog', { name: '주제로 만들기' });
  await nextPicker.getByLabel('조', { exact: true }).selectOption('F:major');
  await nextPicker.getByRole('button', { name: '장면 만들기', exact: true }).click();
  await saveEditor(page, '바장조 새 카드');
  const scenes = await storedRecords(page, 'scenes');
  const original = scenes.find(scene => scene.title === '사장조 카드 보존');
  const generated = scenes.find(scene => scene.title === '바장조 새 카드');
  expect(original.content.key.tonic).toBe('G');
  expect(generated.content.key.tonic).toBe('F');
  expect(generated.id).not.toBe(original.id);
  expect(original.content.source.cardId).toBe('major-scale');
  expect(generated.content.source.params.key).toBe('F:major');
});

test('saves a five-scene transposed key-signature lesson and restores its lesson position', async ({ page }) => {
  await openBoard(page);
  const picker = await openTopic(page, 'key-signature');
  await picker.getByLabel('조', { exact: true }).selectOption('Bb:major');
  await picker.getByLabel('만들 단위', { exact: true }).selectOption('lesson');
  await picker.getByRole('button', { name: '수업 만들기', exact: true }).click();
  await expect(picker).toContainText('5장면');
  const lessons = await storedRecords(page, 'lessons');
  const scenes = await storedRecords(page, 'scenes');
  expect(lessons).toHaveLength(1);
  expect(lessons[0].sceneIds).toHaveLength(5);
  expect(scenes).toHaveLength(5);
  expect(new Set(scenes.map(scene => scene.renderSeed)).size).toBe(1);
  expect(scenes.every(scene => scene.content.key.tonic === 'Bb')).toBe(true);
  await picker.getByRole('button', { name: '수업 열기', exact: true }).click();
  await expect(page.locator('#sceneTitle')).toHaveText('내림나장조 조표 · 1단계');
  for (let position = 1; position <= 5; position++) {
    await page.keyboard.press('PageDown');
    await expect(page.locator('#progress')).toContainText(`${position}/5 · 1 / 1단계`);
  }
  await expect(page.locator('#nextStep')).toBeDisabled();
  await expect.poll(async () => (await storedRecords(page, 'settings'))
    .find(record => record.key === 'lastSceneId')?.value).toBe(lessons[0].sceneIds[4]);
  await page.reload();
  await expect(page.locator('#sceneTitle')).toHaveText('내림나장조 조표 · 5단계');
  await expect(page.locator('#progress')).toContainText('5/5 · 0 / 1단계');
});

test('saves simultaneous interval notation and reopens its two-note column', async ({ page }) => {
  await openBoard(page);
  const picker = await openTopic(page, 'interval');
  await picker.getByLabel('보여 주는 방식', { exact: true }).selectOption('simultaneous');
  await picker.getByRole('button', { name: '장면 만들기', exact: true }).click();
  const editor = page.locator('dialog.scene-editor');
  await expect(editor.locator('[data-column] [data-note]')).toHaveCount(2);
  await expect(editor.locator('[data-dyad-readout]')).toContainText('완전5도');
  await saveEditor(page, '동시에 듣는 완전5도');
  await page.reload();
  await openMenu(page, 'sceneMenu');
  await page.locator('#editScene').click();
  await expect(editor.locator('[data-column]')).toHaveCount(1);
  await expect(editor.locator('[data-column] [data-note]')).toHaveCount(2);
  const [stored] = await storedRecords(page, 'scenes');
  expect(stored.templateVersion).toBe(3);
  expect(stored.content.columns[0].kind).toBe('dyad');
  expect(stored.content.columns[0].notes.map(note => note.pitch)).toEqual(['C4', 'G4']);
});

test('plays a generated form diagram with a transient cursor and stops it for a dialog', async ({ page }) => {
  await openBoard(page);
  const picker = await openTopic(page, 'form');
  await picker.getByRole('button', { name: '장면 만들기', exact: true }).click();
  await saveEditor(page, '세도막 가락 비교');
  for (let step = 1; step <= 5; step++) await page.keyboard.press('ArrowRight');
  await expect(page.locator('#progress')).toContainText('5 / 5단계');
  await expect(page.locator('.diagram-playhead')).toBeVisible();
  await expect.poll(() => page.evaluate(() => globalThis.__noteRequests.length)).toBeGreaterThan(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.diagram-playhead')).toBeVisible();
  await expect(page.locator('.board-brand')).toBeVisible();
  await openMenu(page, 'toolMenu');
  await page.locator('#readBoard').click();
  await expect(page.getByRole('dialog', { name: '칠판 내용', exact: true })).toBeVisible();
  await expect(page.locator('.diagram-playhead')).toBeHidden();
});
