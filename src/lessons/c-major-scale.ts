import type { Lesson } from "../lib/script/schema";

/** 공통 기초 2/3. 온음과 반음의 배열로 다장조 장음계의 모양을 본다. */
export const cMajorScale: Lesson = {
  schema: 1,
  id: "c-major-scale",
  title: "다장조 음계",
  subtitle: "온음과 반음으로 만든 장음계",
  grade: "공통",
  key: { tonic: "C", mode: "major" },
  keyboard: { from: "C4", to: "C5" },
  review: { author: "AI", status: "교사 검토 전" },
  elements: {
    scale: {
      type: "notes",
      pitches: ["C4", "D4", "E4", "F4", "G4", "A4", "B4", "C5"],
      labels: "계이름",
      scale: "major",
    },
  },
  steps: [
    {
      caption: "{key} 음계예요. 도에서 시작해 한 음씩 올라가요.",
      show: ["scale"],
      play: { target: "scale", how: "차례로" },
    },
    {
      caption: "음과 음 사이의 거리는 온음과 반음 두 가지예요.",
      set: { target: "scale", gaps: true },
    },
    {
      caption: "{scale[3].solfege:과/와} {scale[4].solfege} 사이는 반음이에요. 건반에서 둘 사이에 검은 건반이 없어요.",
      highlight: { target: "scale", notes: [3, 4] },
      play: { target: "scale", notes: [3, 4], how: "차례로" },
    },
    {
      caption: "{scale[7].solfege:과/와} {scale[8].solfege} 사이도 반음이에요. 나머지는 모두 온음이에요.",
      highlight: { target: "scale", notes: [7, 8] },
      play: { target: "scale", notes: [7, 8], how: "차례로" },
    },
    {
      caption: "온음, 온음, 반음, 온음, 온음, 온음, 반음. 이 모양이 장음계예요.",
      highlight: { target: "scale", notes: [3, 4, 7, 8] },
      play: { target: "scale", how: "차례로" },
    },
    {
      caption: "건반에서 {scale[1].solfege}부터 차례로 눌러 보세요.",
      ask: { type: "건반", answer: "scale", order: "차례로" },
    },
  ],
};
