import { createSceneV2, upgradeSceneV1, downgradeSceneV2 } from './scene-model.js';
import { buildDocumentScene, checkDocumentLayout, setTextFontAvailability } from './scene.js';
import {
  openSceneStorage, makeScenePackage, makeDraftPackage, recoverImportedDraft,
  validatePackage, validateBackupSet,
} from './scene-storage.js';
import { splitBackupScenes } from './backup-chunks.js';
import { parseImportedSettings } from './import-settings.js';
import { openSceneEditor } from './scene-editor.js';
import { openSceneList } from './ui/scene-list.js';
import { confirmAction } from './ui/confirm-dialog.js';
import { openDialog, makeButton, paragraph, checkbox } from './ui/dialog.js';
import { fileActions, exportDialog, safeFilename, koreanDate, copyText } from './ui/file-export.js';
import { ScenePlayer } from './player.js';
import { builtins } from './builtins.js';
import { builtInLessons, builtInLessonScenes, builtInLessonReview } from './lessons/index.js';
import { createPracticePlan, startPractice, judgePracticeTap } from './practice.js';
import { makeShareLink, readShareLink } from './share-link.js';
import { licenseNotices, appVersion } from './build-info.js';

const byId = id => document.getElementById(id);
const uuid = () => globalThis.crypto?.randomUUID?.() || 'local-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
const clientId = uuid();
const formFields = ['title', 'tags', 'question', 'caption', 'templateId', 'templateVersion', 'content', 'steps'];
const builtinScenes = [...builtins, ...builtInLessonScenes];
const builtinSceneIds = builtinScenes.map(scene => scene.id);
let storage = null;
let current = null;
let previewReturn = null;
let sharedSession = null;
let list = null;
let searchOrder = [];
let activeLesson = null;
let composing = false;
let sceneRequest = 0;
let navRequest = 0;
let persistQueue = Promise.resolve();
let statusTimer;
let fontAvailable = true;
let soundEnabled = true;
let pendingPractice = null;

function status(message, { error = false, persistent = false } = {}) {
  clearTimeout(statusTimer);
  if (error) {
    byId('errorText').textContent = message;
    byId('errorNotice').hidden = false;
  } else {
    byId('status').textContent = message;
    if (!persistent) statusTimer = setTimeout(() => { byId('status').textContent = ''; }, 5500);
  }
}

const report = error => status(error?.message || '작업을 완료하지 못했습니다.', { error: true });
const player = new ScenePlayer({
  stage: byId('stage'),
  frame: byId('frame'),
  board: byId('boardTex'),
  ink: byId('ink'),
  dust: byId('dust'),
  onChange: updatePlayback,
});

function updatePlayback({ state, phase, completed, total, stepLabel, message, canReplay, practiceCue, audioStatus }) {
  byId('playMode').value = player.mode;
  const step = stepLabel || current?.steps?.[Math.min(completed, total - 1)]?.label || '';
  const suffix = state === 'paused' ? ' · 일시정지' : phase === 'holding' ? ' · 대기' : '';
  const progressText = completed + ' / ' + total + '단계' + (step ? ' · ' + step : '') + suffix;
  if (byId('progress').textContent !== progressText) byId('progress').textContent = progressText;
  byId('previousStep').disabled = completed === 0 && !['playing', 'paused'].includes(state);
  byId('nextStep').disabled = state === 'completed';
  byId('togglePlay').disabled = state === 'completed';
  const label = state === 'playing' ? '일시정지' : state === 'paused' ? '계속' : '시작';
  byId('togglePlay').textContent = label;
  byId('togglePlay').setAttribute('aria-label', label);
  byId('replay').disabled = !canReplay;
  pendingPractice = practiceCue || completedPracticeCue(completed);
  byId('openPractice').hidden = !pendingPractice;
  byId('hearNotes').disabled = !(player.visibleNotes?.().length);
  byId('boardDescription').textContent = boardText();
  if (message && !/단계 판서 중|단계 완료$/.test(message)) status(message);

}

function completedPracticeCue(completed) {
  if (completed < 1) return null;
  const step = current?.steps?.[Math.max(0, completed - 1)];
  return step?.cue?.type === 'practice' ? step.cue : null;
}

function boardText() {
  if (!current) return '';
  const groups = (current.steps || []).slice(0, player.completed || 0).flatMap(step => step.groupIds);
  const descriptions = player.scene?.descriptions || player.scene?.groupDescriptions;
  const text = [];
  for (const id of groups) {
    const full = descriptions instanceof Map ? descriptions.get(id) : descriptions?.[id];
    if (full) text.push(full);
    else if (id === 'question') text.push(current.question);
    else if (id === 'caption') text.push(current.caption);
    else if (id.startsWith('body/')) text.push(current.content.blocks?.find(block => block.id === id.slice(5))?.text);
    else {
      const items = player.scene?.groups?.get(id) || [];
      const line = items.map(item => item.text || item.ch || (item.role === 'head' ? item.noteName : '') || '').join('');
      if (line) text.push(line);
    }
  }
  return text.filter(Boolean).join('\n') || '시작을 눌러 첫 단계를 판서하세요.';
}

function closeMenus() {
  document.querySelectorAll('.menu[open]').forEach(menu => { menu.open = false; });
}

function pauseForDialog() {
  player.pause();
  player.stopAudio?.();
  closeMenus();
}

function focusBoard() {
  byId('stage').focus();
}

async function remember(key, value) {
  if (!storage) return;
  persistQueue = persistQueue.catch(() => {}).then(() => storage.setSetting(key, value));
  try { await persistQueue; }
  catch { status('현재 화면은 열렸습니다. 마지막 선택을 기억하지 못했습니다.', { error: true }); }
}

async function sceneById(id) {
  return builtinScenes.find(scene => scene.id === id) || (storage ? storage.getScene(id) : null);
}

async function openDoc(doc, { rememberSelection = true } = {}) {
  if (!doc || doc.deletedAt) throw Error('열 수 있는 장면을 찾지 못했습니다.');
  const previous = current && { doc: current, snapshot: player.snapshot(), title: byId('sceneTitle').textContent };
  buildDocumentScene(doc, false);
  const candidate = structuredClone(doc);
  try {
    current = candidate;
    player.open(candidate);
    byId('sceneTitle').textContent = candidate.title;
    byId('sceneTitle').title = candidate.title;
    byId('editScene').textContent = candidate.origin === 'builtin' ? '복제해서 편집' : '내용 편집';
  } catch (error) {
    if (previous) {
      current = previous.doc;
      player.restore(previous.snapshot);
      byId('sceneTitle').textContent = previous.title;
    }
    throw error;
  }
  if (rememberSelection && !previewReturn) await remember('lastSceneId', candidate.id);
  refreshNavigation();
}

