import {
  CHORD_PRESETS, MAX_NOTATION_COLUMNS, NOTE_LABEL_MODES, DIAGRAM_PHRASE_IDS, createScene, createSceneV2, defaultSteps, reconcileSteps, validateScene, notationTemplateVersion,
} from './scene-model.js';
import { checkDocumentLayout, hasGlyphs } from './scene.js';
import { describeChord, formatNoteLabel, keyNameKo } from './theory/korean.js';
import { LETTERS, accidentalText, parsePitch, formatPitch } from './theory/pitch.js';
import { pitchFromMidi } from './theory/keyboard.js';
import { describeInterval } from './theory/interval.js';
import { describeDiatonicChord } from './theory/chord.js';
import { MAJOR_KEY_TONICS, MINOR_KEY_TONICS } from './theory/scale.js';
import { confirmAction } from './ui/confirm-dialog.js';
import { renderEditorPreview } from './ui/editor-preview.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, character => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]
));
const copy = value => structuredClone(value);
const newId = prefix => prefix + (globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2));
const templateLabels = { 'chord-stack': '화음 쌓기', 'note-selection': '음 고르기', 'text-explanation': '글 설명', diagram: '도식' };
const presetLabels = { 'C-major-I': '다장조 으뜸화음 I', 'C-major-IV': '다장조 버금딸림화음 IV', 'C-major-V': '다장조 딸림화음 V', custom: '직접 입력' };
const labelModes = {
  none: '표시하지 않기', 'fixed-do': '고정도 계이름 (도=C)', 'movable-do': '이동도 계이름 (으뜸음=도)',
  ko: '한글 음이름 (다·라·마)', en: '영문 음이름 (C·D·E)', both: '이동도와 한글 음이름', count: '차례 숫자',
};
const naturalPitches = Array.from({ length: 19 }, (_, index) => `${LETTERS[index % 7]}${4 + Math.floor(index / 7)}`);
const accidentalLabels = { '': '제자리음', '#': '올림음 (♯)', b: '내림음 (♭)' };
const mainFields = {
  title: '장면 제목', tags: '태그', question: '질문', caption: '정리 문장',
  templateId: '장면 템플릿', content: '장면 내용', steps: '판서 순서',
  'content.notes': '구성음', 'content.columns': '오선의 열', 'content.blocks': '본문',
  'content.chordName': '화음 이름', 'content.preset': '화음 프리셋', 'content.key': '조',
};
const maxLengths = { title: 40, question: 80, caption: 120 };
const segmenter = globalThis.Intl?.Segmenter && new Intl.Segmenter('ko', { granularity: 'grapheme' });
const count = value => {
  const text = String(value ?? '').trim().normalize('NFC');
  return segmenter ? Array.from(segmenter.segment(text)).length : Array.from(text).length;
};
const checked = value => value ? 'checked' : '';
const disabled = value => value ? 'disabled' : '';
const optionsHtml = (values, selected) => values.map(([value, label]) =>
  `<option value="${esc(value)}" ${value === selected ? 'selected' : ''}>${esc(label)}</option>`
).join('');
const command = (action, label, extra = '') => `<button type="button" data-action="${action}" ${extra}>${label}</button>`;
const pathAttr = (path, label) => `data-path="${esc(path)}" data-field-label="${esc(label)}"`;
const track = value => `data-focus-key="${esc(value)}"`;
const actionId = (action, id) => `data-id="${esc(id)}" ${track(`${action}/${id}`)}`;
const pitchText = (pitch, key) => formatNoteLabel(pitch, 'fixed-do', key) || pitch;
const secondsText = value => `${(Number(value) / 1000).toFixed(1)}초`;
const slider = (kind, value, min, max, step, attrs = '') => `<div class="ed-range" data-range-kind="${kind}"><input type="range" min="${min}" max="${max}" step="${step}" value="${esc(value)}" ${attrs}><div class="ed-range-scale"><span>${kind === 'hold' ? '바로 진행' : kind === 'level' ? '여리게' : kind === 'tempo' ? '느리게' : '낮게'}</span><output data-range-value aria-hidden="true"></output><span>${kind === 'hold' ? '10초' : kind === 'level' ? '세게' : kind === 'tempo' ? '빠르게' : '높게'}</span></div></div>`;
function pitchOptions(selected, extended = false) {
  const allowed = naturalPitches.slice(0, extended ? 19 : 15);
  const values = allowed.map(pitch => [pitch, `${pitchText(pitch)} (${pitch})`]);
  if (allowed.includes(selected)) return optionsHtml(values, selected);
  return '<option value="" selected disabled>음을 선택하세요</option>' + optionsHtml(values);
}
function keyboardPitchOptions(selected) {
  const values = Array.from({ length: 128 }, (_, midi) => pitchFromMidi(midi)).filter(pitch => pitch.acc === 0).map(pitch => {
    const name = formatPitch(pitch);
    return [name, `${pitchText(name)} (${name})`];
  });
  return optionsHtml(values, selected);
}

function move(items, index, delta) {
  const target = index + delta;
  if (index < 0 || target < 0 || target >= items.length) return false;
  [items[index], items[target]] = [items[target], items[index]];
  return true;
}

function moveButtons(prefix, item, index, length, min, label) {
  const button = (suffix, name, blocked) => {
    const action = `${prefix}-${suffix}`;
    return command(action, name, `${actionId(action, item.id)} aria-label="${esc(`${label} ${name}`)}" ${disabled(blocked)}`);
  };
  return button('up', '위로', index === 0) + button('down', '아래로', index === length - 1) +
    button('remove', '삭제', length <= min);
}

function notationControls(content) {
  const { key, columns } = content;
  return `
    <label for="ed-key">조</label>
    <select id="ed-key" data-field="key" ${pathAttr('content.key', '조')}>
      ${[['major', MAJOR_KEY_TONICS, '장조'], ['minor', MINOR_KEY_TONICS, '단조']].map(([mode, tonics, label]) => `<optgroup label="${label}">${optionsHtml(tonics.map(tonic => [`${tonic}:${mode}`, keyNameKo(tonic, mode)]), `${key.tonic}:${key.mode}`)}</optgroup>`).join('')}
    </select>
    <p class="ed-muted">음과 변화음을 실제 연주할 높이로 선택하세요. 조표를 바꿔도 선택한 음은 유지됩니다.</p>
    <details class="ed-notation-options"><summary>표시 옵션 <span class="ed-optional">음계·간격·조표</span></summary>
    <label>음계 종류 <select data-field="scaleType" ${pathAttr('content.scaleType', '음계 종류')}>${optionsHtml([['', '조의 기본 음계'], ['natural', '자연단음계'], ['harmonic', '화성단음계'], ['melodic', '가락단음계']], content.scaleType || '')}</select></label>
    <label><input type="checkbox" data-field="showGaps" ${checked(content.showGaps)}> 이웃한 음 사이에 온음·반음 표시</label>
    <label><input type="checkbox" data-field="splitSignature" ${checked(content.splitSignature)}> 조표를 한 개씩 단계로 나누기</label>
    </details><p class="ed-controls-help">슬라이더로 음 높이를 움직이거나 음 목록에서 정확한 음을 고르세요.</p>
    <div class="ed-list">${columns.map(notationColumn).join('')}</div>
    <div class="ed-inline">
      ${command('column-add-note', '음표 열 추가', disabled(columns.length >= MAX_NOTATION_COLUMNS))}
      ${command('column-add-chord', '화음 열 추가', disabled(columns.length >= MAX_NOTATION_COLUMNS))}
      ${command('column-add-dyad', '2음 열 추가', disabled(columns.length >= MAX_NOTATION_COLUMNS))}
    </div>
    <details class="ed-interval-section"><summary>음정 표시</summary><div class="ed-intervals">${intervalControls(content)}</div></details>`;
}

function intervalControls(content) {
  const notes = content.columns.flatMap(column => column.notes);
  const choices = notes.map((note, index) => [note.id, `${index + 1}번 ${pitchText(note.pitch, content.key)} (${note.pitch})`]);
  const options = selected => `${choices.some(([id]) => id === selected) ? '' : `<option value="${esc(selected)}" selected>삭제된 음 · 다시 선택해 주세요</option>`}${optionsHtml(choices, selected)}`;
  return `${(content.intervals || []).map((interval, index) => `<div class="ed-card ed-inline">
    <label>아래 음 <select data-interval="${esc(interval.id)}" data-end="from" ${pathAttr(`content.intervals.${index}.from`, '음정의 아래 음')}>${options(interval.from)}</select></label>
    <label>위 음 <select data-interval="${esc(interval.id)}" data-end="to" ${pathAttr(`content.intervals.${index}.to`, '음정의 위 음')}>${options(interval.to)}</select></label>
    ${command('interval-remove', '음정 표시 삭제', actionId('interval-remove', interval.id))}
    <span data-interval-readout="${esc(interval.id)}"></span>
  </div>`).join('')}${command('interval-add', '음정 표시 추가', disabled((content.intervals?.length || 0) >= 4 || notes.length < 2))}`;
}

