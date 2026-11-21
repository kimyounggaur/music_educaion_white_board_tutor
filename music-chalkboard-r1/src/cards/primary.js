import { majorScale } from '../theory/scale.js';
import { keyNameKo, letterNameKo } from '../theory/korean.js';
import { diatonicIndex, formatPitch, parsePitch } from '../theory/pitch.js';
import { sourceLessons } from '../lessons/source-lessons.js';
import { compileSourceLesson } from './source-compiler.js';
import { emphasisGroups, finishSteps, keyboardPositionDescription, keyboardRange, keySignatureText, labelGroups, listen, nameGroups, noteColumn, chordColumn, noteGroups, practiceCue, sceneDraft, signaturePitches, staffGroups, step } from './common.js';

const SUBJECTS = { 'names-and-solfege': '음이름과 계이름', 'major-scale': '음계', 'key-signature': '조표', 'primary-triads': '주요 3화음', 'dominant-cadence': '딸림7화음과 마침꼴' };
export function buildPrimaryScene(id, { key, labels, practice }) {
  const scale = majorScale(key.tonic, 4, 15), keyName = keyNameKo(key.tonic, key.mode);
  const columns = scale.slice(0, 8).map((p, i) => noteColumn(p, i, labels));
  const scene = sceneDraft(`${keyName} ${SUBJECTS[id]}`, '', key, columns);
  const add = (label, ids, cue) => scene.steps.push(step(label, ids, cue));
  const addCommon = () => { add('오선과 조표', staffGroups(key)); add('음표', columns.flatMap(noteGroups)); };
  const listenAll = () => add('차례로 듣기', [], listen(columns.map(c => c.id)));
  const addPractice = (label, selected, order) => { if (practice) add(label, [], practiceCue(columns, selected, order)); };
  if (id === 'names-and-solfege') {
    scene.caption = `${keyName}에서 도는 ${letterNameKo(scale[0])}예요. 계이름은 조마다 자리가 달라지고, 음이름은 변하지 않아요.`;
    addCommon(); add('이름', labelGroups(columns)); add('정리', ['caption']); listenAll();
    addPractice('건반에서 솔을 눌러 보세요', [columns[4].id], 'free');
  } else if (id === 'major-scale') {
    scene.caption = '온음, 온음, 반음, 온음, 온음, 온음, 반음. 이 모양이 장음계예요.';
    scene.content.showGaps = true;
    [2, 3, 6, 7].forEach(i => columns[i].highlightNoteIds.push(columns[i].notes[0].id));
    addCommon(); add('이름', labelGroups(columns)); add('온음과 반음', columns.slice(1).map(c => `gap/${c.id}`));
    add('반음 자리', emphasisGroups(columns), listen([2, 3, 6, 7].map(i => columns[i].id)));
    add('정리', ['caption']); listenAll(); addPractice('도부터 차례로 눌러 보세요', columns.map(c => c.id), 'sequential');
  } else if (id === 'key-signature') {
    const signature = keySignatureText(key);
    const changed = new Set(signaturePitches(key).map(p => p.letter));
    columns.filter(c => changed.has(parsePitch(c.notes[0].pitch).letter)).forEach(c => c.highlightNoteIds.push(c.notes[0].id));
    scene.caption = signature.count ? `${keyName}의 조표는 ${signature.type} ${signature.count}개예요. ${signature.names}에 붙어요.` : '다장조에는 조표가 없어요. 모든 음을 제자리로 연주해요.';
    add('오선과 음자리표', ['staff', 'clef']); if (signature.count) add('조표', ['key-signature']);
    add('음계', columns.flatMap(noteGroups)); add('조표가 붙는 음', emphasisGroups(columns));
    add('음이름', labelGroups(columns)); add('정리', ['caption']); listenAll();
  } else {
    const seventh = id === 'dominant-cadence';
    const degrees = seventh ? [[4, 6, 8], [4, 6, 8, 10], [7, 9, 11]] : [[0, 2, 4], [3, 5, 7], [4, 6, 8]];
    const chords = degrees.map((indices, i) => chordColumn(indices.map(n => scale[n]), i));
    scene.content.columns = chords; scene.templateId = 'chord-stack';
    scene.caption = seventh ? '딸림7화음에서 으뜸화음으로 끝나는 꼴을 마침꼴이라고 해요.' : '으뜸화음, 버금딸림화음, 딸림화음을 주요 3화음이라고 해요.';
    if (seventh) chords[1].highlightNoteIds.push(chords[1].notes[3].id);
    add('오선과 조표', staffGroups(key));
    const labels = seventh ? ['딸림화음', '딸림7화음', '으뜸화음'] : ['으뜸화음', '버금딸림화음', '딸림화음'];
    chords.forEach((c, i) => add(labels[i], [...noteGroups(c), ...nameGroups(c), ...c.highlightNoteIds.map(n => `emphasis/${n}`)]));
    add('정리', ['caption']); add(seventh ? '이어서 듣기' : '차례로 듣기', [], listen((seventh ? chords.slice(1) : chords).map(c => c.id)));
    if (practice) add(seventh ? '딸림7화음의 네 음을 눌러 보세요' : '딸림화음의 세 음을 눌러 보세요', [], practiceCue(chords, [chords[seventh ? 1 : 2].id], 'free'));
  }
  return finishSteps(scene);
}