async function selectScene(id, { orderedIds, lesson, rememberSelection = true } = {}) {
  if (previewReturn) return;
  const request = ++sceneRequest;
  const doc = await sceneById(id);
  if (request !== sceneRequest || previewReturn) return;
  const oldOrder = searchOrder;
  const oldLesson = activeLesson;
  try {
    if (orderedIds) searchOrder = [...orderedIds];
    if (lesson !== undefined) activeLesson = lesson;
    await openDoc(doc, { rememberSelection });
    if (request !== sceneRequest) return;
    if (lesson !== undefined) await remember('activeLessonId', lesson?.id || null);
    return true;
  } catch (error) {
    searchOrder = oldOrder;
    activeLesson = oldLesson;
    report(error);
    return false;
  }
}

async function navigation() {
  const users = storage ? await storage.listScenes() : [];
  const all = [...builtinScenes, ...users];
  const bySceneId = new Map(all.map(scene => [scene.id, scene]));
  const fallback = [...builtins.map(scene => scene.id), ...users.map(scene => scene.id)];
  const source = activeLesson?.sceneIds || (searchOrder.includes(current?.id) ? searchOrder : fallback);
  const ids = source.filter(id => bySceneId.has(id));
  return { ids, all: bySceneId };
}

async function refreshNavigation() {
  if (sharedSession) {
    byId('previousScene').disabled = sharedSession.index <= 0;
    byId('nextScene').disabled = sharedSession.index >= sharedSession.scenes.length - 1;
    return;
  }
  const request = ++navRequest;
  try {
    const { ids } = await navigation();
    if (request !== navRequest) return;
    const index = ids.indexOf(current?.id);
    byId('previousScene').disabled = !!previewReturn || index <= 0;
    byId('nextScene').disabled = !!previewReturn || index < 0 || index >= ids.length - 1;
    if (activeLesson && index >= 0) byId('sceneTitle').title = activeLesson.title + ' · ' + (index + 1) + '/' + ids.length;
  } catch (error) { report(error); }
}

async function changeScene(delta) {
  if (sharedSession) {
    const next = sharedSession.index + delta;
    if (next < 0 || next >= sharedSession.scenes.length) return;
    const scene = sharedSession.scenes[next];
    await openDoc(scene, { rememberSelection: false });
    sharedSession.index = next;
    byId('sceneTitle').textContent = '공유 미리보기 · ' + scene.title;
    refreshNavigation();
    return;
  }
  if (previewReturn) return;
  const request = sceneRequest;
  const sourceId = current?.id;
  const { ids } = await navigation();
  if (previewReturn || request !== sceneRequest || current?.id !== sourceId) return;
  const index = ids.indexOf(current?.id);
  if (index < 0) {
    await selectScene(builtins[0].id, { lesson: null, orderedIds: [] });
    return;
  }
  if (index + delta < 0 || index + delta >= ids.length) {
    if (activeLesson && delta > 0) status('수업의 마지막 장면입니다.');
    return;
  }
  await selectScene(ids[index + delta]);
}

function draftRecord(snapshot, baseRevision, isNew, draftId) {
  return {
    draftId, sceneId: isNew ? null : snapshot.id, baseRevision: isNew ? null : baseRevision,
    editorVersion: snapshot.schemaVersion || 1, updatedAt: new Date().toISOString(),
    formData: Object.fromEntries(formFields.map(key => [key, structuredClone(snapshot[key])])), clientId,
  };
}

function cloneDoc(source) {
  const copy = structuredClone(source);
  copy.id = uuid();
  copy.origin = 'user';
  copy.revision = 1;
  copy.deletedAt = null;
  copy.title = source.title.slice(0, 34) + ' 사본';
  copy.createdAt = copy.updatedAt = new Date().toISOString();
  delete copy.importInfo;
  return copy;
}

function layoutCheck(scene) {
  const feedback = checkDocumentLayout(scene);
  if (feedback.errors.length) throw Error(feedback.errors.map(error => error.message).join(' '));
  return feedback;
}