function notationColumn(column, index, columns) {
  const base = `content.columns.${index}`;
  const label = `${index + 1}열 ${column.kind === 'chord' ? '화음' : column.kind === 'dyad' ? '2음' : '음표'}`;
  const chord = column.kind === 'chord';
  const dyad = column.kind === 'dyad';
  return `
    <fieldset class="ed-card" data-column="${esc(column.id)}">
      <legend class="ed-legend">${label}</legend>
      ${column.notes.map((note, noteIndex) => {
        const pitch = parsePitch(note.pitch);
        const noteLabel = `${index + 1}열 ${noteIndex + 1}번째 음`;
        return `<div class="ed-inline ed-note-row" data-note-row="${esc(note.id)}">
          <label><span>${noteLabel}</span>
            <select data-note="${esc(note.id)}" ${track(`pitch/${note.id}`)} ${pathAttr(`${base}.notes.${noteIndex}.pitch`, noteLabel)}>
              ${pitchOptions(pitch && pitch.letter + pitch.octave, true)}
            </select>
          </label>
          ${slider('pitch',Math.max(0,naturalPitches.indexOf(pitch && pitch.letter+pitch.octave)),0,18,1,`data-pitch-slider="${esc(note.id)}" ${track(`pitch-slider/${note.id}`)} aria-label="${noteLabel} 음 높이"`)}
          <label><span>변화음</span>
            <select data-accidental="${esc(note.id)}" ${track(`accidental/${note.id}`)}
              aria-label="${noteLabel} 변화음">${optionsHtml(Object.entries(accidentalLabels), accidentalText(pitch?.acc))}</select>
          </label>
          <label><input type="checkbox" data-highlight="${esc(note.id)}"
            ${checked(column.highlightNoteIds?.includes(note.id))}> 강조</label>
          ${chord ? command('column-note-remove', '구성음 삭제', `${actionId('column-note-remove', note.id)} ${disabled(column.notes.length <= 3)}`) : ''}
        </div>`;
      }).join('')}
      ${chord ? command('column-note-add', '구성음 추가', `${actionId('column-note-add', column.id)} ${disabled(column.notes.length >= 4)}`) : ''}
      <label>음 표시 <select data-label-mode="${esc(column.id)}" ${track(`label/${column.id}`)}>
        ${optionsHtml(NOTE_LABEL_MODES.map(mode => [mode, labelModes[mode] ?? mode]), column.labelMode)}
      </select></label>
      ${dyad ? `<label><input type="checkbox" data-chord-edit="showName" ${checked(column.showName)}> 음정 이름 표시</label><p class="ed-muted" data-dyad-readout></p>` : ''}
      ${chord ? `
        <div class="ed-inline">
          <label><input type="checkbox" data-chord-edit="showName" ${track(`name/${column.id}`)} ${checked(column.showName)}> 화음 이름 표시</label>
          <label><input type="checkbox" data-chord-edit="showRoman" ${track(`roman/${column.id}`)} ${checked(column.showRoman)}> 로마 숫자 표시</label>
          <label><input type="checkbox" data-chord-edit="emphasis" ${track(`emphasis/${column.id}`)} ${checked(column.emphasis)}> 화음 전체 강조</label>
        </div>
        <p class="ed-muted" data-theory-readout></p>
        ${column.legacyName || column.legacyRoman ? `<p class="ed-muted">이전 표시 · ${esc([column.legacyName, column.legacyRoman].filter(Boolean).join(' · '))}</p>` : ''}
        <label>교사 메모
          <input data-memo="${esc(column.id)}" ${track(`memo/${column.id}`)}
            ${pathAttr(`${base}.teacherMemo`, `${label} 교사 메모`)} value="${esc(column.teacherMemo)}">
        </label>` : ''}
      <div class="ed-inline">${moveButtons('column', column, index, columns.length, 1, label)}</div>
    </fieldset>`;
}

function legacyControls(draft) {
  const content = draft.content;
  if (draft.templateId === 'chord-stack') {
    return `
      <label for="ed-preset">화음 프리셋</label>
      <select id="ed-preset" data-field="preset" ${track("preset")} ${pathAttr('content.preset', '화음 프리셋')}>
        ${optionsHtml(Object.entries(presetLabels), content.preset)}
      </select>
      <p class="ed-muted">다장조의 기본 위치 삼화음을 표시합니다.</p>
      <div class="ed-inline">${content.notes.map((note, index) => `
        <label>${index + 1}번째 음
          <select data-note="${esc(note.id)}" ${track(`pitch/${note.id}`)} ${pathAttr(`content.notes.${index}.pitch`, `${index + 1}번째 음`)}>
            ${pitchOptions(note.pitch)}
          </select>
        </label>`).join('')}</div>
      <label for="ed-name">화음 이름</label>
      <input id="ed-name" data-field="chordName" ${pathAttr('content.chordName', '화음 이름')} value="${esc(content.chordName)}">
      <p class="ed-muted">로마 숫자 ${esc(content.roman || '없음')}</p>
      <label><input type="checkbox" data-field="emphasis" ${checked(content.emphasis)}> 화음 전체 강조하기</label>`;
  }
  return `
    <p class="ed-muted">표시 순서대로 2~8개를 선택하세요.</p>
    <div class="ed-list">${content.notes.map((note, index) => `
      <div class="ed-inline ed-card">
        <select aria-label="${index + 1}번째 음" data-note="${esc(note.id)}" ${track(`pitch/${note.id}`)}
          ${pathAttr(`content.notes.${index}.pitch`, `${index + 1}번째 음`)}>${pitchOptions(note.pitch)}</select>
        <label><input type="checkbox" data-highlight="${esc(note.id)}" ${checked(content.highlightNoteIds.includes(note.id))}> 강조</label>
        ${moveButtons('note', note, index, content.notes.length, 2, `${index + 1}번째 음`)}
      </div>`).join('')}</div>
    ${command('note-add', '음 추가', disabled(content.notes.length >= 8))}
    <label><input type="checkbox" data-field="showLabels" ${checked(content.showLabels)}> 계이름 표시 (도=C)</label>`;
}

function textControls(blocks) {
  return `
    <p class="ed-muted">본문은 1~6개 문장, 합계 360자까지 입력하세요.</p>
    <div class="ed-list">${blocks.map((block, index) => `
      <div class="ed-card">
        <label for="ed-block-${index}">본문 ${index + 1}</label>
        <textarea id="ed-block-${index}" data-block="${esc(block.id)}" ${track(`block/${block.id}`)}
          ${pathAttr(`content.blocks.${index}.text`, `본문 ${index + 1}`)}>${esc(block.text)}</textarea>
        <p class="ed-count" data-count="content.blocks.${index}.text" id="ed-block-count-${index}"></p>
        <div class="ed-inline">
          <label>색상 <select data-ink="${esc(block.id)}" ${track(`ink/${block.id}`)}>
            ${optionsHtml([['main', '기본색'], ['accent', '강조색']], block.ink)}
          </select></label>
          ${moveButtons('block', block, index, blocks.length, 1, `본문 ${index + 1}`)}
        </div>
      </div>`).join('')}</div>
    ${command('block-add', '본문 추가', disabled(blocks.length >= 6))}`;
}

const diagramKinds = [['sequence', '차례 상자'], ['ladder', '계단'], ['line', '줄 세우기']];
const phraseChoices = [['', '듣기 예시 없음'], ...DIAGRAM_PHRASE_IDS.map((id,index) => [id, index < 3 ? `가락 ${'ABC'[index]}` : `변주 가락 ${index - 2}`])];
function diagramControls(content) {
  const phraseKeys = content.kind === 'sequence' ? [...new Set(content.items.map(item => item.label))] : ['all'];
  return `<label>꼴 <select data-field="diagramKind">${optionsHtml(diagramKinds, content.kind)}</select></label>
    <div class="ed-list">${content.items.map((item, index, items) => `<fieldset class="ed-card" data-diagram-item="${esc(item.id)}">
      <legend>${index + 1}번째 항목</legend>
      <label>글자 <input data-diagram-text="label" data-id="${esc(item.id)}" ${pathAttr(`content.items.${index}.label`, `${index + 1}번째 글자`)} value="${esc(item.label)}"></label>
      <label>아래 글자 <input data-diagram-text="sub" data-id="${esc(item.id)}" ${pathAttr(`content.items.${index}.sub`, `${index + 1}번째 아래 글자`)} value="${esc(item.sub)}"></label>
      <label>색 <select data-diagram-value="ink" data-id="${esc(item.id)}">${optionsHtml([['main', '기본색'], ['accent', '강조색']], item.ink)}</select></label>
      ${content.kind === 'ladder' ? `<label>${index + 1}번째 세기</label>${slider('level',item.level ?? .6,.1,1,.05,`data-diagram-text="level" data-id="${esc(item.id)}" aria-label="${index + 1}번째 세기" ${pathAttr(`content.items.${index}.level`, '듣기 세기')}`)}` : ''}
      ${content.kind === 'line' ? `<label>${index + 1}번째 빠르기</label>${slider('tempo',item.tempo ?? 96,40,200,1,`data-diagram-text="tempo" data-id="${esc(item.id)}" aria-label="${index + 1}번째 빠르기" ${pathAttr(`content.items.${index}.tempo`, '듣기 빠르기')}`)}` : ''}
      <div class="ed-inline">${moveButtons('diagram', item, index, items.length, 2, `${index + 1}번째 항목`)}</div>
    </fieldset>`).join('')}</div>
    ${command('diagram-add', '항목 추가', disabled(content.items.length >= 7))}
    ${content.kind === 'sequence' ? `<label><input type="checkbox" data-field="arrows" ${checked(content.arrows)}> 상자 사이 화살표</label>` : ''}
    ${content.kind === 'ladder' ? `<div class="ed-inline">${[['up', '점점 세게'], ['down', '점점 여리게']].map(([value, label]) => `<label><input type="checkbox" data-hairpin="${value}" ${checked(content.hairpins?.includes(value))}> ${label}</label>`).join('')}</div>` : ''}
    <details><summary>소리 예시</summary>${phraseKeys.map(key => `<label>${key === 'all' ? '모든 항목의' : esc(key)} 가락 <select data-phrase="${esc(key)}">${optionsHtml(phraseChoices, content.phrases?.[key] || '')}</select></label>`).join('')}</details>`;
}

function autoKeyboard(columns) {
  const midi = columns.flatMap(column => column.notes.map(note => parsePitch(note.pitch)?.midi)).filter(Number.isFinite);
  if (!midi.length) return null;
  const whites = new Set([0, 2, 4, 5, 7, 9, 11]);
  let from = Math.min(...midi), to = Math.max(...midi);
  while (!whites.has(from % 12)) from--;
  while (!whites.has(to % 12)) to++;
  if (from === to) { if (to < 127) { do { to++; } while (!whites.has(to % 12)); } else from--; }
  if (from < 0 || to > 127 || to - from > 24) return null;
  return { from: formatPitch(pitchFromMidi(from)), to: formatPitch(pitchFromMidi(to)) };
}

function activityColumns(draft, index) {
  const shown = new Set(draft.steps.slice(0, index + 1).flatMap(step => step.groupIds));
  return (draft.content.columns || []).filter(column => column.notes.every(note => shown.has(`note/${note.id}`)));
}