const SOURCE_INDEX = { 'names-and-solfege': 0, 'major-scale': 1, 'primary-triads': 2, 'dominant-cadence': 3 };
export function generalizedSource(id, key) {
  const index = SOURCE_INDEX[id], original = sourceLessons[index];
  if (!original) throw new Error('이 주제의 수업 대본을 찾을 수 없습니다.');
  const source = structuredClone(original), scale = majorScale(key.tonic, 4, 24);
  source.key = { ...key };
  source.title = `${keyNameKo(key.tonic, key.mode)} ${SUBJECTS[id]}`;
  if (key.tonic === 'C') source.title = original.title;
  for (const element of Object.values(source.elements)) element.pitches = element.pitches.map(p => formatPitch(scale[diatonicIndex(parsePitch(p)) - 28]));
  source.keyboard = key.tonic === 'C' ? { ...original.keyboard } : keyboardRange(Object.values(source.elements).flatMap(e => e.pitches));
  if (id === 'names-and-solfege') {
    source.steps[4].caption = `{scale[1].solfege}({scale[1].letters})는 ${keyboardPositionDescription(scale[0].midi)}이에요.`;
  }
  if (id === 'major-scale') source.steps[2].caption = '{scale[3].solfege:과/와} {scale[4].solfege} 사이는 반음이에요. 건반에서 바로 옆 건반이에요.';
  return { source, index };
}

export function buildPrimaryLesson(id, options) {
  if (id === 'key-signature') return buildSignatureLesson(options);
  const { source, index } = generalizedSource(id, options.key);
  source.title = `${keyNameKo(options.key.tonic, options.key.mode)} ${SUBJECTS[id]}`;
  const bundle = compileSourceLesson(source, index);
  const scenes = bundle.scenes.filter(scene => options.practice !== false || !scene.steps.some(s => s.cue?.type === 'practice'))
    .map((scene, i) => ({ ...toRawScene(scene), title: `${source.title} · ${i + 1}단계` }));
  return { title: bundle.lesson.title, grade: bundle.lesson.grade, scenes, review: bundle.review };
}
export function buildDefaultLessonCatalog() {
  return Object.keys(SOURCE_INDEX).map(id => { const { source, index } = generalizedSource(id, { tonic: 'C', mode: 'major' }); return compileSourceLesson(source, index); });
}
export function toRawScene(scene) {
  return Object.fromEntries(['title', 'tags', 'question', 'caption', 'templateId', 'templateVersion', 'content', 'steps'].map(key => [key, structuredClone(scene[key])]));
}
function buildSignatureLesson({ key }) {
  const signature = keySignatureText(key);
  if (!signature.count) throw new Error('다장조는 조표 읽기 수업 묶음 대신 한 장면으로 만들어 주세요.');
  const scale = majorScale(key.tonic, 4, 8), changed = new Set(signaturePitches(key).map(p => p.letter));
  const captions = [
    `${signature.keyName}의 조표예요. ${signature.type}가 ${signature.count}개 있어요.`,
    `조표는 ${signature.names}에 붙어요. 그 음은 늘 ${signature.action} 연주해요.`,
    `${signature.keyName}의 으뜸음은 ${letterNameKo(scale[0])}예요.`,
    '으뜸음부터 차례로 도 레 미 파 솔 라 시 도예요.',
    '조표가 붙는 음을 건반에서 모두 눌러 보세요.',
  ];
  const scenes = captions.map((caption, index) => {
    // Keep IDs stable when the scale enters on the second view.
    const columns = scale.map((p, i) => noteColumn(p, i, index >= 3 ? 'both' : 'ko'));
    const selected = index === 1 ? columns.filter(c => changed.has(parsePitch(c.notes[0].pitch).letter)) : [columns[0], columns[7]];
    if (index > 0) selected.forEach(c => c.highlightNoteIds.push(c.notes[0].id));
    const scene = sceneDraft(`${signature.keyName} 조표 · ${index + 1}단계`, caption, key, columns);
    let groups = [...staffGroups(key), ...(index ? [...columns.flatMap(noteGroups), ...labelGroups(columns), ...emphasisGroups(columns)] : []), 'caption'];
    if (!index) {
      // A signature-only view contains no note or label groups.
      scene.content.columns = [];
    }
    const cue = index === 1 ? listen(selected.map(c => c.id)) : index === 2 ? listen([columns[0].id, columns[7].id]) : index === 3 ? listen(columns.map(c => c.id)) : index === 4 ? practiceCue(columns, columns.filter(c => changed.has(parsePitch(c.notes[0].pitch).letter)).map(c => c.id), 'free') : null;
    scene.steps = [step(index === 4 ? '해보기' : `${index + 1}단계`, groups, cue)];
    return finishSteps(scene);
  });
  return { title: `${signature.keyName} 조표`, grade: '공통', scenes, review: { author: 'AI', status: '교사 검토 전' } };
}
