import { validateScene } from '../scene-model.js';
import { validateLesson } from '../lesson-model.js';
import { checkDocumentLayout } from '../scene.js';
import { isSupportedKey, majorScale } from '../theory/scale.js';
import { parsePitch, formatPitch, isStaffPitch } from '../theory/pitch.js';
import { signaturePitches } from './common.js';
import { DIAGRAM_CARD_DEFINITIONS, generateDiagramCard } from './diagram.js';

export { buildDefaultLessonCatalog } from './primary.js';
export { attachJosa, resolveCaption } from './source-compiler.js';
import { MAJOR_KEY_OPTIONS, MINOR_KEY_OPTIONS, staffMinorOptions } from './definition.js';
export { MAJOR_KEY_OPTIONS, MINOR_KEY_OPTIONS } from './definition.js';
import cardNamesAndSolfege from './names-and-solfege.js';
import cardMajorScale from './major-scale.js';
import cardKeySignature from './key-signature.js';
import cardPrimaryTriads from './primary-triads.js';
import cardDominantCadence from './dominant-cadence.js';
import cardMinorScale from './minor-scale.js';
import cardInterval from './interval.js';
import cardMinorTriads from './minor-triads.js';
import cardCadences from './cadences.js';
import cardPentatonic from './pentatonic.js';
export const CARD_DEFINITIONS = Object.freeze([
  cardNamesAndSolfege,
  cardMajorScale,
  cardKeySignature,
  cardPrimaryTriads,
  cardDominantCadence,
  cardMinorScale,
  cardInterval,
  cardMinorTriads,
  cardCadences,
  cardPentatonic,
  ...DIAGRAM_CARD_DEFINITIONS,
]);
const cardsById = new Map(CARD_DEFINITIONS.map(card => [card.id, card]));
export const getAvailableCards = () => CARD_DEFINITIONS;
export const getCardDefinition = id => cardsById.get(id) ?? null;

export function getCardParamOptions(cardId, paramId, options = {}) {
  const card = cardsById.get(cardId), param = card?.params.find(p => p.id === paramId);
  if (!param) return [];
  if (cardId === 'minor-scale' && paramId === 'key' && ['harmonic', 'melodic'].includes(options.form)) return staffMinorOptions;
  if (cardId === 'interval' && paramId === 'fromPitch') {
    const key = typeof options.key === 'string' ? { tonic: options.key.split(':')[0], mode: options.key.split(':')[1] } : options.key ?? { tonic: 'C', mode: 'major' };
    const scale = majorScale(key.tonic, 4, 24), degree = Number(options.degree ?? 5);
    return scale.filter((p, i) => isStaffPitch(p) && isStaffPitch(scale[i + degree - 1])).map(p => ({ value: formatPitch(p), label: formatPitch(p) }));
  }
  return param.options ?? [];
}

function normalizeOptions(card, options) {
  const known = new Set([...card.params.map(p => p.id), 'unit', 'includeSource']);
  for (const name of Object.keys(options)) if (!known.has(name)) throw new Error(`지원하지 않는 카드 조건: ${name}`);
  const result = Object.fromEntries(card.params.map(p => [p.id, options[p.id] ?? p.default]));
  for (const param of card.params) {
    const value = result[param.id];
    if (param.type === 'key') {
      const key = typeof value === 'string' ? { tonic: value.split(':')[0], mode: value.split(':')[1] } : value;
      if (!isSupportedKey(key) || !(param.options ?? []).some(option => option.value === `${key.tonic}:${key.mode}`)) throw new Error('이 카드에서 지원하는 조를 골라 주세요.');
      result[param.id] = { ...key };
    } else if (param.type === 'boolean') {
      if (typeof value !== 'boolean') throw new Error(`${param.label} 조건을 확인해 주세요.`);
    } else if (param.options && !param.options.some(option => option.value === value)) {
      throw new Error(`${param.label} 조건을 확인해 주세요.`);
    } else if (param.type === 'pitch' && !parsePitch(value)) throw new Error(`${param.label}의 음높이를 확인해 주세요.`);
  }
  if (card.id === 'names-and-solfege' && options.labels === undefined && signaturePitches(result.key).length >= 3) result.labels = 'movable-do';
  if (options.unit && !['scene', 'lesson'].includes(options.unit)) throw new Error('한 장면 또는 수업 한 묶음을 골라 주세요.');
  return result;
}