function cueMarkup(draft, step, index) {
  const diagram = draft.templateId === 'diagram';
  if (!diagram && (!draft.content.columns || draft.schemaVersion !== 2)) return '';
  const cue = step.cue;
  const columns = activityColumns(draft, index);
  const selected = diagram ? cue?.items || [] : cue?.type === 'listen' ? (cue.targets || []).map(target => target.columnId) : cue?.columnIds || [];
  const targets = diagram ? draft.content.items.filter(item => new Set(draft.steps.slice(0, index + 1).flatMap(current => current.groupIds)).has(`box/${item.id}`)).map(item => [item.id, item.label])
    : columns.map(column => [column.id, `${draft.content.columns.indexOf(column) + 1}열 ${column.kind === 'chord' ? '화음 ' : ''}${column.notes.map(note => pitchText(note.pitch, draft.content.key)).join(' ')} `]);
  if (diagram) for (const id of selected) if (!draft.content.items.some(item => item.id === id)) targets.push([id, `삭제된 항목 (${id}) · 선택을 해제해 주세요`]);
  const naturalOrder = diagram ? draft.content.items.map(item => item.id) : draft.content.columns.map(column => column.id);
  const ordered = naturalOrder.filter(id => selected.includes(id));
  const custom = cue?.type === 'listen' && JSON.stringify(ordered) !== JSON.stringify(selected);
  const range = autoKeyboard(columns.filter(column => selected.includes(column.id)));
  const manualRange = cue?.type === 'practice' && (!range || cue.keyboard?.from !== range.from || cue.keyboard?.to !== range.to);
  return `<details class="ed-cue" ${cue ? 'open' : ''}><summary>이 단계의 활동${cue ? ` · ${cue.type === 'listen' ? '듣기' : '건반 해보기'}` : ''}</summary>
    <label>이 단계의 활동 <select data-cue-type="${esc(step.id)}" ${track(`cue-type/${step.id}`)}>${optionsHtml([['none', '없음'], ['listen', '듣기'], ...(!diagram ? [['practice', '건반 해보기']] : [])], cue?.type || 'none')}</select></label>
    ${cue ? `<p class="ed-muted">활동이 있는 단계는 판서를 마친 뒤에만 소리를 냅니다.</p>
      ${custom ? '<p class="ed-muted">지정된 순서입니다. 대상을 바꾸면 악보 순서로 바뀝니다.</p>' : ''}
      <fieldset class="ed-cue-targets"><legend>${cue.type === 'practice' ? '정답이 될 열' : '들을 대상'}</legend>
        ${targets.map(([id, label]) => `<label><input type="checkbox" data-cue-target="${esc(step.id)}" value="${esc(id)}" ${checked(selected.includes(id))}> ${esc(label)}</label>`).join('') || '<p>이 단계까지 보여 준 대상이 없어요.</p>'}
      </fieldset>
      ${cue.type === 'practice' ? `<div class="ed-inline"><label>순서 <select data-cue-order="${esc(step.id)}">${optionsHtml([['free', '자유'], ['sequential', '차례로']], cue.order)}</select></label>
        <label>건반 범위 <select data-cue-range="${esc(step.id)}">${optionsHtml([['auto', '자동'], ['manual', '직접']], manualRange ? 'manual' : 'auto')}</select></label></div>
        <div class="ed-inline" data-keyboard-range-row ${manualRange ? '' : 'hidden'}>
          <label>왼쪽 흰 건반 <select data-cue-key="from" data-id="${esc(step.id)}">${keyboardPitchOptions(cue.keyboard?.from)}</select></label>
          <label>오른쪽 흰 건반 <select data-cue-key="to" data-id="${esc(step.id)}">${keyboardPitchOptions(cue.keyboard?.to)}</select></label></div>
        <label>건반 이름표 <select data-cue-label="${esc(step.id)}">${optionsHtml(NOTE_LABEL_MODES.filter(mode => mode !== 'count').map(mode => [mode, labelModes[mode]]), cue.keyboard?.labelMode || 'none')}</select></label>` : ''}` : ''}
  </details>`;
}

function activitySummary(draft) {
  return draft.steps.flatMap((step, index) => {
    if (!step.cue) return [];
    const cue = step.cue;
    const ids = cue.items || (cue.type === 'listen' ? cue.targets.map(target => target.columnId) : cue.columnIds);
    const labels = ids.map(id => draft.templateId === 'diagram' ? draft.content.items.find(item => item.id === id)?.label || '삭제된 항목' : `${draft.content.columns.findIndex(column => column.id === id) + 1}열`);
    return [`${index + 1}단계 ${cue.type === 'listen' ? '듣기' : '해보기'}: ${labels.join(' → ')}${cue.type === 'practice' ? ` ${cue.order === 'sequential' ? '차례로' : '자유'}, 건반 ${cue.keyboard.from}~${cue.keyboard.to}` : ''}`];
  }).join('\n');
}

function describeGroups(draft) {
  const descriptions = new Map(Object.entries({
    question: '질문', caption: '정리 문장', staff: '오선', clef: '높은음자리표', 'key-signature': '조표',
    name: '화음 이름', roman: '로마 숫자', 'emphasis/chord': '화음 강조',
  }));
  draft.content.blocks?.forEach((block, index) => descriptions.set(`body/${block.id}`, `본문 ${index + 1}`));
  const columns = draft.content.columns || [];
  let number = 0;
  for (const [index, column] of columns.entries()) {
    descriptions.set(`name/${column.id}`, `${index + 1}열 ${column.kind === 'dyad' ? '음정' : '화음'} 이름`);
    descriptions.set(`roman/${column.id}`, `${index + 1}열 로마 숫자`);
    descriptions.set(`emphasis-column/${column.id}`, `${index + 1}열 화음 강조`);
    descriptions.set(`gap/${column.id}`, `${index}~${index + 1}열 간격`);
    descriptions.set(`dyad-name/${column.id}`, `${index + 1}열 음정 이름`);
  }
  for (let index = 1; index <= 7; index++) descriptions.set(`key-signature/${index}`, `조표 ${index}번째`);
  const notes = columns.flatMap(column => column.notes);
  for (const interval of draft.content.intervals || []) descriptions.set(`interval/${interval.id}`, `${notes.findIndex(note => note.id === interval.from) + 1}~${notes.findIndex(note => note.id === interval.to) + 1}번 음의 음정`);
  descriptions.set('axis', '가로줄');
  for (const [index, item] of (draft.content.items || []).entries()) {
    for (const [prefix, label] of [['box', '상자'], ['box-label', '글자'], ['box-sub', '아래 글자'], ['arrow', '들어오는 화살표']]) descriptions.set(`${prefix}/${item.id}`, `${index + 1}번째 ${label}`);
  }
  descriptions.set('hairpin/up', '점점 세게');
  descriptions.set('hairpin/down', '점점 여리게');
  for (const note of columns.length ? columns.flatMap(column => column.notes) : draft.content.notes || []) {
    number++;
    const label = `${number} (${pitchText(note.pitch, draft.content.key)})`;
    for (const [group, name] of [['note', '음표'], ['label', '음 이름'], ['emphasis', '강조']]) {
      descriptions.set(`${group}/${note.id}`, `${name} ${label}`);
    }
  }
  return descriptions;
}

function stepsMarkup(draft, labels) {
  return draft.steps.map((step, index) => {
    const last = index === draft.steps.length - 1;
    const action = (kind, label, blocked = false) => command(kind, label, `${actionId(kind, step.id)} ${disabled(blocked)}`);
    return `<div class="ed-card">
      <h4>${index + 1}단계</h4>
      <label for="ed-step-${index}">단계 이름</label>
      <input id="ed-step-${index}" data-step-label="${esc(step.id)}" ${track(`step-label/${step.id}`)}
        ${pathAttr(`steps.${index}.label`, `${index + 1}단계 이름`)} value="${esc(step.label)}">
      <div class="ed-groups">
        ${step.groupIds.map(group => `<label class="ed-group">
          <input type="checkbox" data-split="${esc(step.id)}" value="${esc(group)}"
            ${track(`split/${step.id}/${group}`)}> <span>${esc(labels.get(group) ?? '확인할 판서 내용')}</span>
        </label>`).join('')}
      </div>
      <div class="ed-inline">
        ${action('step-up', '위로', index === 0)}${action('step-down', '아래로', last)}
        ${action('step-merge', '다음 단계와 병합', last)}
        ${action('step-split', '선택 내용 분리', step.groupIds.length < 2)}
        ${command('preview-step', '이 단계부터 미리보기', `data-index="${index}"`)}
      </div>
      <div class="ed-inline">
        <label>단계 종료 후 <select data-advance="${esc(step.id)}" ${track(`advance/${step.id}`)}>
          ${optionsHtml([['manual', '기다리기'], ['auto', '자동 진행']], step.advance)}
        </select></label>
        <div class="ed-hold" data-hold-row ${step.advance !== 'auto' ? 'hidden' : ''}><label>${index + 1}단계 대기 시간</label>
          ${slider('hold',step.holdMs,0,10000,100,`data-hold="${esc(step.id)}" aria-label="${index + 1}단계 대기 시간" ${pathAttr(`steps.${index}.holdMs`, `${index + 1}단계 대기 시간`)}`)}
        </div>
      </div>
      ${cueMarkup(draft, step, index)}
    </div>`;
  }).join('');
}

