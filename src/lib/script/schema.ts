/**
 * 수업 대본 형식 v1(개발 지시서 5장). 정해진 요소와 동작만 허용한다(모르는 키는 오류).
 * 이름·화음 종류 같은 이론 사실은 여기서 적지 않고 theory 모듈이 계산한다.
 */

import { z } from "zod";

const pitchSchema = z
  .string()
  .regex(/^[A-G](#|b)?\d$/, "음 표기는 C4, F#4, Bb4 형식이어야 해요");

const idSchema = z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/, "요소 이름은 영문자로 시작하는 영문·숫자·밑줄이에요");

export const NOTES_LABELS = ["없음", "계이름", "음이름", "둘 다"] as const;
export const CHORD_LABELS = ["없음", "이름", "로마숫자", "둘 다"] as const;
export const KEY_LABELS = ["없음", "계이름", "음이름"] as const;

const notesElement = z.strictObject({
  type: z.literal("notes"),
  pitches: z.array(pitchSchema).min(1).max(12),
  labels: z.enum(NOTES_LABELS).optional(),
  gaps: z.boolean().optional(),
  scale: z.literal("major").optional(),
});

const chordElement = z.strictObject({
  type: z.literal("chord"),
  pitches: z.array(pitchSchema).min(2).max(4),
  degree: z.union([z.literal(1), z.literal(4), z.literal(5)]).optional(),
  kind: z.enum(["triad", "seventh"]).optional(),
  name: z.string().min(1).max(20).optional(),
  labels: z.enum(CHORD_LABELS).optional(),
});

const elementSchema = z.discriminatedUnion("type", [notesElement, chordElement]);

const highlightSpec = z.strictObject({
  target: idSchema,
  notes: z.array(z.number().int().min(1)).min(1).optional(),
});

const playSpec = z.strictObject({
  target: idSchema,
  notes: z.array(z.number().int().min(1)).min(1).optional(),
  how: z.enum(["차례로", "동시에"]),
});

const askSpec = z.strictObject({
  type: z.literal("건반"),
  answer: idSchema,
  order: z.enum(["자유", "차례로"]).optional(),
  success: z.string().min(1).max(60).optional(),
});

const stepSchema = z.strictObject({
  caption: z.string().min(1, "자막이 비어 있어요"),
  show: z.array(idSchema).min(1).optional(),
  hide: z.array(idSchema).min(1).optional(),
  set: z
    .strictObject({
      target: idSchema,
      labels: z.enum(["없음", "계이름", "음이름", "둘 다", "이름", "로마숫자"]).optional(),
      gaps: z.boolean().optional(),
    })
    .optional(),
  keyLabels: z.enum(KEY_LABELS).optional(),
  highlight: z.union([highlightSpec, z.array(highlightSpec).min(1)]).optional(),
  play: z.union([playSpec, z.array(playSpec).min(1)]).optional(),
  ask: askSpec.optional(),
});

export const lessonSchema = z.strictObject({
  schema: z.literal(1),
  id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "id는 영문 소문자·숫자·하이픈이에요"),
  title: z.string().min(1).max(30),
  subtitle: z.string().max(60).optional(),
  grade: z.enum(["공통", "초5-6", "중1-3"]),
  key: z.strictObject({ tonic: z.string(), mode: z.literal("major") }),
  keyboard: z.strictObject({ from: pitchSchema, to: pitchSchema }),
  review: z.strictObject({
    author: z.enum(["AI", "사람"]),
    status: z.enum(["교사 검토 전", "검토 완료"]),
    note: z.string().optional(),
  }),
  elements: z.record(idSchema, elementSchema),
  steps: z.array(stepSchema).min(3, "단계는 3개 이상이에요").max(16, "단계는 16개 이하예요"),
});

export type Lesson = z.infer<typeof lessonSchema>;
export type LessonElement = Lesson["elements"][string];
export type NotesElement = Extract<LessonElement, { type: "notes" }>;
export type ChordElement = Extract<LessonElement, { type: "chord" }>;
export type Step = Lesson["steps"][number];
export type HighlightSpec = z.infer<typeof highlightSpec>;
export type PlaySpec = z.infer<typeof playSpec>;
export type AskSpec = z.infer<typeof askSpec>;
export type Grade = Lesson["grade"];
export type KeyLabelMode = (typeof KEY_LABELS)[number];

/** 학교급 표시 이름(수업 고르기 화면) */
export const GRADE_LABEL: Record<Grade, string> = {
  공통: "공통 기초",
  "초5-6": "초등 5~6학년",
  "중1-3": "중학교",
};

export function asArray<T>(value: T | T[] | undefined): T[] {
  return value === undefined ? [] : Array.isArray(value) ? value : [value];
}
