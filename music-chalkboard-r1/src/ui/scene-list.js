// 장면 목록은 임시 대화창으로만 표시한다. 데이터와 동작은 호출자가 제공한다.
const TEMPLATE_LABELS = { 'chord-stack': '화음 쌓기', 'note-selection': '음 고르기', 'text-explanation': '글 설명' };
const normalize = (value) => String(value ?? '').normalize('NFC').toLocaleLowerCase().trim();
const templateLabel = (scene) => TEMPLATE_LABELS[scene.templateId] || scene.templateId || '장면';

/** 공백으로 구분된 모든 검색어가 포함된 장면을 관련도 순으로 반환한다. */
export function searchScenes(scenes, query) {
  const normalized = normalize(query);
  if (!normalized) return [...scenes];
  const words = normalized.split(/\s+/);
  return scenes.map((scene, index) => {
    const title = normalize(scene.title);
    const tags = normalize((scene.tags || []).join(' '));
    const content = scene.content || {};
    const body = normalize([scene.question, scene.caption, templateLabel(scene), content.chordName,
      ...(Array.isArray(content.blocks) ? content.blocks.map((block) => typeof block === 'string' ? block : block.text || '') : [])].join(' '));
    const all = `${title} ${tags} ${body}`;
    const score = title === normalized ? 0 : title.includes(normalized) ? 1 : tags.includes(normalized) ? 2 : 3;
    return { scene, index, score, matches: words.every((word) => all.includes(word)) };
  }).filter((entry) => entry.matches).sort((a, b) => a.score - b.score || a.index - b.index).map((entry) => entry.scene);
}

const css = `
.wb-scenes { border:0; padding:0; border-radius:18px; width:min(960px,calc(100vw - 28px)); max-width:none; max-height:min(88vh,900px); color:#263b34; background:#fffefa; box-shadow:0 20px 70px #071b1490; font:15px/1.5 system-ui,sans-serif; }
.wb-scenes::backdrop { background:#142d25ad; }
.wb-scenes * { box-sizing:border-box; }
.wb-scenes header { position:sticky; top:0; z-index:1; padding:18px 20px 12px; background:#fffefa; border-bottom:1px solid #dce7df; }
.wb-scenes h2 { font-size:1.25rem; margin:0; }
.wb-scenes .wb-title { display:flex; justify-content:space-between; align-items:center; gap:12px; }
.wb-scenes .wb-toolbar,.wb-scenes .wb-tabs,.wb-scenes .wb-actions,.wb-scenes .wb-row-actions { display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
.wb-scenes .wb-toolbar,.wb-scenes .wb-tabs { margin-top:12px; }
.wb-scenes input,.wb-scenes select { min-height:38px; border:1px solid #aebeb4; border-radius:8px; padding:7px 10px; background:white; color:#22372e; font:inherit; }
.wb-scenes input[type=search] { flex:1; min-width:180px; }
.wb-scenes button { min-height:36px; border:1px solid #b2c3b7; background:#fff; color:#254a38; border-radius:8px; padding:6px 11px; cursor:pointer; font:inherit; }
.wb-scenes button:hover { background:#eff8f1; }
.wb-scenes button:focus-visible,.wb-scenes input:focus-visible,.wb-scenes select:focus-visible { outline:3px solid #e5a300; outline-offset:2px; }
.wb-scenes button[aria-selected=true],.wb-scenes .wb-primary { background:#245c40; color:white; border-color:#245c40; }
.wb-scenes button:disabled { opacity:.45; cursor:not-allowed; }
.wb-scenes .wb-content { padding:12px 20px 20px; }
.wb-scenes .wb-hint { color:#5b6e63; font-size:.88rem; margin:8px 0; }
.wb-scenes .wb-error { color:#a32621; white-space:pre-wrap; }
.wb-scenes ul { padding:0; margin:0; list-style:none; display:grid; gap:8px; }
.wb-scenes li { border:1px solid #dce7df; border-radius:12px; padding:12px; display:flex; justify-content:space-between; gap:12px; align-items:center; }
.wb-scenes li > div:first-child { min-width:0; }
.wb-scenes strong { overflow-wrap:anywhere; font-size:1rem; }
.wb-scenes .wb-meta { font-size:.83rem; color:#607169; overflow-wrap:anywhere; margin-top:3px; }
.wb-scenes .wb-row-actions { justify-content:flex-end; }
.wb-scenes .wb-row-actions button { font-size:.87rem; }
.wb-scenes .wb-empty { padding:26px 4px; text-align:center; color:#607169; }
@media(max-width:600px) { .wb-scenes { width:100vw; height:100dvh; max-height:none; border-radius:0; } .wb-scenes header { padding:14px; } .wb-scenes .wb-content { padding:12px 14px; } .wb-scenes li { align-items:flex-start; flex-direction:column; } .wb-scenes .wb-row-actions { justify-content:flex-start; } }
`;

