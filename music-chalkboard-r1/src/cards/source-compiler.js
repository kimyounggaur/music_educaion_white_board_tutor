import { activeGroups, validateScene } from '../scene-model.js';
import {
  describeChord, keyNameKo, letterNameKo, solfegeInKey,
} from '../theory/korean.js';
import { parsePitch, pitchClassName } from '../theory/pitch.js';
import { majorScale } from '../theory/scale.js';

const SOURCE_TIMESTAMP = '2026-11-17T10:26:54.000Z';
const ROMANS = { 1: 'I', 4: 'IV', 5: 'V' };
const NOTE_LABEL_MODE = {
  '없음': 'none',
  '계이름': 'movable-do',
  '음이름': 'ko',
  '둘 다': 'both',
};
const JOSA = new Set(['이/가', '은/는', '을/를', '과/와', '으로/로', '이에요/예요', '이라고/라고']);

const asArray = value => Array.isArray(value) ? value : value ? [value] : [];
const chordColumn = element => ({
  kind: 'chord',
  notes: element.pitches.map(pitch => ({ pitch })),
});

function sourceError(lesson, message) {
  throw new Error(`${lesson.id}: ${message}`);
}

/** 원본 자료의 이론 선언을 실제 음높이로 확인한다. */
function checkSourceElements(lesson) {
  for (const [id, element] of Object.entries(lesson.elements)) {
    const pitches = element.pitches.map(parsePitch);
    if (pitches.some(pitch => !pitch)) sourceError(lesson, `${id}의 음높이가 올바르지 않습니다.`);
    if (element.scale === 'major') {
      const expected = majorScale(lesson.key.tonic, pitches[0].octave, 8);
      if (pitches.length !== expected.length || pitches.some((pitch, index) =>
        pitch.midi !== expected[index].midi || pitchClassName(pitch) !== pitchClassName(expected[index]))) {
        sourceError(lesson, `${id}의 장음계가 계산 결과와 다릅니다.`);
      }
    }
    if (element.type === 'chord') {
      const expected = ROMANS[element.degree] + (element.kind === 'seventh' ? '7' : '');
      if (describeChord(chordColumn(element), lesson.key).roman !== expected) {
        sourceError(lesson, `${id}의 화음이 선언한 조의 화음과 다릅니다.`);
      }
    }
  }
}

export function attachJosa(word, pair, lesson = {id:"caption"}) {
  const last = word.charCodeAt(word.length - 1);
  if (!JOSA.has(pair) || !(last >= 0xac00 && last <= 0xd7a3)) {
    sourceError(lesson, `${word} 뒤에 ${pair} 조사를 붙일 수 없습니다.`);
  }
  const finalConsonant = (last - 0xac00) % 28;
  const hasConsonant = finalConsonant !== 0 && (pair !== '으로/로' || finalConsonant !== 8);
  return word + pair.split('/')[hasConsonant ? 0 : 1];
}

export function resolveCaption(lesson, caption) {
  const result = caption.replace(/\{([^{}]+)\}/g, (placeholder, body) => {
    const [reference, pair] = body.split(':');
    let value;
    if (reference === 'key') {
      value = keyNameKo(lesson.key.tonic, lesson.key.mode);
    } else {
      const match = /^([a-z][a-z0-9]*)(?:\[(\d+)\])?\.(name|letters|solfege)$/.exec(reference);
      const element = match && Object.hasOwn(lesson.elements, match[1]) && lesson.elements[match[1]];
      if (!element) sourceError(lesson, `자막 참조 ${placeholder}의 대상을 찾을 수 없습니다.`);
      const [, , ordinal, property] = match;
      const pitches = ordinal === undefined ? element.pitches : [element.pitches[Number(ordinal) - 1]];
      if (pitches.some(pitch => !pitch)) sourceError(lesson, `자막 참조 ${placeholder}의 음 번호가 잘못되었습니다.`);
      if (property === 'name') {
        value = element.type === 'chord' && describeChord(chordColumn(element), lesson.key).name;
      } else {
        const names = pitches.map(parsePitch).map(pitch => property === 'letters'
          ? letterNameKo(pitch)
          : solfegeInKey(pitch, lesson.key.tonic, lesson.key.mode));
        if (names.every(Boolean)) value = names.join(', ');
      }
    }
    if (!value) sourceError(lesson, `자막 참조 ${placeholder}의 값을 계산할 수 없습니다.`);
    return pair ? attachJosa(value, pair, lesson) : value;
  });
  if (/[{}]/.test(result)) sourceError(lesson, '자막에 완성되지 않은 참조가 있습니다.');
  return result;
}

function columnId(target, ordinal) {
  return ordinal === undefined ? target : `${target}-${ordinal}`;
}

function makeColumns(lesson, visible, labels, step) {
  const highlights = new Map(asArray(step.highlight).map(spec => [spec.target, spec]));
  return visible.flatMap(target => {
    const element = lesson.elements[target];
    const labelsHere = labels.get(target);
    const selected = highlights.get(target);
    const notes = element.pitches.map((pitch, index) => ({ id: `${target}-${index + 1}`, pitch }));
    const highlightIds = selected?.notes?.map(ordinal => notes[ordinal - 1].id) ?? [];
    if (element.type === 'chord') {
      return [{
        id: columnId(target), kind: 'chord', notes, labelMode: 'none',
        highlightNoteIds: highlightIds, emphasis: Boolean(selected && !selected.notes),
        showName: labelsHere === '둘 다' || labelsHere === '이름',
        showRoman: labelsHere === '둘 다' || labelsHere === '로마 숫자',
      }];
    }
    return notes.map((note, index) => ({
      id: columnId(target, index + 1),
      kind: 'note',
      notes: [note],
      labelMode: NOTE_LABEL_MODE[labelsHere],
      highlightNoteIds: selected && (!selected.notes || highlightIds.includes(note.id)) ? [note.id] : [],
    }));
  });
}

