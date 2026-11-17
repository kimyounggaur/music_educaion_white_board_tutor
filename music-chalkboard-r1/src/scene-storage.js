/** Browser-local scene storage and portable, versioned backups. */
import { validateScene } from './scene-model.js';

export const DB_NAME = 'music-whiteboard-authoring';
export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_SCENES = 500;
export const MAX_ACTIVE_SCENES = 1000;
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
function inspectTree(value) {
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
  if (typeof draft.draftId !== 'string' || draft.draftId.length > 128 || !draft.draftId || !(draft.sceneId === null || typeof draft.sceneId === 'string') || !(draft.baseRevision === null || Number.isInteger(draft.baseRevision) && draft.baseRevision > 0) || draft.editorVersion !== 1 || typeof draft.updatedAt !== 'string' || !Number.isFinite(Date.parse(draft.updatedAt)) || !isObject(draft.formData) || !Object.keys(draft.formData).every(k => FORM_KEYS.has(k))) fail('invalid', '초안 형식이 올바르지 않습니다.');
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
  if (!required(form, [...FORM_KEYS]) || !['chord-stack','note-selection','text-explanation'].includes(form.templateId) || form.templateVersion !== 1)
    fail('invalid', '초안의 템플릿 또는 필드가 올바르지 않습니다.');
  if (!max(form.title,40) || !max(form.question,80) || !max(form.caption,120)) fail('invalid', '초안의 문장이 길이 제한을 넘었습니다. 내용을 복사한 뒤 줄여 주세요.');
  if (!Array.isArray(form.tags) || form.tags.length > 5 || form.tags.some(tag => !max(tag,12))) fail('invalid', '초안의 태그가 제한을 넘었습니다.');
  if (!Array.isArray(form.steps) || form.steps.length > 12 || form.steps.some(s =>
    !required(s,['id','label','groupIds','advance','holdMs']) || !isId(s.id) || !max(s.label,24) ||
    !Array.isArray(s.groupIds) || s.groupIds.length > 100 || s.groupIds.some(group => !max(group,256)) ||
    !['manual','auto'].includes(s.advance) || typeof s.holdMs !== 'number' || !Number.isFinite(s.holdMs)))
    fail('invalid', '초안의 단계 형식이 올바르지 않습니다.');
  const c = form.content;
  const notesOk = notes => Array.isArray(notes) && notes.length <= 8 && notes.every(n =>
    required(n,['id','pitch']) && isId(n.id) && max(n.pitch, 20));
  if (form.templateId === 'chord-stack') {
    if (!required(c,['preset','notes','chordName','roman','emphasis']) ||
      !['custom','C-major-I','C-major-IV','C-major-V'].includes(c.preset) ||
      !notesOk(c.notes) || !max(c.chordName,20) || !max(c.roman,20) || typeof c.emphasis !== 'boolean')
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

export function openSceneStorage() {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) return reject(new StorageError('unavailable', '브라우저 저장소를 사용할 수 없습니다.'));
    let blocked = false;
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const [name, keyPath] of [['scenes','id'],['drafts','draftId'],['settings','key'],['meta','key']]) if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath });
    };
    request.onblocked = () => { blocked = true; reject(new StorageError('blocked', '다른 탭을 닫거나 새로고침해 주세요.')); };
    request.onerror = () => reject(request.error || new StorageError('unavailable', '저장소를 열지 못했습니다.'));
    request.onsuccess = () => {
      const db = request.result;
      if (blocked) { db.close(); return; }
      db.onversionchange = () => db.close();
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
  for (const id of [...order, ...ids]) if (ids.has(id) && !output.includes(id)) output.push(id);
  return output;
}
export class SceneStorage {
  constructor(db) { this.db = db; }
  close() { this.db.close(); }
  async listScenes({ includeDeleted = false } = {}) {
    return transaction(this.db, ['scenes','meta'], 'readonly', async tx => {
      const [all, orderRecord] = await Promise.all([req(tx.objectStore('scenes').getAll()), req(tx.objectStore('meta').get('sceneOrder'))]);
      const order = reconcileSceneOrder(orderOf(orderRecord), all);
      const byId = new Map(all.map(s => [s.id, s]));
      return order.map(id => byId.get(id)).filter(s => includeDeleted || !s.deletedAt);
    });
  }
  async getScene(id) { return transaction(this.db, ['scenes'], 'readonly', tx => req(tx.objectStore('scenes').get(id))); }
  async reorderScenes(activeIds) {
    if (!Array.isArray(activeIds) || new Set(activeIds).size !== activeIds.length) fail('invalid', '장면 순서가 올바르지 않습니다.');
    return transaction(this.db, ['scenes','meta'], 'readwrite', async tx => {
      const [all, record] = await Promise.all([req(tx.objectStore('scenes').getAll()), req(tx.objectStore('meta').get('sceneOrder'))]);
      const active = all.filter(s => !s.deletedAt);
      const expected = new Set(active.map(s => s.id));
      if (activeIds.length !== expected.size || activeIds.some(id => !expected.has(id))) fail('conflict', '장면 목록이 변경되었습니다. 목록을 다시 열어 주세요.');
      const oldOrder = reconcileSceneOrder(orderOf(record), all);
      let index = 0;
      const reordered = oldOrder.map(id => expected.has(id) ? activeIds[index++] : id);
      tx.objectStore('meta').put({ key: 'sceneOrder', value: reordered });
    });
  }
  /** expectedRevision is null for creation and an integer for existing scenes. */
  async saveScene(document, { expectedRevision = null, draftId = null } = {}) {
    const scene = clone(document);
    if (scene.origin === 'builtin' || String(scene.id).startsWith('builtin:')) fail('readonly', '기본 장면은 복제해서 저장해 주세요.');
    assertDocument(scene);
    return transaction(this.db, ['scenes','drafts','meta'], 'readwrite', async tx => {
      const scenes = tx.objectStore('scenes');
      const [current, all, orderRecord] = await Promise.all([req(scenes.get(scene.id)), req(scenes.getAll()), req(tx.objectStore('meta').get('sceneOrder'))]);
      if (expectedRevision === null ? !!current : !current || current.revision !== expectedRevision || !!current.deletedAt) fail('conflict', '다른 탭에서 장면이 변경되었거나 삭제되었습니다.');
      if (!current && all.filter(s => !s.deletedAt).length >= MAX_ACTIVE_SCENES) fail('limit', '활성 장면은 최대 1,000개입니다.');
      const time = now();
      scene.origin = 'user'; scene.revision = current ? current.revision + 1 : 1;
      scene.createdAt = current?.createdAt || time; scene.updatedAt = time; scene.deletedAt = null;
      scenes.put(scene);
      tx.objectStore('meta').put({ key: 'sceneOrder', value: reconcileSceneOrder(orderOf(orderRecord), [...all.filter(s => s.id !== scene.id), scene]) });
      if (draftId) tx.objectStore('drafts').delete(draftId);
      return scene;
    });
  }
  async setDeleted(id, expectedRevision, deleted) {
    if (String(id).startsWith('builtin:')) fail('readonly', '기본 장면은 삭제할 수 없습니다.');
    return transaction(this.db, ['scenes'], 'readwrite', async tx => {
      const store = tx.objectStore('scenes');
      const [scene, all] = await Promise.all([req(store.get(id)), req(store.getAll())]);
      if (!scene || scene.revision !== expectedRevision || (!!scene.deletedAt === !!deleted)) fail('conflict', '장면이 이미 변경되었습니다.');
      if (!deleted && all.filter(s => !s.deletedAt).length >= MAX_ACTIVE_SCENES) fail('limit', '활성 장면은 최대 1,000개입니다.');
      scene.deletedAt = deleted ? now() : null; scene.updatedAt = now(); scene.revision++;
      store.put(scene); return scene;
    });
  }
  async permanentlyDelete(id, expectedRevision) {
    return transaction(this.db, ['scenes','meta'], 'readwrite', async tx => {
      const store = tx.objectStore('scenes');
      const [scene, orderRecord] = await Promise.all([req(store.get(id)), req(tx.objectStore('meta').get('sceneOrder'))]);
      if (!scene || !scene.deletedAt || scene.revision !== expectedRevision) fail('conflict', '휴지통의 장면이 변경되었습니다.');
      store.delete(id); tx.objectStore('meta').put({key:'sceneOrder', value:orderOf(orderRecord).filter(x => x !== id)});
    });
  }
  async saveDraft(draft) { const copy = clone(draft); assertDraft(copy); return transaction(this.db,['drafts'],'readwrite', tx => { tx.objectStore('drafts').put(copy); }); }
  async getDraft(id) { return transaction(this.db,['drafts'],'readonly',tx => req(tx.objectStore('drafts').get(id))); }
  async listDrafts() { return transaction(this.db,['drafts'],'readonly',tx => req(tx.objectStore('drafts').getAll())); }
  async deleteDraft(id) { return transaction(this.db,['drafts'],'readwrite',tx => { tx.objectStore('drafts').delete(id); }); }
  async getSetting(key) { const record = await transaction(this.db,['settings'],'readonly',tx => req(tx.objectStore('settings').get(key))); return record?.value; }
  async setSetting(key, value) { return transaction(this.db,['settings'],'readwrite',tx => { tx.objectStore('settings').put({key,value}); }); }
  async importBundle(bundle) {
    const parsed = validatePackage(bundle);
    if (parsed.kind !== 'scene-bundle') fail('invalid', '장면 백업 파일이 아닙니다.');
    const importedAt = now();
    const idMap = new Map(parsed.scenes.map(scene => [scene.id, uid()]));
    const copies = parsed.scenes.map(source => ({...clone(source), id:idMap.get(source.id), origin:'user', revision:1, createdAt:importedAt, updatedAt:importedAt,
      importInfo:{sourceSceneId:source.id, sourceCreatedAt:source.createdAt, sourceUpdatedAt:source.updatedAt, importedAt}}));
    return transaction(this.db,['scenes','meta','settings'],'readwrite',async tx => {
      const store = tx.objectStore('scenes');
      const [existing, orderRecord] = await Promise.all([req(store.getAll()), req(tx.objectStore('meta').get('sceneOrder'))]);
      if (existing.filter(s => !s.deletedAt).length + copies.filter(s => !s.deletedAt).length > MAX_ACTIVE_SCENES) fail('limit', '가져온 후 활성 장면이 1,000개를 초과합니다.');
      for (const scene of copies) store.add(scene);
      const importedOrder = parsed.sceneOrder.map(id => idMap.get(id)).filter(Boolean);
      const all = [...existing,...copies];
      tx.objectStore('meta').put({key:'sceneOrder',value:reconcileSceneOrder([...orderOf(orderRecord),...importedOrder],all)});
      // Settings are intentionally not applied automatically; the caller may offer explicit opt-in.
      return copies;
    });
  }
}