/**
 * data(): Promise<{builtins: SceneDocument[], scenes: SceneDocument[], order: string[]}>
 * onOpen(scene, orderedSceneIds), onEdit(scene), onClone(scene), onNew(),
 * onDelete(scene), onRestore(scene), onPurge(scene), onReorder(ids),
 * onImport(), onExport(scene), onBackup() are optional async callbacks.
 * A change callback is followed by a fresh data() read.
 */
export function openSceneList(options) {
  const previousFocus = document.activeElement;
  const dialog = document.createElement('dialog');
  dialog.className = 'wb-scenes';
  const style = document.createElement('style');
  style.textContent = css;
  dialog.append(style);
  const header = document.createElement('header');
  const heading = document.createElement('div'); heading.className = 'wb-title';
  const title = document.createElement('h2'); title.id = `wb-list-${Math.random().toString(36).slice(2)}`; title.textContent = '장면 목록';
  dialog.setAttribute('aria-labelledby', title.id);
  const close = button('닫기', () => dialog.close()); close.setAttribute('aria-label', '장면 목록 닫기');
  heading.append(title, close); header.append(heading);
  const toolbar = document.createElement('div'); toolbar.className = 'wb-toolbar';
  const search = document.createElement('input'); search.type = 'search'; search.placeholder = '제목, 내용, 태그 검색'; search.setAttribute('aria-label', '장면 검색'); search.value = options.query || '';
  const sort = document.createElement('select'); sort.setAttribute('aria-label', '장면 정렬');
  for (const [value, label] of [['manual','직접 정한 순서'],['updated','최근 수정'],['title','이름순']]) { const option = document.createElement('option'); option.value = value; option.textContent = label; sort.append(option); }
  toolbar.append(search, sort);
  if (options.onNew) toolbar.append(button('새 장면', () => runAction(options.onNew, null, true), 'wb-primary'));
  header.append(toolbar);
  const tabs = document.createElement('div'); tabs.className = 'wb-tabs'; tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', '장면 분류');
  const tabButtons = {};
  for (const [key, label] of [['builtin','기본 장면'],['user','내 장면'],['trash','휴지통']]) {
    const el = button(label, () => { tab = key; render(); }); el.setAttribute('role', 'tab'); tabButtons[key] = el; tabs.append(el);
  }
  tabs.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    const keys = ['builtin', 'user', 'trash'];
    tab = keys[(keys.indexOf(tab) + (event.key === 'ArrowRight' ? 1 : 2)) % keys.length];
    render(); tabButtons[tab].focus();
  });
  header.append(tabs); dialog.append(header);
  const content = document.createElement('div'); content.className = 'wb-content';
  const actions = document.createElement('div'); actions.className = 'wb-actions';
  if (options.onImport) actions.append(button('파일 가져오기', () => runAction(options.onImport)));
  if (options.onBackup) actions.append(button('전체 백업', () => runAction(options.onBackup)));
  const hint = document.createElement('p'); hint.className = 'wb-hint';
  const error = document.createElement('p'); error.className = 'wb-error'; error.setAttribute('role','alert');
  const list = document.createElement('ul'); list.setAttribute('aria-label','장면 목록');
  content.append(actions, hint, error, list); dialog.append(content); document.body.append(dialog);
  let tab = options.initialTab || 'builtin', dataset = {builtins:[], scenes:[], order:[]}, timer = 0, composing = false;
  let closed = false;
  dialog.addEventListener('close', () => { closed = true; clearTimeout(timer); dialog.remove(); if (previousFocus && previousFocus.isConnected) previousFocus.focus(); if (options.onClose) options.onClose(); });
  dialog.addEventListener('cancel', () => {});
  async function refresh() {
    try { dataset = await options.data(); dataset ||= {}; render(); }
    catch (err) { error.textContent = err?.message || '장면 목록을 불러오지 못했습니다.'; }
  }
  async function runAction(action, value, closeAfter = false, secondArg) {
    try {
      error.textContent = '';
      const result = await action(value, secondArg);
      if (closeAfter && result !== false) { dialog.close(); return; }
      if (!closed) await refresh();
    } catch (err) { error.textContent = err?.message || '작업을 완료하지 못했습니다.'; }
  }
  function render() {
    if (closed) return;
    for (const [key, el] of Object.entries(tabButtons)) { el.setAttribute('aria-selected', String(key === tab)); el.tabIndex = key === tab ? 0 : -1; }
    const order = dataset.order || [];
    const orderMap = new Map(order.map((id, i) => [id, i]));
    let all = tab === 'builtin' ? [...(dataset.builtins || [])] : (dataset.scenes || []).filter((s) => tab === 'trash' ? !!s.deletedAt : !s.deletedAt);
    if (sort.value === 'updated') all.sort((a,b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
    else if (sort.value === 'title') all.sort((a,b) => (a.title || '').localeCompare(b.title || '', 'ko'));
    else if (tab === 'user') all.sort((a,b) => (orderMap.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (orderMap.get(b.id) ?? Number.MAX_SAFE_INTEGER));
    const filtered = searchScenes(all, search.value);
    const ids = filtered.map((s) => s.id);
    const reorderable = tab === 'user' && sort.value === 'manual' && !normalize(search.value) && !!options.onReorder;
    hint.textContent = tab === 'trash' ? '휴지통의 장면은 검색과 일반 목록에 나타나지 않습니다.' : reorderable ? '위·아래 버튼으로 장면 순서를 바꿀 수 있습니다.' : '검색하거나 정렬해도 저장된 순서는 바뀌지 않습니다.';
    list.replaceChildren();
    if (!filtered.length) { const empty = document.createElement('li'); empty.className = 'wb-empty'; empty.textContent = search.value.trim() ? '다른 말로 검색하거나 새 장면을 만들어 보세요.' : tab === 'user' ? '기본 장면을 복제하거나 새 장면을 만들어 보세요.' : tab === 'trash' ? '휴지통이 비어 있습니다.' : '기본 장면이 없습니다.'; list.append(empty); return; }
    filtered.forEach((scene, index) => {
      const row = document.createElement('li'); const info = document.createElement('div');
      const name = document.createElement('strong'); name.textContent = scene.title || '제목 없는 장면';
      const meta = document.createElement('div'); meta.className = 'wb-meta';
      const date = scene.updatedAt && !Number.isNaN(Date.parse(scene.updatedAt)) ? new Date(scene.updatedAt).toLocaleDateString('ko-KR') : '';
      meta.textContent = [scene.origin === 'builtin' ? '기본 장면' : '내 장면', templateLabel(scene), `${scene.steps?.length || 0}단계`, date && `수정 ${date}`, ...(scene.tags || []).map((x) => `#${x}`)].filter(Boolean).join(' · ');
      info.append(name, meta); const commands = document.createElement('div'); commands.className = 'wb-row-actions';
      if (tab === 'trash') {
        if (options.onRestore) commands.append(button('복원', () => runAction(options.onRestore, scene)));
        if (options.onPurge) commands.append(button('영구 삭제', () => { if (window.confirm(`“${scene.title}” 장면을 영구 삭제할까요? 이 작업은 되돌릴 수 없습니다.`)) runAction(options.onPurge, scene); }));
      } else {
        if (options.onOpen) commands.append(button('열기', () => runAction(options.onOpen, scene, true, ids)));
        if (options.onClone) commands.append(button(scene.origin === 'builtin' ? '복제해서 편집' : '복제', () => runAction(options.onClone, scene, true)));
        if (scene.origin !== 'builtin' && options.onEdit) commands.append(button('편집', () => runAction(options.onEdit, scene, true)));
        if (options.onExport) commands.append(button('내보내기', () => runAction(options.onExport, scene)));
        if (scene.origin !== 'builtin' && options.onDelete) commands.append(button('휴지통으로', () => { if (window.confirm(`“${scene.title}” 장면을 휴지통으로 이동할까요?`)) runAction(options.onDelete, scene); }));
        if (reorderable) {
          for (const [label, offset] of [['위로',-1],['아래로',1]]) {
            const move = button(label, () => { const newIds = all.map((s) => s.id); [newIds[index],newIds[index+offset]] = [newIds[index+offset],newIds[index]]; runAction(options.onReorder, newIds); });
            move.disabled = index + offset < 0 || index + offset >= all.length; move.setAttribute('aria-label', `${scene.title} ${label} 이동`); commands.append(move);
          }
        }
      }
      row.append(info,commands); list.append(row);
    });
  }
  function updateSearch() { clearTimeout(timer); if (!composing) timer = setTimeout(render, 150); }
  search.addEventListener('compositionstart', () => { composing = true; clearTimeout(timer); });
  search.addEventListener('compositionend', () => { composing = false; updateSearch(); });
  search.addEventListener('input', updateSearch);
  search.addEventListener('keydown', (event) => {
    if (composing || event.isComposing) return;
    if (event.key === 'ArrowDown' || event.key === 'Enter') { clearTimeout(timer); render(); }
    if (event.key === 'ArrowDown') { const first = list.querySelector('button'); if (first) { event.preventDefault(); first.focus(); } }
    if (event.key === 'Enter') { const first = list.querySelector('button'); if (first) { event.preventDefault(); first.click(); } }
  });
  sort.addEventListener('change', render);
  dialog.showModal(); search.focus(); refresh();
  return { close: () => dialog.close(), refresh, element: dialog };
}

function button(label, handler, className = '') {
  const element = document.createElement('button'); element.type = 'button'; element.textContent = label;
  if (className) element.className = className;
  element.addEventListener('click', handler); return element;
}
