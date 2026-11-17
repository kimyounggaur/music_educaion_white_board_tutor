import type { Lesson } from "../../lib/script/schema";
import { gMajorFixture } from "./g-major-fixture";

/** 개발용 시험 대본. 검산기는 이것도 검사하지만 수업 고르기 화면에는 나오지 않는다. */
export const fixtures: Lesson[] = [gMajorFixture];

export function getFixture(id: string): Lesson | undefined {
  return fixtures.find((l) => l.id === id);
}
