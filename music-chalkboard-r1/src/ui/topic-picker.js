import { CARD_DEFINITIONS, generateCard, materializeCard, getCardParamOptions } from '../cards/index.js';
import { getColumns } from '../scene-model.js';
import { formatNoteLabel, keyNameKo } from '../theory/korean.js';
import { MAJOR_KEY_TONICS, MINOR_KEY_TONICS, keySignatureAccidentals } from '../theory/scale.js';
import { isStaffPitch, parsePitch } from '../theory/pitch.js';
import { openDialog, makeButton, paragraph } from './dialog.js';

const commonKeys = ['C','G','F','D','Bb','A','Eb'];
const identity = () => globalThis.crypto.randomUUID();

/** A card produces an editable draft; generating it never mutates saved data. */
export function openTopicPicker({unit = 'scene', source, onScene, onLesson, getLayoutFeedback, onClose} = {}) {
  const view = openDialog('주제로 만들기', {onClose});
  view.dialog.classList.add('topic-picker');
  const grid = document.createElement('div');
  grid.className = 'topic-grid';
  const topics = document.createElement('section');
  topics.setAttribute('aria-label','주제 목록');
  const conditions = document.createElement('section');
  conditions.setAttribute('aria-label','조건');
  const preview = document.createElement('section');
  preview.setAttribute('aria-label','만들 내용');
  preview.setAttribute('aria-live','polite');
  grid.append(topics, conditions, preview);
  view.content.append(grid);
  let selected = CARD_DEFINITIONS.find(card => card.id === source?.cardId) || CARD_DEFINITIONS[0];
  let values = {}, raw = null;
  let labelsTouched = false;
  const make = makeButton('장면 만들기', async () => {
    if (!raw) return;
    const result = materializeCard(raw, {idPrefix:identity(), now:new Date().toISOString(), renderSeed:Math.floor(Math.random() * 0x7fffffff)});
    if (values.unit === 'lesson') {
      await onLesson(result, view);
    } else {
      view.close();
      await onScene(result.scenes[0]);
    }
  });
  view.actions.prepend(make);
  const cardButtons = [];
  let group;
  for (const card of CARD_DEFINITIONS) {
    if (group !== card.group) {
      group = card.group;
      const h = document.createElement('h3'); h.textContent = group; topics.append(h);
    }
    const button = makeButton(card.title, () => choose(card));
    button.dataset.cardId = card.id;
    button.setAttribute('aria-pressed', String(card === selected));
    const row = document.createElement('div'); row.className = 'topic-card';
    row.append(button, paragraph(card.summary), paragraph((card.grade || '공통') + ' · AI 초안 · 교사 검토 전','note'));
    topics.append(row); cardButtons.push(button);
  }
  function recompute() {
    preview.replaceChildren(); raw = null; make.disabled = true;
    view.error.textContent = '';
    make.textContent = values.unit === 'lesson' ? '수업 만들기' : '장면 만들기';
    try {
      const candidate = generateCard(selected.id, values);
      const result = materializeCard(candidate, {idPrefix:'preview', now:'2026-01-01T00:00:00.000Z', renderSeed:1});
      const scenes = result.scenes;
      for (const scene of scenes) {
        const feedback = getLayoutFeedback?.(scene);
        if (feedback?.errors.length) throw Error(feedback.errors.map(e=>e.message).join(' '));
      }
      preview.append(paragraph((result.lesson?.title || scenes[0].title) + ' · ' + scenes.length + '장면'));
      for (const scene of scenes) {
        const columns = getColumns(scene);
        preview.append(paragraph(scene.title + ' · ' + scene.steps.length + '단계'));
        if (columns.length) preview.append(paragraph('음: ' + columns.flatMap(col=>col.notes.map(note=>formatNoteLabel(note.pitch,'ko',scene.content.key))).join(' ')));
        preview.append(paragraph('단계: ' + scene.steps.map(step=>step.label).join(' → ')));
        const warnings = getLayoutFeedback?.(scene)?.warnings || [];
        preview.append(paragraph(warnings.length ? '세로 화면에서는 음표가 작아집니다. ' + warnings.map(w=>w.message).join(' ') : '배치: 가로 화면 문제없음 · 세로 화면 문제없음','note'));
      }
      for (const warning of result.warnings || []) preview.append(paragraph(typeof warning === 'string' ? warning : warning.message,'note'));
      raw = candidate; make.disabled = false;
    } catch (error) { view.error.textContent = '이 조건으로는 만들 수 없습니다. ' + error.message; }
  }
  function choose(card, initial = false, previousValues = null) {
    selected = card;
    if (!previousValues) labelsTouched = !!(initial && source?.params && Object.hasOwn(source.params,'labels'));
    cardButtons.forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.cardId === card.id)));
    values = Object.fromEntries((card.params || []).map(param=>[param.id,param.default]));
    values.unit = unit;
    if (previousValues) Object.assign(values,previousValues);
    if (initial && source?.params) Object.assign(values,source.params);
    conditions.replaceChildren();
    const heading = document.createElement('h3'); heading.textContent = card.title; conditions.append(heading);
    for (const param of card.params || []) {
      if (param.id === 'unit') continue;
      const row = document.createElement('label'); row.className = 'topic-field'; row.append(document.createTextNode(param.label));
      let input;
      if (param.type === 'boolean') {
        input = document.createElement('input'); input.type = 'checkbox'; input.checked = !!values[param.id];
      } else if (param.type === 'number') {
        input = document.createElement('input'); input.type = 'number'; input.min = param.min ?? 1; input.max = param.max ?? 200; input.value = values[param.id];
      } else {
        input = document.createElement('select');
        let options = getCardParamOptions(card.id,param.id,values);
        if (param.type === 'key' && !options.length) {
          const keys = card.id === 'minor-scale' || card.id === 'minor-triads' ? MINOR_KEY_TONICS.map(tonic=>({tonic,mode:'minor'})) : MAJOR_KEY_TONICS.map(tonic=>({tonic,mode:'major'}));
          options = keys.map(key=>({value:key.tonic+':'+key.mode,label:keyNameKo(key.tonic,key.mode)}));
        }
        if (param.type === 'pitch' && !options.length) {
          options = [4,5,6].flatMap(octave=>[...'CDEFGAB'].flatMap(letter=>['b','','#'].map(acc=>letter+acc+octave)))
            .filter(value=>isStaffPitch(parsePitch(value))).sort((a,b)=>parsePitch(a).midi-parsePitch(b).midi)
            .map(value=>({value,label:formatNoteLabel(value,'ko')+parsePitch(value).octave}));
        }
        const groups = new Map();
        for (const option of options) {
          const value = typeof option === 'string' ? option : option.value;
          const entry = document.createElement('option'); entry.value = value; entry.textContent = typeof option === 'string' ? option : option.label;
          if (param.type === 'key') {
            const name = commonKeys.includes(String(value).split(':')[0]) ? '자주 쓰는 조' : '그 밖의 조';
            if (!groups.has(name)) { const optgroup = document.createElement('optgroup'); optgroup.label = name; groups.set(name,optgroup); input.append(optgroup); }
            groups.get(name).append(entry);
          } else input.append(entry);
        }
        input.value = typeof values[param.id] === 'object' ? values[param.id].tonic+':'+values[param.id].mode : values[param.id];
        if (!input.value && input.options.length) input.selectedIndex = 0;
        values[param.id] = options.find(option=>String(typeof option === 'string' ? option : option.value) === input.value)?.value ?? input.value;
      }
      input.name = param.id;
      input.setAttribute('aria-label',param.label);
      input.addEventListener('change',()=>{
        values[param.id] = param.type === 'boolean' ? input.checked : param.type === 'number' ? Number(input.value) : param.options?.find(option=>String(option.value) === input.value)?.value ?? input.value;
        if (param.id === 'labels') labelsTouched = true;
        if (param.id === 'key' && selected.id === 'names-and-solfege' && !labelsTouched) {
          const [tonic,mode] = values.key.split(':');
          values.labels = Object.values(keySignatureAccidentals(tonic,mode)).filter(Boolean).length >= 3 ? 'movable-do' : 'both';
        }
        if (['key','form','degree'].includes(param.id)) { choose(selected,false,{...values}); conditions.querySelector(`[name="${param.id}"]`)?.focus(); }
        else recompute();
      });
      row.append(input); conditions.append(row);
    }
    const row = document.createElement('label'); row.className='topic-field'; row.textContent='만들 단위';
    const select = document.createElement('select'); select.name='unit'; select.setAttribute('aria-label','만들 단위');
    for (const [value,label] of [['scene','한 장면'],['lesson','수업 한 묶음']]) {
      if (value === 'lesson' && !card.buildLesson) continue;
      const option=document.createElement('option');option.value=value;option.textContent=label;select.append(option);
    }
    select.value=values.unit;
    if (!select.value) select.value='scene';
    values.unit=select.value;
    select.onchange=()=>{values.unit=select.value;unit=select.value;recompute();};
    row.append(select);conditions.append(row);
    recompute();
  }
  choose(selected,true);
  cardButtons.find(button=>button.dataset.cardId===selected.id)?.focus();
  return view;
}
