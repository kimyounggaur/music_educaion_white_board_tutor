import { parsePitch, formatPitch, makePitch, diatonicIndex } from '../theory/pitch.js';
import { pitchFromMidi } from '../theory/keyboard.js';
import { keySignatureAccidentals } from '../theory/scale.js';
import { letterNameKo, keyNameKo } from '../theory/korean.js';

export const CARD_REVIEW = Object.freeze({ author: 'AI', status: '교사 검토 전' });
export const step = (label, groupIds, cue) => ({ id: '', label, groupIds, advance: 'manual', holdMs: 0, ...(cue ? { cue } : {}) });
export const listen = ids => ({ type: 'listen', targets: ids.map(columnId => ({ columnId })) });
export const noteColumn = (pitch, index, labelMode = 'none') => ({ id: `c${index + 1}`, kind: 'note', notes: [{ id: `n${index + 1}`, pitch: typeof pitch === 'string' ? pitch : formatPitch(pitch) }], labelMode, highlightNoteIds: [] });
export const chordColumn = (pitches, index) => ({ id: `c${index + 1}`, kind: 'chord', notes: pitches.map((pitch, i) => ({ id: `n${index + 1}-${i + 1}`, pitch: typeof pitch === 'string' ? pitch : formatPitch(pitch) })), labelMode: 'none', highlightNoteIds: [], showName: true, showRoman: true, emphasis: false });
export const noteGroups = column => column.notes.map(note => `note/${note.id}`);
export const nameGroups = column => [`name/${column.id}`, ...(column.kind === 'chord' && column.showRoman ? [`roman/${column.id}`] : [])];
export const labelGroups = columns => columns.filter(c => c.labelMode !== 'none').flatMap(c => c.notes.map(n => `label/${n.id}`));
export const emphasisGroups = columns => columns.flatMap(c => c.highlightNoteIds.map(id => `emphasis/${id}`));
export const signaturePitches = key => {
  const signature = keySignatureAccidentals(key.tonic, key.mode);
  const order = Object.values(signature).some(n => n > 0) ? 'FCGDAEB' : 'BEADGCF';
  return [...order].filter(letter => signature[letter]).map(letter => makePitch('CDEFGAB'.indexOf(letter), signature[letter], 4));
};
export const staffGroups = key => ['staff', 'clef', ...(signaturePitches(key).length ? ['key-signature'] : [])];
export function keyboardRange(pitches) {
  const parsed = pitches.map(p => typeof p === 'string' ? parsePitch(p) : p);
  let low = Math.min(...parsed.map(p => p.midi)), high = Math.max(...parsed.map(p => p.midi));
  while (pitchFromMidi(low).acc !== 0) low--;
  while (pitchFromMidi(high).acc !== 0) high++;
  if (low === high) { if (low >= 12) low -= 12; else high += 12; }
  if (high - low > 24) throw new Error('건반 범위가 두 옥타브를 넘습니다. 장면을 나누어 주세요.');
  return { from: formatPitch(pitchFromMidi(low)), to: formatPitch(pitchFromMidi(high)) };
}
export function practiceCue(columns, selected, order = 'free', labelMode = 'none') {
  return { type: 'practice', order, keyboard: { ...keyboardRange(columns.flatMap(c => c.notes.map(n => n.pitch))), labelMode }, columnIds: selected };
}
export function finishSteps(scene) {
  scene.steps = scene.steps.filter(s => s.groupIds.length || s.cue).map((s, i) => ({ ...s, id: `s${i + 1}` }));
  return scene;
}
export function sceneDraft(title, caption, key, columns, extra = {}) {
  return { title, tags: ['주제카드'], question: '', caption, templateId: columns.length && columns.every(c => c.kind === 'chord') ? 'chord-stack' : 'note-selection', templateVersion: 2, content: { key: { ...key }, columns, showGaps: false, ...extra }, steps: [] };
}
export function keySignatureText(key) {
  const pitches = signaturePitches(key), sharp = pitches[0]?.acc > 0;
  return { count: pitches.length, type: sharp ? '올림표' : '내림표', action: sharp ? '올려서' : '내려서', names: pitches.map(letterNameKo).join(', '), keyName: keyNameKo(key.tonic, key.mode) };
}
export const keyboardPositionDescription = midi => [
  '검은 건반 두 개 묶음의 바로 왼쪽 흰 건반', '검은 건반 두 개 묶음의 왼쪽 검은 건반',
  '검은 건반 두 개 묶음 사이의 흰 건반', '검은 건반 두 개 묶음의 오른쪽 검은 건반',
  '검은 건반 두 개 묶음의 바로 오른쪽 흰 건반', '검은 건반 세 개 묶음의 바로 왼쪽 흰 건반',
  '검은 건반 세 개 묶음의 왼쪽 검은 건반', '검은 건반 세 개 묶음에서 왼쪽 두 개 사이의 흰 건반',
  '검은 건반 세 개 묶음의 가운데 검은 건반', '검은 건반 세 개 묶음에서 오른쪽 두 개 사이의 흰 건반',
  '검은 건반 세 개 묶음의 오른쪽 검은 건반', '검은 건반 세 개 묶음의 바로 오른쪽 흰 건반',
][((midi % 12) + 12) % 12];
export function nearestChord(first, second) {
  const variants = [-1, 0, 1].map(offset => second.map(p => makePitch(p.step, p.acc, p.octave + offset)))
    .filter(ps => diatonicIndex(ps[0]) >= 28 && ps.every(p => diatonicIndex(p) <= 46));
  variants.sort((a, b) => Math.abs(a[0].midi - first[0].midi) - Math.abs(b[0].midi - first[0].midi) || a[0].midi - b[0].midi);
  return variants[0] ?? second;
}
