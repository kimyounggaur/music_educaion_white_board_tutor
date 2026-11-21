import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import 'fake-indexeddb/auto';
import { Window } from 'happy-dom';

const win = new Window({ url: 'http://localhost/' });
win.document.write(readFileSync(new URL('../src/index.html', import.meta.url), 'utf8').replace('<script>/*__SCRIPT__*/</script>', ''));
Object.assign(globalThis, {
  window: win, document: win.document, location: win.location, sessionStorage: win.sessionStorage,
  innerWidth: 1200, devicePixelRatio: 1, matchMedia: () => ({ matches: true }),
  requestAnimationFrame: () => 1, cancelAnimationFrame: () => {},
  confirm: () => { throw Error('앱 확인창을 사용해야 합니다.'); },
});
const ctx = new Proxy({
  createImageData: (width, height) => ({ data: new Uint8ClampedArray(width * height * 4), width, height }),
  measureText: value => ({ width: value.length * 12 }), createPattern: () => null,
  createLinearGradient: () => ({ addColorStop() {} }), createRadialGradient: () => ({ addColorStop() {} }),
}, { get: (target, key) => key in target ? target[key] : () => {}, set: (target, key, value) => (target[key] = value, true) });
win.HTMLCanvasElement.prototype.getContext = () => ctx;
Object.defineProperty(win.document.querySelector('#stage'), 'clientWidth', { value: 800 });

const element = selector => document.querySelector(selector);
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const waitFor = async (predicate, label) => {
  for (let attempt = 0; attempt < 300; attempt++) {
    const value = await predicate();
    if (value) return value;
    await delay(10);
  }
  throw Error(label + ': ' + (element('.ed-error,.dialog-error,#errorText')?.textContent || '화면 전환 시간 초과'));
};
const editor = () => element('dialog.scene-editor[open]');
const modal = title => element(`dialog[aria-label="${title}"][open]`);
const button = (root, label) => [...root.querySelectorAll('button')].find(action => action.textContent.trim() === label);
const click = selector => {
  const action = element(selector);
  assert.ok(action, selector);
  assert.equal(action.disabled, false, selector + '를 눌러야 합니다.');
  action.click();
};
const field = (control, value, type = 'input') => {
  assert.ok(control, value + ' 입력 칸이 있어야 합니다.');
  control.value = value;
  control.dispatchEvent(new win.Event(type, { bubbles: true }));
};
const titleIs = title => element('#sceneTitle').textContent === title;

await import('../src/app.js');
await waitFor(() => titleIs('화음이란 무엇일까요?'), '기본 장면 열기');
assert.equal(element('#progress').textContent, '0 / 3단계 · 질문');
click('#nextStep');
assert.match(element('#progress').textContent, /^1 \/ 3/);

click('#newScene');
await waitFor(editor, '새 장면 편집');
field(editor().querySelector('#ed-template'), 'text-explanation', 'change');
await waitFor(() => element('dialog.wb-confirm[open]'), '템플릿 변경 확인창');
click('dialog.wb-confirm [data-confirm="cancel"]');
await delay(0);
assert.equal(editor().querySelector('#ed-template').value, 'chord-stack');
field(editor().querySelector('#ed-template'), 'text-explanation', 'change');
await waitFor(() => element('dialog.wb-confirm[open]'), '템플릿 변경 재확인');
click('dialog.wb-confirm [data-confirm="accept"]');
await waitFor(() => editor()?.querySelector('#ed-template')?.value === 'text-explanation', '본문 템플릿 선택');
field(editor().querySelector('#ed-title'), '자동 시험 장면');
click('dialog.scene-editor [data-action="save"]');
await waitFor(() => !element('dialog.scene-editor') && titleIs('자동 시험 장면'), '첫 클릭으로 장면 저장');
assert.match(element('#status').textContent, /저장했습니다/);