async function editDoc(original, isNew = false, allowTemplateChange = false, recoveredDraft = null) {
  if (previewReturn) return;
  pauseForDialog();
  ++sceneRequest;
  const lessonSnapshot = player.snapshot();
  const lessonDoc = structuredClone(current);
  const lessonOrder = [...searchOrder];
  const lesson = activeLesson;
  let doc = upgradeSceneV1(original);
  let baseRevision = isNew ? null : original.revision;
  let saved = false;
  let cleanupDraft = recoveredDraft;
  let draftId = clientId + ':' + doc.id;
  if (!recoveredDraft && storage) {
    const candidates = await storage.listDrafts({ sceneId: original.id });
    if (candidates.length) {
      const latest = candidates.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
      if (await confirmAction({ title: '저장하지 않은 초안', message: '이 장면의 초안을 이어서 편집할까요?', confirmLabel: '이어서 편집', cancelLabel: '저장본 편집' })) {
        recoveredDraft = cleanupDraft = latest;
      }
    }
  }
  if (recoveredDraft) {
    Object.assign(doc, structuredClone(recoveredDraft.formData));
    doc.schemaVersion = recoveredDraft.editorVersion || 1;
    doc = upgradeSceneV1(doc);
    const stale = !isNew && recoveredDraft.baseRevision !== original.revision;
    if (stale) { doc = cloneDoc(doc); isNew = true; }
    baseRevision = isNew ? null : recoveredDraft.baseRevision;
    draftId = clientId + ':' + doc.id;
  }
  const restorePreview = returnToEditor => {
    previewReturn = null;
    byId('returnPreview').hidden = true;
    byId('sceneMenu').inert = false;
    current = lessonDoc;
    searchOrder = lessonOrder;
    activeLesson = lesson;
    player.restore(lessonSnapshot);
    byId('sceneTitle').textContent = lessonDoc.title;
    byId('sceneTitle').title = lessonDoc.title;
    returnToEditor();
    refreshNavigation();
  };
  openSceneEditor({
    scene: doc, isNew, allowTemplateChange, preserveInitialDraft: !!recoveredDraft, fontAvailable,
    getLayoutFeedback: checkDocumentLayout,
    onSave: async snapshot => {
      const feedback = layoutCheck(snapshot);
      if (!storage) throw Error('저장소를 사용할 수 없습니다. 초안 파일을 보관해 주세요.');
      let result;
      try {
        result = await storage.saveScene(snapshot, { expectedRevision: baseRevision, draftId, cleanupDraft });
      } catch (error) {
        if (error.code !== 'conflict') throw error;
        const accepted = await confirmAction({
          title: '다른 탭에서 원본 변경', message: '현재 내용을 새 장면 사본으로 저장할까요?',
          confirmLabel: '사본 저장', cancelLabel: '편집 계속',
        });
        if (!accepted) throw Error('초안을 유지했습니다. 사본 저장 또는 초안 파일을 사용할 수 있습니다.');
        result = await storage.saveScene(cloneDoc(snapshot), { expectedRevision: null, draftId, cleanupDraft });
      }
      saved = true;
      searchOrder = [];
      activeLesson = null;
      await remember('activeLessonId', null);
      await openDoc(result);
      status('장면을 저장했습니다.' + (feedback.warnings.length ? ' 세로 화면 배치 안내를 확인해 주세요.' : ''));
      updateDraftCount();
    },
    onDraft: async snapshot => {
      if (!storage) throw Error('저장소를 사용할 수 없습니다. 초안을 파일로 보관해 주세요.');
      await storage.saveDraft(draftRecord(snapshot, baseRevision, isNew, draftId));
    },
    onDiscard: async () => { if (storage) await storage.deleteDraft(draftId); },
    onExportDraft: snapshot => exportDialog(makeDraftPackage(draftRecord(snapshot, baseRevision, isNew, draftId)), safeFilename(snapshot.title) + '_초안.json'),
    onPreview: async (snapshot, { startStep, returnToEditor }) => {
      layoutCheck(snapshot);
      ++sceneRequest;
      previewReturn = () => restorePreview(returnToEditor);
      byId('sceneMenu').inert = true;
      byId('returnPreview').hidden = false;
      byId('returnPreview').textContent = '미리보기 종료 · 편집으로 돌아가기';
      try {
        await openDoc(snapshot, { rememberSelection: false });
        player.previewFrom(startStep);
        byId('sceneTitle').textContent = '미리보기 · 저장 전 · ' + snapshot.title;
        byId('returnPreview').focus();
      } catch (error) {
        restorePreview(returnToEditor);
        throw error;
      }
    },
    onClose: async () => {
      if (previewReturn) {
        previewReturn = null;
        byId('sceneMenu').inert = false;
        byId('returnPreview').hidden = true;
      }
      if (!saved) {
        current = lessonDoc;
        player.restore(lessonSnapshot);
        byId('sceneTitle').textContent = lessonDoc.title;
        searchOrder = lessonOrder;
        activeLesson = lesson;
      }
      updateDraftCount();
      refreshNavigation();
      focusBoard();
    },
  });
}

function exportScene(scene) {
  const view = openDialog('파일 내보내기');
  const filename = safeFilename(scene.title) + '_' + koreanDate() + '.json';
  view.content.append(paragraph(filename), fileActions(makeScenePackage([scene]), filename));
  const legacy = downgradeSceneV2(scene);
  if (legacy && scene.schemaVersion === 2) {
    const name = safeFilename(scene.title) + '_v1.json';
    view.content.append(paragraph('이 장면은 이전 앱용 v1 형식으로도 보관할 수 있습니다.'), makeButton('이전 앱용 v1 파일', () => exportDialog(makeScenePackage([legacy], { version: 1 }), name)));
  }
}

async function openList(query = '') {
  if (previewReturn) return;
  pauseForDialog();
  list = openSceneList({
    query,
    data: async () => {
      const snapshot = storage ? await storage.listSceneSnapshot({ includeDeleted: true }) : { scenes: [], orderRevision: 0 };
      return { builtins, scenes: snapshot.scenes, order: snapshot.scenes.filter(scene => !scene.deletedAt).map(scene => scene.id), orderRevision: snapshot.orderRevision };
    },
    onOpen: (scene, ids) => selectScene(scene.id, { orderedIds: ids, lesson: null }),
    onEdit: scene => { setTimeout(() => editDoc(scene).catch(report), 0); },
    onClone: scene => { setTimeout(() => editDoc(cloneDoc(scene), true).catch(report), 0); },
    onNew: () => { setTimeout(() => editDoc(createSceneV2(), true, true).catch(report), 0); },
    onDelete: async scene => {
      if (!storage) throw Error('저장소를 사용할 수 없습니다.');
      await storage.setDeleted(scene.id, scene.revision, true);
      if (current?.id === scene.id) await selectScene(builtins[0].id, { lesson: null, orderedIds: [] });
      refreshNavigation();
    },
    onRestore: scene => storage.setDeleted(scene.id, scene.revision, false),
    onPurge: async scene => {
      try { await storage.permanentlyDelete(scene.id, scene.revision); }
      catch (error) {
        if (error.code !== 'referenced') throw error;
        if (error.emptyLessons?.length) throw Error('이 장면만 있는 수업이 있습니다. 먼저 수업에 다른 장면을 추가해 주세요.');
        const accepted = await confirmAction({
          title: '수업에서도 장면 참조 제거',
          message: error.lessons.map(lesson => lesson.title).join(', ') + ' 수업이 이 장면을 사용합니다. 수업의 참조도 함께 제거할까요?',
          confirmLabel: '참조와 장면 삭제', destructive: true,
        });
        if (accepted) await storage.permanentlyDelete(scene.id, scene.revision, { removeFromLessons: true, expectedLessons: error.lessons });
      }
      refreshNavigation();
    },
    onReorder: (ids, orderRevision) => storage.reorderScenes(ids, { expectedOrderRevision: orderRevision }),
    onImport: () => byId('fileImport').click(), onExport: exportScene, onBackup: exportAll,
    onClose: () => { list = null; focusBoard(); },
  });
}

async function updateDraftCount() {
  if (!storage) return;
  try {
    const drafts = await storage.listDrafts();
    byId('recoverDraft').textContent = '초안 복구' + (drafts.length ? ' (' + drafts.length + ')' : '');
  } catch { /* The storage status screen retains the error path. */ }
}