function targetColumns(lesson, target, ordinals) {
  const element = lesson.elements[target];
  if (element.type === 'chord') return [columnId(target)];
  const selection = ordinals ?? element.pitches.map((_, index) => index + 1);
  return selection.map(ordinal => columnId(target, ordinal));
}

function compileCue(lesson, step, columns, keyLabels) {
  if (step.ask) {
    const target = lesson.elements[step.ask.answer];
    // 두 이름 찾기 문제는 오선 위 음계의 음으로 답을 참조한다.
    const columnIds = target.pitches.map((pitch, index) => {
      const id = target.type === 'chord' ? columnId(step.ask.answer) : columnId(step.ask.answer, index + 1);
      return columns.find(column => column.id === id)?.id
        ?? columns.find(column => column.kind === 'note' && column.notes[0].pitch === pitch)?.id
        ?? sourceError(lesson, `건반 문제의 답 ${pitch}을 오선에서 찾을 수 없습니다.`);
    });
    return {
      type: 'practice',
      order: step.ask.order === '차례로' ? 'sequential' : 'free',
      keyboard: { ...lesson.keyboard, labelMode: NOTE_LABEL_MODE[keyLabels] },
      columnIds: [...new Set(columnIds)],
    };
  }
  const targets = asArray(step.play).flatMap(spec =>
    targetColumns(lesson, spec.target, spec.notes).map(columnId => ({ columnId })));
  return targets.length ? { type: 'listen', targets } : null;
}

function chooseVisible(lesson, visible, step) {
  if (lesson.id !== 'c-major-triads') return [...visible];
  // 음계 여덟 음과 화음 세 개는 한 오선에서 동시에 보여 주기 어렵다.
  // 음을 고르는 화면에는 음계를, 쌓기·비교·해보기 화면에는 보이는 화음을 놓는다.
  const presentsScale = asArray(step.play).some(spec => spec.target === 'scale');
  return [...visible].filter(id => presentsScale ? id === 'scale' : id !== 'scale');
}

export function compileSourceLesson(source, lessonIndex = 0) {
  checkSourceElements(source);
  const id = `builtin:lesson-${source.id}`;
  const visible = new Set();
  const labels = new Map(Object.entries(source.elements).map(([elementId, element]) =>
    [elementId, element.labels ?? (element.type === 'chord' ? '둘 다' : '없음')]));
  const gaps = new Set();
  let keyLabels = '없음';

  const scenes = source.steps.map((step, index) => {
    for (const target of step.hide ?? []) visible.delete(target);
    for (const target of step.show ?? []) visible.add(target);
    if (step.set?.labels) labels.set(step.set.target, step.set.labels);
    if (step.set?.gaps === true) gaps.add(step.set.target);
    if (step.set?.gaps === false) gaps.delete(step.set.target);
    keyLabels = step.keyLabels ?? keyLabels;
    const displayed = chooseVisible(source, visible, step);
    const columns = makeColumns(source, displayed, labels, step);
    const scene = {
      schemaVersion: 2,
      id: `${id}-s${index + 1}`,
      revision: 1,
      origin: 'builtin',
      templateId: columns.every(column => column.kind === 'chord') ? 'chord-stack' : 'note-selection',
      templateVersion: 2,
      title: `${source.title} · ${index + 1}단계`,
      tags: [],
      question: '',
      caption: resolveCaption(source, step.caption),
      content: {
        key: { ...source.key },
        columns,
        showGaps: displayed.some(target => gaps.has(target)),
      },
      steps: [],
      createdAt: SOURCE_TIMESTAMP,
      updatedAt: SOURCE_TIMESTAMP,
      deletedAt: null,
      renderSeed: (lessonIndex + 1) * 100,
    };
    const cue = compileCue(source, step, columns, keyLabels);
    scene.steps.push({
      id: `instruction-${index + 1}`,
      label: step.ask ? '해보기' : `${index + 1}단계`,
      groupIds: activeGroups(scene),
      advance: 'manual',
      holdMs: 0,
      ...(cue ? { cue } : {}),
    });
    const result = validateScene(scene);
    if (!result.valid) sourceError(source, `단계 ${index + 1}: ${result.errors.map(e => e.message).join(' ')}`);
    return scene;
  });

  return {
    lesson: {
      schemaVersion: 1,
      id,
      revision: 1,
      origin: 'builtin',
      title: source.title,
      grade: source.grade,
      sceneIds: scenes.map(scene => scene.id),
      createdAt: SOURCE_TIMESTAMP,
      updatedAt: SOURCE_TIMESTAMP,
    },
    scenes,
    review: { ...source.review },
    stageMap: scenes.map((scene, index) => ({
      sourceStep: index + 1,
      sceneId: scene.id,
      stepId: scene.steps[0].id,
    })),
  };
}
