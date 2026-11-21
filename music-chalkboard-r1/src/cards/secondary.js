import { scaleInKey, majorScale } from '../theory/scale.js';
import { formatPitch, parsePitch, diatonicIndex } from '../theory/pitch.js';
import { keyNameKo, letterNameKo, describeChord } from '../theory/korean.js';
import { describeInterval } from '../theory/interval.js';
import { diatonicChord, classifyCadence } from '../theory/chord.js';
import { THEORY_POLICY } from '../theory/policy.js';
import { chordColumn, emphasisGroups, finishSteps, labelGroups, listen, nameGroups, nearestChord, noteColumn, noteGroups, practiceCue, sceneDraft, staffGroups, step } from './common.js';

export function buildMinorScale(options) {
  const { key, form, labels, practice } = options;
  const scale = scaleInKey(key, 4, 8, form), columns = scale.map((p, i) => noteColumn(p, i, labels));
  const formName = { natural: '자연', harmonic: '화성', melodic: '가락' }[form];
  const captions = { natural: '온음, 반음, 온음, 온음, 반음, 온음, 온음. 이 모양이 자연단음계예요.', harmonic: '자연단음계의 일곱째 음을 반음 올리면 화성단음계가 돼요.', melodic: '올라갈 때 여섯째와 일곱째 음을 반음 올리면 가락단음계가 돼요.' };
  const scene = sceneDraft(`${keyNameKo(key.tonic, key.mode)} ${formName}단음계`, captions[form], key, columns, { showGaps: true, scaleType: form });
  const raised = form === 'harmonic' ? [6] : form === 'melodic' ? [5, 6] : [];
  raised.forEach(i => columns[i].highlightNoteIds.push(columns[i].notes[0].id));
  scene.steps.push(step('오선과 조표', staffGroups(key)), step('음표', columns.flatMap(noteGroups)), step('이름', labelGroups(columns)), step('음 사이의 거리', columns.slice(1).map(c => `gap/${c.id}`)));
  if (raised.length) scene.steps.push(step('올린 음', emphasisGroups(columns), listen([...new Set(raised.flatMap(i => [i, i + 1]))].map(i => columns[i].id))));
  scene.steps.push(step('정리', ['caption']), step('차례로 듣기', [], listen(columns.map(c => c.id))));
  if (practice) scene.steps.push(step(`${THEORY_POLICY.minorTonic === 'la' ? '라' : '도'}부터 차례로 눌러 보세요`, [], practiceCue(columns, columns.map(c => c.id), 'sequential')));
  scene.templateVersion = 3;
  return finishSteps(scene);
}

export function buildInterval({ key, fromPitch, degree, presentation }) {
  const from = parsePitch(fromPitch), scale = majorScale(key.tonic, 4, 24);
  const start = scale.findIndex(p => formatPitch(p) === fromPitch);
  if (!from || start < 0 || !Number.isInteger(degree) || degree < 2 || degree > 8) throw new Error('조의 음계 안에서 아래 음과 2~8도를 골라 주세요.');
  const pitches = scale.slice(start, start + degree);
  if (pitches.length !== degree || pitches.some(p => diatonicIndex(p) > 46)) throw new Error('음정의 위 음이 도4부터 솔6까지의 범위를 벗어납니다.');
  const upper = pitches.at(-1), interval = describeInterval(from, upper);
  if (!interval.name) throw new Error('지원하지 않는 음정입니다.');
  const simultaneously = presentation === 'simultaneous';
  const columns = simultaneously ? [{ id: 'c1', kind: 'dyad', notes: [{ id: 'n1', pitch: fromPitch }, { id: 'n2', pitch: formatPitch(upper) }], labelMode: 'none', highlightNoteIds: [], showName: true }] : pitches.map((p, i) => noteColumn(p, i, 'count'));
  const scene = sceneDraft(`${keyNameKo(key.tonic, key.mode)} ${interval.name}`, `${letterNameKo(from)}부터 ${letterNameKo(upper)}까지 세면 음이 ${degree}개예요. 이 거리를 ${interval.name}라고 해요.`, key, columns);
  scene.templateVersion = 3;
  scene.steps.push(step('오선과 조표', staffGroups(key)));
  if (simultaneously) {
    scene.steps.push(step('두 음', columns.flatMap(noteGroups)), step('음정 이름', ['name/c1']), step('정리', ['caption']), step('함께 듣기', [], listen(['c1'])));
  } else {
    const ends = [columns[0], columns.at(-1)]; ends.forEach(c => c.highlightNoteIds.push(c.notes[0].id));
    scene.content.intervals = [{ id: 'i1', from: 'n1', to: `n${degree}` }];
    scene.steps.push(step('두 음', [...ends.flatMap(noteGroups), ...emphasisGroups(ends)]), step('사이의 음', columns.slice(1, -1).flatMap(noteGroups)), step('음 세기', labelGroups(columns)), step('음정 이름', ['interval/i1']), step('정리', ['caption']), step('두 음 듣기', [], listen(ends.map(c => c.id))));
  }
  return finishSteps(scene);
}

