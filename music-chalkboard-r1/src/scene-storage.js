/** Browser-local scene storage and portable, versioned backups. */
import {downgradeSceneV2, MAX_NOTATION_COLUMNS, NOTE_LABEL_MODES, TEMPLATE_IDS, upgradeDraftV1, upgradeSceneV1, validateScene} from './scene-model.js';
import { parseImportedSettings } from './import-settings.js';
import { validateLesson } from './lesson-model.js';

export const DB_NAME = 'music-whiteboard-authoring';
export const DB_VERSION = 2;
export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_SCENES = 500;
export const MAX_ACTIVE_SCENES = 1000;
export const MAX_BACKUP_PARTS = 1000;
const FORMAT = 'music-whiteboard-package';
const forbidden = new Set(['__proto__', 'constructor', 'prototype']);
const FORM_KEYS = new Set(['title', 'tags', 'question', 'caption', 'templateId', 'templateVersion', 'content', 'steps']);
const uid = () => globalThis.crypto?.randomUUID?.() ?? `scene-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
const clone = value => structuredClone(value);
const now = () => new Date().toISOString();

export class StorageError extends Error {
  constructor(code, message) { super(message); this.name = 'StorageError'; this.code = code; }
}
const fail = (code, message) => { throw new StorageError(code, message); };
const isObject = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const only = (object, allowed) => Object.keys(object).every(key => allowed.includes(key));

/** Checks size, depth and hostile keys before any processing or object merging. */
export function inspectTree(value) {
  const pending = [[value, 0]];
  let nodes = 0;
  while (pending.length) {
    const [item, depth] = pending.pop();
    if (++nodes > 150000 || depth > 20) fail('invalid', '데이터가 너무 복잡합니다.');
    if (typeof item === 'string' && item.length > 20000) fail('invalid', '문자열이 너무 깁니다.');
    if (item && typeof item === 'object') {
      const entries = Object.entries(item);
      if (entries.length > 10000) fail('invalid', '항목이 너무 많습니다.');
      for (const [key, child] of entries) {
        if (forbidden.has(key)) fail('invalid', '허용되지 않는 데이터 필드입니다.');
        pending.push([child, depth + 1]);
      }
    }
  }
}
function checkSize(value) {
  let json;
  try { json = JSON.stringify(value); } catch { fail('invalid', 'JSON으로 변환할 수 없습니다.'); }
  if (json === undefined || new TextEncoder().encode(json).byteLength > MAX_FILE_BYTES) fail('size', '파일은 5 MiB 이하여야 합니다.');
  return json;
}
function assertDocument(scene) {
  inspectTree(scene);
  const result = validateScene(scene);
  if (!result.valid) fail('invalid', `장면 검증 실패: ${result.errors.map(e => e.message).join(' ')}`);
}
function assertDraft(draft) {
  if (!isObject(draft) || !only(draft, ['draftId','sceneId','baseRevision','editorVersion','updatedAt','formData','clientId'])) fail('invalid', '초안 형식이 올바르지 않습니다.');
  if (typeof draft.draftId !== 'string' || draft.draftId.length > 128 || !draft.draftId || !(draft.sceneId === null || typeof draft.sceneId === 'string') || !(draft.baseRevision === null || Number.isSafeInteger(draft.baseRevision) && draft.baseRevision > 0) || ![1, 2].includes(draft.editorVersion) || typeof draft.updatedAt !== 'string' || !Number.isFinite(Date.parse(draft.updatedAt)) || !isObject(draft.formData) || !Object.keys(draft.formData).every(k => FORM_KEYS.has(k))) fail('invalid', '초안 형식이 올바르지 않습니다.');
  if (draft.clientId !== undefined && (typeof draft.clientId !== 'string' || draft.clientId.length > 128)) fail('invalid', '초안 식별자가 올바르지 않습니다.');
  inspectTree(draft);
  checkSize(draft);
  const form = draft.formData;
  const required = (object, keys) => isObject(object) && only(object, keys) && keys.every(key => Object.hasOwn(object, key));
  const count = value => {
    const normal = value.normalize('NFC');
    return typeof Intl.Segmenter === 'function' ? [...new Intl.Segmenter('ko', {granularity:'grapheme'}).segment(normal)].length : [...normal].length;
  };
  const max = (value, limit) => typeof value === 'string' && count(value) <= limit;
  const isId = value => max(value, 128);
  // A draft may be semantically invalid while the user is editing, but its
  // complete structure must be safe to render without executing user data.
  const notationV2 = draft.editorVersion === 2 && form.templateId !== 'text-explanation';
  if (!required(form, [...FORM_KEYS]) || !TEMPLATE_IDS.includes(form.templateId) || form.templateVersion !== (notationV2 ? 2 : 1))
    fail('invalid', '초안의 템플릿 또는 필드가 올바르지 않습니다.');
  if (!max(form.title,40) || !max(form.question,80) || !max(form.caption,120)) fail('invalid', '초안의 문장이 길이 제한을 넘었습니다. 내용을 복사한 뒤 줄여 주세요.');
  if (!Array.isArray(form.tags) || form.tags.length > 5 || form.tags.some(tag => !max(tag,12))) fail('invalid', '초안의 태그가 제한을 넘었습니다.');
  const stepFields = ['id','label','groupIds','advance','holdMs'];
  const cueOk = cue => {
    if (cue?.type === 'listen') {
      return required(cue, ['type','targets']) && Array.isArray(cue.targets) && cue.targets.length <= 32
        && cue.targets.every(target => required(target,['columnId']) && isId(target.columnId));
    }
    return cue?.type === 'practice' && required(cue, ['type','order','keyboard','columnIds'])
      && ['free','sequential'].includes(cue.order) && isObject(cue.keyboard) && only(cue.keyboard,['from','to','labelMode'])
      && max(cue.keyboard.from,20) && max(cue.keyboard.to,20)
      && (!Object.hasOwn(cue.keyboard,'labelMode') || NOTE_LABEL_MODES.includes(cue.keyboard.labelMode))
      && Array.isArray(cue.columnIds) && cue.columnIds.length <= MAX_NOTATION_COLUMNS && cue.columnIds.every(isId);
  };
  if (!Array.isArray(form.steps) || form.steps.length > 12 || form.steps.some(s =>
    !isObject(s) || !only(s,draft.editorVersion === 2 ? [...stepFields,'cue'] : stepFields)
    || !stepFields.every(key => Object.hasOwn(s,key)) || (Object.hasOwn(s,'cue') && !cueOk(s.cue)) || !isId(s.id) || !max(s.label,24) ||
    !Array.isArray(s.groupIds) || s.groupIds.length > 100 || s.groupIds.some(group => !max(group,256)) ||
    !['manual','auto'].includes(s.advance) || typeof s.holdMs !== 'number' || !Number.isFinite(s.holdMs)))
    fail('invalid', '초안의 단계 형식이 올바르지 않습니다.');
  const c = form.content;
  const notesOk = notes => Array.isArray(notes) && notes.length <= 8 && notes.every(n =>
    required(n,['id','pitch']) && isId(n.id) && max(n.pitch, 20));
  if (notationV2) {
    const columnKeys = ['id','kind','notes','labelMode','highlightNoteIds'];
    const controls = ['emphasis','showName','showRoman'];
    const labels = ['teacherMemo','legacyName','legacyRoman'];
    const columnOk = col => isObject(col) && only(col,col.kind === 'chord' ? [...columnKeys,...controls,...labels] : columnKeys)
      && columnKeys.every(key => Object.hasOwn(col,key)) && isId(col.id) && ['note','chord'].includes(col.kind)
      && notesOk(col.notes) && (col.kind === 'note' ? col.notes.length === 1 : col.notes.length >= 3 && col.notes.length <= 4)
      && NOTE_LABEL_MODES.includes(col.labelMode)
      && Array.isArray(col.highlightNoteIds) && col.highlightNoteIds.length <= 4 && col.highlightNoteIds.every(isId)
      && controls.every(key => !Object.hasOwn(col,key) || typeof col[key] === 'boolean')
      && labels.every(key => !Object.hasOwn(col,key) || max(col[key],key === 'teacherMemo' ? 80 : 20));
    if (!isObject(c) || !only(c,['key','columns','showGaps']) || !required(c.key,['tonic','mode'])
      || !max(c.key.tonic,20) || !['major','minor'].includes(c.key.mode)
      || !Array.isArray(c.columns) || c.columns.length > MAX_NOTATION_COLUMNS || !c.columns.every(columnOk)
      || (Object.hasOwn(c,'showGaps') && typeof c.showGaps !== 'boolean')) fail('invalid', '초안의 악보 내용이 올바르지 않습니다.');
  } else if (form.templateId === 'chord-stack') {
    if (!required(c,['preset','notes','chordName','roman','emphasis']) ||
      !['custom','C-major-I','C-major-IV','C-major-V'].includes(c.preset) ||
      (!notesOk(c.notes) || c.notes.length !== 3) || !max(c.chordName,20) || !max(c.roman,20) || typeof c.emphasis !== 'boolean')
      fail('invalid', '초안의 화음 내용이 올바르지 않습니다.');
  } else if (form.templateId === 'note-selection') {
    if (!required(c,['notes','showLabels','highlightNoteIds']) || !notesOk(c.notes) ||
      typeof c.showLabels !== 'boolean' || !Array.isArray(c.highlightNoteIds) ||
      c.highlightNoteIds.length > 8 || c.highlightNoteIds.some(id => !isId(id)))
      fail('invalid', '초안의 음 고르기 내용이 올바르지 않습니다.');
  } else {
    if (!required(c,['blocks']) || !Array.isArray(c.blocks) || c.blocks.length > 6 || c.blocks.some(b =>
      !required(b,['id','text','ink']) || !isId(b.id) || !max(b.text,80) || !['main','accent'].includes(b.ink)))
      fail('invalid', '초안의 본문 형식이 올바르지 않습니다.');
    if (c.blocks.reduce((total, block) => total + count(block.text), 0) > 360)
      fail('invalid', '초안 본문이 길이 제한을 넘었습니다.');
  }
}

export function openSceneStorage({onVersionChange} = {}) {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) return reject(new StorageError('unavailable', '브라우저 저장소를 사용할 수 없습니다.'));
    let blocked = false;
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      const stores = [['scenes','id'], ['drafts','draftId'], ['settings','key'], ['meta','key'], ['lessons','id']];
      for (const [name, keyPath] of stores) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, {keyPath});
      }
    };
    request.onblocked = () => { blocked = true; reject(new StorageError('blocked', '다른 탭을 닫거나 새로고침해 주세요.')); };
    request.onerror = () => reject(request.error || new StorageError('unavailable', '저장소를 열지 못했습니다.'));
    request.onsuccess = () => {
      const db = request.result;
      if (blocked) { db.close(); return; }
      db.onversionchange = event => {
        db.close();
        onVersionChange?.({oldVersion:event.oldVersion, newVersion:event.newVersion});
      };
      resolve(new SceneStorage(db));
    };
  });
}
const req = request => new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
function complete(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error || new StorageError('aborted', '저장 작업이 취소되었습니다.'));
    tx.onerror = () => {};
  });
}
async function transaction(db, names, mode, fn) {
  const tx = db.transaction(names, mode);
  const done = complete(tx);
  try { const result = await fn(tx); await done; return result; }
  catch (err) { try { tx.abort(); } catch {} await done.catch(() => {}); throw err; }
}
const orderOf = record => Array.isArray(record?.value) ? record.value.filter(id => typeof id === 'string') : [];
export function reconcileSceneOrder(order, scenes) {
  const ids = new Set(scenes.map(s => s.id));
  const output = [];
  for (const id of order) if (ids.delete(id)) output.push(id);
  return output.concat([...ids]);
}

const ORDER_KEY = 'sceneOrderRevision';
const revisionOf = record => Number.isSafeInteger(record?.value) && record.value >= 0 ? record.value : 0;
const validTime = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
const knownBuiltins = ids => [...ids].filter(id => typeof id === 'string' && id.startsWith('builtin:'));

function upgradeScene(scene) {
  assertDocument(scene);
  const upgraded = upgradeSceneV1(scene);
  if (upgraded !== scene) assertDocument(upgraded);
  return upgraded;
}

function upgradeDraft(draft) {
  assertDraft(draft);
  const upgraded = upgradeDraftV1(draft);
  if (upgraded !== draft) assertDraft(upgraded);
  return upgraded;
}

function draftMatches(current, observed) {
  if (!current || !observed || current.draftId !== observed.draftId) return false;
  try {
    return JSON.stringify(upgradeDraft(current)) === JSON.stringify(upgradeDraft(observed));
  } catch {
    return false;
  }
}

function assertLesson(lesson, sceneIds) {
  inspectTree(lesson);
  const result = validateLesson(lesson, {sceneIds});
  if (!result.valid) fail('invalid', `수업 검증 실패: ${result.errors.map(e => e.message).join(' ')}`);
}

function updateOrderRevision(meta, orderRevision) {
  meta.put({key:ORDER_KEY, value:orderRevision + 1});
}

async function readSceneRecords(tx) {
  const meta = tx.objectStore('meta');
  const [records, order, orderRevision] = await Promise.all([
    req(tx.objectStore('scenes').getAll()), req(meta.get('sceneOrder')), req(meta.get(ORDER_KEY)),
  ]);
  return {records, order:orderOf(order), orderRevision:revisionOf(orderRevision)};
}

function orderedScenes(records, order, includeDeleted) {
  const issues = [];
  const byId = new Map(records.map(scene => [scene.id, scene]));
  const scenes = reconcileSceneOrder(order, records).flatMap(id => {
    const record = byId.get(id);
    if (record.deletedAt && !includeDeleted) return [];
    try { return [upgradeScene(record)]; }
    catch (error) { issues.push({id, message:error.message}); return []; }
  });
  return {scenes, issues};
}

class LessonReferenceError extends StorageError {
  constructor(lessons, empty = false) {
    super('referenced', empty ? '장면을 삭제하기 전에 수업에 남을 장면을 선택해 주세요.' : '이 장면을 참조하는 수업이 있습니다.');
    this.lessons = lessons;
    this.emptyLessons = lessons.filter(lesson => lesson.sceneIds.length === 1);
  }
}

export class SceneStorage {
  constructor(db) { this.db = db; }
  close() { this.db.close(); }

  async listSceneSnapshot({includeDeleted = false} = {}) {
    return transaction(this.db, ['scenes','meta'], 'readonly', async tx => {
      const {records, order, orderRevision} = await readSceneRecords(tx);
      return {...orderedScenes(records, order, includeDeleted), orderRevision};
    });
  }

  async listScenes(options) {
    return (await this.listSceneSnapshot(options)).scenes;
  }

  async getScene(id) {
    const scene = await transaction(this.db, ['scenes'], 'readonly', tx => req(tx.objectStore('scenes').get(id)));
    return scene && upgradeScene(scene);
  }

  async reorderScenes(activeIds, {expectedOrderRevision} = {}) {
    if (!Array.isArray(activeIds) || new Set(activeIds).size !== activeIds.length) fail('invalid', '장면 순서가 올바르지 않습니다.');
    return transaction(this.db, ['scenes','meta'], 'readwrite', async tx => {
      const {records, order, orderRevision} = await readSceneRecords(tx);
      const expected = new Set(records.filter(scene => !scene.deletedAt).map(scene => scene.id));
      if ((expectedOrderRevision !== undefined && expectedOrderRevision !== orderRevision)
        || activeIds.length !== expected.size || activeIds.some(id => !expected.has(id))) {
        fail('conflict', '장면 목록이나 순서가 변경되었습니다. 최신 순서를 확인해 주세요.');
      }
      let index = 0;
      const reordered = reconcileSceneOrder(order, records).map(id => expected.has(id) ? activeIds[index++] : id);
      const meta = tx.objectStore('meta');
      meta.put({key:'sceneOrder', value:reordered});
      updateOrderRevision(meta, orderRevision);
      return orderRevision + 1;
    });
  }

  /** expectedRevision is null for creation and an integer for existing scenes. */
  async saveScene(document, {expectedRevision = null, draftId = null, cleanupDraft = null} = {}) {
    const scene = clone(document);
    if (scene.origin === 'builtin' || String(scene.id).startsWith('builtin:')) fail('readonly', '기본 장면은 복제해서 저장해 주세요.');
    assertDocument(scene);
    return transaction(this.db, ['scenes','drafts','meta'], 'readwrite', async tx => {
      const scenes = tx.objectStore('scenes'), drafts = tx.objectStore('drafts'), meta = tx.objectStore('meta');
      const [current, {records, order, orderRevision}, observed] = await Promise.all([
        req(scenes.get(scene.id)), readSceneRecords(tx),
        cleanupDraft && cleanupDraft.draftId !== draftId
          ? req(drafts.get(cleanupDraft.draftId))
          : undefined,
      ]);
      if (expectedRevision === null ? !!current : !current || current.revision !== expectedRevision || !!current.deletedAt) {
        fail('conflict', '다른 탭에서 장면이 변경되었거나 삭제되었습니다.');
      }
      if (!current && records.filter(s => !s.deletedAt).length >= MAX_ACTIVE_SCENES) fail('limit', '활성 장면은 최대 1,000개입니다.');
      const time = now();
      scene.origin = 'user';
      scene.revision = current ? current.revision + 1 : 1;
      scene.createdAt = current?.createdAt || time;
      scene.updatedAt = time;
      scene.deletedAt = null;
      scenes.put(scene);
      if (!current) {
        meta.put({key:'sceneOrder', value:reconcileSceneOrder(order, [...records, scene])});
        if (!records.length) meta.put({key:'firstSceneAt', value:time});
        updateOrderRevision(meta, orderRevision);
      }
      if (draftId) drafts.delete(draftId);
      if (draftMatches(observed, cleanupDraft)) drafts.delete(cleanupDraft.draftId);
      return scene;
    });
  }

  async setDeleted(id, expectedRevision, deleted) {
    if (String(id).startsWith('builtin:')) fail('readonly', '기본 장면은 삭제할 수 없습니다.');
    return transaction(this.db, ['scenes','meta'], 'readwrite', async tx => {
      const store = tx.objectStore('scenes'), meta = tx.objectStore('meta');
      const [scene, records, orderRevision] = await Promise.all([
        req(store.get(id)), req(store.getAll()), req(meta.get(ORDER_KEY)),
      ]);
      if (!scene || scene.revision !== expectedRevision || (!!scene.deletedAt === !!deleted)) fail('conflict', '장면이 이미 변경되었습니다.');
      if (!deleted && records.filter(s => !s.deletedAt).length >= MAX_ACTIVE_SCENES) fail('limit', '활성 장면은 최대 1,000개입니다.');
      const time = now();
      scene.deletedAt = deleted ? time : null;
      scene.updatedAt = time;
      scene.revision++;
      store.put(scene);
      updateOrderRevision(meta, revisionOf(orderRevision));
      return scene;
    });
  }

  async permanentlyDelete(id, expectedRevision, {removeFromLessons = false, expectedLessons} = {}) {
    return transaction(this.db, ['scenes','meta','lessons'], 'readwrite', async tx => {
      const store = tx.objectStore('scenes'), meta = tx.objectStore('meta'), lessonStore = tx.objectStore('lessons');
      const [scene, order, orderRevision, lessons] = await Promise.all([
        req(store.get(id)), req(meta.get('sceneOrder')), req(meta.get(ORDER_KEY)), req(lessonStore.getAll()),
      ]);
      if (!scene || !scene.deletedAt || scene.revision !== expectedRevision) fail('conflict', '휴지통의 장면이 변경되었습니다.');
      const references = lessons.filter(lesson => lesson.sceneIds.includes(id));
      if (references.length && !removeFromLessons) throw new LessonReferenceError(references);
      if (references.some(lesson => lesson.sceneIds.length === 1)) throw new LessonReferenceError(references, true);
      if (expectedLessons) {
        const observed = new Map(expectedLessons.map(lesson => [lesson.id, lesson.revision]));
        if (references.length !== observed.size || references.some(lesson => observed.get(lesson.id) !== lesson.revision)) {
          fail('conflict', '확인하는 동안 수업이 변경되었습니다. 최신 수업 정보를 확인해 주세요.');
        }
      }
      const updatedAt = now();
      for (const lesson of references) {
        lessonStore.put({...lesson, sceneIds:lesson.sceneIds.filter(sceneId => sceneId !== id), revision:lesson.revision + 1, updatedAt});
      }
      store.delete(id);
      meta.put({key:'sceneOrder', value:orderOf(order).filter(x => x !== id)});
      updateOrderRevision(meta, revisionOf(orderRevision));
    });
  }

  async saveDraft(draft) {
    const copy = clone(draft);
    assertDraft(copy);
    return transaction(this.db, ['drafts'], 'readwrite', tx => { tx.objectStore('drafts').put(copy); });
  }

  async getDraft(id) {
    const draft = await transaction(this.db, ['drafts'], 'readonly', tx => req(tx.objectStore('drafts').get(id)));
    return draft && upgradeDraft(draft);
  }

  async listDrafts({sceneId} = {}) {
    const records = await transaction(this.db, ['drafts'], 'readonly', tx => req(tx.objectStore('drafts').getAll()));
    return records.flatMap(draft => {
      if (sceneId !== undefined && sceneId !== draft.sceneId) return [];
      try { return [upgradeDraft(draft)]; }
      catch { return []; }
    });
  }

  async deleteDraft(id, {expected} = {}) {
    return transaction(this.db, ['drafts'], 'readwrite', async tx => {
      const store = tx.objectStore('drafts');
      if (expected !== undefined && !draftMatches(await req(store.get(id)), expected)) {
        fail('conflict', '확인하는 동안 초안이 변경되었습니다. 최신 초안을 확인해 주세요.');
      }
      store.delete(id);
    });
  }

  async getSetting(key) {
    const record = await transaction(this.db, ['settings'], 'readonly', tx => req(tx.objectStore('settings').get(key)));
    return record?.value;
  }

  async setSetting(key, value) {
    return transaction(this.db, ['settings'], 'readwrite', tx => { tx.objectStore('settings').put({key,value}); });
  }

  async listLessons() {
    return transaction(this.db, ['lessons'], 'readonly', tx => req(tx.objectStore('lessons').getAll()));
  }

  async saveLesson(document, {expectedRevision = null, builtinSceneIds = []} = {}) {
    const lesson = clone(document);
    if (lesson.origin === 'builtin' || String(lesson.id).startsWith('builtin:')) fail('readonly', '기본 수업은 복제해서 저장해 주세요.');
    assertLesson(lesson);
    return transaction(this.db, ['lessons','scenes'], 'readwrite', async tx => {
      const store = tx.objectStore('lessons');
      const [current, sceneIds] = await Promise.all([req(store.get(lesson.id)), req(tx.objectStore('scenes').getAllKeys())]);
      if (expectedRevision === null ? !!current : !current || current.revision !== expectedRevision) {
        fail('conflict', '다른 탭에서 수업을 바꾸거나 삭제했습니다.');
      }
      assertLesson(lesson, new Set([...sceneIds, ...knownBuiltins(builtinSceneIds)]));
      const time = now();
      lesson.revision = current ? current.revision + 1 : 1;
      lesson.createdAt = current?.createdAt || time;
      lesson.updatedAt = time;
      store.put(lesson);
      return lesson;
    });
  }

  async deleteLesson(id, expectedRevision) {
    if (String(id).startsWith('builtin:')) fail('readonly', '기본 수업은 삭제할 수 없습니다.');
    return transaction(this.db, ['lessons'], 'readwrite', async tx => {
      const store = tx.objectStore('lessons');
      const lesson = await req(store.get(id));
      if (!lesson || lesson.revision !== expectedRevision) fail('conflict', '다른 탭에서 수업을 바꾸거나 삭제했습니다.');
      store.delete(id);
    });
  }

  async getBackupSnapshot({includeDeleted = false, includeSettings = false, includeLessons = true} = {}) {
    return transaction(this.db, ['scenes','meta','lessons','settings'], 'readonly', async tx => {
      const store = tx.objectStore('settings');
      const [{records, order}, lessonRecords, settingRecords] = await Promise.all([
        readSceneRecords(tx),
        includeLessons ? req(tx.objectStore('lessons').getAll()) : [],
        includeSettings ? Promise.all(['viewOptions','playMode','soundEnabled'].map(key => req(store.get(key)))) : [],
      ]);
      const {scenes, issues} = orderedScenes(records, order, includeDeleted);
      if (issues.length) fail('invalid', `백업 전에 읽을 수 없는 장면을 확인해 주세요: ${issues.map(issue => issue.id).join(', ')}`);
      const raw = Object.fromEntries(settingRecords.filter(Boolean).map(record => [record.key, record.value]));
      const settings = includeSettings ? parseImportedSettings(raw).settings : null;
      return {scenes, lessons:lessonRecords, settings, snapshotAt:now()};
    });
  }

  async getBackupStatus() {
    return transaction(this.db, ['scenes','meta'], 'readonly', async tx => {
      const meta = tx.objectStore('meta');
      const [confirmed, scope, first, reminder, scenes] = await Promise.all([
        req(meta.get('lastConfirmedBackupAt')), req(meta.get('backupScope')), req(meta.get('firstSceneAt')),
        req(meta.get('backupReminderDismissedAt')), req(tx.objectStore('scenes').getAll()),
      ]);
      const earliest = scenes.map(scene => scene.createdAt).filter(validTime)
        .reduce((oldest, date) => oldest === null || Date.parse(date) < Date.parse(oldest) ? date : oldest, null);
      return {
        lastConfirmedBackupAt:confirmed?.value ?? null,
        firstSceneAt:first?.value ?? earliest,
        reminderDismissedAt:reminder?.value ?? null,
        scope:scope?.value ?? null,
        sceneCount:scenes.length,
      };
    });
  }

  async confirmBackup({scope = null, snapshotAt = now()} = {}) {
    if (!validTime(snapshotAt)) fail('invalid', '백업 시각이 올바르지 않습니다.');
    const time = now();
    return transaction(this.db, ['meta'], 'readwrite', tx => {
      const meta = tx.objectStore('meta');
      meta.put({key:'lastConfirmedBackupAt', value:time});
      meta.put({key:'backupScope', value:{scope, snapshotAt}});
      return time;
    });
  }

  async dismissBackupReminder() {
    return transaction(this.db, ['meta'], 'readwrite', tx => {
      tx.objectStore('meta').put({key:'backupReminderDismissedAt', value:now()});
    });
  }

  async importBundle(bundle, options) {
    return (await this.importBundles([bundle], options)).scenes;
  }

  async importBundles(inputs, {includeSettings = false, builtinSceneIds = []} = {}) {
    const parsed = validateBackupSet(inputs, {builtinSceneIds});
    const settings = includeSettings ? parseImportedSettings(parsed.settings).settings : {};
    const importedAt = now();
    const idMap = new Map(parsed.scenes.map(scene => [scene.id, uid()]));
    const copies = parsed.scenes.map(source => ({
      ...clone(upgradeScene(source)), id:idMap.get(source.id), origin:'user', revision:1,
      createdAt:importedAt, updatedAt:importedAt,
      importInfo:{sourceSceneId:source.id, sourceCreatedAt:source.createdAt, sourceUpdatedAt:source.updatedAt, importedAt},
    }));
    const lessons = parsed.lessons.map(source => ({
      ...clone(source), id:uid(), origin:'user', revision:1, createdAt:importedAt, updatedAt:importedAt,
      sceneIds:source.sceneIds.map(id => idMap.get(id) ?? id),
    }));
    return transaction(this.db, ['scenes','lessons','meta','settings'], 'readwrite', async tx => {
      const store = tx.objectStore('scenes'), lessonStore = tx.objectStore('lessons'), meta = tx.objectStore('meta');
      const {records, order, orderRevision} = await readSceneRecords(tx);
      if (records.filter(s => !s.deletedAt).length + copies.filter(s => !s.deletedAt).length > MAX_ACTIVE_SCENES) {
        fail('limit', '가져온 후 활성 장면이 1,000개를 초과합니다.');
      }
      for (const scene of copies) store.add(scene);
      for (const lesson of lessons) lessonStore.add(lesson);
      if (copies.length) {
        const importedOrder = parsed.sceneOrder.map(id => idMap.get(id));
        meta.put({key:'sceneOrder', value:reconcileSceneOrder([...order, ...importedOrder], [...records, ...copies])});
        if (!records.length) meta.put({key:'firstSceneAt', value:importedAt});
        updateOrderRevision(meta, orderRevision);
      }
      const settingStore = tx.objectStore('settings');
      for (const [key, value] of Object.entries(settings)) settingStore.put({key,value});
      return {scenes:copies, lessons};
    });
  }
}

/** Accept parsed object or JSON text. Validation precedes the write transaction. */
export function validatePackage(input, {builtinSceneIds = []} = {}) {
  let value = input;
  if (typeof input === 'string') {
    if (new TextEncoder().encode(input).byteLength > MAX_FILE_BYTES) fail('size', '파일은 5 MiB 이하여야 합니다.');
    try { value = JSON.parse(input); } catch { fail('invalid', 'JSON 파일을 읽을 수 없습니다.'); }
  } else {
    checkSize(value);
  }
  inspectTree(value);
  if (!isObject(value) || value.format !== FORMAT || ![1, 2].includes(value.version) || !validTime(value.exportedAt)) {
    fail('invalid', '지원하지 않는 백업 형식입니다.');
  }
  if (value.kind === 'draft') {
    if (!only(value, ['format','version','kind','exportedAt','draft'])
      || (value.version === 1 && value.draft?.editorVersion !== 1)) fail('invalid', '지원하지 않는 초안 파일입니다.');
    assertDraft(value.draft);
    return value;
  }

  const fields = ['format','version','kind','exportedAt','scenes','sceneOrder','lessons','settings'];
  if (value.version === 2) fields.push('backupSet');
  if (value.kind !== 'scene-bundle' || !only(value, fields) || !Array.isArray(value.scenes) || value.scenes.length > MAX_SCENES
    || !Array.isArray(value.sceneOrder) || !Array.isArray(value.lessons) || value.lessons.length > MAX_SCENES
    || (!value.scenes.length && !value.lessons.length)
    || (value.version === 1 && (!value.scenes.length || value.lessons.length || value.scenes.some(scene => scene?.schemaVersion !== 1)))
    || !(value.settings === null || isObject(value.settings))) {
    fail('invalid', '지원하지 않는 장면 백업입니다.');
  }
  const scenesById = new Map();
  for (const scene of value.scenes) {
    assertDocument(scene);
    if (scenesById.has(scene.id)) fail('invalid', '백업 안에 중복된 장면 ID가 있습니다.');
    scenesById.set(scene.id, scene);
  }
  const order = new Set();
  for (const id of value.sceneOrder) {
    const scene = scenesById.get(id);
    if (typeof id !== 'string' || !scene || order.has(id) || scene.deletedAt) fail('invalid', '장면 순서가 올바르지 않습니다.');
    order.add(id);
  }
  if (value.version === 2 && order.size !== value.scenes.filter(scene => !scene.deletedAt).length) fail('invalid', '백업에서 활성 장면의 순서가 누락되었습니다.');
  const lessonIds = new Set();
  const sceneIds = new Set([...scenesById.keys(), ...knownBuiltins(builtinSceneIds)]);
  for (const lesson of value.lessons) {
    assertLesson(lesson, sceneIds);
    if (lessonIds.has(lesson.id)) fail('invalid', '백업 안에 중복된 수업 ID가 있습니다.');
    lessonIds.add(lesson.id);
  }
  if (Object.hasOwn(value, 'backupSet')) {
    const set = value.backupSet;
    if (!isObject(set) || !only(set,['id','part','total','scenePositions'])
      || typeof set.id !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(set.id)
      || !Number.isSafeInteger(set.total) || set.total < 1 || set.total > MAX_BACKUP_PARTS
      || !Number.isSafeInteger(set.part) || set.part < 1 || set.part > set.total
      || !Array.isArray(set.scenePositions) || set.scenePositions.length !== value.scenes.length
      || set.scenePositions.some(position => !Number.isSafeInteger(position) || position < 0 || position >= MAX_BACKUP_PARTS * MAX_SCENES)
      || new Set(set.scenePositions).size !== set.scenePositions.length) {
      fail('invalid', '분할 백업의 파일 번호나 장면 순서가 올바르지 않습니다.');
    }
    const position = new Map(value.scenes.map((scene, index) => [scene.id, set.scenePositions[index]]));
    if (value.sceneOrder.some((id, index) => index > 0 && position.get(id) <= position.get(value.sceneOrder[index - 1]))) {
      fail('invalid', '분할 파일 안의 장면 순서가 원본 순서와 다릅니다.');
    }
  }
  parseImportedSettings(value.settings, {version:value.version});
  return value;
}

function settingsSignature(value, version) {
  const {settings} = parseImportedSettings(value, {version});
  const options = Object.entries(settings.viewOptions ?? {}).sort(([left], [right]) => left.localeCompare(right));
  return JSON.stringify([options, settings.playMode, settings.soundEnabled]);
}

/** Each part is independently importable. Multiple inputs must cover a complete, consistent set. */
export function validateBackupSet(inputs, {builtinSceneIds = []} = {}) {
  if (!Array.isArray(inputs) || !inputs.length || inputs.length > MAX_BACKUP_PARTS) fail('invalid', '가져올 백업 파일을 선택해 주세요.');
  const packages = inputs.map(input => validatePackage(input, {builtinSceneIds}));
  if (packages.some(pkg => pkg.kind !== 'scene-bundle')) fail('invalid', '장면 백업 파일이 아닙니다.');
  const first = packages[0], manifest = first.backupSet;
  if (packages.length > 1 && !manifest) fail('invalid', '여러 파일을 한 번에 복원하려면 한 세트의 v2 분할 백업을 선택해 주세요.');
  const orderedParts = [...packages].sort((a, b) => (a.backupSet?.part ?? 0) - (b.backupSet?.part ?? 0));
  const partNumbers = new Set();
  const positions = new Set();
  const scenes = new Map();
  const lessons = new Map();
  const sceneOrder = [];
  const referenceSettings = settingsSignature(first.settings, first.version);
  for (const pkg of orderedParts) {
    const set = pkg.backupSet;
    if (manifest) {
      if (!set || set.id !== manifest.id || set.total !== manifest.total || partNumbers.has(set.part)
        || pkg.exportedAt !== first.exportedAt || settingsSignature(pkg.settings, pkg.version) !== referenceSettings) {
        fail('invalid', '같은 분할 백업 세트의 서로 다른 파일만 선택해 주세요.');
      }
      partNumbers.add(set.part);
    }
    pkg.scenes.forEach((scene, index) => {
      if (scenes.has(scene.id)) fail('invalid', '백업 전체에 중복된 장면 ID가 있습니다.');
      const position = set?.scenePositions[index];
      if (set && positions.has(position)) fail('invalid', '백업 전체에 중복된 장면 순번이 있습니다.');
      if (set) positions.add(position);
      scenes.set(scene.id, {scene, position});
    });
    for (const lesson of pkg.lessons) {
      if (lessons.has(lesson.id)) fail('invalid', '백업 전체에 중복된 수업 ID가 있습니다.');
      lessons.set(lesson.id, lesson);
    }
    if (!set) sceneOrder.push(...pkg.sceneOrder);
  }
  const complete = !manifest || partNumbers.size === manifest.total;
  if (packages.length > 1 && !complete) fail('invalid', '분할 백업 세트에 빠진 파일이 있습니다. 모든 파일을 다시 선택해 주세요.');
  if (manifest) {
    const ordered = [...scenes.entries()].sort(([, a], [, b]) => a.position - b.position);
    if (complete && ordered.some(([, entry], index) => entry.position !== index)) fail('invalid', '전체 백업에 장면 순번이 빠져 있습니다.');
    sceneOrder.push(...ordered.map(([id]) => id));
  }
  const listed = new Set(sceneOrder);
  return {
    packages:orderedParts,
    scenes:sceneOrder.concat([...scenes.keys()].filter(id => !listed.has(id))).map(id => scenes.get(id).scene),
    sceneOrder,
    lessons:[...lessons.values()],
    settings:first.settings,
    complete,
  };
}

export function makeScenePackage(scenes, {settings = null, lessons = [], builtinSceneIds = [], version, exportedAt = now(), backupSet} = {}) {
  const copies = clone(scenes);
  if (version === undefined) {
    const legacySettings = (() => {
      try { parseImportedSettings(settings, {version:1}); return true; }
      catch { return false; }
    })();
    version = backupSet || lessons.length || copies.some(scene => scene.schemaVersion === 2) || !legacySettings ? 2 : 1;
  }
  const documents = version === 1
    ? copies.map(scene => scene.schemaVersion === 2 ? downgradeSceneV2(scene) : scene)
    : copies;
  if (documents.some(scene => !scene)) fail('invalid', '이 장면에는 v1에서 표현할 수 없는 설정이나 내용이 있습니다.');
  const result = {
    format:FORMAT, version, kind:'scene-bundle', exportedAt, scenes:documents,
    sceneOrder:documents.filter(scene => !scene.deletedAt).map(scene => scene.id), lessons:clone(lessons), settings:clone(settings),
  };
  if (backupSet) result.backupSet = clone(backupSet);
  return validatePackage(result, {builtinSceneIds});
}

export function makeDraftPackage(draft) {
  const copy = clone(draft);
  delete copy.clientId;
  return validatePackage({format:FORMAT, version:draft.editorVersion, kind:'draft', exportedAt:now(), draft:copy});
}

export function recoverImportedDraft(input, clientId = uid()) {
  const pkg = validatePackage(input);
  if (pkg.kind !== 'draft') fail('invalid', '초안 백업 파일이 아닙니다.');
  return {...clone(upgradeDraft(pkg.draft)), draftId:uid(), clientId, sceneId:null, baseRevision:null, updatedAt:now()};
}
