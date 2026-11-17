import type { Lesson } from "../src/lib/script/schema";
import { cMajorScale } from "../src/lessons/c-major-scale";
import { cMajorTriads } from "../src/lessons/c-major-triads";
import { dominantSeventhCadence } from "../src/lessons/dominant-seventh-cadence";
import { namesAndSolfege } from "../src/lessons/names-and-solfege";

/** 수업 대본을 깊은 복사해서 시험에서 마음대로 고칠 수 있게 한다. */
export function clone<T>(value: T): T {
  return structuredClone(value);
}

export const base = {
  names: namesAndSolfege,
  scale: cMajorScale,
  triads: cMajorTriads,
  seventh: dominantSeventhCadence,
} satisfies Record<string, Lesson>;
