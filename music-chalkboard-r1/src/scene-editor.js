import { CHORD_PRESETS, createScene, defaultSteps, reconcileSteps, validateScene } from './scene-model.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clone = value => JSON.parse(JSON.stringify(value));
const id = prefix => `${prefix}${globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2)}`;
const PITCHES = ['C4','D4','E4','F4','G4','A4','B4','C5','D5','E5','F5','G5','A5','B5','C6'];
const typeNames = {'chord-stack':'화음 쌓기', 'note-selection':'음 고르기', 'text-explanation':'글 설명'};
const labelGroup = group => ({question:'질문',caption:'정리 문장',staff:'오선',clef:'높은음자리표',name:'화음 이름',roman:'로마 숫자','emphasis/chord':'화음 강조'}[group] || (group.startsWith('note/') ? '음표 ' : group.startsWith('label/') ? '계이름 ' : group.startsWith('emphasis/') ? '강조 ' : group.startsWith('body/') ? '본문 ' : '') + group.split('/').pop());
const pitchOptions = selected => PITCHES.map(p => `<option${p === selected ? ' selected' : ''}>${p}</option>`).join('');
const button = (action, label, extra = '') => `<button type="button" data-action="${action}" ${extra}>${label}</button>`;

const style = `
.scene-editor{border:0;padding:0;width:min(1120px,96vw);max-width:none;max-height:94dvh;border-radius:18px;background:#f7f8f5;color:#23352c;box-shadow:0 18px 60px #0006;font:inherit}.scene-editor::backdrop{background:#10241dcc}.scene-editor *{box-sizing:border-box}.scene-editor .ed-shell{display:flex;flex-direction:column;max-height:94dvh}.scene-editor header,.scene-editor footer{padding:14px 20px;background:white;display:flex;align-items:center;gap:12px;justify-content:space-between}.scene-editor header{border-bottom:1px solid #d9e2db}.scene-editor footer{border-top:1px solid #d9e2db;flex-wrap:wrap}.scene-editor h2,.scene-editor h3{margin:0}.scene-editor h2{font-size:19px}.scene-editor h3{font-size:16px;margin-bottom:12px}.scene-editor p{margin:6px 0}.scene-editor .ed-body{padding:20px;overflow:auto;overscroll-behavior:contain}.scene-editor .ed-grid{display:grid;grid-template-columns:minmax(0,1.7fr) minmax(220px,.8fr);gap:20px}.scene-editor .ed-main{display:grid;gap:16px}.scene-editor section,.scene-editor aside{background:white;border:1px solid #d9e2db;border-radius:12px;padding:16px}.scene-editor label{display:block;font-size:14px;font-weight:650;margin:10px 0 4px}.scene-editor input:not([type=checkbox]),.scene-editor textarea,.scene-editor select{width:100%;border:1px solid #b6c7ba;border-radius:8px;background:white;color:#20332a;padding:9px;font:inherit;min-height:42px}.scene-editor textarea{resize:vertical;min-height:70px}.scene-editor input[type=checkbox]{width:20px;height:20px;vertical-align:middle;accent-color:#2d6d54}.scene-editor button{font:inherit;font-weight:650;border:1px solid #b8cbbd;border-radius:8px;min-height:42px;padding:7px 12px;background:#fff;color:#254a38;cursor:pointer}.scene-editor button:hover{background:#ecf5ee}.scene-editor button:focus-visible,.scene-editor input:focus-visible,.scene-editor select:focus-visible,.scene-editor textarea:focus-visible{outline:3px solid #e5a600;outline-offset:2px}.scene-editor button.primary{background:#28684e;color:white;border-color:#28684e}.scene-editor button:disabled{opacity:.5;cursor:not-allowed}.scene-editor .ed-inline{display:flex;flex-wrap:wrap;gap:8px;align-items:center}.scene-editor .ed-inline label{margin:0}.scene-editor .ed-inline select{width:auto;min-width:85px}.scene-editor .ed-list{display:grid;gap:10px}.scene-editor .ed-card{border:1px solid #d8e6db;border-radius:10px;padding:12px;background:#f9fcf9}.scene-editor .ed-card h4{margin:0 0 5px}.scene-editor .ed-steps{display:grid;gap:10px}.scene-editor .ed-groups{display:flex;flex-wrap:wrap;gap:5px;margin:8px 0}.scene-editor .ed-group{display:inline-flex;align-items:center;gap:4px;background:#e7f0e8;border-radius:20px;padding:3px 8px;font-size:13px}.scene-editor .ed-group input{width:16px;height:16px}.scene-editor .ed-muted{color:#60736a;font-size:13px}.scene-editor .ed-errors{background:#fff0ed;border:1px solid #ce6c61;color:#8a2117;padding:12px;border-radius:9px;margin-bottom:14px}.scene-editor .ed-errors ul{margin:5px 0;padding-left:22px}.scene-editor .ed-preview{background:#1b4f3a;color:#fbfaf0;min-height:180px;padding:16px;border-radius:8px;white-space:pre-wrap;overflow-wrap:anywhere}.scene-editor .ed-tabs{display:none}.scene-editor .ed-close-options{padding:14px 20px;background:#fff6e5;border-top:1px solid #e5c980}.scene-editor .ed-status{font-size:13px;color:#566a5c}.scene-editor [hidden]{display:none!important}@media(max-width:700px){.scene-editor{width:100vw;height:100dvh;max-height:100dvh;border-radius:0}.scene-editor .ed-shell{height:100dvh;max-height:100dvh}.scene-editor .ed-body{padding:12px}.scene-editor .ed-grid{display:block}.scene-editor .ed-tabs{display:flex;gap:6px;padding:8px 12px;background:white}.scene-editor .ed-tabs button[aria-selected=true]{background:#28684e;color:white}.scene-editor[data-tab=content] .ed-stage-section,.scene-editor[data-tab=content] aside,.scene-editor[data-tab=steps] .ed-content-section,.scene-editor[data-tab=steps] aside,.scene-editor[data-tab=review] .ed-main{display:none}.scene-editor header,.scene-editor footer{padding:10px 12px}}
`;