async function recoverDraft() {
  pauseForDialog();
  if (!storage) throw Error('저장소를 사용할 수 없습니다.');
  const drafts = await storage.listDrafts();
  const view = openDialog('저장되지 않은 초안');
  view.content.append(paragraph(drafts.length ? '이어서 편집할 초안을 선택하세요.' : '복구할 초안이 없습니다.'));
  for (const draft of drafts.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))) {
    const row = document.createElement('div');
    row.className = 'draft-row';
    const label = document.createElement('span');
    label.textContent = (draft.formData.title || '제목 없는 초안') + ' · ' + new Date(draft.updatedAt).toLocaleString('ko-KR');
    row.append(label, makeButton('이어서 편집', async () => {
      const source = draft.sceneId && await storage.getScene(draft.sceneId);
      const sameRevision = source && !source.deletedAt && source.revision === draft.baseRevision;
      let doc = sameRevision ? source : createSceneV2(draft.formData.templateId);
      const recovered = structuredClone(draft);
      Object.assign(doc, structuredClone(draft.formData));
      doc.schemaVersion = draft.editorVersion;
      view.close();
      await editDoc(doc, !sameRevision, false, recovered);
      if (!sameRevision && draft.sceneId) status('원본이 변경되어 초안을 새 장면으로 복구했습니다.');
    }), makeButton('파일로 저장', () => exportDialog(makeDraftPackage(draft), safeFilename(draft.formData.title) + '_초안.json')),
    makeButton('초안 삭제', async () => {
      if (!await confirmAction({ title: '초안 삭제', message: '선택한 초안을 삭제할까요?', destructive: true, confirmLabel: '삭제' })) return;
      await storage.deleteDraft(draft.draftId, { expected: draft });
      row.remove();
      updateDraftCount();
    }));
    view.content.append(row);
  }
}

async function exportAll() {
  pauseForDialog();
  if (!storage) throw Error('저장소를 사용할 수 없습니다.');
  const view = openDialog('전체 백업');
  const trash = checkbox('휴지통 포함');
  const settings = checkbox('보기·소리 설정 포함');
  const lessons = checkbox('수업 포함', true);
  view.content.append(trash.row, lessons.row, settings.row, paragraph('초안은 포함되지 않습니다. 초안 복구에서 별도로 내보낼 수 있습니다.'));
  const results = document.createElement('div');
  view.content.append(results);
  view.actions.prepend(makeButton('백업 파일 준비', async () => {
    const scope = { includeDeleted: trash.input.checked, includeSettings: settings.input.checked, includeLessons: lessons.input.checked };
    const snapshot = await storage.getBackupSnapshot(scope);
    const parts = splitBackupScenes(snapshot.scenes, snapshot.settings, {
      lessons: snapshot.lessons, builtinSceneIds, exportedAt: snapshot.snapshotAt,
    });
    results.replaceChildren(paragraph(snapshot.scenes.length + '개 장면 · ' + snapshot.lessons.length + '개 수업 · ' + parts.length + '개 파일을 준비했습니다.'));
    const requested = new Set();
    const confirm = makeButton('모든 백업 파일을 보관했습니다', async () => {
      await storage.confirmBackup({
        scope,
        snapshotAt: snapshot.snapshotAt,
      });
      status('전체 백업 보관 날짜를 기록했습니다.');
      view.close();
    });
    confirm.disabled = true;
    parts.forEach((part, index) => {
      const filename = '음악칠판_전체백업_' + koreanDate() + '_' + String(index + 1).padStart(2, '0') + '-of-' + String(parts.length).padStart(2, '0') + '.json';
      results.append(paragraph(filename), fileActions(part, filename, {
        onRequested: () => { requested.add(index); confirm.disabled = requested.size !== parts.length; },
      }));
    });
    results.append(confirm);
  }));
}

async function importFiles(files) {
  if (!files?.length) return;
  pauseForDialog();
  const texts = [];
  for (const file of files) {
    if (file.size > 5 * 1024 * 1024) throw Error('파일은 각각 5 MiB 이하여야 합니다.');
    texts.push(await file.text());
  }
  if (texts.length === 1) {
    const pkg = validatePackage(texts[0], { builtinSceneIds });
    if (pkg.kind === 'draft') {
      const draft = recoverImportedDraft(pkg, clientId);
      const view = openDialog('초안 파일 가져오기');
      view.content.append(paragraph(draft.formData.title || '제목 없는 초안'), fileActions(pkg, '음악칠판_초안.json'));
      view.actions.prepend(makeButton('초안 편집', async () => {
        if (storage) await storage.saveDraft(draft);
        const doc = createSceneV2(draft.formData.templateId);
        Object.assign(doc, draft.formData);
        doc.schemaVersion = draft.editorVersion;
        view.close();
        await editDoc(doc, true, false, draft);
        status('파일의 초안을 편집기로 열었습니다.');
      }));
      return;
    }
  }
  const parsed = validateBackupSet(texts, { builtinSceneIds });
  const view = openDialog('파일 가져오기');
  view.content.append(paragraph(files.map(file => file.name).join(', ')));
  view.content.append(paragraph(parsed.scenes.length + '개 장면 · ' + parsed.lessons.length + '개 수업을 새 사본으로 가져옵니다.'));
  for (const scene of parsed.scenes.slice(0, 5)) view.content.append(paragraph(scene.title));
  if (!parsed.complete) view.content.append(paragraph('전체 백업의 일부 파일입니다. 선택한 파일에 담긴 자료만 복원합니다.'));
  const includeSettings = checkbox('백업에 포함된 보기·소리 설정 적용', false);
  const settingsAvailable = parsed.settings && parseImportedSettings(parsed.settings).available;
  if (settingsAvailable) view.content.append(includeSettings.row);
  if (!storage) {
    view.content.append(paragraph('저장소를 사용할 수 없습니다. 검증한 파일은 아래에서 다시 보관할 수 있습니다.'));
    parsed.packages.forEach((pkg, index) => view.content.append(fileActions(pkg, '음악칠판_보관_' + (index + 1) + '.json')));
    return;
  }
  view.actions.prepend(makeButton('새 사본으로 가져오기', async () => {
    const imported = await storage.importBundles(texts, { includeSettings: includeSettings.input.checked, builtinSceneIds });
    if (includeSettings.input.checked && parsed.settings) applySettings(parseImportedSettings(parsed.settings).settings);
    view.close();
    searchOrder = [];
    await refreshNavigation();
    updateDraftCount();
    list?.refresh();
    status(imported.scenes.length + '개 장면과 ' + imported.lessons.length + '개 수업을 가져왔습니다.');
  }));
}

