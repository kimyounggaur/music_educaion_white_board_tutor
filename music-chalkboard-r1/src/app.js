import { createScene, defaultSteps, CHORD_PRESETS } from './scene-model.js';
import { buildDocumentScene } from './scene.js';
import { openSceneStorage, makeScenePackage, makeDraftPackage, recoverImportedDraft, validatePackage } from './scene-storage.js';
import { openSceneEditor } from './scene-editor.js';
import { openSceneList } from './ui/scene-list.js';
import { ScenePlayer } from './player.js';
import { splitBackupScenes } from './backup-chunks.js';

const $=s=>document.querySelector(s);
const byId=id=>document.getElementById(id);
const uuid=()=>crypto.randomUUID?.() || `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const clientId=uuid(); // 탭 복제 시에도 초안 식별자를 공유하지 않는다.
const fields=['title','tags','question','caption','templateId','templateVersion','content','steps'];
let storage=null, current=null, previewReturn=null, list=null, lastOrder=[], resizeTimer=0, composing=false;
const status=message=>{byId('status').textContent=message;};
const player=new ScenePlayer({stage:byId('stage'),frame:byId('frame'),board:byId('boardTex'),ink:byId('ink'),dust:byId('dust'),onChange:({state,completed,total,message})=>{
  byId('playMode').value=player.mode;
  byId('progress').textContent=`${completed} / ${total}단계${state==='paused'?' · 일시정지':''}`;
  byId('previousStep').disabled=completed===0 && !(state==='playing'||state==='paused');
  byId('nextStep').disabled=state==='completed'; byId('togglePlay').disabled=state==='completed';
  if(message)status(message);
}});

function builtin(template,id,title,question,caption,adjust) {
  const doc=createScene(template); doc.id=`builtin:${id}`; doc.origin='builtin'; doc.title=title; doc.question=question; doc.caption=caption;
  doc.createdAt=doc.updatedAt='2026-11-18T00:00:00.000Z'; doc.renderSeed=123456;
  adjust?.(doc); doc.steps=defaultSteps(doc); return doc;
}
const builtins=[
  builtin('text-explanation','chord-intro','화음이란 무엇일까요?','화음은 무엇일까요?','여러 음이 어울려 하나의 화음을 만들어요.',d=>d.content.blocks[0].text='화음은 여러 음이 함께 울리는 소리예요.'),
  builtin('note-selection','choose-notes','첫째·셋째·다섯째 음','다섯 음 중 어떤 음을 고를까요?','도·미·솔을 함께 연주해요.'),
  ...[['I','으뜸화음 만들기'],['IV','버금딸림화음 만들기'],['V','딸림화음 만들기']].map(([degree,title])=>builtin('chord-stack',`chord-${degree}`,title,'주요 3화음은 어떻게 만들어요?','세 음을 쌓아 화음을 만들어요.',d=>{const p=CHORD_PRESETS[`C-major-${degree}`]; d.content={...d.content,preset:`C-major-${degree}`,notes:p.pitches.map((pitch,i)=>({id:`n${i+1}`,pitch})),chordName:p.chordName,roman:p.roman};})),
  builtin('text-explanation','summary','주요 3화음 정리','세 화음을 다시 살펴볼까요?','이름과 구성음을 함께 읽어 보세요.',d=>{d.content.blocks=[{id:'b1',text:'으뜸화음 I: 도·미·솔',ink:'main'},{id:'b2',text:'버금딸림화음 IV: 파·라·도',ink:'main'},{id:'b3',text:'딸림화음 V: 솔·시·레',ink:'accent'}];}),
];
function closeMenus(){document.querySelectorAll('.menu[open]').forEach(m=>m.open=false);}
async function openDoc(doc,{remember=true}={}) {
  if(!doc || doc.deletedAt)return;
  current=structuredClone(doc); byId('sceneTitle').textContent=doc.title; byId('sceneTitle').title=doc.title;
  byId('editScene').textContent=doc.origin==='builtin'?'복제해서 편집':'내용 편집';
  try {player.open(doc); if(remember&&storage) await storage.setSetting('lastSceneId',doc.id);}
  catch(error){status(`장면을 열 수 없습니다: ${error.message}`);}
}
function download(value,name) {
  const blob=new Blob([JSON.stringify(value,null,2)],{type:'application/json'}), url=URL.createObjectURL(blob), a=document.createElement('a');
  a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function filename(scene){return (scene.title || '장면').replace(/[\\/:*?"<>|\u0000-\u001f]/g,'_').slice(0,40);}
const exportScene=scene=>download(makeScenePackage([scene]),`${filename(scene)}.json`);
async function exportAll(){
  if(!storage)throw Error('저장소를 사용할 수 없습니다.'); player.pause();closeMenus();
  const dialog=document.createElement('dialog');dialog.className='draft-dialog';dialog.setAttribute('aria-label','전체 백업');
  const h=document.createElement('h2');h.textContent='전체 백업';
  const message=document.createElement('p');message.textContent='필요한 항목을 선택하고 백업 파일을 저장하세요.';
  const trashLabel=document.createElement('label'),trash=document.createElement('input');trash.type='checkbox';trashLabel.append(trash,document.createTextNode(' 휴지통 포함'));
  const settingLabel=document.createElement('label'),setting=document.createElement('input');setting.type='checkbox';settingLabel.append(setting,document.createTextNode(' 보기 설정 포함'));
  const results=document.createElement('div'),prepare=document.createElement('button'),close=document.createElement('button');prepare.textContent='백업 파일 준비';close.textContent='닫기';
  close.onclick=()=>{dialog.close();dialog.remove();};
  prepare.onclick=async()=>{try{
    results.replaceChildren();const scenes=await storage.listScenes({includeDeleted:trash.checked});if(!scenes.length)throw Error('백업할 내 장면이 없습니다.');
    const settings=setting.checked?{viewOptions:await storage.getSetting('viewOptions')||null,playMode:await storage.getSetting('playMode')||'step'}:null;
    const packages=splitBackupScenes(scenes,settings);
    const note=document.createElement('p');note.textContent=`${scenes.length}개 장면을 ${packages.length}개 파일로 준비했습니다. 각 파일을 모두 저장하세요.`;results.append(note);
    packages.forEach((pkg,i)=>{const b=document.createElement('button');b.textContent=`백업 ${i+1}/${packages.length} 저장 (${pkg.scenes.length}개)`;b.onclick=()=>download(pkg,`음악칠판_전체백업_${i+1}.json`);results.append(b);});
  }catch(e){results.textContent=e.message;}};
  dialog.append(h,message,trashLabel,document.createElement('br'),settingLabel,document.createElement('br'),prepare,close,results);document.body.append(dialog);dialog.addEventListener('close',()=>dialog.remove(),{once:true});dialog.showModal();prepare.focus();
}
function layoutCheck(scene) {for(const portrait of [false,true]) {const problems=buildDocumentScene(scene,portrait).layoutErrors || [];if(problems.length)throw Error(`${portrait?'세로':'가로'} 화면: ${problems.map(p=>p.message||String(p)).join(' ')}`);}}
function draftRecord(snapshot,baseRevision,isNew,draftId = `${clientId}:${snapshot.id}`) {
  const formData=Object.fromEntries(fields.map(k=>[k,structuredClone(snapshot[k])]));
  return {draftId,sceneId:isNew?null:snapshot.id,baseRevision:isNew?null:baseRevision,editorVersion:1,updatedAt:new Date().toISOString(),formData,clientId};
}
function cloneDoc(source) {const copy=structuredClone(source);copy.id=uuid();copy.origin='user';copy.revision=1;copy.deletedAt=null;copy.title=`${source.title}`.slice(0,34)+' 사본';copy.createdAt=copy.updatedAt=new Date().toISOString();delete copy.importInfo;return copy;}
async function editDoc(original,isNew=false,allowTemplateChange=false,recoveredDraft=null) {
  player.pause(); closeMenus(); const lessonSnapshot=player.snapshot(), lessonDoc=structuredClone(current); let doc=structuredClone(original), saved=false, initialDraftLoaded=!!recoveredDraft;
  let draftId=recoveredDraft?.draftId || `${clientId}:${doc.id}`;
  let baseRevision=isNew?null:original.revision;
  if(recoveredDraft){baseRevision=recoveredDraft.baseRevision;Object.assign(doc,structuredClone(recoveredDraft.formData));}
  else if(storage) {const draft=await storage.getDraft(draftId);if(draft && confirm('저장되지 않은 초안이 있습니다. 초안을 이어서 편집할까요?')) {Object.assign(doc,structuredClone(draft.formData));baseRevision=draft.baseRevision;initialDraftLoaded=true;}}
  openSceneEditor({scene:doc,isNew,allowTemplateChange,preserveInitialDraft:initialDraftLoaded,
    onSave:async snapshot=>{layoutCheck(snapshot);if(!storage)throw Error('저장소를 사용할 수 없습니다. 브라우저 저장 설정을 확인해 주세요.');
      try {const result=await storage.saveScene(snapshot,{expectedRevision:baseRevision,draftId});saved=true;await openDoc(result);status('장면을 저장했습니다.');}
      catch(error){if(error.code==='conflict'){if(confirm('다른 탭에서 원본이 변경되었습니다. 현재 내용을 새 장면 사본으로 저장할까요?')){const copy=cloneDoc(snapshot);const result=await storage.saveScene(copy,{expectedRevision:null,draftId});saved=true;await openDoc(result);status('변경 내용을 새 장면 사본으로 저장했습니다.');return;} throw Error('저장 충돌이 발생했습니다. 초안을 유지하거나 파일로 내보낼 수 있습니다.');}throw error;}
    },
    onDraft:async snapshot=>{if(!storage)throw Error('저장소를 사용할 수 없습니다.'); await storage.saveDraft(draftRecord(snapshot,baseRevision,isNew,draftId));},
    onDiscard:async()=>{if(storage)await storage.deleteDraft(draftId);},
    onExportDraft:snapshot=>download(makeDraftPackage(draftRecord(snapshot,baseRevision,isNew,draftId)),`${filename(snapshot)}_초안.json`),
    onPreview:async(snapshot,{startStep,returnToEditor})=>{layoutCheck(snapshot);byId('sceneMenu').inert=true;byId('sceneSearchForm').inert=true;previewReturn=()=>{byId('sceneMenu').inert=false;byId('sceneSearchForm').inert=false;current=lessonDoc;byId('sceneTitle').textContent=lessonDoc.title;byId('sceneTitle').title=lessonDoc.title;player.restore(lessonSnapshot);returnToEditor();};byId('returnPreview').hidden=false;byId('returnPreview').focus();await openDoc(snapshot,{remember:false});player.previewFrom(startStep);byId('sceneTitle').textContent=`미리보기 · 저장 전 · ${snapshot.title}`;},
    onClose:async()=>{if(previewReturn){previewReturn=null;byId('sceneMenu').inert=false;byId('sceneSearchForm').inert=false;byId('returnPreview').hidden=true;} if(!saved && current?.id!==lessonDoc?.id){current=lessonDoc;byId('sceneTitle').textContent=lessonDoc.title;player.restore(lessonSnapshot);}}
  });
}
async function openList(query='') {
  player.pause();closeMenus();
  list=openSceneList({query,data:async()=>{const scenes=storage?await storage.listScenes({includeDeleted:true}):[];return {builtins,scenes,order:scenes.filter(s=>!s.deletedAt).map(s=>s.id)};},
    onOpen:async(scene,ids)=>{lastOrder=ids;await openDoc(scene);},
    onEdit:scene=>{setTimeout(()=>editDoc(scene),0);},onClone:scene=>{setTimeout(()=>editDoc(cloneDoc(scene),true),0);},onNew:()=>{setTimeout(()=>editDoc(createScene(),true,true),0);},
    onDelete:async scene=>{if(!storage)throw Error('저장소를 사용할 수 없습니다.');await storage.setDeleted(scene.id,scene.revision,true);if(current?.id===scene.id)await openDoc(builtins[0]);},
    onRestore:scene=>storage.setDeleted(scene.id,scene.revision,false),onPurge:scene=>storage.permanentlyDelete(scene.id,scene.revision),onReorder:ids=>storage.reorderScenes(ids),
    onImport:()=>{byId('fileImport').click();},onExport:exportScene,onBackup:exportAll,onClose:()=>{list=null;}
  });
}

async function recoverDraft() {
  player.pause(); closeMenus();
  if(!storage){status('저장소를 사용할 수 없습니다.');return;}
  const drafts=await storage.listDrafts();
  if(!drafts.length){status('복구할 초안이 없습니다.');alert('복구할 초안이 없습니다.');return;}
  const dialog=document.createElement('dialog'); dialog.className='draft-dialog';
  const h=document.createElement('h2');h.textContent='저장되지 않은 초안';dialog.append(h);
  const intro=document.createElement('p');intro.textContent='복구할 초안을 선택하세요. 원본 장면과 초안은 별도로 보관됩니다.';dialog.append(intro);
  for(const draft of drafts.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))) {
    const row=document.createElement('div');row.className='draft-row';
    const label=document.createElement('span');label.textContent=`${draft.formData.title||'제목 없는 초안'} · ${new Date(draft.updatedAt).toLocaleString('ko-KR')}`;
    const recover=document.createElement('button');recover.textContent='이어서 편집';recover.onclick=async()=>{
      const source=draft.sceneId && await storage.getScene(draft.sceneId);
      let doc, isNew;
      if(source && !source.deletedAt && source.revision===draft.baseRevision){doc=structuredClone(source);isNew=false;}
      else {doc=createScene(draft.formData.templateId);isNew=true;}
      Object.assign(doc,structuredClone(draft.formData));dialog.close();dialog.remove();await editDoc(doc,isNew,false,isNew?{...draft,baseRevision:null}:draft);
      if(isNew && draft.sceneId) status('원본이 변경되어 초안을 새 장면으로 복구했습니다.');
    };
    const backup=document.createElement('button');backup.textContent='파일로 저장';backup.onclick=()=>download(makeDraftPackage(draft),'음악칠판_초안.json');
    row.append(label,recover,backup);dialog.append(row);
  }
  const close=document.createElement('button');close.textContent='닫기';close.onclick=()=>{dialog.close();dialog.remove();};dialog.append(close);document.body.append(dialog);dialog.showModal();close.focus();
  dialog.addEventListener('close',()=>dialog.remove(),{once:true});
}

async function changeScene(delta) {
  const all=[...builtins,...(storage?await storage.listScenes():[])], order=lastOrder.length?lastOrder:all.map(s=>s.id), index=order.indexOf(current?.id), id=order[index+delta], target=all.find(s=>s.id===id);if(target)await openDoc(target);
}
async function importFile(file) {
  if(!file)return;if(!storage)throw Error('저장소를 사용할 수 없습니다.');if(file.size>5*1024*1024)throw Error('파일은 5 MiB 이하여야 합니다.');
  const text=await file.text(), pkg=validatePackage(text);
  if(pkg.kind==='draft') {const draft=recoverImportedDraft(pkg,clientId);await storage.saveDraft(draft);const doc=createScene(draft.formData.templateId);Object.assign(doc,draft.formData);await editDoc(doc,true,false,draft);status('파일의 초안을 편집기로 열었습니다.');}
  else {if(!confirm(`${pkg.scenes.length}개 장면을 새 사본으로 가져올까요?`))return;const imported=await storage.importBundle(pkg);status(`${imported.length}개 장면을 사본으로 가져왔습니다.`);list?.refresh();}
}

byId('sceneSearchForm').onsubmit=e=>{e.preventDefault();if(!previewReturn)openList(byId('sceneSearch').value);};
byId('openScenes').onclick=()=>openList();
byId('recoverDraft').onclick=()=>recoverDraft().catch(e=>status(e.message));
byId('newScene').onclick=()=>editDoc(createScene(),true,true);
byId('duplicateScene').onclick=()=>editDoc(cloneDoc(current),true);
byId('editScene').onclick=()=>current.origin==='builtin'?editDoc(cloneDoc(current),true):editDoc(current);
byId('importScenes').onclick=()=>{closeMenus();player.pause();byId('fileImport').click();};
byId('exportScene').onclick=()=>{try{exportScene(current);status('현재 장면을 내보냈습니다.');}catch(e){status(e.message);}};
byId('exportAll').onclick=()=>exportAll().catch(e=>status(e.message));
byId('fileImport').onchange=async e=>{try{await importFile(e.target.files[0]);}catch(err){status(`가져오기 실패: ${err.message}`);alert(`가져오기 실패: ${err.message}`);}finally{e.target.value='';}};
let lastNextAt=-Infinity;
function nextOnce(){const now=performance.now();if(now-lastNextAt<250)return;lastNextAt=now;player.next();}
byId('previousScene').onclick=()=>changeScene(-1);byId('nextScene').onclick=()=>changeScene(1);
byId('nextStep').onclick=nextOnce;byId('previousStep').onclick=()=>player.previous();byId('togglePlay').onclick=()=>player.toggle();byId('restart').onclick=()=>player.restart();byId('finish').onclick=()=>player.finish();
byId('playMode').onchange=e=>{player.mode=e.target.value;storage?.setSetting('playMode',player.mode).catch(()=>{});};
byId('method').onchange=e=>{player.setOption('method',e.target.value);storage?.setSetting('viewOptions',player.opts).catch(()=>{});};
document.querySelectorAll('.seg button').forEach(b=>{b.onclick=()=>{const key=b.closest('.seg').dataset.opt;player.setOption(key,b.dataset.v);syncOptions();storage?.setSetting('viewOptions',player.opts).catch(()=>{});};});
function syncOptions(){document.querySelectorAll('.seg').forEach(seg=>seg.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(player.opts[seg.dataset.opt]===b.dataset.v))));}
byId('returnPreview').onclick=()=>{const go=previewReturn;previewReturn=null;byId('returnPreview').hidden=true;player.pause();go?.();};
document.addEventListener('click',e=>document.querySelectorAll('.menu[open]').forEach(m=>{if(!m.contains(e.target))m.open=false;}));
document.addEventListener('compositionstart',()=>composing=true);document.addEventListener('compositionend',()=>composing=false);
document.addEventListener('keydown',e=>{
 if(e.isComposing||composing||e.repeat||e.ctrlKey||e.metaKey||e.altKey)return;
 if(e.key==='Escape'){const menu=$('.menu[open]');if(menu){menu.open=false;menu.querySelector('summary').focus();}return;}
 if(document.querySelector('dialog[open], .menu[open]') || e.target.closest('input,textarea,select,button,summary,a,[contenteditable="true"]'))return;
 if(e.shiftKey&&e.key==='PageDown'){e.preventDefault();changeScene(1);return;}if(e.shiftKey&&e.key==='PageUp'){e.preventDefault();changeScene(-1);return;}
 if(e.key==='ArrowRight'||e.key==='PageDown'){e.preventDefault();nextOnce();}else if(e.key==='ArrowLeft'||e.key==='PageUp'){e.preventDefault();player.previous();}else if(e.key===' '){e.preventDefault();player.toggle();}
});
document.addEventListener('visibilitychange',()=>{if(document.hidden)player.pause();});
window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>player.resize(),180);});
(async()=>{syncOptions();try{storage=await openSceneStorage();const savedOpts=await storage.getSetting('viewOptions');if(savedOpts && typeof savedOpts==='object') for(const [key,allowed] of Object.entries({theme:['chalk','white'],hand:['hand','pen'],dust:['on','off'],speed:['slow','normal','fast'],method:['svg','canvas']})) if(allowed.includes(savedOpts[key]))player.opts[key]=savedOpts[key];const mode=await storage.getSetting('playMode');if(['step','auto','continuous'].includes(mode))player.mode=byId('playMode').value=mode;byId('method').value=player.opts.method;syncOptions();const last=await storage.getSetting('lastSceneId');const doc=builtins.find(s=>s.id===last)||(typeof last==='string'?await storage.getScene(last):null)||builtins[0];await openDoc(doc.deletedAt?builtins[0]:doc);}
catch(e){await openDoc(builtins[0],{remember:false});status(`기본 장면을 열었습니다. 저장소를 사용할 수 없습니다: ${e.message}`);}})();