/** Opens an isolated draft. Callbacks are async-capable; a rejected save never closes it. */
export function openSceneEditor({scene, onSave, onPreview, onDraft, onDiscard, onExportDraft, onClose, isNew = false, allowTemplateChange = false} = {}) {
  if (!scene) throw new Error('편집할 장면이 필요합니다.');
  const original = clone(scene);
  let draft = clone(scene), timer = null, status = '', dirty = false, busy = false, errorList = [], closing = false;
  let tab = 'content', draftQueue = Promise.resolve();
  const dialog = document.createElement('dialog');
  dialog.className = 'scene-editor';
  dialog.setAttribute('aria-label', isNew ? '새 장면' : '장면 편집');
  document.body.append(dialog);
  if (!document.getElementById('scene-editor-styles')) {
    const sheet = document.createElement('style'); sheet.id = 'scene-editor-styles'; sheet.textContent = style; document.head.append(sheet);
  }
  const syncSteps = () => { const result = reconcileSteps(draft); if (Array.isArray(result)) draft.steps = result; };
  const scheduleDraft = () => {
    dirty = JSON.stringify(draft) !== JSON.stringify(original);
    clearTimeout(timer);
    if (!onDraft || !dirty) return;
    status = '초안 저장 대기 중'; updateStatus();
    const snapshot = clone(draft);
    timer = setTimeout(() => { draftQueue = draftQueue.catch(() => {}).then(() => onDraft(snapshot)).then(() => { status = '초안 저장됨'; }, () => { status = '초안을 저장하지 못했어요. 입력 내용은 유지됩니다.'; }); draftQueue.then(updateStatus); }, 800);
  };
  const updateStatus = () => { const el = dialog.querySelector('.ed-status'); if (el) el.textContent = status; };
  const check = () => { const result = validateScene(draft); errorList = result.errors || []; return !!result.valid; };
  const render = () => {
    const scroll = dialog.querySelector('.ed-body')?.scrollTop || 0;
    dialog.dataset.tab = tab;
    let template = '';
    if (draft.templateId === 'chord-stack') {
      const presetLabels = {'C-major-I':'다장조 으뜸화음 I','C-major-IV':'다장조 버금딸림화음 IV','C-major-V':'다장조 딸림화음 V',custom:'직접 입력'};
      template = `<label for="ed-preset">화음 프리셋</label><select id="ed-preset" data-field="preset">${Object.entries(presetLabels).map(([k,v])=>`<option value="${k}" ${draft.content.preset===k?'selected':''}>${v}</option>`).join('')}</select><p class="ed-muted">다장조의 기본 위치 삼화음을 표시합니다.</p><div class="ed-inline">${draft.content.notes.map((n,i)=>`<div><label for="ed-note-${i}">${i+1}번째 음</label><select id="ed-note-${i}" data-note="${esc(n.id)}">${pitchOptions(n.pitch)}</select></div>`).join('')}</div>${draft.content.preset==='custom'?'<p class="ed-muted">직접 입력한 음에 맞는 이름인지 확인해 주세요.</p>':''}<label for="ed-name">화음 이름</label><input id="ed-name" data-field="chordName" value="${esc(draft.content.chordName)}"><p class="ed-muted">로마 숫자: ${esc(draft.content.roman || '없음')}</p><label><input type="checkbox" data-field="emphasis" ${draft.content.emphasis?'checked':''}> 화음 전체 강조하기</label>`;
    } else if (draft.templateId === 'note-selection') {
      template = `<p class="ed-muted">표시 순서대로 2~8개를 선택하세요. 같은 음도 여러 번 넣을 수 있습니다.</p><div class="ed-list">${draft.content.notes.map((n,i)=>`<div class="ed-inline ed-card"><strong>${i+1}.</strong><select data-note="${esc(n.id)}" aria-label="${i+1}번째 음">${pitchOptions(n.pitch)}</select><label><input type="checkbox" data-highlight="${esc(n.id)}" ${draft.content.highlightNoteIds.includes(n.id)?'checked':''}> 강조</label>${button('note-up','위로',`data-id="${esc(n.id)}" ${i===0?'disabled':''}`)}${button('note-down','아래로',`data-id="${esc(n.id)}" ${i===draft.content.notes.length-1?'disabled':''}`)}${button('note-remove','삭제',`data-id="${esc(n.id)}" ${draft.content.notes.length<=2?'disabled':''}`)}</div>`).join('')}</div>${button('note-add','음 추가',draft.content.notes.length>=8?'disabled':'')}<label><input type="checkbox" data-field="showLabels" ${draft.content.showLabels?'checked':''}> 계이름(고정도) 표시</label>`;
    } else {
      template = `<p class="ed-muted">본문은 1~6개 문장으로 나누어 입력하세요.</p><div class="ed-list">${draft.content.blocks.map((b,i)=>`<div class="ed-card"><label for="ed-block-${i}">본문 ${i+1}</label><textarea id="ed-block-${i}" data-block="${esc(b.id)}">${esc(b.text)}</textarea><div class="ed-inline"><label>색상 <select data-ink="${esc(b.id)}"><option value="main" ${b.ink==='main'?'selected':''}>기본색</option><option value="accent" ${b.ink==='accent'?'selected':''}>강조색</option></select></label>${button('block-up','위로',`data-id="${esc(b.id)}" ${i===0?'disabled':''}`)}${button('block-down','아래로',`data-id="${esc(b.id)}" ${i===draft.content.blocks.length-1?'disabled':''}`)}${button('block-remove','삭제',`data-id="${esc(b.id)}" ${draft.content.blocks.length<=1?'disabled':''}`)}</div></div>`).join('')}</div>${button('block-add','본문 추가',draft.content.blocks.length>=6?'disabled':'')}`;
    }
    const steps = draft.steps.map((step,i)=>`<div class="ed-card"><h4>${i+1}단계</h4><label for="ed-step-${i}">단계 이름</label><input id="ed-step-${i}" data-step-label="${esc(step.id)}" value="${esc(step.label)}"><div class="ed-groups">${step.groupIds.map(group=>`<label class="ed-group"><input type="checkbox" data-split="${esc(step.id)}" value="${esc(group)}"> ${esc(labelGroup(group))}</label>`).join('')}</div><div class="ed-inline">${button('step-up','위로',`data-id="${esc(step.id)}" ${i===0?'disabled':''}`)}${button('step-down','아래로',`data-id="${esc(step.id)}" ${i===draft.steps.length-1?'disabled':''}`)}${button('step-merge','다음 단계와 병합',`data-id="${esc(step.id)}" ${i===draft.steps.length-1?'disabled':''}`)}${button('step-split','선택 내용 분리',`data-id="${esc(step.id)}" ${step.groupIds.length<2?'disabled':''}`)}${button('preview-step','이 단계부터 미리보기',`data-index="${i}"`)}</div><div class="ed-inline"><label>단계 종료 후 <select data-advance="${esc(step.id)}"><option value="manual" ${step.advance==='manual'?'selected':''}>기다리기</option><option value="auto" ${step.advance==='auto'?'selected':''}>자동 진행</option></select></label>${step.advance==='auto'?`<label>대기 시간(ms) <input type="number" min="0" max="10000" step="100" data-hold="${esc(step.id)}" value="${esc(step.holdMs)}"></label>`:''}</div></div>`).join('');
    const contents = draft.templateId==='text-explanation' ? draft.content.blocks.map(b=>b.text).join('\n') : draft.content.notes.map(n=>n.pitch).join(' · ');
    dialog.innerHTML = `<div class="ed-shell"><header><div><h2>${isNew?'새 장면':'장면 편집'}</h2><span class="ed-muted">${esc(typeNames[draft.templateId])} · 저장 전 편집</span></div>${button('close','닫기')}</header><nav class="ed-tabs" aria-label="편집 화면"><button type="button" data-tab="content" aria-selected="${tab==='content'}">내용</button><button type="button" data-tab="steps" aria-selected="${tab==='steps'}">순서</button><button type="button" data-tab="review" aria-selected="${tab==='review'}">확인</button></nav><div class="ed-body">${errorList.length?`<div class="ed-errors" role="alert"><strong>다음 내용을 확인해 주세요.</strong><ul>${errorList.map(e=>`<li>${esc(e.message)}</li>`).join('')}</ul></div>`:''}<div class="ed-grid"><div class="ed-main"><section class="ed-content-section"><h3>기본 정보</h3>${allowTemplateChange?`<label for="ed-template">장면 템플릿</label><select id="ed-template" data-field="templateId">${Object.entries(typeNames).map(([key,name])=>`<option value="${key}" ${draft.templateId===key?'selected':''}>${name}</option>`).join('')}</select><p class="ed-muted">템플릿을 바꾸면 템플릿 내용과 단계 순서가 초기화됩니다.</p>`:''}<label for="ed-title">장면 제목</label><input id="ed-title" data-field="title" value="${esc(draft.title)}" autocomplete="off"><label for="ed-question">질문</label><textarea id="ed-question" data-field="question">${esc(draft.question)}</textarea><label for="ed-caption">정리 문장</label><textarea id="ed-caption" data-field="caption">${esc(draft.caption)}</textarea><label for="ed-tags">태그</label><input id="ed-tags" data-field="tags" value="${esc(draft.tags.join(', '))}"><p class="ed-muted">쉼표로 구분하여 최대 5개까지 입력합니다.</p></section><section class="ed-content-section"><h3>${esc(typeNames[draft.templateId])}</h3>${template}</section><section class="ed-stage-section"><h3>판서 순서</h3><p class="ed-muted">그룹을 선택한 뒤 분리하거나 인접한 단계를 병합할 수 있습니다.</p><div class="ed-steps">${steps}</div><p>${button('reset-steps','기본 순서로 되돌리기')}</p></section></div><aside><h3>내용 확인</h3><div class="ed-preview">${esc(draft.question)}\n\n${esc(contents)}\n\n${esc(draft.caption)}</div><p class="ed-muted">실제 칠판 배치는 전체 화면 미리보기에서 확인하세요.</p><p>${draft.steps.length}단계 · ${esc(typeNames[draft.templateId])}</p></aside></div></div><div class="ed-close-options" hidden><strong>변경한 내용을 어떻게 할까요?</strong><div class="ed-inline">${button('continue','계속 편집')}${button('keep-draft','초안으로 남기고 닫기')}${button('discard','변경 버리기')}</div></div><footer><span class="ed-status" role="status">${esc(status)}</span><div class="ed-inline">${onExportDraft?button('export-draft','초안 파일 내보내기'):''}${button('preview','전체 화면 미리보기')}${button('close','취소')}${button('save','장면 저장','class="primary"')}</div></footer></div>`;
    for (const err of errorList) {
      const field = String(err.field || '');
      const map = {title:'#ed-title', question:'#ed-question', caption:'#ed-caption', tags:'#ed-tags', 'content.chordName':'#ed-name', 'content.preset':'#ed-preset'};
      let target = dialog.querySelector(map[field] || '[data-error-placeholder]');
      if (!target && field.startsWith('content.notes')) target = dialog.querySelector('[data-note]');
      if (!target && field.startsWith('content.blocks')) target = dialog.querySelector('[data-block]');
      if (!target && field.startsWith('steps')) target = dialog.querySelector('[data-step-label]');
      if (target) { const msg=document.createElement('p'); msg.className='ed-field-error'; msg.style.cssText='color:#a32621;font-size:13px;margin:4px 0'; msg.textContent=err.message; target.setAttribute('aria-invalid','true'); target.insertAdjacentElement('afterend',msg); }
    }
    dialog.querySelector('.ed-body').scrollTop = scroll;
  };
  const rerender = () => { syncSteps(); scheduleDraft(); render(); };
  const applyPreset = key => {
    const preset = CHORD_PRESETS[key]; if (!preset) { draft.content.preset = 'custom'; draft.content.roman = ''; return; }
    draft.content.preset = key;
    draft.content.notes = draft.content.notes.map((n,i)=>({...n,pitch:preset.pitches[i]}));
    draft.content.chordName = preset.chordName ?? preset.name ?? '';
    draft.content.roman = preset.roman ?? '';
  };
  const setBusy = value => { busy = value; if(value) dialog.querySelectorAll('button,input,select,textarea').forEach(control=>control.disabled=true); else render(); };
  const finish = async discarded => { clearTimeout(timer); await draftQueue; if (discarded && onDiscard) await onDiscard(clone(draft)); dialog.close(); dialog.remove(); onClose?.({discarded}); };
  const requestClose = () => { if (!dirty) { finish(false); return; } closing = true; dialog.querySelector('.ed-close-options').hidden = false; dialog.querySelector('[data-action="continue"]').focus(); };
  const move = (array, i, delta) => { const j=i+delta; if (i<0||j<0||j>=array.length) return; [array[i],array[j]]=[array[j],array[i]]; };
  dialog.addEventListener('input', event => {
    const t = event.target;
    if (t.dataset.field) {
      const key=t.dataset.field;
      if (['title','question','caption'].includes(key)) draft[key]=t.value;
      else if (key==='tags') draft.tags=t.value.split(',').map(x=>x.trim()).filter(Boolean);
      else if (key==='chordName') draft.content.chordName=t.value;
    }
    if (t.dataset.block) { const block=draft.content.blocks.find(b=>b.id===t.dataset.block); if (block) block.text=t.value; }
    if (t.dataset.stepLabel) { const step=draft.steps.find(s=>s.id===t.dataset.stepLabel); if(step) step.label=t.value; }
    if (t.dataset.hold) { const step=draft.steps.find(s=>s.id===t.dataset.hold); if(step) step.holdMs=Number(t.value); }
    scheduleDraft();
  });
  dialog.addEventListener('change', event => {
    const t=event.target, field=t.dataset.field;
    if (field==='templateId') {
      if (t.value===draft.templateId) return;
      if (!window.confirm('템플릿을 바꾸면 템플릿 내용과 판서 순서가 초기화됩니다. 변경할까요?')) {t.value=draft.templateId;return;}
      const fresh=createScene(t.value); draft.templateId=fresh.templateId; draft.templateVersion=fresh.templateVersion; draft.content=fresh.content; draft.steps=defaultSteps(draft);
    }
    if (field==='preset') applyPreset(t.value);
    if (field==='emphasis'||field==='showLabels') draft.content[field]=t.checked;
    if (t.dataset.note) { const n=draft.content.notes.find(n=>n.id===t.dataset.note); if(n) n.pitch=t.value; if(draft.templateId==='chord-stack'){draft.content.preset='custom';draft.content.roman='';} }
    if (t.dataset.highlight) { const arr=draft.content.highlightNoteIds, n=t.dataset.highlight; draft.content.highlightNoteIds=t.checked?[...new Set([...arr,n])]:arr.filter(x=>x!==n); }
    if (t.dataset.ink) { const block=draft.content.blocks.find(b=>b.id===t.dataset.ink); if(block) block.ink=t.value; }
    if (t.dataset.advance) { const step=draft.steps.find(s=>s.id===t.dataset.advance); if(step) step.advance=t.value; }
    if (t.dataset.split) return;
    if (field==='title'||field==='tags'||t.dataset.stepLabel||t.dataset.hold) return;
    rerender();
  });
  dialog.addEventListener('click', async event => {
    const b=event.target.closest('button'); if(!b || busy) return;
    if(b.dataset.tab){tab=b.dataset.tab;render();return;}
    const action=b.dataset.action, ident=b.dataset.id;
    if(!action) return;
    if(action==='close') return requestClose();
    if(action==='export-draft'){try{await onExportDraft?.(clone(draft));status='초안을 파일로 내보냈습니다.';}catch(err){status=err?.message||'초안 파일을 내보내지 못했어요.';}updateStatus();return;}
    if(action==='continue'){closing=false;dialog.querySelector('.ed-close-options').hidden=true;return;}
    if(action==='discard'){try{await finish(true);}catch{status='초안을 삭제하지 못했어요.';updateStatus();}return;}
    if(action==='keep-draft') { if(!onDraft){status='초안을 저장할 수 없어요. 장면을 저장하거나 계속 편집해 주세요.';updateStatus();return;} try{setBusy(true);clearTimeout(timer);await draftQueue;await onDraft(clone(draft));await finish(false);}catch{status='초안을 저장하지 못했어요. 입력 내용은 유지됩니다.';setBusy(false);updateStatus();}return; }
    if(action==='save'||action==='preview'||action==='preview-step'){
      syncSteps(); if(!check()){const field=errorList[0]?.field || ''; tab=field.startsWith('steps')?'steps':'content'; render(); const lookup = field==='title'?'#ed-title':field==='question'?'#ed-question':field==='caption'?'#ed-caption':field.startsWith('tags')?'#ed-tags':field.startsWith('steps')?'[data-step-label]':field.startsWith('content.blocks')?'[data-block]':field.startsWith('content.notes')?'[data-note]':null; const target=lookup&&dialog.querySelector(lookup); if(target){target.setAttribute('aria-invalid','true');target.focus();}else dialog.querySelector('.ed-errors')?.scrollIntoView({block:'start'}); return;}
      if(action==='save'){
        const snapshot=clone(draft);
        try {
          if(!onSave) throw new Error('장면 저장을 사용할 수 없어요.');
          setBusy(true); clearTimeout(timer); await draftQueue; await onSave(snapshot);
          dialog.close(); dialog.remove(); onClose?.({saved:true});
        } catch(err) {
          clearTimeout(timer);
          let draftSaved=false;
          try { await draftQueue; if(onDraft) { await onDraft(clone(draft)); draftSaved=true; } } catch { /* 편집창과 내보내기 대안 유지 */ }
          status=(err?.message||'저장하지 못했어요.')+(draftSaved?' 최신 입력은 초안으로 저장했습니다.':' 초안도 저장하지 못했어요. 입력 내용은 유지되며 초안 파일로 내보낼 수 있습니다.');
          setBusy(false); updateStatus();
        }
        return;
      }
      if(!onPreview){status='미리보기를 사용할 수 없어요.';updateStatus();return;}
      const focused=document.activeElement; dialog.close();
      try { await onPreview(clone(draft), {startStep:action==='preview-step'?Number(b.dataset.index):0,returnToEditor:()=>{if(!dialog.isConnected)return;dialog.showModal();focused?.focus();}}); }
      catch(err){dialog.showModal();status=err?.message||'미리보기를 열지 못했어요.';updateStatus();}
      return;
    }
    if(action==='note-add')draft.content.notes.push({id:id('n'),pitch:'C4'});
    if(action==='note-remove'){draft.content.notes=draft.content.notes.filter(n=>n.id!==ident);draft.content.highlightNoteIds=draft.content.highlightNoteIds.filter(n=>n!==ident);}
    if(action==='note-up'||action==='note-down')move(draft.content.notes,draft.content.notes.findIndex(n=>n.id===ident),action==='note-up'?-1:1);
    if(action==='block-add')draft.content.blocks.push({id:id('b'),text:'새 문장을 입력하세요.',ink:'main'});
    if(action==='block-remove')draft.content.blocks=draft.content.blocks.filter(n=>n.id!==ident);
    if(action==='block-up'||action==='block-down')move(draft.content.blocks,draft.content.blocks.findIndex(n=>n.id===ident),action==='block-up'?-1:1);
    const i=draft.steps.findIndex(s=>s.id===ident);
    if(action==='step-up'||action==='step-down'){
      const before=clone(draft.steps);move(draft.steps,i,action==='step-up'?-1:1);
      const errors=validateScene(draft).errors || [];
      if(errors.some(e=>String(e.field).startsWith('steps'))){draft.steps=before;status='선행 조건 때문에 이 순서로 이동할 수 없어요.';}
    }
    if(action==='step-merge' && i>=0 && i<draft.steps.length-1){draft.steps[i].groupIds.push(...draft.steps[i+1].groupIds);draft.steps.splice(i+1,1);}
    if(action==='step-split' && i>=0){const chosen=[...dialog.querySelectorAll('[data-split]')].filter(x=>x.dataset.split===ident&&x.checked).map(x=>x.value);if(!chosen.length||chosen.length===draft.steps[i].groupIds.length){status='나눌 내용을 일부만 선택해 주세요.';updateStatus();return;}if(draft.steps.length>=12){status='단계는 최대 12개까지 만들 수 있어요.';updateStatus();return;}const before=clone(draft.steps);draft.steps[i].groupIds=draft.steps[i].groupIds.filter(g=>!chosen.includes(g));draft.steps.splice(i+1,0,{id:id('s'),label:'새 단계',groupIds:chosen,advance:'manual',holdMs:0});if((validateScene(draft).errors||[]).some(e=>String(e.field).startsWith('steps'))){draft.steps=before;status='선행 조건을 지키도록 내용을 선택해 주세요.';}}
    if(action==='reset-steps'){if(!window.confirm('판서 순서를 기본 순서로 되돌릴까요?'))return;draft.steps=defaultSteps(draft);}
    rerender();
  });
  dialog.addEventListener('cancel', e=>{e.preventDefault();if(!busy&&!closing)requestClose();});
  render(); dialog.showModal(); dialog.querySelector('#ed-title')?.focus();
  return {getSnapshot:()=>clone(draft), returnToEditor:()=>{if(dialog.isConnected&&!dialog.open)dialog.showModal();}, close:requestClose};
}