/** Accept parsed object or JSON text. Validation is all-or-nothing before a transaction starts. */
export function validatePackage(input) {
  let value = input;
  if (typeof input === 'string') {
    if (new TextEncoder().encode(input).byteLength > MAX_FILE_BYTES) fail('size', '파일은 5 MiB 이하여야 합니다.');
    try { value = JSON.parse(input); } catch { fail('invalid', 'JSON 파일을 읽을 수 없습니다.'); }
  } else checkSize(value);
  inspectTree(value);
  if (!isObject(value) || value.format !== FORMAT || value.version !== 1 || typeof value.exportedAt !== 'string' || !Number.isFinite(Date.parse(value.exportedAt))) fail('invalid', '지원하지 않는 백업 형식입니다.');
  if (value.kind === 'draft') {
    if (!only(value,['format','version','kind','exportedAt','draft'])) fail('invalid', '초안 파일에 알 수 없는 필드가 있습니다.');
    assertDraft(value.draft);
    return value;
  }
  if (value.kind !== 'scene-bundle' || !only(value,['format','version','kind','exportedAt','scenes','sceneOrder','lessons','settings']) || !Array.isArray(value.scenes) || value.scenes.length < 1 || value.scenes.length > MAX_SCENES || !Array.isArray(value.sceneOrder) || !Array.isArray(value.lessons) || value.lessons.length || !(value.settings === null || isObject(value.settings))) fail('invalid', '지원하지 않는 장면 백업입니다.');
  const ids = new Set();
  for (const scene of value.scenes) {
    assertDocument(scene);
    if (ids.has(scene.id)) fail('invalid', '백업 안에 중복된 장면 ID가 있습니다.');
    ids.add(scene.id);
  }
  const order = new Set();
  for (const id of value.sceneOrder) {
    if (typeof id !== 'string' || !ids.has(id) || order.has(id) || value.scenes.find(s => s.id === id)?.deletedAt) fail('invalid', '장면 순서가 올바르지 않습니다.');
    order.add(id);
  }
  return value;
}
export function makeScenePackage(scenes, { settings = null } = {}) {
  const copies = clone(scenes);
  const result = {format:FORMAT,version:1,kind:'scene-bundle',exportedAt:now(),scenes:copies,sceneOrder:copies.filter(s => !s.deletedAt).map(s => s.id),lessons:[],settings};
  validatePackage(result); return result;
}
export function makeDraftPackage(draft) {
  const copy = clone(draft); delete copy.clientId;
  const result = {format:FORMAT,version:1,kind:'draft',exportedAt:now(),draft:copy}; validatePackage(result); return result;
}
export function recoverImportedDraft(input, clientId = uid()) {
  const pkg = validatePackage(input);
  if (pkg.kind !== 'draft') fail('invalid', '초안 백업 파일이 아닙니다.');
  return {...clone(pkg.draft), draftId:uid(), clientId, sceneId:null, baseRevision:null, updatedAt:now()};
}
