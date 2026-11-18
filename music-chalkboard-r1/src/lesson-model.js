export const LESSON_GRADES = Object.freeze(['공통', '초5-6', '중1-3', '미지정']);
export const MAX_LESSON_SCENES = 50;

const fields = ['schemaVersion', 'id', 'revision', 'origin', 'title', 'grade', 'sceneIds', 'createdAt', 'updatedAt'];
const validId = value => typeof value === 'string' && value.length <= 128 && !!value.trim() && !/[\u0000-\u001f/]/.test(value);
const validDate = value => typeof value === 'string'
  && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/.test(value)
  && Number.isFinite(Date.parse(value));

export function createLesson({title = '새 수업', grade = '미지정', sceneIds = []} = {}) {
  const now = new Date().toISOString();
  const id = globalThis.crypto?.randomUUID?.() ?? `lesson-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return {schemaVersion:1, id, revision:1, origin:'user', title, grade, sceneIds:[...sceneIds], createdAt:now, updatedAt:now};
}

/** Available scene IDs may include trashed scenes so they remain restorable. */
export function validateLesson(lesson, {sceneIds} = {}) {
  const errors = [];
  const fail = (field, message) => errors.push({field, message});
  if (!lesson || typeof lesson !== 'object' || Array.isArray(lesson)) {
    fail('lesson', '수업 형식이 올바르지 않습니다.');
    return {valid:false, errors};
  }
  if (Object.keys(lesson).some(key => !fields.includes(key))) fail('lesson', '알 수 없는 수업 필드가 있습니다.');
  if (lesson.schemaVersion !== 1) fail('schemaVersion', '지원하지 않는 수업 버전입니다.');
  if (!validId(lesson.id)) fail('id', '수업 ID가 올바르지 않습니다.');
  if (!['builtin','user'].includes(lesson.origin) || (lesson.origin === 'builtin') !== String(lesson.id).startsWith('builtin:')) {
    fail('origin', '수업 출처가 올바르지 않습니다.');
  }
  if (!Number.isSafeInteger(lesson.revision) || lesson.revision < 1) fail('revision', '수업 저장 버전이 올바르지 않습니다.');
  if (typeof lesson.title !== 'string' || !lesson.title.trim() || /[\r\n]/.test(lesson.title)
    || [...lesson.title.trim().normalize('NFC')].length > 40) fail('title', '수업 제목을 40자 이내로 입력해 주세요.');
  if (!LESSON_GRADES.includes(lesson.grade)) fail('grade', '학교급을 선택해 주세요.');
  if (!validDate(lesson.createdAt) || !validDate(lesson.updatedAt)) fail('updatedAt', '수업 날짜가 올바르지 않습니다.');
  if (!Array.isArray(lesson.sceneIds) || !lesson.sceneIds.length || lesson.sceneIds.length > MAX_LESSON_SCENES
    || !lesson.sceneIds.every(validId) || new Set(lesson.sceneIds).size !== lesson.sceneIds.length) {
    fail('sceneIds', '서로 다른 장면을 1~50개 선택해 주세요.');
  } else if (sceneIds) {
    const known = sceneIds instanceof Set ? sceneIds : new Set(sceneIds);
    if (lesson.sceneIds.some(id => !known.has(id))) fail('sceneIds', '수업이 참조하는 장면을 찾을 수 없습니다.');
  }
  return {valid:errors.length === 0, errors};
}