click('#editScene');
await waitFor(editor, '저장한 장면 편집');
click('dialog.scene-editor [data-action="preview"]');
const previewTitle = '미리보기 · 저장 전 · 자동 시험 장면';
await waitFor(() => titleIs(previewTitle), '편집 중인 장면 미리보기');
assert.equal(element('#sceneMenu').inert, true);
element('#returnPreview').dispatchEvent(new win.KeyboardEvent('keydown', { key: 'PageDown', shiftKey: true, bubbles: true }));
await delay(20);
assert.equal(element('#sceneTitle').textContent, previewTitle, '미리보기에서 발표 장면으로 이동하지 않습니다.');
click('#returnPreview');
await waitFor(() => titleIs('자동 시험 장면') && editor(), '미리보기에서 기존 편집 창 복귀');
assert.equal(element('#sceneMenu').inert, false);
click('dialog.scene-editor [data-action="close"]');
await waitFor(() => !element('dialog.scene-editor'), '편집 닫기');

const { openSceneStorage } = await import('../src/scene-storage.js');
const { downgradeSceneV2 } = await import('../src/scene-model.js');
const store = await openSceneStorage();
const [stored] = await store.listScenes();
assert.equal(stored.schemaVersion, 2);
assert.equal(stored.templateId, 'text-explanation');
const formFields = ['title', 'tags', 'question', 'caption', 'templateId', 'templateVersion', 'content', 'steps'];
const old = downgradeSceneV2(stored);
const originalDraft = {
  draftId: 'recovered-draft', sceneId: stored.id, baseRevision: stored.revision, editorVersion: 1,
  updatedAt: new Date().toISOString(),
  formData: Object.fromEntries(formFields.map(key => [key, structuredClone(old[key])])),
};
await store.saveDraft(originalDraft);
click('#recoverDraft');
const recovery = await waitFor(() => modal('저장되지 않은 초안')?.querySelector('.draft-row'), 'v1 초안 복구 목록');
button(recovery, '이어서 편집').click();
await waitFor(editor, 'v1 초안을 편집기로 불러오기');
field(editor().querySelector('#ed-title'), '복구한 장면');
const savedDrafts = await waitFor(async () => {
  const drafts = await store.listDrafts();
  return drafts.some(draft => draft.formData.title === '복구한 장면') && drafts;
}, '복구 내용을 현재 탭 초안에 자동 저장');
assert.equal(savedDrafts.length, 2);
assert.equal(savedDrafts.find(draft => draft.draftId === originalDraft.draftId).formData.title, '자동 시험 장면', '복구 편집 중에는 원본 초안을 덮어쓰지 않습니다.');
assert.equal(savedDrafts.find(draft => draft.draftId !== originalDraft.draftId).editorVersion, 2);
click('dialog.scene-editor [data-action="save"]');
await waitFor(() => !element('dialog.scene-editor') && titleIs('복구한 장면'), '복구 장면 저장');
assert.equal((await store.listDrafts()).length, 0, '저장한 탭의 초안과 여전히 같은 원본 초안을 정리합니다.');

const current = await store.getScene(stored.id);
const concurrent = { ...originalDraft, draftId: 'other-tab-draft', baseRevision: current.revision };
await store.saveDraft(concurrent);
click('#editScene');
await waitFor(() => element('dialog.wb-confirm[open]'), '편집 중 초안 이어쓰기 선택');
click('dialog.wb-confirm [data-confirm="accept"]');
await waitFor(editor, '이어서 편집 열기');
field(editor().querySelector('#ed-title'), '마지막 저장본');
const changedByOtherTab = { ...concurrent, updatedAt: new Date().toISOString(), formData: { ...concurrent.formData, title: '다른 탭의 변경' } };
await store.saveDraft(changedByOtherTab);
click('dialog.scene-editor [data-action="save"]');
await waitFor(() => !element('dialog.scene-editor') && titleIs('마지막 저장본'), '다른 탭 변경을 유지하며 저장');
assert.deepEqual((await store.listDrafts()).map(draft => [draft.draftId, draft.formData.title]), [[concurrent.draftId, '다른 탭의 변경']]);

click('#openScenes');
const sceneList = await waitFor(() => element('dialog.wb-scenes[open]'), '장면 목록 열기');
button(sceneList, '내 장면').click();
await waitFor(() => sceneList.textContent.includes('마지막 저장본'), '장면 목록에 저장본 표시');
sceneList.close();
await waitFor(() => !element('dialog.wb-scenes[open]'), '장면 목록 닫기');