async function storageStatus() {
  pauseForDialog();
  const view = openDialog('저장 상태');
  if (!storage) {
    view.content.append(paragraph('브라우저 저장소를 사용할 수 없습니다. 입력 중인 자료는 초안 파일로 보관하세요.'));
    return;
  }
  const state = await storage.getBackupStatus();
  const detail = document.createElement('p');
  view.content.append(detail);
  async function persisted() {
    try {
      const granted = await navigator.storage?.persisted?.();
      detail.textContent = granted === true ? '저장 유지 요청이 승인된 브라우저입니다.' : granted === false ? '기본 저장 상태입니다. 백업 파일을 함께 보관하세요.' : '이 브라우저는 저장 유지 상태를 제공하지 않습니다.';
    } catch { detail.textContent = '저장 유지 상태를 조회하지 못했습니다.'; }
  }
  await persisted();
  if (navigator.storage?.persist) view.content.append(makeButton('저장 유지 요청', async () => {
    const accepted = await navigator.storage.persist();
    await persisted();
    if (!accepted) detail.textContent = '저장 유지 요청이 승인되지 않았습니다. 파일 백업을 보관할 수 있습니다.';
  }));
  view.content.append(paragraph(state.lastConfirmedBackupAt ? '최근 전체 백업 보관 확인 · ' + new Date(state.lastConfirmedBackupAt).toLocaleString('ko-KR') : '전체 백업 보관 확인 기록이 없습니다.'));
  if (state.lastConfirmedBackupAt) view.content.append(paragraph('백업 후 ' + Math.max(0, Math.floor((Date.now() - Date.parse(state.lastConfirmedBackupAt)) / 86400000)) + '일이 지났습니다.'));
  view.content.append(paragraph('브라우저 데이터 삭제와 기기 저장 정책에 따라 자료가 지워질 수 있습니다.'));
  view.actions.prepend(makeButton('전체 백업', () => { view.close(); return exportAll(); }));
}

async function shareCurrent() {
  if (previewReturn) return;
  pauseForDialog();
  const view = openDialog(activeLesson ? '장면·수업 링크 공유' : '장면 링크 공유');
  view.content.append(paragraph('링크를 받은 사람은 담긴 내용을 볼 수 있습니다. 링크에 포함된 자료는 만료하거나 회수할 수 없습니다.'));
  async function display(kind) {
    try {
      const options = { baseUrl: location.origin + location.pathname };
      if (kind === 'lesson') {
        options.lesson = activeLesson;
        options.scenes = await Promise.all(activeLesson.sceneIds.map(sceneById));
      } else options.scene = current;
      const url = makeShareLink(options);
      const output = document.createElement('textarea');
      output.className = 'copy-data';
      output.readOnly = true;
      output.value = url;
      view.content.append(paragraph(kind === 'lesson' ? activeLesson.title : current.title), output, makeButton('링크 복사', () => copyText(url, '링크 복사')));
      output.focus();
      output.select();
    } catch (error) {
      view.error.textContent = error.message + ' 파일로 내보내 자료를 옮길 수 있습니다.';
      view.content.append(makeButton('현재 장면 파일', () => exportScene(current)));
      if (activeLesson) view.content.append(makeButton('수업 파일', () => exportLesson(activeLesson)));
    }
  }
  if (activeLesson) {
    view.content.append(makeButton('현재 장면 링크', () => display('scene')), makeButton('수업 링크', () => display('lesson')));
  } else await display('scene');
}

async function openSharedLink(shared) {
  if (!shared?.scenes?.length) return;
  pauseForDialog();
  ++sceneRequest;
  const original = current;
  const snapshot = player.snapshot();
  const order = [...searchOrder];
  let index = 0;
  let sharedDialog = null;
  sharedSession = { scenes: shared.scenes, index: 0 };
  previewReturn = () => {
    sharedDialog?.close();
    sharedSession = null;
    previewReturn = null;
    byId('sceneMenu').inert = false;
    byId('returnPreview').hidden = true;
    current = original;
    searchOrder = order;
    player.restore(snapshot);
    byId('sceneTitle').textContent = original.title;
    refreshNavigation();
    focusBoard();
  };
  byId('sceneMenu').inert = true;
  byId('returnPreview').hidden = false;
  byId('returnPreview').textContent = '공유 미리보기 닫기';
  try { await openDoc(shared.scenes[index], { rememberSelection: false }); }
  catch (error) { previewReturn(); throw error; }
  byId('sceneTitle').textContent = '공유 미리보기 · ' + (shared.lesson?.title || current.title);
  const view = sharedDialog = openDialog('공유 자료');
  view.content.append(paragraph((shared.lesson?.title || current.title) + ' · ' + shared.scenes.length + '개 장면'));
  if (shared.scenes.length > 1) {
    const previous = makeButton('앞 장면 보기', () => show(index - 1));
    const next = makeButton('다음 장면 보기', () => show(index + 1));
    view.content.append(previous, next);
    async function show(value) {
      if (value < 0 || value >= shared.scenes.length) return;
      index = value;
      sharedSession.index = index;
      await openDoc(shared.scenes[index], { rememberSelection: false });
      byId('sceneTitle').textContent = '공유 미리보기 · ' + current.title;
    }
  }
  view.actions.prepend(makeButton('내 장면에 사본 저장', async () => {
    if (!storage) throw Error('저장소를 사용할 수 없습니다. 파일로 보관할 수 있습니다.');
    const imported = await storage.importBundles([shared.bundle], { builtinSceneIds });
    status(imported.scenes.length + '개 장면을 사본으로 저장했습니다.');
    view.close();
  }));
  view.content.append(makeButton('파일로 보관', () => exportDialog(shared.bundle, '음악칠판_공유자료.json')));
}

async function allLessons() {
  return [...builtInLessons, ...(storage ? await storage.listLessons() : [])];
}

