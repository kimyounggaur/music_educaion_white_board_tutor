import { buildDefaultLessonCatalog } from '../cards/primary.js';

// Built-ins use the same pure topic-card compiler as editable teacher lessons.
// Their persistent IDs, source step references and review state stay compatible.
const catalog = buildDefaultLessonCatalog();

export const builtInLessons = catalog.map(entry => entry.lesson);
export const builtInLessonScenes = catalog.flatMap(entry => entry.scenes);
export const builtInLessonReview = Object.fromEntries(catalog.map(entry => [entry.lesson.id, entry.review]));
export const builtInLessonStageMap = Object.fromEntries(catalog.map(entry => [entry.lesson.id, entry.stageMap]));
