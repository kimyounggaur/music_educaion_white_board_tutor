import {validateScene} from './scene-model.js';
import {validateLesson} from './lesson-model.js';
import {inspectTree, makeScenePackage} from './scene-storage.js';

export const MAX_SHARE_URL_CHARS = 4096;
export const MAX_SHARE_JSON_BYTES = 3072;
const PREFIX = '#mwb1=';
const fields = ['schemaVersion','templateId','templateVersion','title','tags','question','caption','content','steps','renderSeed'];
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', {fatal:true});
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const exactKeys = (value, keys) => record(value) && Object.keys(value).length === keys.length
  && keys.every(key => Object.hasOwn(value, key));
const allowedRef = value => typeof value === 'string' && /^s[1-9][0-9]?$/.test(value);
const sizeError = () => new Error('공유 링크에 담을 수 있는 길이를 초과했습니다. 장면이나 수업 파일을 사용해 주세요.');
const formatError = () => new Error('공유 링크가 잘렸거나 지원하지 않는 형식입니다.');

function encode(bytes) {
  return btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/, '');
}

function sceneContent(scene) {
  if (!validateScene(scene).valid || scene.deletedAt) throw new Error('공유할 장면을 확인해 주세요.');
  return Object.fromEntries(fields.map(key => [key, scene[key]]));
}

/** The HTTPS page loads only the app. The shared data stays in its URL fragment. */
export function makeShareLink({baseUrl, scene, lesson, scenes = []}) {
  const url = new URL(baseUrl);
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('HTTPS로 열린 앱에서 공유 링크를 만들 수 있습니다.');
  url.search = '';
  const payload = lesson ? {
    version:1, kind:'lesson',
    lesson:{title:lesson.title, grade:lesson.grade, sceneRefs:[]},
    scenes:[],
  } : {version:1, kind:'scene', scene:sceneContent(scene)};
  if (lesson) {
    const byId = new Map(scenes.map(item => [item.id, item]));
    if (!validateLesson(lesson, {sceneIds:new Set(byId.keys())}).valid) {
      throw new Error('수업이 참조하는 장면을 모두 확인해 주세요.');
    }
    for (const [index, id] of lesson.sceneIds.entries()) {
      const ref = `s${index + 1}`;
      payload.lesson.sceneRefs.push(ref);
      payload.scenes.push({ref, scene:sceneContent(byId.get(id))});
    }
  }
  const bytes = encoder.encode(JSON.stringify(payload));
  if (bytes.byteLength > MAX_SHARE_JSON_BYTES) throw sizeError();
  url.hash = PREFIX + encode(bytes);
  const link = url.href;
  if (link.length > MAX_SHARE_URL_CHARS) throw sizeError();
  return link;
}

function restoreScene(content, index, time) {
  if (!exactKeys(content, fields)) throw formatError();
  const scene = {
    ...content, id:`shared-scene-${index + 1}`, revision:1, origin:'user',
    createdAt:time, updatedAt:time, deletedAt:null,
  };
  if (!validateScene(scene).valid) throw formatError();
  return scene;
}

export function readShareLink(hashOrUrl) {
  if (typeof hashOrUrl !== 'string') return null;
  const firstHash = hashOrUrl.indexOf('#');
  if (firstHash === -1) return null;
  const hash = hashOrUrl.slice(firstHash);
  if (!/^#mwb(?:[0-9]|=|$)/.test(hash)) return null;
  if (hashOrUrl.length > MAX_SHARE_URL_CHARS) throw sizeError();
  if (!hash.startsWith(PREFIX)) throw formatError();
  const encoded = hash.slice(PREFIX.length);
  if (!/^[A-Za-z0-9_-]+$/.test(encoded) || encoded.length % 4 === 1) throw formatError();
  if (Math.floor(encoded.length * 3 / 4) > MAX_SHARE_JSON_BYTES) throw sizeError();
  const bytes = Uint8Array.from(atob(encoded.replaceAll('-','+').replaceAll('_','/')), char => char.charCodeAt(0));
  if (encode(bytes) !== encoded) throw formatError();
  let payload;
  try { payload = JSON.parse(decoder.decode(bytes)); }
  catch { throw formatError(); }
  inspectTree(payload);
  const time = new Date().toISOString();
  if (exactKeys(payload,['version','kind','scene']) && payload.version === 1 && payload.kind === 'scene') {
    const scenes = [restoreScene(payload.scene, 0, time)];
    return {kind:'scene', scenes, bundle:makeScenePackage(scenes)};
  }

  if (!exactKeys(payload,['version','kind','lesson','scenes']) || payload.version !== 1 || payload.kind !== 'lesson'
    || !exactKeys(payload.lesson,['title','grade','sceneRefs']) || !Array.isArray(payload.lesson.sceneRefs)
    || !Array.isArray(payload.scenes) || !payload.scenes.length || payload.scenes.length > 50) throw formatError();
  const byRef = new Map();
  for (const [index, item] of payload.scenes.entries()) {
    if (!exactKeys(item,['ref','scene']) || !allowedRef(item.ref) || byRef.has(item.ref)) throw formatError();
    byRef.set(item.ref, restoreScene(item.scene, index, time));
  }
  const {sceneRefs, title, grade} = payload.lesson;
  if (sceneRefs.length !== byRef.size || new Set(sceneRefs).size !== byRef.size || sceneRefs.some(ref => !byRef.has(ref))) {
    throw formatError();
  }
  const scenes = sceneRefs.map(ref => byRef.get(ref));
  const lesson = {
    schemaVersion:1, id:'shared-lesson', revision:1, origin:'user', title, grade,
    sceneIds:scenes.map(scene => scene.id), createdAt:time, updatedAt:time,
  };
  if (!validateLesson(lesson).valid) throw formatError();
  return {kind:'lesson', scenes, lesson, bundle:makeScenePackage(scenes,{lessons:[lesson]})};
}