export function buildMinorTriads({ key, practice }) {
  const columns = [1, 4, 5].map((degree, i) => chordColumn(diatonicChord(key, degree, 'triad', 4, 'harmonic'), i));
  const scene = sceneDraft(`${keyNameKo(key.tonic, key.mode)} 주요 3화음`, '단조의 딸림화음은 일곱째 음을 반음 올려서 만들어요.', key, columns, { scaleType: 'harmonic' });
  scene.templateVersion = 3;
  scene.steps.push(step('오선과 조표', staffGroups(key)));
  columns.forEach((c, i) => scene.steps.push(step(['으뜸화음', '버금딸림화음', '딸림화음'][i], [...noteGroups(c), ...nameGroups(c)])));
  scene.steps.push(step('정리', ['caption']), step('차례로 듣기', [], listen(columns.map(c => c.id))));
  if (practice) scene.steps.push(step('딸림화음의 세 음을 눌러 보세요', [], practiceCue(columns, [columns[2].id], 'free')));
  return finishSteps(scene);
}

const CADENCES = { authentic: [5, 1, '바른마침'], plagal: [4, 1, '벗어난마침'], half: [1, 5, '반마침'], deceptive: [5, 6, '거짓마침'] };
export function buildCadence({ key, kind, seventh }) {
  const [firstDegree, secondDegree, name] = CADENCES[kind] ?? [];
  if (!firstDegree) throw new Error('마침꼴 종류를 골라 주세요.');
  if (seventh && !['authentic', 'deceptive'].includes(kind)) throw new Error('7음은 바른마침과 거짓마침에만 넣을 수 있습니다.');
  const first = diatonicChord(key, firstDegree, seventh ? 'seventh' : 'triad', 4, key.mode === 'minor' ? 'harmonic' : 'major');
  const second = nearestChord(first, diatonicChord(key, secondDegree, 'triad', 4, key.mode === 'minor' ? 'harmonic' : 'major'));
  const columns = [chordColumn(first, 0), chordColumn(second, 1)];
  const descriptions = columns.map(c => describeChord(c, key));
  const named = descriptions.map((d, i) => d.name || `${i ? secondDegree : firstDegree}도의 화음`);
  const classification = classifyCadence({ degree: firstDegree, kind: seventh ? 'seventh' : 'triad' }, { degree: secondDegree, kind: 'triad' });
  if ((typeof classification === 'string' ? classification : classification?.name) !== name) throw new Error('마침꼴의 계산 결과가 카드와 다릅니다.');
  const scene = sceneDraft(`${keyNameKo(key.tonic, key.mode)} ${name}`, `${named[0]}에서 ${named[1]}으로 가는 마침꼴을 ${name}이라고 해요.`, key, columns, key.mode === 'minor' ? { scaleType: 'harmonic' } : {});
  scene.templateVersion = 3;
  scene.steps.push(step('오선과 조표', staffGroups(key)));
  columns.forEach((c, i) => scene.steps.push(step(i ? '둘째 화음' : '첫째 화음', [...noteGroups(c), ...nameGroups(c)])));
  scene.steps.push(step('정리', ['caption']), step('이어서 듣기', [], listen(columns.map(c => c.id))));
  return finishSteps(scene);
}

export function buildPentatonic({ key, labels, practice }) {
  const scale = majorScale(key.tonic, 4, 8), columns = [0, 1, 2, 4, 5, 7].map((i, index) => noteColumn(scale[i], index, labels));
  const scene = sceneDraft(`${keyNameKo(key.tonic, key.mode)} 5음 음계`, '도 레 미 솔 라. 파와 시가 없는 다섯 음의 음계예요.', key, columns, { showGaps: true });
  scene.templateVersion = 3;
  scene.steps.push(step('오선과 조표', staffGroups(key)), step('음표', columns.flatMap(noteGroups)), step('이름', labelGroups(columns)), step('음 사이의 거리', columns.slice(1).map(c => `gap/${c.id}`)), step('정리', ['caption']), step('차례로 듣기', [], listen(columns.map(c => c.id))));
  if (practice) scene.steps.push(step('도부터 차례로 눌러 보세요', [], practiceCue(columns, columns.map(c => c.id), 'sequential')));
  return finishSteps(scene);
}

export function buildMinorScaleLesson(options) {
  const up = buildMinorScale(options);
  if (options.form !== 'melodic') return { title: up.title, grade: '중1-3', scenes: [up] };
  const down = buildMinorScale({ ...options, form: 'natural' });
  down.title = `${keyNameKo(options.key.tonic, options.key.mode)} 가락단음계 내려가기`;
  down.caption = '가락단음계를 내려올 때는 자연단음계로 연주해요.';
  down.content.columns.reverse();
  down.steps = [step('오선과 조표', staffGroups(options.key)), step('내려가는 음계', down.content.columns.flatMap(noteGroups)), step('이름', labelGroups(down.content.columns)), step('정리', ['caption']), step('차례로 듣기', [], listen(down.content.columns.map(c => c.id)))];
  if (options.practice) down.steps.push(step('차례로 내려가며 눌러 보세요', [], practiceCue(down.content.columns, down.content.columns.map(c => c.id), 'sequential')));
  // Gaps are naturally in reverse order and remain attached to their columns.
  down.content.showGaps = false; down.content.columns.forEach(c => { c.highlightNoteIds = []; });
  return { title: `${up.title} 수업`, grade: '중1-3', scenes: [up, finishSteps(down)] };
}