click('#openLessons');
const lessons = await waitFor(() => modal('수업 열기·관리')?.querySelectorAll('.lesson-grid li').length === 4 && modal('수업 열기·관리'), '기본 수업 4개 표시');
button(lessons, '새 수업').click();
const composition = await waitFor(() => modal('수업 구성'), '수업을 구성하는 대화창');
field(composition.querySelector('input'), '자동 시험 수업');
const chooser = composition.querySelector('[aria-label="추가할 장면"]');
field(chooser, stored.id, 'change');
button(composition, '장면 추가').click();
await waitFor(() => composition.querySelectorAll('.lesson-edit-list li').length === 1, '개인 장면 추가');
chooser.selectedIndex = 0;
const firstBuiltinId = chooser.value;
button(composition, '장면 추가').click();
await waitFor(() => composition.querySelectorAll('.lesson-edit-list li').length === 2, '기본 장면 추가');
button(composition.querySelector('.lesson-edit-list li:last-child'), '위').click();
button(composition, '수업 저장').click();
await waitFor(() => lessons.textContent.includes('자동 시험 수업'), '새 수업 저장 후 목록 갱신');
const [lesson] = await store.listLessons();
assert.deepEqual(lesson.sceneIds, [firstBuiltinId, stored.id], '편집한 수업 순서를 그대로 저장합니다.');

const nameLesson = [...lessons.querySelectorAll('.lesson-grid li')].find(row => row.querySelector('strong').textContent === '음이름과 계이름');
assert.match(nameLesson.textContent, /교사 검토 전/);
button(nameLesson, '수업 열기').click();
await waitFor(() => titleIs('음이름과 계이름 · 1단계'), '기본 수업 첫 장면');
for (let stage = 2; stage <= 6; stage++) {
  await waitFor(() => !element('#nextScene').disabled, '다음 장면 활성화');
  click('#nextScene');
  await waitFor(() => titleIs(`음이름과 계이름 · ${stage}단계`), '기본 수업의 다음 장면');
}
await waitFor(async () => (await store.getSetting('lastSceneId')) === 'builtin:lesson-names-and-solfege-s6', '수업 진행 장면 기억');
assert.equal(await store.getSetting('activeLessonId'), 'builtin:lesson-names-and-solfege');
assert.equal(element('#openPractice').hidden, true);
click('#nextStep');
await waitFor(() => !element('#openPractice').hidden, '판서 뒤 건반 문제 표시');
click('#openPractice');
const practice = await waitFor(() => modal('해보기 · 건반'), '해보기 건반 열기');
const keys = [...practice.querySelectorAll('.practice-keyboard button')];
assert.equal(keys.length, 13);
assert.ok(keys.every(key => key.textContent === '' && key.hasAttribute('aria-label')), '음이름을 숨기는 문제에는 이름을 화면에 표시하지 않습니다.');
practice.querySelector('[aria-label="D4"]').click();
assert.match(practice.querySelector('[role="status"]').textContent, /그 음이 아니에요/);
practice.querySelector('[aria-label="G4"]').click();
assert.equal(practice.querySelector('[role="status"]').textContent, '맞아요!');
button(practice, '다시 시도').click();
assert.equal(practice.querySelector('[role="status"]').textContent, '');
assert.equal(document.activeElement.getAttribute('aria-label'), 'C4');
button(practice, '닫기').click();
await waitFor(() => !modal('해보기 · 건반'), '해보기 창 닫기');
assert.equal(document.activeElement.id, 'stage');
click('#openPractice');
const reopened = await waitFor(() => modal('해보기 · 건반'), '해보기 다시 열기');
button(reopened, '다음 장면').click();
await waitFor(() => titleIs('음이름과 계이름 · 7단계'), '해보기에서 수업의 다음 장면 열기');
await waitFor(async () => (await store.getSetting('lastSceneId')) === 'builtin:lesson-names-and-solfege-s7', '공유 전에 마지막 수업 장면 기억');
const { makeShareLink } = await import('../src/share-link.js');
const savedForShare = await store.getScene(stored.id);
const sceneIdsBeforeShare = (await store.listScenes()).map(scene => scene.id);
const shareHash = title => new URL(makeShareLink({
  baseUrl: 'https://classroom.example/',
  scene: { ...savedForShare, title },
})).hash;
function changeHash(hash) {
  // Setting the location fragment emits a real HashChangeEvent in Happy DOM.
  const change = new Promise(resolve => window.addEventListener('hashchange', resolve, { once: true }));
  window.location.hash = hash;
  return change;
}
await changeHash(shareHash('첫 공유 장면'));
await waitFor(() => titleIs('공유 미리보기 · 첫 공유 장면') && modal('공유 자료'), '첫 링크에서 공유 장면 미리보기');
assert.equal(await store.getSetting('lastSceneId'), 'builtin:lesson-names-and-solfege-s7');
assert.deepEqual((await store.listScenes()).map(scene => scene.id), sceneIdsBeforeShare, '미리보기는 공유 장면을 저장하지 않습니다.');

