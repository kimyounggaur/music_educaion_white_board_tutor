import {MAX_BACKUP_PARTS, MAX_FILE_BYTES, MAX_SCENES, makeScenePackage} from './scene-storage.js';

const encoder = new TextEncoder();
const bytes = value => encoder.encode(JSON.stringify(value)).byteLength;

function backupComponents(scenes, lessons, builtinSceneIds) {
  const positions = new Map(scenes.map((scene, index) => [scene.id, index]));
  if (positions.size !== scenes.length) throw new Error('백업할 장면 ID가 중복되었습니다.');
  const builtinIds = new Set([...builtinSceneIds].filter(id => typeof id === 'string' && id.startsWith('builtin:')));
  const parent = scenes.map((_, index) => index);
  const root = index => {
    while (parent[index] !== index) {
      parent[index] = parent[parent[index]];
      index = parent[index];
    }
    return index;
  };
  const references = lessons.map(lesson => {
    if (!Array.isArray(lesson.sceneIds)) throw new Error('수업의 장면 목록을 확인해 주세요.');
    return lesson.sceneIds.flatMap(id => {
      if (positions.has(id)) return [positions.get(id)];
      if (builtinIds.has(id)) return [];
      throw new Error(`“${lesson.title}” 수업에서 빠진 장면이 있습니다. 휴지통을 포함하거나 수업의 장면을 확인해 주세요.`);
    });
  });
  for (const indices of references) {
    for (const index of indices.slice(1)) parent[root(index)] = root(indices[0]);
  }
  const groups = new Map();
  for (const [index, scene] of scenes.entries()) {
    const id = root(index);
    if (!groups.has(id)) groups.set(id, {scenes:[], lessons:[]});
    groups.get(id).scenes.push(scene);
  }
  for (const [index, lesson] of lessons.entries()) {
    const [first] = references[index];
    if (first === undefined) groups.set(`lesson:${index}`, {scenes:[], lessons:[lesson]});
    else groups.get(root(first)).lessons.push(lesson);
  }
  return {groups:[...groups.values()], positions};
}

/** Prepare independent parts, keeping every connected lesson and scene group together. */
export function splitBackupScenes(scenes, settings = null, {lessons = [], builtinSceneIds = [], exportedAt = new Date().toISOString()} = {}) {
  if (!Array.isArray(scenes) || !Array.isArray(lessons) || (!scenes.length && !lessons.length)) {
    throw new Error('백업할 내 장면이나 수업이 없습니다.');
  }
  const {groups, positions} = backupComponents(scenes, lessons, builtinSceneIds);
  const byteBudget = MAX_FILE_BYTES - bytes(settings) - 4096;
  const chunks = [];
  let chunk = {scenes:[], lessons:[], byteCount:0};

  for (const group of groups) {
    const groupBytes = group.scenes.reduce((size, scene) => size + bytes(scene) + bytes(scene.id) + 12, 0)
      + group.lessons.reduce((size, lesson) => size + bytes(lesson) + 1, 0);
    if (group.scenes.length > MAX_SCENES || group.lessons.length > MAX_SCENES || groupBytes > byteBudget) {
      throw new Error('같은 수업에서 사용하는 자료가 백업 파일 한도를 초과합니다. 수업을 따로 선택하거나 장면만 백업해 주세요.');
    }
    if (chunk.scenes.length + group.scenes.length > MAX_SCENES || chunk.lessons.length + group.lessons.length > MAX_SCENES
      || chunk.byteCount + groupBytes > byteBudget) {
      chunks.push(chunk);
      chunk = {scenes:[], lessons:[], byteCount:0};
    }
    chunk.scenes.push(...group.scenes);
    chunk.lessons.push(...group.lessons);
    chunk.byteCount += groupBytes;
  }
  chunks.push(chunk);
  if (chunks.length > MAX_BACKUP_PARTS) throw new Error('백업 파일 수가 한도를 초과했습니다.');

  const id = globalThis.crypto?.randomUUID?.() ?? `backup-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return chunks.map((part, index) => {
    part.scenes.sort((a, b) => positions.get(a.id) - positions.get(b.id));
    const backupSet = {id, part:index + 1, total:chunks.length, scenePositions:part.scenes.map(scene => positions.get(scene.id))};
    return makeScenePackage(part.scenes, {settings, lessons:part.lessons, builtinSceneIds, exportedAt, backupSet});
  });
}