/** Pure generation: no IDs, dates, randomness, DOM or persistence. */
export function generateCard(cardId, options = {}) {
  const card = cardsById.get(cardId);
  if (!card) throw new Error('주제 카드를 찾을 수 없습니다.');
  if (DIAGRAM_CARD_DEFINITIONS.some(item => item.id === cardId)) {
    const params = normalizeOptions(card, options);
    if (options.unit && options.unit !== 'scene') throw new Error('이 카드는 한 장면으로 만들 수 있습니다.');
    const built = generateDiagramCard(cardId, params);
    return { cardId, title: built.scenes[0].title, grade: card.grade, unit: 'scene', ...built };
  }
  const params = normalizeOptions(card, options), unit = options.unit ?? 'scene';
  if (unit === 'lesson' && !card.buildLesson) throw new Error('이 카드는 한 장면으로 만들 수 있습니다.');
  const built = unit === 'lesson' ? card.buildLesson(params) : { title: card.title, grade: card.grade, scenes: [card.buildScene(params)] };
  const sourceParams = Object.fromEntries(Object.entries(params).map(([key, value]) => [key, typeof value === 'object' ? `${value.tonic}:${value.mode}` : value]));
  const scenes = built.scenes.map(scene => {
    const copy = structuredClone(scene);
    copy.tags = [...new Set([...(copy.tags ?? []), '주제카드'])];
    if (options.includeSource !== false) {
      copy.content.source = { cardId, cardVersion: card.version, params: sourceParams };
      copy.templateVersion = 3;
    }
    return copy;
  });
  return { cardId, title: built.title, grade: built.grade, unit, scenes, ...(unit === 'lesson' ? { lesson: { title: built.title, grade: built.grade } } : {}), review: { ...(built.review ?? card.review) }, warnings: [] };
}

/** Application boundary supplies identity, clock and one shared lesson seed. */
export function materializeCard(result, { idPrefix, now, renderSeed } = {}) {
  if (typeof idPrefix !== 'string' || !idPrefix || !now || !Number.isInteger(renderSeed)) throw new Error('장면을 저장하기 위한 ID, 날짜, 그림 씨앗이 필요합니다.');
  const warnings = [...(result.warnings ?? [])];
  const scenes = result.scenes.map((raw, index) => {
    const scene = { ...structuredClone(raw), schemaVersion: 2, id: `${idPrefix}-s${index + 1}`, revision: 1, origin: 'user', createdAt: now, updatedAt: now, deletedAt: null, renderSeed };
    const validation = validateScene(scene);
    if (!validation.valid) throw new Error('이 조건으로는 만들 수 없습니다. ' + validation.errors.map(e => e.message).join(' '));
    warnings.push(...(validation.warnings ?? []));
    const layout = checkDocumentLayout(scene);
    if (layout.errors.length) throw new Error('이 조건으로는 만들 수 없습니다. ' + layout.errors.map(e => e.message).join(' '));
    warnings.push(...layout.warnings);
    return scene;
  });
  const lesson = result.lesson ? { schemaVersion: 1, id: `${idPrefix}-lesson`, revision: 1, origin: 'user', title: result.lesson.title, grade: result.lesson.grade, sceneIds: scenes.map(s => s.id), createdAt: now, updatedAt: now } : undefined;
  if (lesson) {
    const validation = validateLesson(lesson, { sceneIds: scenes.map(s => s.id) });
    if (!validation.valid) throw new Error(validation.errors.map(e => e.message).join(' '));
  }
  return { ...result, scenes, ...(lesson ? { lesson } : {}), warnings };
}