async function openLessonManager() {
  if (previewReturn) return;
  pauseForDialog();
  const view = openDialog('수업 열기·관리');
  const items = document.createElement('ul');
  items.className = 'lesson-grid';
  view.content.append(items);
  async function refresh() {
    items.replaceChildren();
    const lessons = await allLessons();
    for (const lesson of lessons) {
      const row = document.createElement('li');
      const title = document.createElement('strong');
      title.textContent = lesson.title;
      const review = builtInLessonReview[lesson.id];
      row.append(title, paragraph((lesson.grade || '미지정') + ' · ' + lesson.sceneIds.length + '장면' + (review ? ' · AI 초안 · 교사 검토 전' : ''), 'lesson-meta'));
      row.append(makeButton('수업 열기', async () => {
        const docs = await Promise.all(lesson.sceneIds.map(sceneById));
        if (docs.some(doc => !doc || doc.deletedAt)) throw Error('수업에 없는 장면 또는 휴지통 장면이 있습니다. 수업 편집에서 바꾸거나 복원해 주세요.');
        view.close();
        if (await selectScene(lesson.sceneIds[0], { lesson, orderedIds: [] })) status(lesson.title + ' 수업을 열었습니다.');
      }), makeButton('수업 파일', () => exportLesson(lesson)), makeButton(lesson.origin === 'builtin' ? '복제해서 편집' : '편집', () => editLesson(lesson, refresh)));
      if (lesson.origin !== 'builtin') row.append(makeButton('수업 삭제', async () => {
        if (!await confirmAction({ title: '수업 삭제', message: '수업 목록을 삭제할까요? 구성 장면은 내 장면에 남습니다.', confirmLabel: '삭제', destructive: true })) return;
        await storage.deleteLesson(lesson.id, lesson.revision);
        if (activeLesson?.id === lesson.id) activeLesson = null;
        await refresh();
      }));
      items.append(row);
    }
  }
  view.actions.prepend(makeButton('새 수업', () => editLesson(null, refresh)));
  await refresh();
}

async function exportLesson(lesson) {
  const docs = await Promise.all(lesson.sceneIds.map(sceneById));
  if (docs.some(doc => !doc || doc.deletedAt)) throw Error('수업의 장면을 모두 찾을 수 없습니다. 먼저 수업 구성을 확인해 주세요.');
  const pkg = makeScenePackage(docs.filter(doc => doc.origin !== 'builtin'), { lessons: [lesson], builtinSceneIds, version: 2 });
  exportDialog(pkg, safeFilename(lesson.title) + '_' + koreanDate() + '.json');
}

async function editLesson(source, onSaved) {
  if (!storage) throw Error('수업을 저장할 수 없습니다. 브라우저 저장 설정을 확인해 주세요.');
  const users = await storage.listScenes();
  const choices = [...builtinScenes, ...users];
  const lookup = new Map(choices.map(scene => [scene.id, scene]));
  const clone = source?.origin === 'builtin';
  const now = new Date().toISOString();
  const doc = source ? structuredClone(source) : {
    schemaVersion: 1, id: uuid(), revision: 1, origin: 'user', title: '새 수업', grade: '미지정',
    sceneIds: [], createdAt: now, updatedAt: now,
  };
  if (clone) { doc.id = uuid(); doc.origin = 'user'; doc.revision = 1; doc.title = doc.title.slice(0, 34) + ' 사본'; doc.createdAt = now; }
  const view = openDialog('수업 구성');
  const titleLabel = document.createElement('label');
  titleLabel.textContent = '수업 이름';
  const title = document.createElement('input');
  title.value = doc.title;
  title.maxLength = 40;
  titleLabel.append(title);
  const gradeLabel = document.createElement('label');
  gradeLabel.textContent = '학교급';
  const grade = document.createElement('select');
  for (const value of ['공통', '초5-6', '중1-3', '미지정']) {
    const option = document.createElement('option');
    option.value = option.textContent = value;
    grade.append(option);
  }
  grade.value = doc.grade;
  gradeLabel.append(grade);
  const select = document.createElement('select');
  select.setAttribute('aria-label', '추가할 장면');
  for (const scene of choices) {
    const option = document.createElement('option');
    option.value = scene.id;
    option.textContent = scene.title;
    select.append(option);
  }
  const rows = document.createElement('ol');
  rows.className = 'lesson-edit-list';
  function render() {
    rows.replaceChildren();
    doc.sceneIds.forEach((id, index) => {
      const row = document.createElement('li');
      const label = document.createElement('span');
      label.textContent = (index + 1) + '. ' + (lookup.get(id)?.title || '장면을 찾지 못함 · 복원 또는 교체 필요');
      const up = makeButton('위', () => { [doc.sceneIds[index - 1], doc.sceneIds[index]] = [id, doc.sceneIds[index - 1]]; render(); });
      const down = makeButton('아래', () => { [doc.sceneIds[index + 1], doc.sceneIds[index]] = [id, doc.sceneIds[index + 1]]; render(); });
      up.disabled = index === 0;
      down.disabled = index === doc.sceneIds.length - 1;
      row.append(label, up, down, makeButton('빼기', () => { doc.sceneIds.splice(index, 1); render(); }));
      rows.append(row);
    });
  }
  view.content.append(titleLabel, gradeLabel, select, makeButton('장면 추가', () => {
    if (doc.sceneIds.length >= 50) throw Error('한 수업에는 최대 50장면을 담을 수 있습니다.');
    if (!doc.sceneIds.includes(select.value)) doc.sceneIds.push(select.value);
    render();
  }), rows);
  render();
  view.actions.prepend(makeButton('수업 저장', async () => {
    doc.title = title.value.trim();
    doc.grade = grade.value;
    await storage.saveLesson(doc, { expectedRevision: source && !clone ? source.revision : null, builtinSceneIds });
    view.close();
    await onSaved?.();
    status('수업을 저장했습니다.');
  }));
}

function openPractice() {
  const cue = pendingPractice;
  const plan = createPracticePlan(current, cue);
  if (!plan) throw Error('현재 단계에 해보기 문제가 없습니다.');
  pauseForDialog();
  const view = openDialog('해보기 · 건반', { onClose: () => { player.stopAudio?.(); focusBoard(); } });
  view.content.append(paragraph(cue.order === 'sequential' ? '칠판의 음을 차례대로 눌러 보세요.' : '칠판의 구성음을 찾아 눌러 보세요.'));
  const feedback = paragraph('');
  feedback.setAttribute('role', 'status');
  const keyboard = document.createElement('div');
  keyboard.className = 'practice-keyboard';
  keyboard.setAttribute('role', 'group');
  keyboard.setAttribute('aria-label', '연습 건반');
  let progress = startPractice(plan);
  const keys = [];
  for (const [index, key] of plan.keys.entries()) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = key.white ? 'white' : 'black';
    button.textContent = key.label || '';
    button.setAttribute('aria-label', key.name + (key.label ? ' ' + key.label : ''));
    button.tabIndex = index === 0 ? 0 : -1;
    button.onclick = () => {
      player.playNote?.(key.midi);
      progress = judgePracticeTap(plan, progress, key.midi);
      feedback.textContent = progress.message;
    };
    button.onkeydown = event => {
      if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      let next = index + (event.key === 'ArrowRight' ? 1 : -1);
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = keys.length - 1;
      next = Math.max(0, Math.min(keys.length - 1, next));
      keys.forEach((item, i) => { item.tabIndex = i === next ? 0 : -1; });
      keys[next].focus();
    };
    keys.push(button);
    keyboard.append(button);
  }
  view.content.append(keyboard, feedback);
  view.actions.prepend(makeButton('다시 시도', () => { progress = startPractice(plan); feedback.textContent = ''; keys[0]?.focus(); }),
    makeButton(player.state === 'completed' ? (activeLesson ? '다음 장면' : '칠판으로 돌아가기') : '다음 단계', async () => {
      view.close();
      if (player.state !== 'completed') player.next();
      else if (activeLesson) await changeScene(1);
    }));
  keys[0]?.focus();
}