await changeHash(shareHash('두 번째 공유 장면'));
await waitFor(() => titleIs('공유 미리보기 · 두 번째 공유 장면') &&
  document.querySelectorAll('dialog[aria-label="공유 자료"]').length === 1, '두 번째 링크에서 기존 공유 창 정리');
assert.match(modal('공유 자료').textContent, /두 번째 공유 장면/);
assert.equal(await store.getSetting('lastSceneId'), 'builtin:lesson-names-and-solfege-s7');

await changeHash('');
await waitFor(() => titleIs('음이름과 계이름 · 7단계') && !element('dialog[aria-label="공유 자료"]'), '공유 주소 제거 뒤 수업과 포커스 복구');
assert.equal(element('#returnPreview').hidden, true);
assert.equal(element('#sceneMenu').inert, false);
assert.equal(document.activeElement.id, 'stage');
assert.deepEqual((await store.listScenes()).map(scene => scene.id), sceneIdsBeforeShare);
assert.equal(element('#errorNotice').hidden, true);

click('#createFromTopic');
const picker = await waitFor(()=>modal('주제로 만들기'),'주제 카드 선택창');
assert.equal(document.activeElement.dataset.cardId,'names-and-solfege');
picker.querySelector('[data-card-id="major-scale"]').click();
field(picker.querySelector('[name="key"]'),'G:major','change');
await waitFor(()=>!button(picker,'장면 만들기').disabled,'사장조 장면 미리보기');
assert.match(picker.querySelector('[aria-label="만들 내용"]').textContent,/사장조/);
button(picker,'장면 만들기').click();
await waitFor(editor,'카드를 새 편집 초안으로 열기');
assert.equal(editor().querySelector('#ed-title').value,'사장조 음계');
assert.match(editor().textContent,/주제 카드로 만든 장면/);
field(editor().querySelector('#ed-question'),'사장조의 음계를 들어 보세요.');
button(editor(),'장면 저장').click();
await waitFor(()=>!editor()&&titleIs('사장조 음계'),'주제 카드 저장');
const cardScene=(await store.listScenes()).find(scene=>scene.title==='사장조 음계');
assert.equal(cardScene.templateVersion,3);
assert.equal(cardScene.content.source.cardId,'major-scale');
assert.equal(cardScene.question,'사장조의 음계를 들어 보세요.');
assert.equal(cardScene.content.key.tonic,'G');

click('#createFromTopic');
const lessonPicker=await waitFor(()=>modal('주제로 만들기'),'주제 수업 선택창');
lessonPicker.querySelector('[data-card-id="key-signature"]').click();
field(lessonPicker.querySelector('[name="key"]'),'G:major','change');
field(lessonPicker.querySelector('[name="unit"]'),'lesson','change');
button(lessonPicker,'수업 만들기').click();
await waitFor(()=>lessonPicker.textContent.includes('수업을 만들었습니다'),'조표 수업 원자 저장 결과');
button(lessonPicker,'수업 열기').click();
await waitFor(()=>titleIs('사장조 조표 · 1단계'),'생성 수업 열기');
assert.match(element('#progress').textContent,/^1\/5 · 0 \/ 1/);
const generatedLesson=(await store.listLessons()).find(lesson=>lesson.title.includes('사장조 조표'));
assert.equal(generatedLesson.sceneIds.length,5);
const generatedScenes=await Promise.all(generatedLesson.sceneIds.map(id=>store.getScene(id)));
assert.equal(new Set(generatedScenes.map(scene=>scene.renderSeed)).size,1);
assert.ok(generatedScenes.every(scene=>!scene.importInfo));

store.close();
console.log('앱 초기화, 템플릿 확인, 미리보기, 안전한 초안 복구, 수업·건반, 링크 공유 통합 시험 통과');
