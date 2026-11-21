import { getColumns } from './scene-model.js';
import { buildKeyboard } from './theory/keyboard.js';
import { formatNoteLabel } from './theory/korean.js';
import { parsePitch, pitchClassNumber } from './theory/pitch.js';

export { buildKeyboard } from './theory/keyboard.js';

/** The teaching answer comes from the notation. No student data is saved. */
export function createPracticePlan(scene, cue) {
  if (cue?.type !== 'practice' || !['free', 'sequential'].includes(cue.order) || !Array.isArray(cue.columnIds)) return null;
  const labelMode = cue.keyboard?.labelMode ?? 'none';
  const keys = buildKeyboard(cue.keyboard?.from, cue.keyboard?.to, scene.content?.key);
  const byId = new Map(getColumns(scene).map(column => [column.id, column]));
  const pitches = [];
  for (const id of cue.columnIds) {
    const notes = byId.get(id)?.notes;
    if (!Array.isArray(notes)) return null;
    pitches.push(...notes.map(note => parsePitch(note?.pitch)));
  }
  if (!keys.length || !pitches.length || pitches.some(pitch => !pitch)) return null;

  const sequence = pitches.map(pitch => pitchClassNumber(pitch.midi));
  const unique = [...new Set(sequence)];
  const available = new Set(keys.map(key => pitchClassNumber(key.midi)));
  if (unique.some(pc => !available.has(pc))) return null;
  return {
    order: cue.order,
    sequence,
    unique,
    keys: keys.map(key => ({ ...key, label: formatNoteLabel(key.name, labelMode, scene.content?.key) })),
  };
}

export function startPractice(plan) {
  return {
    found: [],
    nextIndex: 0,
    total: plan.order === 'sequential' ? plan.sequence.length : plan.unique.length,
    done: false,
    mine: [],
    wrongMidi: null,
    message: '',
    tone: 'info',
  };
}

export function judgePracticeTap(plan, progress, tappedMidi) {
  if (progress.done || !plan.keys.some(key => key.midi === tappedMidi)) return progress;
  const pc = pitchClassNumber(tappedMidi);
  if (plan.order === 'sequential' && pc !== plan.sequence[progress.nextIndex]) {
    return { ...progress, wrongMidi: tappedMidi, message: '순서가 달라요. 다시 눌러 보세요.', tone: 'bad' };
  }
  if (plan.order === 'free') {
    if (!plan.unique.includes(pc)) return { ...progress, wrongMidi: tappedMidi, message: '그 음이 아니에요. 다시 눌러 보세요.', tone: 'bad' };
    if (progress.found.includes(pc)) return { ...progress, wrongMidi: null, message: '이미 찾은 음이에요.', tone: 'info' };
  }

  const count = progress.nextIndex + 1;
  const done = count === progress.total;
  return {
    ...progress,
    nextIndex: count,
    found: plan.order === 'free' ? [...progress.found, pc] : progress.found,
    mine: [...progress.mine, tappedMidi],
    wrongMidi: null,
    done,
    message: done ? '맞아요!' : `${count} / ${progress.total}개 찾았어요.`,
    tone: done ? 'ok' : 'info',
  };
}