function applySettings(settings) {
  for (const [key, value] of Object.entries(settings.viewOptions || {})) player.setOption(key, value);
  if (settings.playMode) player.mode = settings.playMode;
  if (typeof settings.soundEnabled === 'boolean') soundEnabled = settings.soundEnabled;
  player.setAudioEnabled(soundEnabled);
  byId('method').value = player.opts.method;
  byId('playMode').value = player.mode;
  syncOptions();
}

function syncOptions() {
  document.querySelectorAll('.seg').forEach(segment => {
    segment.querySelectorAll('button').forEach(button => {
      button.setAttribute('aria-pressed', String(player.opts[segment.dataset.opt] === button.dataset.v));
    });
  });
  byId('soundToggle').textContent = soundEnabled ? '소리 켜짐' : '소리 꺼짐';
  byId('soundToggle').setAttribute('aria-pressed', String(soundEnabled));
}

function playbackCommand(command) {
  if (soundEnabled && (command === 'next' || (command === 'toggle' && player.state !== 'playing'))) {
    player.unlockFromGesture?.().then(ready => { if (!ready) status('소리를 재생하지 못했습니다. 다시 듣기에서 재시도할 수 있습니다.'); });
  }
  closeMenus();
  player[command]();
}

function bind(id, action, { close = true } = {}) {
  byId(id).addEventListener('click', async () => {
    if (close) closeMenus();
    try { await action(); }
    catch (error) { report(error); }
  });
}

bind('openScenes', () => openList());
bind('newScene', () => editDoc(createSceneV2(), true, true));
bind('duplicateScene', () => editDoc(cloneDoc(current), true));
bind('editScene', () => current.origin === 'builtin' ? editDoc(cloneDoc(current), true) : editDoc(current));
bind('recoverDraft', recoverDraft);
bind('exportScene', () => exportScene(current));
bind('exportAll', exportAll);
bind('importScenes', () => { pauseForDialog(); byId('fileImport').click(); });
bind('storageStatus', storageStatus);
bind('shareScene', shareCurrent);
bind('openLessons', openLessonManager);
bind('openPractice', openPractice);
bind('previousScene', () => changeScene(-1));
bind('nextScene', () => changeScene(1));
bind('nextStep', () => playbackCommand('next'));
bind('previousStep', () => playbackCommand('previous'));
bind('togglePlay', () => playbackCommand('toggle'));
bind('restart', () => playbackCommand('restart'));
bind('finish', () => playbackCommand('finish'));
bind('replay', () => player.replay());
bind('hearNotes', () => {
  pauseForDialog();
  const view = openDialog('보이는 음 듣기');
  const notes = player.visibleNotes();
  if (!notes.length) view.content.append(paragraph('아직 표시된 음이 없습니다.'));
  notes.forEach((note, index) => view.content.append(makeButton((index + 1) + ' · ' + note.pitch, () => player.playNote(note.midi))));
});
bind('readBoard', () => {
  pauseForDialog();
  const view = openDialog('칠판 내용');
  const text = paragraph(boardText());
  text.className = 'board-transcript';
  view.content.append(text);
});
bind('soundToggle', async () => {
  soundEnabled = !soundEnabled;
  player.setAudioEnabled(soundEnabled);
  if (soundEnabled) player.unlockFromGesture?.();
  syncOptions();
  await remember('soundEnabled', soundEnabled);
});
bind('returnPreview', () => {
  const go = previewReturn;
  ++sceneRequest;
  player.pause();
  player.stopAudio();
  go?.();
  byId('returnPreview').textContent = '미리보기 종료 · 편집으로 돌아가기';
});
bind('dismissError', () => { byId('errorNotice').hidden = true; });
bind('dismissBackup', async () => {
  await storage?.dismissBackupReminder();
  byId('dismissBackup').hidden = true;
  byId('status').textContent = '';
});
bind('fontLicenses', () => {
  pauseForDialog();
  const view = openDialog('글꼴 및 라이선스');
  const notices = document.createElement('pre');
  notices.className = 'license-copy';
  notices.textContent = licenseNotices;
  view.content.append(notices);
});
bind('fullscreen', async () => {
  if (document.fullscreenElement) await document.exitFullscreen();
  else if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
  else status('이 브라우저는 전체 화면을 제공하지 않습니다.');
});
document.addEventListener('fullscreenchange', () => {
  byId('fullscreen').textContent = document.fullscreenElement ? '전체 화면 종료' : '전체 화면';
});

