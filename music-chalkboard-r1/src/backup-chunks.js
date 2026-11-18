import { MAX_FILE_BYTES, MAX_SCENES, makeScenePackage } from './scene-storage.js';

/** Prepare valid, independently importable packages without exceeding either file limit. */
export function splitBackupScenes(scenes, settings = null) {
  if (!Array.isArray(scenes) || !scenes.length) throw new Error('백업할 내 장면이 없습니다.');
  const encoder = new TextEncoder();
  const budget = MAX_FILE_BYTES - encoder.encode(JSON.stringify(settings)).length - 4096;
  const chunks = [];
  let chunk = [], bytes = 0;
  for (const scene of scenes) {
    const size = encoder.encode(JSON.stringify(scene)).length + encoder.encode(JSON.stringify(scene.id)).length + 2;
    if (size > budget) throw new Error('한 장면의 크기가 너무 커서 백업할 수 없습니다.');
    if (chunk.length && (chunk.length >= MAX_SCENES || bytes + size > budget)) { chunks.push(chunk); chunk = []; bytes = 0; }
    chunk.push(scene); bytes += size;
  }
  if (chunk.length) chunks.push(chunk);
  return chunks.map(items => makeScenePackage(items, {settings}));
}
