import type { Lesson } from "../../lib/script/schema";

/**
 * 개발용 시험 대본. 조표와 임시표(올림표), 높은 음역, 덧줄이 제대로 그려지는지 확인한다.
 * 수업 고르기 화면에는 나오지 않고, 환경변수 NEXT_PUBLIC_DEV_LESSONS=1일 때만 /dev/g-major-fixture로 열린다.
 */
export const gMajorFixture: Lesson = {
  schema: 1,
  id: "g-major-fixture",
  title: "[개발용] 사장조 시험 칠판",
  grade: "공통",
  key: { tonic: "G", mode: "major" },
  keyboard: { from: "G4", to: "C6" },
  review: { author: "AI", status: "교사 검토 전", note: "개발용 시험 대본" },
  elements: {
    scale: {
      type: "notes",
      pitches: ["G4", "A4", "B4", "C5", "D5", "E5", "F#5", "G5"],
      labels: "계이름",
      scale: "major",
    },
    dom7: { type: "chord", pitches: ["D5", "F#5", "A5", "C6"], degree: 5, kind: "seventh" },
    // 조표에 없는 음: 내림표(Bb), 올림표(C#), 제자리표(F는 조표의 F#을 되돌린다), 조표 안의 F#은 표시 없음
    chroma: { type: "notes", pitches: ["Bb4", "C#5", "F5", "F#5"] },
  },
  steps: [
    {
      caption: "{key} 음계예요. 조표에 올림표가 하나 있어요.",
      show: ["scale"],
      play: { target: "scale", how: "차례로" },
    },
    {
      caption: "올림표가 붙은 음은 {scale[7].letters}예요.",
      highlight: { target: "scale", notes: [7] },
      play: { target: "scale", notes: [7], how: "차례로" },
    },
    {
      caption: "{dom7.name:이/가} 나타났어요.",
      show: ["dom7"],
      play: { target: "dom7", how: "동시에" },
    },
    {
      caption: "조표에 없는 음에는 올림표·내림표·제자리표가 붙어요.",
      hide: ["scale", "dom7"],
      show: ["chroma"],
      play: { target: "chroma", how: "차례로" },
    },
    {
      caption: "건반에서 {dom7.name:을/를} 이루는 음을 눌러 보세요.",
      ask: { type: "건반", answer: "dom7" },
    },
  ],
};
