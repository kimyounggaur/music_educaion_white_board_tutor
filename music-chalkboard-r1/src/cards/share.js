import { generateCard, getCardDefinition } from './index.js';

export const CARD_LINK_PREFIX = '#mwb-card1=';
const encoder = new TextEncoder(), decoder = new TextDecoder('utf-8', { fatal: true });
const fields = ['title', 'tags', 'question', 'caption', 'templateId', 'templateVersion', 'content', 'steps'];
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const canonical = value => Array.isArray(value) ? value.map(canonical) : record(value) ? Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])])) : value;
const equals = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
const content = scene => Object.fromEntries(fields.map(key => [key, scene?.[key]]));
const encode = bytes => btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
const invalid = () => new Error('주제 카드 링크가 잘렸거나 지원하지 않는 형식입니다.');
const versionError = () => new Error('이 링크는 다른 판의 앱에서 만들었습니다. 장면 파일을 요청해 주세요.');

/** Return a descriptor only when every editable field still matches generation. */
export function cardShareDescriptor({ scene, lesson, scenes = [] }) {
  const selected = lesson ? lesson.sceneIds.map(id => scenes.find(s => s.id === id)) : [scene];
  if (!selected.length || selected.some(s => !s || s.deletedAt)) return null;
  const source = selected[0].content?.source;
  if (!source || selected.some(s => !equals(s.content?.source, source))) return null;
  const card = getCardDefinition(source.cardId);
  if (!card || card.version !== source.cardVersion) return null;
  let result;
  try { result = generateCard(source.cardId, { ...source.params, unit: lesson ? 'lesson' : 'scene' }); } catch { return null; }
  if (selected.length !== result.scenes.length || selected.some((s, index) => !equals(content(s), content(result.scenes[index])))) return null;
  if (lesson && (lesson.title !== result.lesson?.title || lesson.grade !== result.lesson?.grade)) return null;
  return { version: 1, cardId: source.cardId, cardVersion: source.cardVersion, params: structuredClone(source.params), unit: lesson ? 'lesson' : 'scene' };
}

/** null means use the existing content link or file; never lose teacher edits. */
export function makeCardShareLink({ baseUrl, ...selection }) {
  const descriptor = cardShareDescriptor(selection);
  if (!descriptor) return null;
  const url = new URL(baseUrl);
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('HTTPS로 열린 앱에서 공유 링크를 만들 수 있습니다.');
  url.search = '';
  const bytes = encoder.encode(JSON.stringify(descriptor));
  if (bytes.byteLength > 3072) throw new Error('공유 링크 한도를 넘었습니다. 장면 파일을 사용해 주세요.');
  url.hash = CARD_LINK_PREFIX + encode(bytes);
  if (url.href.length > 4096) throw new Error('공유 링크 한도를 넘었습니다. 장면 파일을 사용해 주세요.');
  return url.href;
}

/** Regenerate a pure preview. The application chooses identity and whether to save. */
export function readCardShareLink(hashOrUrl) {
  if (typeof hashOrUrl !== 'string' || !hashOrUrl.includes('#mwb-card')) return null;
  const hash = hashOrUrl.slice(hashOrUrl.indexOf('#'));
  if (!hash.startsWith(CARD_LINK_PREFIX) || hashOrUrl.length > 4096) throw invalid();
  const encoded = hash.slice(CARD_LINK_PREFIX.length);
  if (!/^[A-Za-z0-9_-]+$/.test(encoded) || encoded.length % 4 === 1 || Math.floor(encoded.length * 3 / 4) > 3072) throw invalid();
  let payload;
  try {
    const bytes = Uint8Array.from(atob(encoded.replaceAll('-', '+').replaceAll('_', '/')), c => c.charCodeAt(0));
    if (encode(bytes) !== encoded) throw invalid();
    payload = JSON.parse(decoder.decode(bytes));
  } catch { throw invalid(); }
  if (!record(payload) || Object.keys(payload).sort().join() !== ['version', 'cardId', 'cardVersion', 'params', 'unit'].sort().join() || payload.version !== 1 || !['scene', 'lesson'].includes(payload.unit) || !record(payload.params) || Object.keys(payload.params).length > 8 || Object.values(payload.params).some(value => !['string', 'number', 'boolean'].includes(typeof value)) || Object.keys(payload.params).some(k => ['__proto__', 'prototype', 'constructor'].includes(k))) throw invalid();
  const card = getCardDefinition(payload.cardId);
  if (!card || card.version !== payload.cardVersion) throw versionError();
  return { descriptor: payload, result: generateCard(payload.cardId, { ...payload.params, unit: payload.unit }) };
}
