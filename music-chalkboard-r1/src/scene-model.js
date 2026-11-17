// Persistent scene data is intentionally independent of rendering and storage.
export const CHORD_PRESETS = Object.freeze({
  'C-major-I': { pitches: ['C4', 'E4', 'G4'], chordName: '으뜸화음', roman: 'I' },
  'C-major-IV': { pitches: ['F4', 'A4', 'C5'], chordName: '버금딸림화음', roman: 'IV' },
  'C-major-V': { pitches: ['G4', 'B4', 'D5'], chordName: '딸림화음', roman: 'V' },
});
export const TEMPLATE_IDS = ['chord-stack', 'note-selection', 'text-explanation'];
const uid = () => globalThis.crypto?.randomUUID?.() ?? `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
const step = (label, groupIds) => ({ id: uid(), label, groupIds, advance: 'manual', holdMs: 0 });
const pitchIndex = p => {
  if (typeof p !== 'string' || !/^[CDEFGAB][4-6]$/.test(p)) return -1;
  const n = (Number(p[1]) - 4) * 7 + 'CDEFGAB'.indexOf(p[0]);
  return n <= 14 ? n : -1;
};
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const count = value => {
  if (typeof Intl !== 'undefined' && Intl.Segmenter) return [...new Intl.Segmenter('ko', { granularity: 'grapheme' }).segment(value.normalize('NFC'))].length;
  return [...value.normalize('NFC')].length;
};
const iso = value => typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/.test(value) && Number.isFinite(Date.parse(value));

/** IDs of all currently visible semantic groups, in default rendering order. */
export function activeGroups(scene) {
  if (!scene || !isRecord(scene.content)) return [];
  const c = scene.content, groups = [];
  if (typeof scene.question === 'string' && scene.question.trim()) groups.push('question');
  if (scene.templateId === 'chord-stack' || scene.templateId === 'note-selection') {
    groups.push('staff', 'clef');
    const notes = Array.isArray(c.notes) ? c.notes : [];
    for (const n of notes) if (n && typeof n.id === 'string') groups.push(`note/${n.id}`);
    if (scene.templateId === 'chord-stack') {
      if (typeof c.chordName === 'string' && c.chordName.trim()) groups.push('name');
      if (typeof c.roman === 'string' && c.roman.trim()) groups.push('roman');
      if (c.emphasis) groups.push('emphasis/chord');
    } else {
      if (c.showLabels) for (const n of notes) if (n && typeof n.id === 'string') groups.push(`label/${n.id}`);
      for (const id of (Array.isArray(c.highlightNoteIds) ? c.highlightNoteIds : [])) groups.push(`emphasis/${id}`);
    }
  } else if (scene.templateId === 'text-explanation') {
    for (const b of (Array.isArray(c.blocks) ? c.blocks : [])) if (b && typeof b.id === 'string') groups.push(`body/${b.id}`);
  }
  if (typeof scene.caption === 'string' && scene.caption.trim()) groups.push('caption');
  return groups;
}

/** Default grouping; absent optional content never produces empty steps. */
export function defaultSteps(scene) {
  const all = activeGroups(scene), has = id => all.includes(id), result = [];
  const add = (label, ids) => { const present = ids.filter(has); if (present.length) result.push(step(label, present)); };
  add('질문', ['question']);
  if (scene.templateId === 'text-explanation') {
    for (const group of all.filter(g => g.startsWith('body/'))) add('본문', [group]);
  } else {
    add('오선과 음자리표', ['staff', 'clef']);
    add('음표', all.filter(g => g.startsWith('note/') || g.startsWith('label/')));
    add('이름과 강조', all.filter(g => g === 'name' || g === 'roman' || g.startsWith('emphasis/')));
  }
  add('정리', ['caption']);
  return result;
}

/** Preserve the teacher's step order while synchronizing changed content groups. */
export function reconcileSteps(scene) {
  const active = activeGroups(scene), activeSet = new Set(active), seen = new Set();
  const result = (Array.isArray(scene.steps) ? scene.steps : []).map(s => ({ ...s, groupIds: (Array.isArray(s.groupIds) ? s.groupIds : []).filter(id => {
    if (!activeSet.has(id) || seen.has(id)) return false;
    seen.add(id); return true;
  }) })).filter(s => s.groupIds.length);
  const missing = active.filter(id => !seen.has(id));
  for (const id of missing) {
    if (id.startsWith('body/')) { result.push(step('본문', [id])); continue; }
    const family = id.split('/')[0];
    let target = result.findLast?.(s => s.groupIds.some(g => g.split('/')[0] === family));
    if (!target && (family === 'label' || family === 'emphasis')) target = result.findLast?.(s => s.groupIds.some(g => g.startsWith(family === 'label' ? 'note/' : 'emphasis/')));
    if (!target && id === 'question') { result.unshift(step('질문', [id])); continue; }
    if (!target && id === 'caption') { result.push(step('정리', [id])); continue; }
    if (!target && (id === 'staff' || id === 'clef')) { result.unshift(step('오선과 음자리표', [id])); continue; }
    if (target) target.groupIds.push(id); else result.push(step('추가 내용', [id]));
  }
  return result;
}

export function createScene(templateId = 'chord-stack') {
  if (!TEMPLATE_IDS.includes(templateId)) throw new Error('지원하지 않는 장면 유형입니다.');
  const now = new Date().toISOString();
  let content;
  if (templateId === 'chord-stack') content = { preset: 'C-major-I', notes: ['C4', 'E4', 'G4'].map(pitch => ({ id: uid(), pitch })), chordName: '으뜸화음', roman: 'I', emphasis: true };
  else if (templateId === 'note-selection') {
    const notes = ['C4', 'D4', 'E4', 'F4', 'G4'].map(pitch => ({ id: uid(), pitch }));
    content = { notes, showLabels: true, highlightNoteIds: [notes[0].id, notes[2].id, notes[4].id] };
  } else content = { blocks: [{ id: uid(), text: '여기에 설명을 입력하세요.', ink: 'main' }] };
  const scene = { schemaVersion: 1, id: uid(), revision: 1, origin: 'user', templateId, templateVersion: 1, title: '새 장면', tags: [], question: '', caption: '', content, steps: [], createdAt: now, updatedAt: now, deletedAt: null, renderSeed: Math.floor(Math.random() * 2147483647) };
  scene.steps = defaultSteps(scene);
  return scene;
}

/** Validate a complete persisted document. Returns all actionable errors without modifying the input. */
export function validateScene(scene) {
  const errors = [];
  const fail = (field, message) => errors.push({ field, message });
  const only = (obj, allowed, field) => { if (!isRecord(obj)) { fail(field, '올바른 객체가 아닙니다.'); return false; } for (const key of Object.keys(obj)) if (!allowed.includes(key)) fail(field, `알 수 없는 항목: ${key}`); return true; };
  const str = (v, field, max, required = false, multiline = true) => {
    if (typeof v !== 'string') { fail(field, '문자열을 입력해 주세요.'); return; }
    if (required && !v.trim()) fail(field, '내용을 입력해 주세요.');
    if (count(v.trim()) > max) fail(field, `${max}자 이하로 입력해 주세요.`);
    if (!multiline && /[\r\n]/.test(v)) fail(field, '줄바꿈을 사용할 수 없습니다.');
  };
  const identifier = (v, f) => { if (typeof v !== 'string' || !v.trim() || v.length > 128 || /[\u0000-\u001f/]/.test(v)) fail(f, '올바른 ID가 아닙니다.'); };
  if (!only(scene, ['schemaVersion','id','revision','origin','templateId','templateVersion','title','tags','question','caption','content','steps','createdAt','updatedAt','deletedAt','renderSeed','importInfo'], 'scene')) return { valid: false, errors };
  if (scene.schemaVersion !== 1) fail('schemaVersion', '지원하지 않는 장면 버전입니다.');
  identifier(scene.id, 'id');
  if (!Number.isSafeInteger(scene.revision) || scene.revision < 1) fail('revision', '올바른 저장 버전이 아닙니다.');
  if (!['builtin','user'].includes(scene.origin)) fail('origin', '올바른 장면 출처가 아닙니다.');
  if (scene.origin === 'builtin' && !String(scene.id).startsWith('builtin:')) fail('id', '기본 장면 ID가 올바르지 않습니다.');
  if (scene.origin === 'user' && String(scene.id).startsWith('builtin:')) fail('id', '사용자 장면 ID가 올바르지 않습니다.');
  if (!TEMPLATE_IDS.includes(scene.templateId)) fail('templateId', '지원하지 않는 장면 유형입니다.');
  if (scene.templateVersion !== 1) fail('templateVersion', '지원하지 않는 템플릿 버전입니다.');
  str(scene.title, 'title', 40, true, false); str(scene.question, 'question', 80); str(scene.caption, 'caption', 120);
  if (typeof scene.question === 'string' && scene.question.split(/\r\n|\r|\n/).length > 2) fail('question', '질문은 최대 두 줄입니다.');
  if (typeof scene.caption === 'string' && scene.caption.split(/\r\n|\r|\n/).length > 3) fail('caption', '정리는 최대 세 줄입니다.');
  if (!Array.isArray(scene.tags) || scene.tags.length > 5) fail('tags', '태그는 최대 5개입니다.');
  else { const tags = new Set(); scene.tags.forEach((t, i) => { str(t, `tags.${i}`, 12, true, false); if (typeof t === 'string') { const n = t.trim().normalize('NFC'); if (tags.has(n)) fail('tags', '중복 태그를 제거해 주세요.'); tags.add(n); } }); }
  for (const key of ['createdAt','updatedAt']) if (!iso(scene[key])) fail(key, '올바른 날짜가 아닙니다.');
  if (scene.deletedAt !== null && !iso(scene.deletedAt)) fail('deletedAt', '올바른 삭제 날짜가 아닙니다.');
  if (!Number.isSafeInteger(scene.renderSeed)) fail('renderSeed', '올바른 렌더 시드가 아닙니다.');
  if (scene.importInfo !== undefined && only(scene.importInfo, ['sourceSceneId','sourceCreatedAt','sourceUpdatedAt','importedAt'], 'importInfo')) {
    str(scene.importInfo.sourceSceneId, 'importInfo.sourceSceneId', 128, true, false);
    for (const key of ['sourceCreatedAt','sourceUpdatedAt','importedAt']) if (!iso(scene.importInfo[key])) fail(`importInfo.${key}`, '올바른 날짜가 아닙니다.');
  }
  const c = scene.content;
  if (scene.templateId === 'chord-stack' || scene.templateId === 'note-selection') {
    if (only(c, scene.templateId === 'chord-stack' ? ['preset','notes','chordName','roman','emphasis'] : ['notes','showLabels','highlightNoteIds'], 'content')) {
      const max = scene.templateId === 'chord-stack' ? 3 : 8, min = scene.templateId === 'chord-stack' ? 3 : 2;
      const ids = new Set(), pitches = [];
      if (!Array.isArray(c.notes) || c.notes.length < min || c.notes.length > max) fail('content.notes', `음은 ${min}~${max}개여야 합니다.`);
      else c.notes.forEach((n, i) => { if (!only(n, ['id','pitch'], `content.notes.${i}`)) return; identifier(n.id, `content.notes.${i}.id`); if (ids.has(n.id)) fail('content.notes', '음 ID가 중복되었습니다.'); ids.add(n.id); const p = pitchIndex(n.pitch); pitches.push(p); if (p < 0) fail(`content.notes.${i}.pitch`, '도4부터 도6까지 자연음을 선택해 주세요.'); });
      if (scene.templateId === 'chord-stack') {
        if (!['custom', ...Object.keys(CHORD_PRESETS)].includes(c.preset)) fail('content.preset', '올바른 화음 프리셋이 아닙니다.');
        str(c.chordName, 'content.chordName', 20, false, false); str(c.roman, 'content.roman', 20, false, false);
        if (typeof c.emphasis !== 'boolean') fail('content.emphasis', '강조 설정이 올바르지 않습니다.');
        if (pitches.length === 3 && pitches.every(p => p >= 0) && (pitches[1] - pitches[0] !== 2 || pitches[2] - pitches[1] !== 2)) fail('content.notes', '낮은 음부터 3도 간격으로 쌓은 세 음을 선택해 주세요.');
        if (c.preset === 'custom' && c.roman !== '') fail('content.roman', '직접 입력한 화음은 로마 숫자를 비워 주세요.');
        const preset = Object.hasOwn(CHORD_PRESETS, c.preset) ? CHORD_PRESETS[c.preset] : null;
        if (preset && ((Array.isArray(c.notes) ? c.notes.map(n => n?.pitch).join(',') : '') !== preset.pitches.join(',') || c.roman !== preset.roman)) fail('content.preset', '프리셋의 음과 로마 숫자가 일치하지 않습니다.');
      } else {
        if (typeof c.showLabels !== 'boolean') fail('content.showLabels', '계이름 설정이 올바르지 않습니다.');
        if (!Array.isArray(c.highlightNoteIds) || c.highlightNoteIds.length > 8) fail('content.highlightNoteIds', '강조할 음 설정이 올바르지 않습니다.');
        else { const selected = new Set(); for (const id of c.highlightNoteIds) { if (!ids.has(id) || selected.has(id)) fail('content.highlightNoteIds', '강조할 음이 없거나 중복되었습니다.'); selected.add(id); } }
      }
    }
  } else if (scene.templateId === 'text-explanation' && only(c, ['blocks'], 'content')) {
    const ids = new Set(); let total = 0;
    if (!Array.isArray(c.blocks) || c.blocks.length < 1 || c.blocks.length > 6) fail('content.blocks', '본문은 1~6개가 필요합니다.');
    else c.blocks.forEach((b, i) => { if (!only(b, ['id','text','ink'], `content.blocks.${i}`)) return; identifier(b.id, `content.blocks.${i}.id`); if (ids.has(b.id)) fail('content.blocks', '본문 ID가 중복되었습니다.'); ids.add(b.id); str(b.text, `content.blocks.${i}.text`, 80, true); if (typeof b.text === 'string') total += count(b.text.trim()); if (!['main','accent'].includes(b.ink)) fail(`content.blocks.${i}.ink`, '올바른 강조 색상이 아닙니다.'); });
    if (total > 360) fail('content.blocks', '본문은 모두 합쳐 360자 이하여야 합니다.');
  }
  const groups = activeGroups(scene), groupSet = new Set(groups), membership = new Map(), stepIds = new Set();
  if (!Array.isArray(scene.steps) || scene.steps.length < 1 || scene.steps.length > 12) fail('steps', '단계는 1~12개가 필요합니다.');
  else scene.steps.forEach((s, i) => {
    if (!only(s, ['id','label','groupIds','advance','holdMs'], `steps.${i}`)) return;
    identifier(s.id, `steps.${i}.id`); if (stepIds.has(s.id)) fail('steps', '단계 ID가 중복되었습니다.'); stepIds.add(s.id);
    str(s.label, `steps.${i}.label`, 24, true, false);
    if (!['manual','auto'].includes(s.advance)) fail(`steps.${i}.advance`, '단계 진행 방식이 올바르지 않습니다.');
    if (!Number.isInteger(s.holdMs) || s.holdMs < 0 || s.holdMs > 10000 || s.holdMs % 100) fail(`steps.${i}.holdMs`, '대기 시간은 0~10000ms의 100ms 단위여야 합니다.');
    if (!Array.isArray(s.groupIds) || !s.groupIds.length || s.groupIds.length > 100) { fail(`steps.${i}.groupIds`, '단계에 표시할 내용을 넣어 주세요.'); return; }
    for (const g of s.groupIds) { if (!groupSet.has(g)) fail(`steps.${i}.groupIds`, `없는 내용: ${String(g)}`); if (membership.has(g)) fail(`steps.${i}.groupIds`, `내용이 중복 배정되었습니다: ${String(g)}`); membership.set(g, i); }
  });
  for (const g of groups) if (!membership.has(g)) fail('steps', `단계에 배정되지 않은 내용: ${g}`);
  const prereq = (dependent, required) => { if (membership.has(dependent) && membership.has(required) && membership.get(dependent) < membership.get(required)) fail('steps', `${dependent}보다 ${required}을 먼저 표시해 주세요.`); };
  prereq('clef','staff');
  for (const g of groups) if (g.startsWith('note/')) { prereq(g, 'staff'); prereq(g, 'clef'); }
  for (const g of groups) if (g.startsWith('label/') || (g.startsWith('emphasis/') && g !== 'emphasis/chord')) prereq(g, `note/${g.slice(g.indexOf('/') + 1)}`);
  if (groups.includes('emphasis/chord')) for (const g of groups.filter(x => x.startsWith('note/'))) prereq('emphasis/chord', g);
  return { valid: errors.length === 0, errors };
}