function editorMarkup(isNew, allowTemplateChange, onExportDraft) {
  return `<div class="ed-shell">
    <header>
      <div class="ed-heading"><span class="ed-app-label">음악 칠판 · 장면 만들기</span><h2>${isNew ? '새 장면' : '장면 편집'}</h2><span class="ed-muted" data-template-status></span></div>
      <div class="ed-inline">
        ${onExportDraft ? `<details class="ed-extra"><summary>더 보기</summary>${command('export-draft', '초안 파일 내보내기')}</details>` : ''}
        ${command('close', '닫기')}
      </div>
    </header>
    <nav class="ed-tabs" aria-label="편집 화면">
      <button type="button" data-tab="content"><span aria-hidden="true">1</span> 장면 내용</button>
      <button type="button" data-tab="steps"><span aria-hidden="true">2</span> 판서 순서</button>
      <button type="button" data-tab="review"><span aria-hidden="true">3</span> 미리보기·확인</button>
      <span class="ed-nav-hint">입력한 내용은 오른쪽 칠판에 바로 반영돼요.</span>
    </nav>
    <div class="ed-body">
      <div class="ed-errors" role="alert" tabindex="-1" hidden><strong>다음 내용을 확인해 주세요.</strong><ul></ul></div>
      <div class="ed-warnings" hidden><ul></ul></div>
      <p class="ed-font-notice" role="note" hidden></p>
      <div class="ed-grid">
        <div class="ed-main">
          <section class="ed-content-section ed-basics" aria-label="기본 정보">
            <div class="ed-section-heading"><h3>기본 정보</h3><span class="ed-eyebrow">어떤 장면인가요?</span></div>
            ${allowTemplateChange ? `<label for="ed-template">장면 템플릿</label>
              <select id="ed-template" data-field="templateId">${optionsHtml(Object.entries(templateLabels))}</select>` : ''}
            <label for="ed-title">장면 제목</label>
            <input id="ed-title" data-field="title" ${pathAttr('title', '장면 제목')} placeholder="예: 세 음으로 화음 만들기" autocomplete="off">
            <p class="ed-count" data-count="title" id="ed-title-count"></p>
            <label for="ed-question">질문 <span class="ed-optional">선택</span></label>
            <textarea id="ed-question" data-field="question" ${pathAttr('question', '질문')} placeholder="학생에게 먼저 던질 질문을 적어 보세요." rows="2"></textarea>
            <p class="ed-count" data-count="question" id="ed-question-count"></p>
            <label for="ed-caption">정리 문장 <span class="ed-optional">선택</span></label>
            <textarea id="ed-caption" data-field="caption" ${pathAttr('caption', '정리 문장')} placeholder="이 장면에서 기억할 한 문장을 적어 보세요." rows="3"></textarea>
            <p class="ed-count" data-count="caption" id="ed-caption-count"></p>
            <details class="ed-tags-details"><summary>태그로 분류하기 <span class="ed-optional">선택</span></summary><label for="ed-tags">태그</label>
              <input id="ed-tags" data-field="tags" ${pathAttr('tags', '태그')} placeholder="예: 화음, 초등, 합주">
              <p class="ed-muted">쉼표로 구분해 최대 5개까지 입력해요.</p>
            </details>
          </section>
          <section class="ed-content-section ed-score-section" aria-label="판서 내용"><div class="ed-section-heading"><h3 data-template-heading></h3><span class="ed-eyebrow">칠판에 보여 줄 내용</span></div><div class="ed-template"></div></section>
          <section class="ed-stage-section" aria-label="판서 순서"><div class="ed-section-heading"><h3>판서 순서</h3><span class="ed-eyebrow">설명 흐름을 정해 보세요.</span></div>
            <p class="ed-muted">오른쪽 슬라이더로 단계별 모습을 확인하세요. 단계 안의 내용을 선택하면 나누거나 합칠 수 있어요.</p>
            <div class="ed-steps"></div><p class="ed-inline"><span data-activity-actions></span>${command('reset-steps', '기본 순서로 되돌리기')}</p>
          </section>
        </div>
        <aside class="ed-review-panel" aria-label="실시간 미리보기">
          <div class="ed-section-heading"><h3>실시간 미리보기</h3><span class="ed-live-badge">저장 전</span></div>
          <div class="ed-preview-options"><label>판 <select data-preview-theme aria-label="미리보기 보드">${optionsHtml([['chalk','칠판'],['white','화이트보드']],'chalk')}</select></label><label>화면 <select data-preview-orientation aria-label="미리보기 화면 방향">${optionsHtml([['landscape','가로'],['portrait','세로']],'landscape')}</select></label></div>
          <div class="ed-canvas-stage" data-theme="chalk" data-orientation="landscape" role="img" aria-label="저장 전 장면 미리보기"><div class="ed-canvas-ink"></div><span class="ed-preview-brand" aria-hidden="true">레슨 디자이너</span></div>
          <p class="ed-preview-message" role="note" hidden></p>
          <div class="ed-preview-scrubber"><label for="ed-preview-through">보여 줄 단계 <output data-preview-position aria-hidden="true"></output></label><input id="ed-preview-through" type="range" min="0" max="1" step="1" value="1" aria-label="미리보기 단계"><div class="ed-range-scale"><span>빈 칠판</span><span>전체 완성</span></div></div>
          <p class="ed-preview-summary" data-review-steps></p>
          <details class="ed-preview-details"><summary>칠판 내용 읽기</summary><div class="ed-preview"></div></details>
          <details class="ed-activity-details"><summary>듣기·해보기 활동</summary><p class="ed-activity-summary" data-activity-summary></p></details>
          <p class="ed-muted">전체 화면 미리보기에서 실제 크기와 판서 진행을 확인할 수 있어요.</p>
        </aside>
      </div>
    </div>
    <div class="ed-close-options" hidden>
      <strong>변경한 내용을 어떻게 할까요?</strong>
      <div class="ed-inline">
        ${command('continue', '계속 편집')}${command('keep-draft', '초안으로 남기고 닫기')}${command('discard', '변경 버리기')}
      </div>
    </div>
    <footer>
      <div class="ed-footer-status"><span class="ed-status" role="status"></span><span class="ed-save-hint">장면을 저장하면 수업에서 다시 열 수 있어요.</span></div>
      <div class="ed-inline ed-footer-actions">
        ${command('preview', '전체 화면 미리보기')}${command('save', '장면 저장', 'class="primary"')}
      </div>
    </footer>
  </div>`;
}

