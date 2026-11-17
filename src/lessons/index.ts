import type { Grade, Lesson } from "../lib/script/schema";
import { namesAndSolfege } from "./names-and-solfege";
import { cMajorScale } from "./c-major-scale";
import { cMajorTriads } from "./c-major-triads";
import { dominantSeventhCadence } from "./dominant-seventh-cadence";

/**
 * 검증 수업 목록(보이는 순서). 새 수업은 대본 파일을 만들고 여기에 넣는다.
 * 검산기(npm run validate, npm test, npm run build)를 통과해야 한다.
 */
export const lessons: Lesson[] = [namesAndSolfege, cMajorScale, cMajorTriads, dominantSeventhCadence];

export function getLesson(id: string): Lesson | undefined {
  return lessons.find((l) => l.id === id);
}

/** 수업 고르기 화면의 묶음 순서 */
export const GRADE_ORDER: Grade[] = ["공통", "초5-6", "중1-3"];
