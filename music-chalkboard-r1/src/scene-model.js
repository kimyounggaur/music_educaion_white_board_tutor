import { describeChord } from './theory/korean.js';
import { diatonicIndex, isStaffPitch, parsePitch, pitchClassNumber } from './theory/pitch.js';
import { buildKeyboard } from './theory/keyboard.js';
import { accidentalEvents, DEFAULT_KEY, isSupportedKey, keySignatureAccidentals } from './theory/scale.js';

// Persistent scene data is intentionally independent of rendering and storage.
export const CHORD_PRESETS = Object.freeze({
  'C-major-I': { pitches: ['C4', 'E4', 'G4'], chordName: '으뜸화음', roman: 'I' },
  'C-major-IV': { pitches: ['F4', 'A4', 'C5'], chordName: '버금딸림화음', roman: 'IV' },
  'C-major-V': { pitches: ['G4', 'B4', 'D5'], chordName: '딸림화음', roman: 'V' },
});
export const TEMPLATE_IDS = ['chord-stack', 'note-selection', 'text-explanation'];
export const NOTE_LABEL_MODES = Object.freeze(['none', 'fixed-do', 'movable-do', 'ko', 'en', 'both']);
export const MAX_NOTATION_COLUMNS = 8;
const LEGACY_CHORD_ID = 'legacy-chord';
const uid = () => globalThis.crypto?.randomUUID?.() ?? `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
const step = (label, groupIds) => ({ id: uid(), label, groupIds, advance: 'manual', holdMs: 0 });
const pitchIndex = p => {
  if (typeof p !== 'string' || !/^[CDEFGAB][4-6]$/.test(p)) return -1;
  const n = (Number(p[1]) - 4) * 7 + 'CDEFGAB'.indexOf(p[0]);
  return n <= 14 ? n : -1;
};
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const count = value => {
  if (typeof Intl !== 'undefined' && Intl.Segmenter) return [...new Intl.Segmenter('ko', { granularity: 'grapheme' }).segment(value.normalize('NFC'))].length;
  return [...value.normalize('NFC')].length;
};
const iso = value => typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/.test(value) && Number.isFinite(Date.parse(value));

function notationTemplate(templateId) {
  return templateId === 'chord-stack' || templateId === 'note-selection';
}

function legacyColumns(scene) {
  const content = scene?.content;
  if (!Array.isArray(content?.notes)) return [];
  if (scene.templateId === 'chord-stack') {
    return [{
      id: LEGACY_CHORD_ID,
      kind: 'chord',
      notes: content.notes,
      labelMode: 'none',
      highlightNoteIds: [],
      emphasis: content.emphasis,
      showName: typeof content.chordName === 'string' && Boolean(content.chordName.trim()),
      showRoman: typeof content.roman === 'string' && Boolean(content.roman.trim()),
      legacyName: content.chordName,
      legacyRoman: content.roman,
    }];
  }
  return content.notes.map((note, index) => ({
    id: `note-${index + 1}`,
    kind: 'note',
    notes: [note],
    labelMode: content.showLabels ? 'fixed-do' : 'none',
    highlightNoteIds: Array.isArray(content.highlightNoteIds) && content.highlightNoteIds.includes(note?.id) ? [note.id] : [],
  }));
}

export function getColumns(scene) {
  if (!notationTemplate(scene?.templateId)) return [];
  if (scene.schemaVersion === 2) return Array.isArray(scene.content?.columns) ? scene.content.columns : [];
  return legacyColumns(scene);
}

export function columnGroupIds(column) {
  if (column.id === LEGACY_CHORD_ID) return { name: 'name', roman: 'roman', emphasis: 'emphasis/chord' };
  return { name: `name/${column.id}`, roman: `roman/${column.id}`, emphasis: `emphasis-column/${column.id}` };
}

export function hasKeySignature(key) {
  return !!key && Object.values(keySignatureAccidentals(key.tonic, key.mode)).some(Boolean);
}

function activeNotationGroups(scene) {
  const groups = ['staff', 'clef'];
  if (hasKeySignature(scene.content.key)) groups.push('key-signature');
  const columns = getColumns(scene);
  let previous;
  for (const column of columns) {
    if (!isRecord(column) || !Array.isArray(column.notes)) continue;
    const notes = column.notes.filter(note => typeof note?.id === 'string');
    groups.push(...notes.map(note => `note/${note.id}`));
    if (NOTE_LABEL_MODES.includes(column.labelMode) && column.labelMode !== 'none') {
      groups.push(...notes.map(note => `label/${note.id}`));
    }
    if (Array.isArray(column.highlightNoteIds)) {
      groups.push(...notes.filter(note => column.highlightNoteIds.includes(note.id)).map(note => `emphasis/${note.id}`));
    }
    if (column.kind === 'chord') {
      const ids = columnGroupIds(column);
      if (column.showName) groups.push(ids.name);
      if (column.showRoman) groups.push(ids.roman);
      if (column.emphasis) groups.push(ids.emphasis);
    }
    if (scene.content.showGaps && previous?.kind === 'note' && column.kind === 'note') groups.push(`gap/${column.id}`);
    previous = column;
  }
  return groups;
}

/** IDs of all currently visible semantic groups, in default rendering order. */
export function activeGroups(scene) {
  if (!scene || !isRecord(scene.content)) return [];
  const c = scene.content, groups = [];
  if (typeof scene.question === 'string' && scene.question.trim()) groups.push('question');
  if (scene.templateId === 'chord-stack' || scene.templateId === 'note-selection') {
    if (scene.schemaVersion === 2) groups.push(...activeNotationGroups(scene));
    else groups.push(...activeLegacyNotationGroups(scene));
  } else if (scene.templateId === 'text-explanation') {
    for (const b of (Array.isArray(c.blocks) ? c.blocks : [])) if (b && typeof b.id === 'string') groups.push(`body/${b.id}`);
  }
  if (typeof scene.caption === 'string' && scene.caption.trim()) groups.push('caption');
  return groups;
}

function activeLegacyNotationGroups(scene) {
  const c = scene.content;
  const groups = ['staff', 'clef'];
  const notes = Array.isArray(c.notes) ? c.notes : [];
  for (const n of notes) if (n && typeof n.id === 'string') groups.push(`note/${n.id}`);
  if (scene.templateId === 'chord-stack') {
    if (typeof c.chordName === 'string' && c.chordName.trim()) groups.push('name');
    if (typeof c.roman === 'string' && c.roman.trim()) groups.push('roman');
    if (c.emphasis) groups.push('emphasis/chord');
  } else {
    if (c.showLabels) for (const n of notes) if (n && typeof n.id === 'string') groups.push(`label/${n.id}`);
    for (const id of (Array.isArray(c.highlightNoteIds) ? c.highlightNoteIds : [])) groups.push(`emphasis/${id}`);
  }
  return groups;
}

/** Default grouping; absent optional content never produces empty steps. */
export function defaultSteps(scene) {
  const all = activeGroups(scene), has = id => all.includes(id), result = [];
  const add = (label, ids) => { const present = ids.filter(has); if (present.length) result.push(step(label, present)); };
  add('질문', ['question']);
  if (scene.templateId === 'text-explanation') {
    for (const group of all.filter(g => g.startsWith('body/'))) add('본문', [group]);
  } else {
    add('오선과 음자리표', ['staff', 'clef', 'key-signature']);
    add('음표', all.filter(g => g.startsWith('note/') || g.startsWith('label/')));
    add('이름과 강조', all.filter(g => g === 'name' || g === 'roman' || /^(?:name|roman|emphasis|emphasis-column|gap)\//.test(g)));
  }
  add('정리', ['caption']);
  return result;
}

function groupRequirements(scene, active) {
  const requirements = new Map();
  const add = (id, ...ids) => requirements.set(id, [...(requirements.get(id) ?? []), ...ids]);
  const notes = active.filter(id => id.startsWith('note/'));
  const keySignature = active.includes('key-signature');
  add('clef', 'staff');
  if (keySignature) add('key-signature', 'staff', 'clef');
  for (const note of notes) add(note, 'staff', 'clef', ...(keySignature ? ['key-signature'] : []));
  for (const id of active) {
    if (id.startsWith('label/') || (id.startsWith('emphasis/') && id !== 'emphasis/chord')) {
      add(id, `note/${id.slice(id.indexOf('/') + 1)}`);
    }
  }
  if (scene.schemaVersion !== 2) {
    add('emphasis/chord', ...notes);
    return requirements;
  }

  const columns = getColumns(scene).filter(column => Array.isArray(column?.notes));
  let previous;
  for (const column of columns) {
    const noteIds = column.notes.map(note => `note/${note?.id}`);
    if (column.kind === 'chord') {
      const groups = columnGroupIds(column);
      add(groups.emphasis, ...noteIds);
      // V1 saves could put legacy names before the notes. Their step order remains valid.
      if (column.id !== LEGACY_CHORD_ID) {
        add(groups.name, ...noteIds);
        add(groups.roman, ...noteIds);
      }
    } else if (column.notes.some(note => note?.id === 'chord')) {
      add('emphasis/chord', 'note/chord');
    }
    if (previous?.kind === 'note' && column.kind === 'note') {
      add(`gap/${column.id}`, ...previous.notes.map(note => `note/${note?.id}`), ...noteIds);
    }
    previous = column;
  }
  const key = isSupportedKey(scene.content?.key) ? scene.content.key : DEFAULT_KEY;
  for (const [id, event] of accidentalEvents(columns, key)) {
    if (event.dependency) add(`note/${id}`, `note/${event.dependency}`);
  }
  return requirements;
}

/** Preserve the teacher's step order while synchronizing changed content groups. */
export function reconcileSteps(scene) {
  const active = activeGroups(scene), activeSet = new Set(active), seen = new Set();
  const columns = new Set(getColumns(scene).map(column => column?.id));
  const result = (Array.isArray(scene.steps) ? scene.steps : []).map(original => {
    const current = { ...original, groupIds: (Array.isArray(original.groupIds) ? original.groupIds : []).filter(id => {
      if (!activeSet.has(id) || seen.has(id)) return false;
      seen.add(id);
      return true;
    }) };
    if (scene.schemaVersion === 2 && current.cue?.type === 'listen' && Array.isArray(current.cue.targets)) {
      const targets = current.cue.targets.filter(target => columns.has(target?.columnId));
      if (targets.length) current.cue = { ...current.cue, targets };
      else delete current.cue;
    }
    if (scene.schemaVersion === 2 && current.cue?.type === 'practice' && Array.isArray(current.cue.columnIds)) {
      // A deleted answer invalidates the entire question, instead of silently changing it.
      if (current.cue.columnIds.some(id => !columns.has(id))) delete current.cue;
    }
    return current;
  }).filter(s => s.groupIds.length || (scene.schemaVersion === 2 && s.cue));
  const requiredBy = groupRequirements(scene, active);
  const requirements = id => requiredBy.get(id) ?? [];
  const locate = id => {
    for (let i=0;i<result.length;i++) { const j=result[i].groupIds.indexOf(id); if(j>=0)return {step:i,index:j}; }
    return null;
  };
  const missing = active.filter(id => !seen.has(id));
  for (const id of missing) {
    if (id.startsWith('body/')) { result.push(step('본문', [id])); continue; }
    if (id === 'question') { result.unshift(step('질문', [id])); continue; }
    if (id === 'caption') { result.push(step('정리', [id])); continue; }
    const family = id.split('/')[0];
    let targetIndex = -1;
    for (let i=result.length-1;i>=0;i--) if (result[i].groupIds.some(g => g.split('/')[0] === family)) {targetIndex=i;break;}
    if (targetIndex < 0 && (family === 'label' || family === 'emphasis')) {
      for (let i=result.length-1;i>=0;i--) if (result[i].groupIds.some(g => g.startsWith('note/'))) {targetIndex=i;break;}
    }
    const before = requirements(id).map(locate).filter(Boolean);
    const after = active.filter(g => requirements(g).includes(id)).map(locate).filter(Boolean);
    const lower = before.length ? Math.max(...before.map(p=>p.step)) : 0;
    const upper = after.length ? Math.min(...after.map(p=>p.step)) : Math.max(result.length-1,0);
    if (!result.length) { result.push(step(['staff','clef','key-signature'].includes(id)?'오선과 음자리표':'추가 내용', [id])); continue; }
    if (targetIndex < 0) targetIndex = ['staff','clef','key-signature'].includes(id) ? 0 : result.length-1;
    // Place newly introduced groups between their existing prerequisites and dependents.
    // Do not reorder pre-existing groups or silently repair an already invalid arrangement.
    if (lower <= upper) targetIndex=Math.max(lower,Math.min(targetIndex,upper));
    const groups=result[targetIndex].groupIds;
    const minIndex=before.filter(p=>p.step===targetIndex).reduce((n,p)=>Math.max(n,p.index+1),0);
    const maxIndex=after.filter(p=>p.step===targetIndex).reduce((n,p)=>Math.min(n,p.index),groups.length);
    const insertion=minIndex<=maxIndex ? maxIndex : groups.length;
    groups.splice(insertion,0,id);
  }
  return result;
}

export function createScene(templateId = 'chord-stack') {
  if (!TEMPLATE_IDS.includes(templateId)) throw new Error('지원하지 않는 장면 유형입니다.');
  const now = new Date().toISOString();
  let content;
  if (templateId === 'chord-stack') content = { preset: 'C-major-I', notes: ['C4', 'E4', 'G4'].map(pitch => ({ id: uid(), pitch })), chordName: '으뜸화음', roman: 'I', emphasis: true };
  else if (templateId === 'note-selection') {
    const notes = ['C4', 'D4', 'E4', 'F4', 'G4'].map(pitch => ({ id: uid(), pitch }));
    content = { notes, showLabels: true, highlightNoteIds: [notes[0].id, notes[2].id, notes[4].id] };
  } else content = { blocks: [{ id: uid(), text: '여기에 설명을 입력하세요.', ink: 'main' }] };
  const scene = { schemaVersion: 1, id: uid(), revision: 1, origin: 'user', templateId, templateVersion: 1, title: '새 장면', tags: [], question: '', caption: '', content, steps: [], createdAt: now, updatedAt: now, deletedAt: null, renderSeed: Math.floor(Math.random() * 2147483647) };
  scene.steps = defaultSteps(scene);
  return scene;
}

function upgradeForm(form) {
  const copy = structuredClone(form);
  if (notationTemplate(copy.templateId)) {
    copy.templateVersion = 2;
    copy.content = { key: { ...DEFAULT_KEY }, columns: legacyColumns(copy) };
  }
  return copy;
}

/** Upgrade in memory only. A normal save writes the new document version. */
export function upgradeSceneV1(scene) {
  if (scene?.schemaVersion !== 1) return scene;
  return { ...upgradeForm(scene), schemaVersion: 2 };
}

export function upgradeDraftV1(draft) {
  if (draft?.editorVersion !== 1) return draft;
  return { ...structuredClone(draft), editorVersion: 2, formData: upgradeForm(draft.formData) };
}

export function createSceneV2(templateId = 'chord-stack') {
  const scene = upgradeSceneV1(createScene(templateId));
  if (templateId === 'chord-stack') {
    const [column] = scene.content.columns;
    column.id = uid();
    delete column.legacyName;
    delete column.legacyRoman;
    scene.steps = defaultSteps(scene);
  }
  return scene;
}

/** Return a v1 document when all teaching content can be represented in v1. */
export function downgradeSceneV2(scene) {
  if (scene?.schemaVersion === 1) return validateSceneV1(scene).valid ? structuredClone(scene) : null;
  if (scene?.schemaVersion !== 2 || !validateScene(scene).valid || scene.steps.some(step => step.cue)) return null;
  const legacy = { ...structuredClone(scene), schemaVersion: 1, templateVersion: 1 };
  if (!notationTemplate(scene.templateId)) return legacy;
  const { key, columns, showGaps } = scene.content;
  if (key.tonic !== 'C' || key.mode !== 'major' || showGaps) return null;
  if (columns.some(column => column.teacherMemo || Object.hasOwn(column, 'legacyName') && column.id !== LEGACY_CHORD_ID)) return null;

  if (scene.templateId === 'note-selection') {
    const mode = columns[0].labelMode;
    if (!['none', 'fixed-do'].includes(mode) || columns.some(column => column.kind !== 'note' || column.labelMode !== mode)) return null;
    legacy.content = {
      notes: columns.map(column => structuredClone(column.notes[0])),
      showLabels: mode === 'fixed-do',
      highlightNoteIds: columns.flatMap(column => column.highlightNoteIds),
    };
  } else {
    const [column] = columns;
    if (columns.length !== 1 || column.kind !== 'chord' || column.notes.length !== 3 || column.labelMode !== 'none' || column.highlightNoteIds.length) return null;
    const { name, roman } = describeChord(column, key);
    const chordName = column.showName ? (column.legacyName ?? name) : '';
    const numeral = column.showRoman ? (column.legacyRoman ?? roman) : '';
    if ((column.showName && !chordName) || (column.showRoman && !numeral)) return null;
    const preset = Object.keys(CHORD_PRESETS).find(id => (
      CHORD_PRESETS[id].roman === numeral && CHORD_PRESETS[id].pitches.every((pitch, index) => column.notes[index].pitch === pitch)
    )) ?? 'custom';
    const ids = columnGroupIds(column);
    const aliases = { [ids.name]: 'name', [ids.roman]: 'roman', [ids.emphasis]: 'emphasis/chord' };
    legacy.steps = legacy.steps.map(step => ({ ...step, groupIds: step.groupIds.map(id => aliases[id] ?? id) }));
    legacy.content = { preset, notes: structuredClone(column.notes), chordName, roman: numeral, emphasis: !!column.emphasis };
  }
  return validateSceneV1(legacy).valid ? legacy : null;
}

function validateNotation(scene, validate) {
  const { fail, only, str, identifier, warn } = validate;
  const content = scene.content;
  if (!only(content, ['key','columns','showGaps'], 'content')) return;
  if (only(content.key, ['tonic','mode'], 'content.key') && !isSupportedKey(content.key)) {
    fail('content.key', '지원하는 장조 또는 가자연단음계를 선택해 주세요.');
  }
  if (content.showGaps !== undefined && typeof content.showGaps !== 'boolean') fail('content.showGaps', '음 사이 표시 설정이 올바르지 않습니다.');
  if (!Array.isArray(content.columns) || content.columns.length < 1 || content.columns.length > MAX_NOTATION_COLUMNS) {
    fail('content.columns', `오선에 1~${MAX_NOTATION_COLUMNS}개 열을 넣어 주세요.`);
    return;
  }

  const columns = new Set();
  const notes = new Set();
  let previous;
  content.columns.forEach((column, index) => {
    const field = `content.columns.${index}`;
    const common = ['id','kind','notes','labelMode','highlightNoteIds'];
    const chordFields = ['showName','showRoman','emphasis','teacherMemo','legacyName','legacyRoman'];
    if (!only(column, column?.kind === 'chord' ? [...common, ...chordFields] : common, field)) return;
    identifier(column.id, `${field}.id`);
    if (columns.has(column.id)) fail(`${field}.id`, '오선의 열 ID가 중복되었습니다.');
    columns.add(column.id);
    if (!['note','chord'].includes(column.kind)) fail(`${field}.kind`, '음표 또는 화음을 선택해 주세요.');
    if (!NOTE_LABEL_MODES.includes(column.labelMode)) fail(`${field}.labelMode`, '음이름 표시 형식이 올바르지 않습니다.');
    if (column.id === LEGACY_CHORD_ID && (column.kind !== 'chord' || scene.templateId !== 'chord-stack')) {
      fail(`${field}.id`, '기존 화음 전용 열 ID입니다.');
    }
    if (column.kind === 'chord') {
      for (const flag of ['showName','showRoman','emphasis']) {
        if (column[flag] !== undefined && typeof column[flag] !== 'boolean') fail(`${field}.${flag}`, '화음의 표시 설정이 올바르지 않습니다.');
      }
      if (column.teacherMemo !== undefined) str(column.teacherMemo, `${field}.teacherMemo`, 80, false, false);
      for (const name of ['legacyName','legacyRoman']) {
        if (column[name] === undefined) continue;
        if (column.id !== LEGACY_CHORD_ID) fail(`${field}.${name}`, '이전 자료의 이름은 이전 화음 열에만 보관할 수 있습니다.');
        str(column[name], `${field}.${name}`, 20, false, false);
      }
    }

    const min = column.kind === 'chord' ? 3 : 1;
    const max = column.kind === 'chord' ? 4 : 1;
    if (!Array.isArray(column.notes) || column.notes.length < min || column.notes.length > max) {
      fail(`${field}.notes`, column.kind === 'chord' ? '화음은 3~4음이어야 합니다.' : '음표 열에는 음 하나가 필요합니다.');
      previous = null;
      return;
    }
    const ids = new Set();
    const positions = new Set();
    const pitches = [];
    column.notes.forEach((note, noteIndex) => {
      const path = `${field}.notes.${noteIndex}`;
      if (!only(note, ['id','pitch'], path)) return;
      identifier(note.id, `${path}.id`);
      if (notes.has(note.id)) fail(`${path}.id`, '음 ID가 중복되었습니다.');
      notes.add(note.id);
      ids.add(note.id);
      const pitch = parsePitch(note.pitch);
      if (!isStaffPitch(pitch)) { fail(`${path}.pitch`, '도4부터 솔6까지의 음을 선택해 주세요.'); return; }
      const position = diatonicIndex(pitch);
      if (positions.has(position)) fail(`${path}.pitch`, '같은 자리의 음은 한 화음에 한 번만 놓을 수 있습니다.');
      positions.add(position);
      pitches.push(pitch);
    });
    if (!Array.isArray(column.highlightNoteIds) || column.highlightNoteIds.some(id => !ids.has(id)) || new Set(column.highlightNoteIds).size !== column.highlightNoteIds.length) {
      fail(`${field}.highlightNoteIds`, '강조할 음이 없거나 중복되었습니다.');
    }
    if (column.kind === 'chord' && pitches.length === column.notes.length) {
      if (pitches.some((pitch, index) => index > 0 && pitch.midi <= pitches[index - 1].midi)) {
        fail(`${field}.notes`, '화음의 음은 낮은 음부터 순서대로 놓아 주세요.');
      }
      const description = describeChord(column, content.key);
      if (description.warning && (column.showName || column.showRoman)) warn(`${field}.notes`, description.warning);
    }
    const current = column.kind === 'note' ? pitches[0] : null;
    if (content.showGaps && previous && current) {
      const interval = Math.abs(current.midi - previous.midi);
      if (interval !== 1 && interval !== 2) fail(`${field}.notes`, '온음·반음 표시는 거리가 1 또는 2반음인 이웃 음에서 사용할 수 있습니다.');
    }
    previous = current;
  });
}

function validateCue(scene, cue, path, { fail, only }) {
  const columns = new Map(getColumns(scene).filter(Boolean).map(column => [column.id, column]));
  if (cue?.type === 'listen') {
    if (!only(cue, ['type','targets'], path)) return;
    if (!Array.isArray(cue.targets) || cue.targets.length < 1 || cue.targets.length > 32) {
      fail(`${path}.targets`, '들을 음이나 화음을 하나 이상 선택해 주세요.');
      return;
    }
    cue.targets.forEach((target, index) => {
      const field = `${path}.targets.${index}`;
      if (only(target, ['columnId'], field) && !columns.has(target.columnId)) fail(field, '장면에 없는 음이나 화음입니다.');
    });
    return;
  }
  if (cue?.type !== 'practice') { fail(path, '지원하지 않는 단계 활동입니다.'); return; }
  if (!only(cue, ['type','order','keyboard','columnIds'], path)) return;
  if (!['free','sequential'].includes(cue.order)) fail(`${path}.order`, '해보기의 응답 순서를 선택해 주세요.');
  if (!Array.isArray(cue.columnIds) || cue.columnIds.length < 1 || cue.columnIds.length > MAX_NOTATION_COLUMNS ||
      cue.columnIds.some(id => !columns.has(id)) || new Set(cue.columnIds).size !== cue.columnIds.length) {
    fail(`${path}.columnIds`, '해보기 정답의 음이나 화음을 확인해 주세요.');
    return;
  }
  if (!only(cue.keyboard, ['from','to','labelMode'], `${path}.keyboard`)) return;
  if (cue.keyboard.labelMode !== undefined && !NOTE_LABEL_MODES.includes(cue.keyboard.labelMode)) {
    fail(`${path}.keyboard.labelMode`, '건반 이름 표시 형식이 올바르지 않습니다.');
  }
  const keys = buildKeyboard(cue.keyboard.from, cue.keyboard.to);
  if (!keys.length) { fail(`${path}.keyboard`, '건반의 범위는 최대 두 옥타브의 흰 건반 양 끝으로 정해 주세요.'); return; }
  const classes = new Set(keys.map(key => pitchClassNumber(key.midi)));
  const missing = cue.columnIds.some(id => {
    const notes = columns.get(id).notes;
    return !Array.isArray(notes) || notes.some(note => {
      const pitch = parsePitch(note?.pitch);
      return !pitch || !classes.has(pitchClassNumber(pitch.midi));
    });
  });
  if (missing) fail(`${path}.keyboard`, '건반 범위에 정답 음이 모두 들어 있어야 합니다.');
}

export function validateSceneV1(scene) {
  return validateVersion(scene, 1);
}

/** Validate a complete persisted document. Returns field diagnostics without modifying it. */
export function validateScene(scene) {
  return scene?.schemaVersion === 2 ? validateVersion(scene, 2) : validateSceneV1(scene);
}

function validateVersion(scene, version) {
  const errors = [], warnings = [];
  const warn = (field, message) => warnings.push({ field, message });
  const result = () => version === 2 ? { valid: !errors.length, errors, warnings } : { valid: !errors.length, errors };
  const fail = (field, message) => errors.push({ field, message });
  const only = (obj, allowed, field) => { if (!isRecord(obj)) { fail(field, '올바른 객체가 아닙니다.'); return false; } for (const key of Object.keys(obj)) if (!allowed.includes(key)) fail(field, `알 수 없는 항목: ${key}`); return true; };
  const str = (v, field, max, required = false, multiline = true) => {
    if (typeof v !== 'string') { fail(field, '문자열을 입력해 주세요.'); return; }
    if (required && !v.trim()) fail(field, '내용을 입력해 주세요.');
    if (count(v.trim()) > max) fail(field, `${max}자 이하로 입력해 주세요.`);
    if (!multiline && /[\r\n]/.test(v)) fail(field, '줄바꿈을 사용할 수 없습니다.');
  };
  const identifier = (v, f) => { if (typeof v !== 'string' || !v.trim() || v.length > 128 || /[\u0000-\u001f/]/.test(v)) fail(f, '올바른 ID가 아닙니다.'); };
  if (!only(scene, ['schemaVersion','id','revision','origin','templateId','templateVersion','title','tags','question','caption','content','steps','createdAt','updatedAt','deletedAt','renderSeed','importInfo'], 'scene')) return result();
  if (scene.schemaVersion !== version) fail('schemaVersion', '지원하지 않는 장면 버전입니다.');
  identifier(scene.id, 'id');
  if (!Number.isSafeInteger(scene.revision) || scene.revision < 1) fail('revision', '올바른 저장 버전이 아닙니다.');
  if (!['builtin','user'].includes(scene.origin)) fail('origin', '올바른 장면 출처가 아닙니다.');
  if (scene.origin === 'builtin' && !String(scene.id).startsWith('builtin:')) fail('id', '기본 장면 ID가 올바르지 않습니다.');
  if (scene.origin === 'user' && String(scene.id).startsWith('builtin:')) fail('id', '사용자 장면 ID가 올바르지 않습니다.');
  if (!TEMPLATE_IDS.includes(scene.templateId)) fail('templateId', '지원하지 않는 장면 유형입니다.');
  if (scene.templateVersion !== (version === 2 && notationTemplate(scene.templateId) ? 2 : 1)) fail('templateVersion', '지원하지 않는 템플릿 버전입니다.');
  str(scene.title, 'title', 40, true, false); str(scene.question, 'question', 80); str(scene.caption, 'caption', 120);
  if (typeof scene.question === 'string' && scene.question.split(/\r\n|\r|\n/).length > 2) fail('question', '질문은 최대 두 줄입니다.');
  if (typeof scene.caption === 'string' && scene.caption.split(/\r\n|\r|\n/).length > 3) fail('caption', '정리는 최대 세 줄입니다.');
  if (!Array.isArray(scene.tags) || scene.tags.length > 5) fail('tags', '태그는 최대 5개입니다.');
  else { const tags = new Set(); scene.tags.forEach((t, i) => { str(t, `tags.${i}`, 12, true, false); if (typeof t === 'string') { const n = t.trim().normalize('NFC'); if (tags.has(n)) fail('tags', '중복 태그를 제거해 주세요.'); tags.add(n); } }); }
  for (const key of ['createdAt','updatedAt']) if (!iso(scene[key])) fail(key, '올바른 날짜가 아닙니다.');
  if (scene.deletedAt !== null && !iso(scene.deletedAt)) fail('deletedAt', '올바른 삭제 날짜가 아닙니다.');
  if (!Number.isSafeInteger(scene.renderSeed)) fail('renderSeed', '올바른 렌더 시드가 아닙니다.');
  if (scene.importInfo !== undefined && only(scene.importInfo, ['sourceSceneId','sourceCreatedAt','sourceUpdatedAt','importedAt'], 'importInfo')) {
    str(scene.importInfo.sourceSceneId, 'importInfo.sourceSceneId', 128, true, false);
    for (const key of ['sourceCreatedAt','sourceUpdatedAt','importedAt']) if (!iso(scene.importInfo[key])) fail(`importInfo.${key}`, '올바른 날짜가 아닙니다.');
  }
  const c = scene.content;
  if (notationTemplate(scene.templateId) && version === 2) validateNotation(scene, { fail, only, str, identifier, warn });
  else if (notationTemplate(scene.templateId)) {
    if (only(c, scene.templateId === 'chord-stack' ? ['preset','notes','chordName','roman','emphasis'] : ['notes','showLabels','highlightNoteIds'], 'content')) {
      const max = scene.templateId === 'chord-stack' ? 3 : 8, min = scene.templateId === 'chord-stack' ? 3 : 2;
      const ids = new Set(), pitches = [];
      if (!Array.isArray(c.notes) || c.notes.length < min || c.notes.length > max) fail('content.notes', `음은 ${min}~${max}개여야 합니다.`);
      else c.notes.forEach((n, i) => { if (!only(n, ['id','pitch'], `content.notes.${i}`)) return; identifier(n.id, `content.notes.${i}.id`); if (ids.has(n.id)) fail('content.notes', '음 ID가 중복되었습니다.'); ids.add(n.id); const p = pitchIndex(n.pitch); pitches.push(p); if (p < 0) fail(`content.notes.${i}.pitch`, '도4부터 도6까지 자연음을 선택해 주세요.'); });
      if (scene.templateId === 'chord-stack') {
        if (!['custom', ...Object.keys(CHORD_PRESETS)].includes(c.preset)) fail('content.preset', '올바른 화음 프리셋이 아닙니다.');
        str(c.chordName, 'content.chordName', 20, false, false); str(c.roman, 'content.roman', 20, false, false);
        if (typeof c.emphasis !== 'boolean') fail('content.emphasis', '강조 설정이 올바르지 않습니다.');
        if (pitches.length === 3 && pitches.every(p => p >= 0) && (pitches[1] - pitches[0] !== 2 || pitches[2] - pitches[1] !== 2)) fail('content.notes', '낮은 음부터 3도 간격으로 쌓은 세 음을 선택해 주세요.');
        if (c.preset === 'custom' && c.roman !== '') fail('content.roman', '직접 입력한 화음은 로마 숫자를 비워 주세요.');
        const preset = Object.hasOwn(CHORD_PRESETS, c.preset) ? CHORD_PRESETS[c.preset] : null;
        if (preset && ((Array.isArray(c.notes) ? c.notes.map(n => n?.pitch).join(',') : '') !== preset.pitches.join(',') || c.roman !== preset.roman)) fail('content.preset', '프리셋의 음과 로마 숫자가 일치하지 않습니다.');
      } else {
        if (typeof c.showLabels !== 'boolean') fail('content.showLabels', '계이름 설정이 올바르지 않습니다.');
        if (!Array.isArray(c.highlightNoteIds) || c.highlightNoteIds.length > 8) fail('content.highlightNoteIds', '강조할 음 설정이 올바르지 않습니다.');
        else { const selected = new Set(); for (const id of c.highlightNoteIds) { if (!ids.has(id) || selected.has(id)) fail('content.highlightNoteIds', '강조할 음이 없거나 중복되었습니다.'); selected.add(id); } }
      }
    }
  } else if (scene.templateId === 'text-explanation' && only(c, ['blocks'], 'content')) {
    const ids = new Set(); let total = 0;
    if (!Array.isArray(c.blocks) || c.blocks.length < 1 || c.blocks.length > 6) fail('content.blocks', '본문은 1~6개가 필요합니다.');
    else c.blocks.forEach((b, i) => { if (!only(b, ['id','text','ink'], `content.blocks.${i}`)) return; identifier(b.id, `content.blocks.${i}.id`); if (ids.has(b.id)) fail('content.blocks', '본문 ID가 중복되었습니다.'); ids.add(b.id); str(b.text, `content.blocks.${i}.text`, 80, true); if (typeof b.text === 'string') total += count(b.text.trim()); if (!['main','accent'].includes(b.ink)) fail(`content.blocks.${i}.ink`, '올바른 강조 색상이 아닙니다.'); });
    if (total > 360) fail('content.blocks', '본문은 모두 합쳐 360자 이하여야 합니다.');
  }
  const groups = activeGroups(scene), groupSet = new Set(groups), membership = new Map(), stepIds = new Set();
  if (!Array.isArray(scene.steps) || scene.steps.length < 1 || scene.steps.length > 12) fail('steps', '단계는 1~12개가 필요합니다.');
  else scene.steps.forEach((s, i) => {
    const path = `steps.${i}`;
    const stepFields = ['id','label','groupIds','advance','holdMs'];
    if (version === 2) stepFields.push('cue');
    if (!only(s, stepFields, path)) return;
    if (version === 2 && s.cue !== undefined) validateCue(scene, s.cue, `${path}.cue`, { fail, only });
    identifier(s.id, `steps.${i}.id`); if (stepIds.has(s.id)) fail('steps', '단계 ID가 중복되었습니다.'); stepIds.add(s.id);
    str(s.label, `steps.${i}.label`, 24, true, false);
    if (!['manual','auto'].includes(s.advance)) fail(`steps.${i}.advance`, '단계 진행 방식이 올바르지 않습니다.');
    if (!Number.isInteger(s.holdMs) || s.holdMs < 0 || s.holdMs > 10000 || s.holdMs % 100) fail(`steps.${i}.holdMs`, '대기 시간은 0~10000ms의 100ms 단위여야 합니다.');
    if (!Array.isArray(s.groupIds) || (!s.groupIds.length && !(version === 2 && s.cue)) || s.groupIds.length > 100) { fail(`steps.${i}.groupIds`, '단계에 표시할 내용을 넣어 주세요.'); return; }
    s.groupIds.forEach((g, index) => { if (!groupSet.has(g)) fail(`steps.${i}.groupIds`, `없는 내용: ${String(g)}`); if (membership.has(g)) fail(`steps.${i}.groupIds`, `내용이 중복 배정되었습니다: ${String(g)}`); else membership.set(g, {step:i, index}); });
  });
  for (const g of groups) if (!membership.has(g)) fail('steps', `단계에 배정되지 않은 내용: ${g}`);
  const prereq = (dependent, required) => {
    const after = membership.get(dependent), before = membership.get(required);
    if (after && before && (after.step < before.step || (after.step === before.step && after.index < before.index)))
      fail(`steps.${after.step}.groupIds`, `${dependent}보다 ${required}을 먼저 표시해 주세요.`);
  };
  for (const [group, required] of groupRequirements(scene, groups)) {
    for (const prerequisite of required) prereq(group, prerequisite);
  }
  if (version === 2 && Array.isArray(scene.steps)) {
    const columns = new Map(getColumns(scene).filter(Boolean).map(column => [column.id, column]));
    scene.steps.forEach((step, index) => {
      if (step?.cue?.type !== 'listen') return;
      const targets = step.cue.targets;
      if (!Array.isArray(targets)) return;
      for (const target of targets) {
        const notes = columns.get(target?.columnId)?.notes;
        if (!Array.isArray(notes)) continue;
        if (notes.some(note => (membership.get(`note/${note?.id}`)?.step ?? Infinity) > index)) {
          fail(`steps.${index}.cue.targets`, '들을 음은 이 단계까지 보여 주어야 합니다.');
        }
      }
    });
  }
  return result();
}