/** The editor owns an isolated draft. Callbacks never get mutable editor state. */
export function openSceneEditor({
  scene, onSave, onPreview, onDraft, onDiscard, onExportDraft, onClose, onRegenerate, isNew = false,
  allowTemplateChange = false, preserveInitialDraft = false, fontAvailable = true, initialTheme = 'chalk',
  getLayoutFeedback = checkDocumentLayout,
} = {}) {
  if (!scene) throw new Error('편집할 장면이 필요합니다.');

  const original = copy(scene);
  const draft = copy(scene);
  const opener = document.activeElement;
  const dialog = document.createElement('dialog');
  dialog.className = 'scene-editor';
  dialog.setAttribute('aria-label', isNew ? '새 장면' : '장면 편집');
  dialog.innerHTML = editorMarkup(isNew, allowTemplateChange, onExportDraft);
  document.body.append(dialog);

  const find = selector => dialog.querySelector(selector);
  const all = selector => Array.from(dialog.querySelectorAll(selector));
  const keyed = key => all('[data-focus-key]').find(element => element.dataset.focusKey === key);
  const act = action => find(`[data-action="${action}"]`);
  const stepList = find('.ed-steps');
  const body = find('.ed-body');
  const modalStatus = find('.ed-status');
  let tab = 'content';
  let renderedTemplate = null;
  let timer, reviewTimer, composing, closeOpener;
  let dirty = false, validating = false, confirming = false;
  let draftQueue = Promise.resolve();
  let cleanupRequired = false, autosaveQueued = false, autosaveVersion = 0;
  let disabledControls = null;
  let previewThrough = null, previewPortrait = false, previewTheme = initialTheme === 'white' ? 'white' : 'chalk', previewKey = '';
  const restoreBaselineDraft = () => preserveInitialDraft && onDraft ? onDraft(copy(original)) : onDiscard?.(copy(draft));

  function status(message, error = false) {
    if (modalStatus.textContent !== message) modalStatus.textContent = message;
    modalStatus.dataset.error = String(error);
  }

  function setTab(nextTab, { reset = false } = {}) {
    tab = nextTab;
    dialog.dataset.tab = tab;
    for (const button of all('[data-tab]')) button.setAttribute('aria-pressed', String(button.dataset.tab === tab));
    if (reset) {
      body.scrollTop = 0;
      for (const panel of all('.ed-grid > aside,.ed-main > section')) panel.scrollTop = 0;
    }
    find('.ed-nav-hint').textContent = tab === 'steps' ? '단계별 칠판 모습을 슬라이더로 확인해 보세요.' : '입력한 내용은 칠판에 바로 반영돼요.';
  }

  function setBusy(busy) {
    if (busy) {
      disabledControls = { before: document.activeElement, controls: all('button, input, select, textarea').filter(control => !control.disabled) };
      for (const control of disabledControls.controls) control.disabled = true;
      dialog.setAttribute('aria-busy', 'true');
    } else if (disabledControls) {
      for (const control of disabledControls.controls) control.disabled = false;
      if (disabledControls.before?.isConnected && document.activeElement === document.body) disabledControls.before.focus();
      disabledControls = null;
      dialog.removeAttribute('aria-busy');
    }
  }

  function scheduleDraft() {
    const wasDirty = dirty;
    dirty = JSON.stringify(draft) !== JSON.stringify(original);
    clearTimeout(timer);
    if (!dirty) {
      if (wasDirty && autosaveQueued && (onDiscard || (preserveInitialDraft && onDraft))) {
        cleanupRequired = true;
        const cleanupVersion = autosaveVersion;
        draftQueue = draftQueue.then(restoreBaselineDraft).then(() => {
          cleanupRequired = false;
          autosaveQueued = autosaveVersion > cleanupVersion;
          if (!dirty) status('변경 사항이 없어 초안을 정리했습니다.');
        }, () => {
          cleanupRequired = true;
          status('초안을 정리할 수 없어요. 닫을 때 다시 시도합니다.', true);
        });
      }
      return;
    }
    if (!onDraft) return;
    status('초안 저장 대기 중');
    timer = setTimeout(() => {
      autosaveQueued = true;
      const version = ++autosaveVersion;
      const snapshot = copy(draft);
      draftQueue = draftQueue.then(() => onDraft(snapshot)).then(() => {
        if (version === autosaveVersion && JSON.stringify(draft) === JSON.stringify(snapshot)) status('초안 저장됨');
      }, () => status('초안을 저장하지 못했어요. 입력은 편집기에 남아 있습니다.', true));
    }, 800);
  }

  function renderTemplate() {
    const template = draft.templateId;
    find('[data-template-heading]').textContent = templateLabels[template];
    find('[data-template-status]').textContent = `${templateLabels[template]} · 저장 전 편집`;
    const templateSelect = find('#ed-template');
    if (templateSelect) templateSelect.value = template;

    const markup = template === 'diagram' ? diagramControls(draft.content) : template === 'text-explanation'
      ? textControls(draft.content.blocks)
      : Array.isArray(draft.content.columns) ? notationControls(draft.content) : legacyControls(draft);
    const templatePanel = find('.ed-template');
    const existingList = template !== 'diagram' && renderedTemplate === template && templatePanel.querySelector('.ed-list');
    if (existingList) {
      const parsed = document.createElement('template');
      parsed.innerHTML = markup;
      const updatedList = parsed.content.querySelector('.ed-list');
      existingList.replaceChildren(...updatedList.children);
      for (const action of ['block-add', 'column-add-note', 'column-add-chord', 'column-add-dyad', 'note-add']) {
        const control = act(action);
        const updated = parsed.content.querySelector(`[data-action="${action}"]`);
        if (control && updated) control.disabled = updated.disabled;
      }
      const intervals = templatePanel.querySelector('.ed-intervals');
      if (intervals) intervals.innerHTML = intervalControls(draft.content);
    } else {
      templatePanel.innerHTML = markup;
      renderedTemplate = template;
    }
  }

  function renderSteps() {
    const selected = new Set(all('[data-split]:checked').map(input => input.dataset.focusKey));
    stepList.innerHTML = stepsMarkup(draft, describeGroups(draft));
    for (const input of all('[data-split]')) input.checked = selected.has(input.dataset.focusKey);
    find('[data-activity-actions]').innerHTML = draft.schemaVersion === 2 && (draft.content.columns || draft.templateId === 'diagram')
      ? command('step-add-listen', '듣기 단계 추가', disabled(draft.steps.length >= 12)) + (draft.content.columns ? command('step-add-practice', '해보기 단계 추가', disabled(draft.steps.length >= 12)) : '') : '';
  }

  function syncTemplateVersion() {
    if (draft.schemaVersion !== 2 || !draft.content.columns) return;
    draft.templateVersion = notationTemplateVersion(draft);
    if (draft.templateVersion === 2) {
      for (const key of ['splitSignature', 'intervals', 'clef', 'scaleType', 'gapLabels']) delete draft.content[key];
    }
  }

  function syncSteps() {
    const next = reconcileSteps(draft);
    if (!Array.isArray(next) || JSON.stringify(next) === JSON.stringify(draft.steps)) return false;
    draft.steps = next;
    return true;
  }

  function fieldElement(path) {
    const controls = all('[data-path]');
    const exact = controls.find(control => control.dataset.path === path);
    if (exact) return exact;
    if (path === 'steps') return null;
    if (path.startsWith('tags.')) return find('#ed-tags');
    for (let ancestor = path; ancestor.includes('.');) {
      ancestor = ancestor.slice(0, ancestor.lastIndexOf('.'));
      const specific = controls.find(control => control.dataset.path === ancestor || control.dataset.path.startsWith(ancestor + '.'));
      if (specific) return specific;
    }
    return controls.find(control => control.dataset.path.startsWith(path + '.')) ?? null;
  }

  function feedbackSummary(selector, items) {
    const region = find(selector);
    const list = region.querySelector('ul');
    const values = items.map(({ field, message }) => {
      const name = fieldElement(field)?.dataset.fieldLabel || mainFields[field] || '';
      return name ? `${name} · ${message}` : message;
    });
    const existing = Array.from(list.children).map(item => item.textContent);
    if (existing.length !== values.length || values.some((value, index) => existing[index] !== value)) {
      list.replaceChildren(...values.map(value => {
        const item = document.createElement('li');
        item.textContent = value;
        return item;
      }));
    }
    region.hidden = !values.length;
  }

  function refresh({ requireValid = false, focusError = false } = {}) {
    clearTimeout(reviewTimer);
    syncTemplateVersion();
    const model = validateScene(draft);
    let layout = {};
    try {
      layout = getLayoutFeedback(draft) || {};
    } catch {
      if (model.valid) layout.errors = [{ field: 'content', message: '칠판 배치를 확인하지 못했어요.' }];
    }
    const errors = [...(model.errors || []), ...(layout.errors || [])];
    const warnings = [...(model.warnings || []), ...(layout.warnings || [])];
    feedbackSummary('.ed-errors', validating || requireValid ? errors : []);
    feedbackSummary('.ed-warnings', warnings);

    for (const feedback of all('.ed-field-error')) feedback.remove();
    for (const control of all('[data-path]')) {
      control.removeAttribute('aria-invalid');
      const field = control.dataset.path;
      const countElement = all('[data-count]').find(element => element.dataset.count === field);
      if (countElement) control.setAttribute('aria-describedby', countElement.id);
      else control.removeAttribute('aria-describedby');
    }

    if (validating || requireValid) {
      const handled = new Set();
      for (const [index, error] of errors.entries()) {
        const control = fieldElement(error.field);
        if (!control || handled.has(control)) continue;
        handled.add(control);
        const message = document.createElement('p');
        message.className = 'ed-field-error';
        message.id = `ed-field-error-${index}`;
        message.textContent = error.message;
        control.setAttribute('aria-invalid', 'true');
        control.setAttribute('aria-describedby', [control.getAttribute('aria-describedby'), message.id].filter(Boolean).join(' '));
        control.insertAdjacentElement('afterend', message);
      }
    }

    const counts = layout.counts || layout.fields || {};
    for (const counter of all('[data-count]')) {
      const field = counter.dataset.count;
      const match = /^content\.blocks\.(\d+)\.text$/.exec(field);
      const value = match ? draft.content.blocks?.[Number(match[1])]?.text : draft[field];
      const limit = match ? 80 : maxLengths[field];
      const remaining = limit - count(value);
      const lines = counts[field];
      counter.textContent = [
        remaining >= 0 ? `${remaining}자 남음` : `${-remaining}자 초과`,
        lines ? [lines.landscape != null && `가로 ${lines.landscape}줄`, lines.portrait != null && `세로 ${lines.portrait}줄`].filter(Boolean).join(' · ') : '',
      ].filter(Boolean).join(' · ');
    }

    const content = draft.content;
    let preview;
    const handText = [draft.question && `Q. ${draft.question}`, draft.caption];
    if (draft.templateId === 'diagram') {
      preview = content.items.map(item => [item.label, item.sub].filter(Boolean).join(' · ')).join('\n');
      handText.push(preview);
    } else if (content.blocks) {
      preview = content.blocks.map(block => block.text).join('\n');
      handText.push(preview);
    } else if (content.columns) {
      preview = content.columns.map((column, index) => {
        const notes = column.notes.map(note => `${pitchText(note.pitch, content.key)} (${note.pitch})`).join(' · ');
        const chord = column.kind === 'chord' ? describeChord(column, content.key, draft.templateVersion === 3) : null;
        if (chord) {
          const readout = all('[data-column]').find(element => element.dataset.column === column.id)?.querySelector('[data-theory-readout]');
          const quality = describeDiatonicChord(column.notes.map(note => note.pitch), content.key).qualityName;
          const summary = [quality && `성질 ${quality}`, chord.name && `기능 ${chord.name}`, chord.roman].filter(Boolean).join(' · ');
          if (readout) {
            const label = chord.warning && !chord.roman ? '판서에 표시' : '이론 계산';
            readout.textContent = summary ? `${label} · ${summary}` : '이 조와 구성음에 해당하는 자동 화음 이름이 없습니다.';
          }
          handText.push(chord.name, chord.roman);
        }
        if (column.kind === 'dyad') {
          const interval = describeInterval(column.notes[0]?.pitch, column.notes[1]?.pitch);
          const readout = all('[data-column]').find(element => element.dataset.column === column.id)?.querySelector('[data-dyad-readout]');
          if (readout) readout.textContent = interval?.name || '음정을 확인해 주세요.';
        }
        return [`${index + 1}열 · ${notes}`, chord?.name, chord?.roman].filter(Boolean).join(' · ');
      }).join('\n');
      const notes = content.columns.flatMap(column => column.notes);
      for (const interval of content.intervals || []) {
        const readout = all('[data-interval-readout]').find(element => element.dataset.intervalReadout === interval.id);
        const from = notes.find(note => note.id === interval.from), to = notes.find(note => note.id === interval.to);
        if (readout) readout.textContent = describeInterval(from?.pitch, to?.pitch)?.name || '음정을 확인해 주세요.';
      }
    } else {
      preview = content.notes.map(note => `${pitchText(note.pitch)} (${note.pitch})`).join(' · ');
      handText.push(content.chordName, content.roman);
    }
    find('.ed-preview').textContent = [draft.question, preview, draft.caption].filter(Boolean).join('\n\n');
    find('[data-review-steps]').textContent = `${draft.steps.length}단계 · ${templateLabels[draft.templateId]}`;
    find('[data-activity-summary]').textContent = activitySummary(draft);
    syncRangeReadouts();
    refreshPreview();
    let sourceNotice = find('[data-source-notice]');
    if (content.source && !sourceNotice) {
      sourceNotice = document.createElement('div'); sourceNotice.dataset.sourceNotice = '';
      sourceNotice.className = 'ed-source-notice';
      find('.ed-content-section').prepend(sourceNotice);
      sourceNotice.innerHTML = `<p>주제 카드로 만든 장면</p>${onRegenerate ? command('regenerate', '조건 바꿔 다시 만들기') : ''}`;
    }

    const fontMessages = [];
    if (handText.some(text => text && !hasGlyphs(text.replace(/\s/g, '')))) fontMessages.push('손글씨 획이 없는 문자는 일반 글꼴로 표시해요.');
    if (!fontAvailable) fontMessages.push('일반 글꼴을 불러오지 못해 기기 기본 글꼴을 사용해요.');
    const fontNotice = find('.ed-font-notice');
    fontNotice.textContent = fontMessages.join(' ');
    fontNotice.hidden = !fontMessages.length;

    if (focusError && errors.length) {
      const first = errors[0].field || '';
      setTab(first.startsWith('steps') ? 'steps' : 'content');
      const target = fieldElement(first) || find('.ed-errors');
      target.focus();
      target.scrollIntoView?.({ block: 'nearest' });
    }
    return !errors.length;
  }

  function syncRangeReadouts() {
    const notes = draft.content.columns?.flatMap(column=>column.notes) || draft.content.notes || [];
    for (const range of all('.ed-range')) {
      const input = range.querySelector('input[type="range"]');
      const kind = range.dataset.rangeKind;
      let text;
      if (kind === 'pitch') {
        const pitch = parsePitch(notes.find(note=>note.id === input.dataset.pitchSlider)?.pitch);
        if (pitch) input.value = naturalPitches.indexOf(pitch.letter+pitch.octave);
        text = pitch ? `${pitchText(formatPitch(pitch),draft.content.key)} · ${formatPitch(pitch)}` : '음을 선택해 주세요';
      } else if (kind === 'hold') text = secondsText(input.value);
      else if (kind === 'level') text = `${Math.round(Number(input.value)*100)}%`;
      else text = `${input.value} BPM`;
      input.setAttribute('aria-valuetext',text);
      range.querySelector('[data-range-value]').textContent = text;
    }
  }

  function scrubPreview(control) {
    const through = Number(control.value);
    previewThrough = through >= draft.steps.length ? null : through;
    refreshPreview();
  }

  function refreshPreview() {
    const total = draft.steps.length;
    const through = Math.max(0,Math.min(total,previewThrough ?? total));
    const scrubber = find('#ed-preview-through');
    scrubber.max = total;
    scrubber.value = through;
    const position = through === 0 ? '빈 칠판' : `${through} / ${total}단계${through === total ? ' · 전체' : ''}`;
    find('[data-preview-position]').textContent = position;
    scrubber.setAttribute('aria-valuetext',through ? `${position} · ${draft.steps[through-1]?.label || ''}` : position);
    const stage = find('.ed-canvas-stage');
    stage.dataset.theme = previewTheme;
    stage.dataset.orientation = previewPortrait ? 'portrait' : 'landscape';
    const key = JSON.stringify([draft.templateId,draft.question,draft.caption,draft.content,draft.steps.map(step=>step.groupIds),through,previewTheme,previewPortrait]);
    if (key === previewKey) return;
    const message = find('.ed-preview-message');
    try {
      const description = renderEditorPreview(find('.ed-canvas-ink'),draft,{portrait:previewPortrait,theme:previewTheme,through});
      stage.setAttribute('aria-label','저장 전 미리보기 · '+description);
      message.hidden = true;
      stage.removeAttribute('data-invalid');
      previewKey = key;
    } catch {
      stage.setAttribute('data-invalid','true');
      message.textContent = '내용을 확인하면 칠판 미리보기가 갱신돼요.';
      message.hidden = false;
    }
  }

  function update(control) {
    const key = control.dataset.field;
    const content = draft.content;
    if (['title', 'question', 'caption'].includes(key)) draft[key] = control.value;
    else if (key === 'tags') draft.tags = control.value.split(',').map(tag => tag.trim()).filter(Boolean);
    else if (key === 'chordName') content.chordName = control.value;
    else if (control.dataset.block) content.blocks.find(block => block.id === control.dataset.block).text = control.value;
    else if (control.dataset.memo) content.columns.find(column => column.id === control.dataset.memo).teacherMemo = control.value;
    else if (control.dataset.stepLabel) draft.steps.find(step => step.id === control.dataset.stepLabel).label = control.value;
    else if (control.dataset.hold) draft.steps.find(step => step.id === control.dataset.hold).holdMs = Number(control.value);
    else if (control.dataset.pitchSlider) {
      const notes = content.columns ? content.columns.flatMap(column=>column.notes) : content.notes || [];
      const note = notes.find(note=>note.id === control.dataset.pitchSlider);
      if (!note) return false;
      const pitch = parsePitch(naturalPitches[Number(control.value)]);
      if (!pitch) return false;
      note.pitch = pitch.letter + accidentalText(parsePitch(note.pitch)?.acc || 0) + pitch.octave;
      const select = all('[data-note]').find(select=>select.dataset.note === note.id);
      if (select) select.value = pitch.letter+pitch.octave;
    }
    else if (control.dataset.diagramText) {
      const field = control.dataset.diagramText;
      const item = draft.content.items.find(item => item.id === control.dataset.id);
      const previous = item[field];
      item[field] = ['level', 'tempo'].includes(field) ? Number(control.value) : control.value;
      if (field === 'label' && content.kind === 'sequence' && content.phrases?.[previous] && previous !== item.label) {
        if (!content.phrases[item.label]) content.phrases[item.label] = content.phrases[previous];
        if (!content.items.some(other => other.label === previous)) delete content.phrases[previous];
      }
    }
    else return false;
    return true;
  }

  function refreshGroups() {
    const labels = describeGroups(draft);
    for (const control of all('[data-split]')) {
      const label = control.nextElementSibling;
      if (label) label.textContent = labels.get(control.value) ?? '확인할 판서 내용';
    }
  }

  function textInput(control) {
    if (!update(control)) return;
    syncRangeReadouts();
    const needsSteps = ['question', 'caption', 'chordName'].includes(control.dataset.field) && syncSteps();
    if (needsSteps) renderSteps();
    scheduleDraft();
    clearTimeout(reviewTimer);
    reviewTimer = setTimeout(refresh, 120);
  }

  function changed({ template = false, steps = false, focusKey = '', showRemoval = false } = {}) {
    const scroll = body.scrollTop;
    const previousSteps = draft.steps.length;
    const active = document.activeElement;
    const previousCues = draft.steps.filter(step => step.cue).map(step => ({ id: step.id, cue: JSON.stringify(step.cue) }));
    syncTemplateVersion();
    const needsSteps = syncSteps();
    if (template) renderTemplate();
    if (needsSteps || steps) renderSteps();
    else refreshGroups();
    const target = focusKey && keyed(focusKey);
    if (target && !target.disabled) target.focus({ preventScroll: true });
    else if (active?.isConnected) active.focus({ preventScroll: true });
    body.scrollTop = scroll;
    if (target && !target.disabled && template) target.scrollIntoView?.({ block: 'nearest' });
    scheduleDraft();
    refresh();
    if (showRemoval && draft.steps.length < previousSteps) {
      status(`삭제한 내용의 판서 참조를 정리하고 빈 단계 ${previousSteps - draft.steps.length}개를 지웠어요.`);
    }
    if (showRemoval && previousCues.some(previous => JSON.stringify(draft.steps.find(step => step.id === previous.id)?.cue) !== previous.cue)) status('삭제한 열의 듣기 대상을 정리하고 정답이 지워진 해보기 활동을 제거했어요.');
  }

  function finish(result) {
    clearTimeout(timer);
    clearTimeout(reviewTimer);
    dialog.close();
    dialog.remove();
    if (opener?.isConnected && !opener.closest('details:not([open])')) opener.focus();
    onClose?.(result);
  }

  async function closeEditor(mode) {
    if (disabledControls || confirming) return;
    setBusy(true);
    try {
      clearTimeout(timer);
      await draftQueue;
      if (mode === 'discard') {
        if (preserveInitialDraft) await restoreBaselineDraft();
        else await onDiscard?.(copy(draft));
      } else if (mode === 'keep') {
        if (!onDraft) throw new Error('초안을 저장할 수 없어요. 장면을 저장하거나 계속 편집해 주세요.');
        await onDraft(copy(draft));
      } else if (cleanupRequired) await restoreBaselineDraft();
      finish({ discarded: mode === 'discard' });
    } catch (error) {
      setBusy(false);
      status(error?.message || '편집을 닫지 못했어요. 입력은 편집기에 남아 있습니다.', true);
    }
  }

  function requestClose() {
    if (disabledControls || confirming) return;
    if (composing) {
      textInput(composing);
      composing = null;
    }
    if (!dirty) return closeEditor('clean');
    closeOpener = document.activeElement;
    find('.ed-close-options').hidden = false;
    act('continue').focus();
  }

  async function confirmEdit(options) {
    confirming = true;
    try {
      return await confirmAction({ destructive: true, ...options });
    } finally {
      confirming = false;
    }
  }

  function applyPreset(key) {
    const preset = CHORD_PRESETS[key];
    const content = draft.content;
    content.preset = preset ? key : 'custom';
    content.roman = preset?.roman ?? '';
    if (!preset) return;
    content.notes = content.notes.map((note, index) => ({ ...note, pitch: preset.pitches[index] }));
    content.chordName = preset.chordName ?? preset.name ?? '';
  }

  async function selectChange(control) {
    if (control.hasAttribute('data-preview-theme')) { previewTheme = control.value; refreshPreview(); return; }
    if (control.hasAttribute('data-preview-orientation')) { previewPortrait = control.value === 'portrait'; refreshPreview(); return; }
    if (control.type === 'range') { if (control.id === 'ed-preview-through') scrubPreview(control); else textInput(control); return; }
    const { field, note, accidental, highlight, ink, advance, labelMode, chordEdit } = control.dataset;
    const content = draft.content;
    if (field === 'templateId' && control.value !== draft.templateId) {
      const selected = control.value;
      control.value = draft.templateId;
      if (!await confirmEdit({
        title: '장면 템플릿 변경',
        message: '템플릿 내용과 판서 순서를 새 템플릿의 기본값으로 바꿉니다.',
        confirmLabel: '템플릿 변경',
        returnFocus: control,
      })) return;
      const fresh = draft.schemaVersion === 2 ? createSceneV2(selected) : createScene(selected);
      Object.assign(draft, { templateId: selected, templateVersion: fresh.templateVersion, content: fresh.content, steps: [] });
      draft.steps = defaultSteps(draft);
      changed({ template: true, steps: true });
    } else if (field === 'preset') {
      applyPreset(control.value);
      changed({ template: true, focusKey: 'preset' });
    } else if (['emphasis', 'showLabels', 'showGaps', 'splitSignature', 'arrows'].includes(field)) {
      content[field] = control.checked;
      if (!control.checked && field === 'splitSignature') delete content.splitSignature;
      changed({ steps: field === 'splitSignature' });
    } else if (field === 'scaleType') {
      if (control.value) content.scaleType = control.value;
      else delete content.scaleType;
      changed();
    } else if (field === 'key') {
      const [tonic, mode] = control.value.split(':');
      content.key = { tonic, mode };
      changed();
    } else if (field === 'diagramKind') {
      content.kind = control.value;
      delete content.arrows; delete content.hairpins; delete content.phrases;
      if (content.kind === 'sequence') content.arrows = true;
      for (const item of content.items) {
        delete item.level; delete item.tempo;
        if (content.kind === 'ladder') item.level = 0.6;
        if (content.kind === 'line') item.tempo = 96;
      }
      changed({ template: true, steps: true });
    } else if (control.dataset.diagramText) {
      update(control);
      changed({ template: control.dataset.diagramText === 'label', steps: true });
    } else if (control.dataset.diagramValue) {
      content.items.find(item => item.id === control.dataset.id)[control.dataset.diagramValue] = control.value;
      changed();
    } else if (control.dataset.hairpin) {
      content.hairpins = ['up', 'down'].filter(direction => direction === control.dataset.hairpin ? control.checked : content.hairpins?.includes(direction));
      changed();
    } else if (control.dataset.phrase) {
      content.phrases ||= {};
      if (control.value) content.phrases[control.dataset.phrase] = control.value;
      else delete content.phrases[control.dataset.phrase];
      if (!Object.keys(content.phrases).length) delete content.phrases;
      changed();
    } else if (control.dataset.interval) {
      content.intervals.find(interval => interval.id === control.dataset.interval)[control.dataset.end] = control.value;
      changed();
    } else if (Object.keys(control.dataset).some(name => name.startsWith('cue'))) {
      editCue(control);
    } else if (note || accidental) {
      const notes = content.columns ? content.columns.flatMap(column => column.notes) : content.notes;
      const selected = notes.find(item => item.id === (note || accidental));
      if (!selected) return;
      const prevPitch = parsePitch(selected.pitch);
      const value = parsePitch(control.value);
      if (accidental && prevPitch) selected.pitch = prevPitch.letter + control.value + prevPitch.octave;
      else if (value) selected.pitch = value.letter + accidentalText(prevPitch?.acc ?? 0) + value.octave;
      const legacyChord = !content.columns && draft.templateId === 'chord-stack';
      if (legacyChord) {
        content.preset = 'custom';
        content.roman = '';
      }
      changed({ template: legacyChord, focusKey: legacyChord ? `pitch/${note}` : '' });
    } else if (highlight) {
      const owner = content.columns ? content.columns.find(column => column.notes.some(note => note.id === highlight)) : content;
      const values = owner.highlightNoteIds || [];
      owner.highlightNoteIds = control.checked ? [...new Set([...values, highlight])] : values.filter(id => id !== highlight);
      changed();
    } else if (ink) {
      content.blocks.find(block => block.id === ink).ink = control.value;
      changed();
    } else if (advance) {
      draft.steps.find(step => step.id === advance).advance = control.value;
      control.closest('.ed-card').querySelector('[data-hold-row]').hidden = control.value !== 'auto';
      changed();
    } else if (labelMode) {
      content.columns.find(column => column.id === labelMode).labelMode = control.value;
      changed();
    } else if (chordEdit) {
      const id = control.closest('[data-column]').dataset.column;
      content.columns.find(column => column.id === id)[chordEdit] = control.checked;
      changed();
    }
  }

  function editCue(control) {
    const type = control.dataset.cueType;
    const step = draft.steps.find(item => item.id === (type || control.dataset.cueTarget || control.dataset.cueOrder || control.dataset.cueRange || control.dataset.cueLabel || control.dataset.id));
    if (!step) return;
    const index = draft.steps.indexOf(step);
    const diagram = draft.templateId === 'diagram';
    const visible = activityColumns(draft, index);
    if (type) {
      if (control.value === 'none') delete step.cue;
      else if (control.value === 'listen') step.cue = diagram ? { type: 'listen', items: draft.content.items.filter(item => draft.steps.slice(0,index+1).some(current => current.groupIds.includes(`box/${item.id}`))).map(item => item.id) } : { type: 'listen', targets: visible.map(column => ({ columnId: column.id })) };
      else step.cue = { type: 'practice', order: 'free', columnIds: visible.map(column => column.id), keyboard: { ...(autoKeyboard(visible) || { from: 'C4', to: 'C5' }), labelMode: 'none' } };
      if (step.cue && !(step.cue.items || step.cue.targets || step.cue.columnIds)?.length) {
        delete step.cue; control.value = 'none';
        status('이 단계까지 보여 준 음이나 항목이 있어야 활동을 넣을 수 있어요.', true); return;
      }
    } else if (!step.cue) return;
    else if (control.dataset.cueTarget) {
      const ids = all('[data-cue-target]').filter(input => input.dataset.cueTarget === step.id && input.checked).map(input => input.value);
      if (diagram) step.cue.items = draft.content.items.filter(item => ids.includes(item.id)).map(item => item.id);
      else if (step.cue.type === 'listen') step.cue.targets = draft.content.columns.filter(column => ids.includes(column.id)).map(column => ({ columnId: column.id }));
      else {
        const previousRange = autoKeyboard(draft.content.columns.filter(column => step.cue.columnIds.includes(column.id)));
        const automatic = previousRange && previousRange.from === step.cue.keyboard.from && previousRange.to === step.cue.keyboard.to;
        step.cue.columnIds = draft.content.columns.filter(column => ids.includes(column.id)).map(column => column.id);
        if (automatic) Object.assign(step.cue.keyboard, autoKeyboard(draft.content.columns.filter(column => ids.includes(column.id))) || {});
      }
    } else if (control.dataset.cueOrder) step.cue.order = control.value;
    else if (control.dataset.cueLabel) step.cue.keyboard.labelMode = control.value;
    else if (control.dataset.cueKey) step.cue.keyboard[control.dataset.cueKey] = control.value;
    else if (control.dataset.cueRange) {
      if (control.value === 'auto') {
        const range = autoKeyboard(draft.content.columns.filter(column => step.cue.columnIds.includes(column.id)));
        if (range) Object.assign(step.cue.keyboard, range);
        else status('정답 음을 두 옥타브 이하의 건반 범위에 넣을 수 없어요.', true);
      } else {
        control.closest('.ed-cue').querySelector('[data-keyboard-range-row]').hidden = false;
        scheduleDraft(); refresh(); return;
      }
    }
    changed({ steps: true, focusKey: `cue-type/${step.id}` });
  }

  function exerciseEdit(action, id) {
    const content = draft.content;
    const isBlock = action.startsWith('block-');
    const isColumn = action.startsWith('column-');
    const items = isBlock ? content.blocks : isColumn ? content.columns : content.notes;
    const prefix = isBlock ? 'block' : isColumn ? 'column' : 'note';
    if (action === 'column-note-add' || action === 'column-note-remove') {
      const column = action === 'column-note-add' ? items.find(item => item.id === id) : items.find(item => item.notes.some(note => note.id === id));
      if (!column) return;
      if (action === 'column-note-add' && column.notes.length < 4) {
        const noteId = newId('n');
        const last = column.notes.at(-1)?.pitch.replace(/[b#]/g, '');
        const natural = naturalPitches.indexOf(last);
        const pitch = naturalPitches[Math.min(natural + 2, naturalPitches.length - 1)];
        column.notes.push({ id: noteId, pitch });
        changed({ template: true, focusKey: `pitch/${noteId}` });
      } else if (action === 'column-note-remove' && column.notes.length > 3) {
        const index = column.notes.findIndex(note => note.id === id);
        column.notes.splice(index, 1);
        column.highlightNoteIds = column.highlightNoteIds.filter(noteId => noteId !== id);
        changed({ template: true, focusKey: `pitch/${column.notes[Math.min(index, column.notes.length - 1)].id}`, showRemoval: true });
      }
      return;
    }

    const findInput = item => isBlock ? `block/${item.id}` : isColumn ? `pitch/${item.notes[0].id}` : `pitch/${item.id}`;
    const min = isBlock || isColumn ? 1 : 2;
    if (action.startsWith(`${prefix}-add`)) {
      if (items.length >= (isBlock ? 6 : isColumn ? MAX_NOTATION_COLUMNS : 8)) return;
      let item;
      if (isColumn) {
        const chord = action === 'column-add-chord';
        const dyad = action === 'column-add-dyad';
        const notes = (chord ? ['C4', 'E4', 'G4'] : dyad ? ['C4', 'E4'] : ['C4']).map(pitch => ({ id: newId('n'), pitch }));
        item = {
          id: newId('c'), kind: chord ? 'chord' : dyad ? 'dyad' : 'note', notes, labelMode: 'none', highlightNoteIds: [],
          ...(chord ? { showName: true, showRoman: true } : dyad ? { showName: true } : {}),
        };
      } else {
        item = isBlock ? { id: newId('b'), text: '새 문장을 입력하세요.', ink: 'main' } : { id: newId('n'), pitch: 'C4' };
      }
      items.push(item);
      changed({ template: true, focusKey: findInput(item) });
      return;
    }

    const index = items.findIndex(item => item.id === id);
    if (index < 0) return;
    if (action.endsWith('-remove') && items.length > min) {
      items.splice(index, 1);
      if (!isBlock && !isColumn) content.highlightNoteIds = content.highlightNoteIds.filter(note => note !== id);
      changed({ template: true, focusKey: findInput(items[Math.min(index, items.length - 1)]), showRemoval: true });
    } else if (action.endsWith('-up') || action.endsWith('-down')) {
      const delta = action.endsWith('-up') ? -1 : 1;
      if (!move(items, index, delta)) return;
      const remaining = index + delta + delta;
      changed({ template: true, focusKey: remaining >= 0 && remaining < items.length ? `${action}/${id}` : findInput(items[index + delta]) });
    }
  }

  async function editStep(action, id, trigger) {
    const index = draft.steps.findIndex(step => step.id === id);
    if (action === 'step-add-listen' || action === 'step-add-practice') {
      if (draft.steps.length >= 12) { status('단계는 최대 12개까지 만들 수 있어요.', true); return; }
      const stepId = newId('s');
      draft.steps.push({ id: stepId, label: action === 'step-add-listen' ? '소리 듣기' : '건반에서 눌러 보세요', groupIds: [], advance: 'manual', holdMs: 0 });
      editCue({ dataset: { cueType: stepId }, value: action === 'step-add-listen' ? 'listen' : 'practice' });
      return;
    }
    if (action === 'reset-steps') {
      const activities = draft.steps.filter(step => step.cue).map(step => ({ ...copy(step), id: step.groupIds.length ? newId('s') : step.id, groupIds: [] }));
      const defaults = defaultSteps(draft);
      if (defaults.length + activities.length > 12) { status('활동을 보존하면 12단계를 넘어요. 활동이나 판서를 먼저 합쳐 주세요.', true); return; }
      if (!await confirmEdit({
        title: '기본 판서 순서로 되돌리기',
        message: '판서 순서·대기 설정을 초기화하고 활동은 원래 순서대로 뒤에 보존합니다.',
        confirmLabel: '되돌리기',
        returnFocus: trigger,
      })) return;
      draft.steps = [...defaults, ...activities];
      changed({ steps: true });
      return;
    }
    if (index < 0) return;
    const before = copy(draft.steps);
    let focusKey = `step-label/${id}`;
    if (action === 'step-up' || action === 'step-down') {
      if (!move(draft.steps, index, action === 'step-up' ? -1 : 1)) return;
    } else if (action === 'step-merge' && index < draft.steps.length - 1) {
      if (draft.steps[index].cue && draft.steps[index + 1].cue) { status('두 단계 모두 활동이 있어 병합할 수 없어요. 활동 하나를 먼저 지워 주세요.', true); return; }
      draft.steps[index].groupIds.push(...draft.steps[index + 1].groupIds);
      if (draft.steps[index + 1].cue) draft.steps[index].cue = copy(draft.steps[index + 1].cue);
      draft.steps.splice(index + 1, 1);
    } else if (action === 'step-split') {
      const chosen = all('[data-split]:checked').filter(input => input.dataset.split === id).map(input => input.value);
      if (!chosen.length || chosen.length === draft.steps[index].groupIds.length) {
        status('나눌 내용을 일부만 선택해 주세요.', true);
        return;
      }
      if (draft.steps.length >= 12) {
        status('단계는 최대 12개까지 만들 수 있어요.', true);
        return;
      }
      const stepId = newId('s');
      const cue = draft.steps[index].cue;
      delete draft.steps[index].cue;
      draft.steps[index].groupIds = draft.steps[index].groupIds.filter(group => !chosen.includes(group));
      draft.steps.splice(index + 1, 0, { id: stepId, label: '새 단계', groupIds: chosen, advance: 'manual', holdMs: 0, ...(cue ? { cue } : {}) });
      focusKey = `step-label/${stepId}`;
    }
    changed({ steps: true, focusKey });
    if (validateScene(draft).errors?.some(error => error.field.startsWith('steps'))) {
      draft.steps = before;
      changed({ steps: true, focusKey: `step-label/${id}` });
      status('선행 조건을 지키는 순서로 내용을 배치해 주세요.', true);
    }
  }

  function editInterval(action, id) {
    if (action === 'interval-remove') {
      draft.content.intervals = (draft.content.intervals || []).filter(interval => interval.id !== id);
      if (!draft.content.intervals.length) delete draft.content.intervals;
    } else {
      const notes = draft.content.columns.flatMap(column => column.notes);
      if (notes.length < 2 || (draft.content.intervals?.length || 0) >= 4) return;
      (draft.content.intervals ||= []).push({ id: newId('i'), from: notes[0].id, to: notes.at(-1).id });
    }
    changed({ template: true, steps: true });
  }

  function editDiagram(action, id) {
    const items = draft.content.items;
    const index = items.findIndex(item => item.id === id);
    if (action === 'diagram-add' && items.length < 7) items.push({ id: newId('b'), label: draft.content.kind === 'sequence' ? 'A' : '새 항목', sub: '', ink: 'main', ...(draft.content.kind === 'ladder' ? { level: 0.6 } : draft.content.kind === 'line' ? { tempo: 96 } : {}) });
    else if (action === 'diagram-remove' && items.length > 2 && index >= 0) {
      const [removed] = items.splice(index, 1);
      if (draft.content.kind === 'sequence' && draft.content.phrases && !items.some(item => item.label === removed.label)) delete draft.content.phrases[removed.label];
    }
    else if (action === 'diagram-up' || action === 'diagram-down') move(items, index, action === 'diagram-up' ? -1 : 1);
    else return;
    changed({ template: true, steps: true, showRemoval: action === 'diagram-remove' });
    if (action === 'diagram-remove' && draft.steps.some(step => step.cue?.items?.includes(id))) status('삭제한 항목을 가리키는 듣기 대상이 남아 있어요. 활동에서 해당 선택을 해제한 뒤 저장해 주세요.', true);
  }

  async function saveOrPreview(action, trigger) {
    if (composing) {
      textInput(composing);
      composing = null;
    }
    if (syncSteps()) renderSteps();
    validating = true;
    if (!refresh({ requireValid: true, focusError: true })) return;
    const snapshot = copy(draft);
    if (action !== 'save') {
      if (!onPreview) {
        status('미리보기를 사용할 수 없어요.', true);
        return;
      }
      const returnToEditor = () => {
        if (!dialog.isConnected || dialog.open) return;
        dialog.showModal();
        trigger.focus();
      };
      dialog.close();
      try {
        await onPreview(snapshot, { startStep: action === 'preview-step' ? Number(trigger.dataset.index) : 0, returnToEditor });
      } catch (error) {
        returnToEditor();
        status(error?.message || '미리보기를 열지 못했어요.', true);
      }
      return;
    }

    setBusy(true);
    try {
      if (!onSave) throw new Error('장면 저장을 사용할 수 없어요.');
      clearTimeout(timer);
      await draftQueue;
      await onSave(snapshot);
      finish({ saved: true });
    } catch (error) {
      let draftSaved = false;
      if (onDraft) {
        try {
          autosaveQueued = true;
          autosaveVersion++;
          await onDraft(snapshot);
          draftSaved = true;
        } catch {
          // Keep inputs and file export available if the device cannot retain drafts.
        }
      }
      setBusy(false);
      status((error?.message || '저장하지 못했어요.') + (draftSaved
        ? ' 최신 입력을 초안으로 저장했어요.'
        : ' 입력은 편집기에 남아 있어요. 초안 파일로 보관할 수 있습니다.'), true);
    }
  }

  dialog.addEventListener('compositionstart', event => { composing = event.target; });
  dialog.addEventListener('compositionend', event => {
    composing = null;
    textInput(event.target);
  });
  dialog.addEventListener('input', event => {
    if (!disabledControls && !composing && !event.isComposing) {
      if (event.target.id === 'ed-preview-through') scrubPreview(event.target);
      else textInput(event.target);
    }
  });
  dialog.addEventListener('change', event => {
    if (!disabledControls && !confirming) void selectChange(event.target);
  });
  dialog.addEventListener('click', async event => {
    const trigger = event.target.closest('button');
    if (!trigger || disabledControls || confirming) return;
    if (trigger.dataset.tab) {
      setTab(trigger.dataset.tab, { reset: true });
      return;
    }
    const { action, id } = trigger.dataset;
    if (action === 'close') requestClose();
    else if (action === 'continue') {
      find('.ed-close-options').hidden = true;
      closeOpener?.focus();
    } else if (action === 'discard') await closeEditor('discard');
    else if (action === 'keep-draft') await closeEditor('keep');
    else if (action === 'export-draft') {
      try {
        if (composing) textInput(composing);
        await onExportDraft?.(copy(draft));
        status('초안 다운로드를 요청했어요.');
      } catch (error) {
        status(error?.message || '초안 파일을 내보내지 못했어요.', true);
      }
    } else if (['save', 'preview', 'preview-step'].includes(action)) await saveOrPreview(action, trigger);
    else if (action === 'regenerate' && onRegenerate) {
      if (await confirmEdit({ title: '조건 바꿔 다시 만들기', message: '카드의 조건을 다시 골라 내용과 판서 순서가 새로운 장면을 만듭니다. 현재 편집 내용은 별도로 유지합니다.', confirmLabel: '조건 고르기', returnFocus: trigger })) {
        try {
          clearTimeout(timer);
          await draftQueue;
          if (dirty && onDraft) await onDraft(copy(draft));
          dialog.close();
          if (await onRegenerate(copy(draft)) === true) finish({ regenerated: true });
        }
        catch (error) { status(error?.message || '주제 카드를 열지 못했어요.', true); }
        finally { if (dialog.isConnected && !dialog.open) { dialog.showModal(); trigger.focus(); } }
      }
    }
    else if (action === 'reset-steps' || action?.startsWith('step-')) await editStep(action, id, trigger);
    else if (action?.startsWith('interval-')) editInterval(action, id);
    else if (action?.startsWith('diagram-')) editDiagram(action, id);
    else if (action && /^(block|note|column)-/.test(action)) exerciseEdit(action, id);
  });
  dialog.addEventListener('cancel', event => {
    event.preventDefault();
    if (composing || disabledControls || confirming) return;
    if (!find('.ed-close-options').hidden) {
      find('.ed-close-options').hidden = true;
      closeOpener?.focus();
    } else requestClose();
  });

  for (const field of ['title', 'question', 'caption', 'tags']) find(`#ed-${field}`).value = field === 'tags' ? draft.tags.join(', ') : draft[field];
  find('[data-preview-theme]').value = previewTheme;
  setTab(tab);
  renderTemplate();
  renderSteps();
  refresh();
  dialog.showModal();
  find('#ed-title').focus();

  return {
    getSnapshot: () => copy(draft),
    returnToEditor: () => { if (dialog.isConnected && !dialog.open) dialog.showModal(); },
    close: requestClose,
  };
}