byId('sceneSearchForm').onsubmit = event => {
  event.preventDefault();
  if (!previewReturn) openList(byId('sceneSearch').value).catch(report);
};
byId('fileImport').onchange = async event => {
  try { await importFiles([...event.target.files]); }
  catch (error) { report(error); }
  finally { event.target.value = ''; }
};
byId('playMode').onchange = event => {
  player.mode = event.target.value;
  remember('playMode', player.mode);
};
byId('method').onchange = event => {
  player.setOption('method', event.target.value);
  remember('viewOptions', player.opts);
};
document.querySelectorAll('.seg button').forEach(button => {
  button.onclick = () => {
    player.setOption(button.closest('.seg').dataset.opt, button.dataset.v);
    syncOptions();
    remember('viewOptions', player.opts);
  };
});
document.querySelectorAll('[data-menu-target]').forEach(button => {
  button.onclick = event => {
    event.stopPropagation();
    closeMenus();
    const target = byId(button.dataset.menuTarget);
    target.open = true;
    target.querySelector('button,select')?.focus();
  };
});
document.addEventListener('click', event => {
  document.querySelectorAll('.menu[open]').forEach(menu => { if (!menu.contains(event.target)) menu.open = false; });
});
document.addEventListener('compositionstart', () => { composing = true; });
document.addEventListener('compositionend', () => { composing = false; });
document.addEventListener('keydown', event => {
  if (event.isComposing || composing || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.key === 'Escape') {
    const menu = document.querySelector('.menu[open]');
    if (menu) { menu.open = false; menu.querySelector('summary').focus(); }
    return;
  }
  if (document.querySelector('dialog[open],.menu[open]') || event.target.closest('input,textarea,select,[contenteditable=true]')) return;
  if (event.shiftKey && ['PageDown', 'PageUp'].includes(event.key)) {
    event.preventDefault();
    changeScene(event.key === 'PageDown' ? 1 : -1).catch(report);
    return;
  }
  if (['ArrowRight', 'PageDown'].includes(event.key)) {
    event.preventDefault();
    playbackCommand('next');
  } else if (['ArrowLeft', 'PageUp'].includes(event.key)) {
    event.preventDefault();
    playbackCommand('previous');
  } else if (event.key === ' ' && !event.target.closest('button,summary,a')) {
    event.preventDefault();
    playbackCommand('toggle');
  }
});
byId('stage').addEventListener('click', event => player.playAt?.(event.clientX, event.clientY));
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { player.pause(); player.stopAudio(); }
  else if (byId('wakeLock').checked) requestWakeLock();
});

let wakeLock = null;
async function requestWakeLock() {
  if (!byId('wakeLock').checked || document.hidden) return;
  if (!navigator.wakeLock?.request) {
    byId('wakeStatus').textContent = '이 기기는 화면 유지 기능을 제공하지 않습니다.';
    return;
  }
  try {
    const acquired = await navigator.wakeLock.request('screen');
    if (!byId('wakeLock').checked || document.hidden) { await acquired.release(); return; }
    wakeLock = acquired;
    byId('wakeStatus').textContent = '수업 중 화면을 켜 둡니다.';
    wakeLock.addEventListener('release', () => { byId('wakeStatus').textContent = '화면 유지가 해제되었습니다.'; });
  } catch { byId('wakeStatus').textContent = '화면 유지 요청을 받지 못했습니다.'; }
}
byId('wakeLock').onchange = async () => {
  if (byId('wakeLock').checked) await requestWakeLock();
  else { await wakeLock?.release(); wakeLock = null; }
};

let resizeFrame = 0;
function resizeBoard() {
  cancelAnimationFrame(resizeFrame);
  resizeFrame = requestAnimationFrame(() => {
    const area = document.querySelector('.board-area');
    const styles = window.getComputedStyle(area);
    const width = area.clientWidth - parseFloat(styles.paddingLeft || 0) - parseFloat(styles.paddingRight || 0);
    const height = area.clientHeight - parseFloat(styles.paddingTop || 0) - parseFloat(styles.paddingBottom || 0);
    player.resize({ width, height });
  });
}
if (typeof ResizeObserver === 'function') new ResizeObserver(resizeBoard).observe(document.querySelector('.board-area'));
window.addEventListener('resize', resizeBoard);

async function initialize() {
  byId('appVersion').textContent = '버전 ' + appVersion;
  let fallbackAvailable = false;
  fontAvailable = false;
  try {
    if (document.fonts?.load) {
      fontAvailable = (await document.fonts.load('700 20px WhiteboardHand', '한글')).length > 0;
      fallbackAvailable = (await document.fonts.load('400 20px WhiteboardKorean', '한글')).length > 0;
    }
  } catch { /* Keep legible device fonts if bundled font decoding fails. */ }
  setTextFontAvailability(fontAvailable, fallbackAvailable);
  try {
    storage = await openSceneStorage({ onVersionChange: () => {
      storage = null;
      status('다른 탭에서 앱이 갱신되었습니다. 초안을 파일로 보관한 뒤 이 탭을 새로고침하세요.', { error: true });
    } });
    const settings = {};
    for (const key of ['viewOptions', 'playMode', 'soundEnabled']) {
      const value = await storage.getSetting(key);
      if (value !== undefined && value !== null) settings[key] = value;
    }
    try { applySettings(parseImportedSettings(settings).settings); }
    catch { syncOptions(); status('일부 보기 설정을 기본값으로 열었습니다.'); }
    const last = await storage.getSetting('lastSceneId');
    const lastLesson = await storage.getSetting('activeLessonId');
    activeLesson = (await allLessons()).find(lesson => lesson.id === lastLesson) || null;
    const doc = typeof last === 'string' ? await sceneById(last) : null;
    const selected = doc && !doc.deletedAt ? doc : builtins[0];
    if (activeLesson && !activeLesson.sceneIds.includes(selected.id)) activeLesson = null;
    await openDoc(selected, { rememberSelection: false });
    updateDraftCount();
    const backup = await storage.getBackupStatus();
    const since = backup.lastConfirmedBackupAt || backup.firstSceneAt;
    if (since && Date.now() - Date.parse(since) > 7 * 86400000 && (!backup.reminderDismissedAt || Date.now() - Date.parse(backup.reminderDismissedAt) > 86400000)) {
      byId('dismissBackup').hidden = false;
      status('백업한 지 7일이 지났습니다. 장면 메뉴에서 전체 백업을 보관하세요.', { persistent: true });
    }
  } catch (error) {
    await openDoc(builtins[0], { rememberSelection: false });
    report(Error('기본 장면을 열었습니다. 저장소를 사용할 수 없습니다. ' + error.message));
  }
  syncOptions();
  resizeBoard();
  byId('shareScene').hidden = location.protocol !== 'https:';
  if (!fontAvailable) status('손글씨 글꼴을 불러오지 못해 기기 기본 글꼴을 사용합니다.');
  if (location.hash.startsWith('#mwb')) {
    try { await openSharedLink(readShareLink(location.href)); }
    catch (error) { report(Error('공유 자료를 열 수 없습니다. 파일 가져오기를 사용할 수 있습니다. ' + error.message)); }
  }
}
initialize().catch(report);

window.addEventListener('hashchange', async () => {
  if (!location.hash.startsWith('#mwb')) {
    if (sharedSession) previewReturn?.();
    return;
  }
  if (document.querySelector('dialog.scene-editor[open]')) {
    report(Error('편집을 마친 뒤 공유 링크를 다시 열어 주세요. 입력한 내용은 편집창에 남아 있습니다.'));
    return;
  }
  try {
    const shared = readShareLink(location.href);
    previewReturn?.();
    await openSharedLink(shared);
  } catch (error) { report(error); }
});
