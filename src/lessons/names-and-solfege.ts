import type { Lesson } from "../lib/script/schema";

/** 공통 기초 1/3. 같은 음을 부르는 두 가지 이름(계이름, 음이름)을 다장조 음계로 익힌다. */
export const namesAndSolfege: Lesson = {
  schema: 1,
  id: "names-and-solfege",
  title: "음이름과 계이름",
  subtitle: "같은 음을 부르는 두 가지 이름",
  grade: "공통",
  key: { tonic: "C", mode: "major" },
  keyboard: { from: "C4", to: "C5" },
  review: { author: "AI", status: "교사 검토 전" },
  elements: {
    scale: { type: "notes", pitches: ["C4", "D4", "E4", "F4", "G4", "A4", "B4", "C5"], scale: "major" },
    // 해보기 문제로만 쓰는 음(칠판에는 나오지 않는다)
    g: { type: "notes", pitches: ["G4"] },
    m: { type: "notes", pitches: ["E4"] },
  },
  steps: [
    {
      caption: "오선 위에 음이 여덟 개 있어요. 낮은 음에서 높은 음으로 올라가요.",
      show: ["scale"],
      play: { target: "scale", how: "차례로" },
    },
    {
      caption: "노래할 때 부르는 이름이 계이름이에요.",
      set: { target: "scale", labels: "계이름" },
      play: { target: "scale", how: "차례로" },
    },
    {
      caption: "음마다 정해진 이름은 음이름이에요. 영어로는 C D E F G A B예요.",
      set: { target: "scale", labels: "음이름" },
      play: { target: "scale", how: "차례로" },
    },
    {
      caption: "{key}에서는 {scale[1].solfege:은/는} {scale[1].letters}, {scale[2].solfege:은/는} {scale[2].letters}… 이렇게 짝이 돼요.",
      set: { target: "scale", labels: "둘 다" },
    },
    {
      caption: "{scale[1].solfege}({scale[1].letters})는 검은 건반 두 개 묶음의 바로 왼쪽 흰 건반이에요.",
      keyLabels: "음이름",
      highlight: { target: "scale", notes: [1] },
      play: { target: "scale", notes: [1], how: "차례로" },
    },
    {
      caption: "건반에서 {g.solfege:을/를} 눌러 보세요.",
      keyLabels: "없음",
      ask: { type: "건반", answer: "g" },
    },
    {
      caption: "이번에는 음이름 {m.letters:을/를} 눌러 보세요.",
      ask: { type: "건반", answer: "m" },
    },
  ],
};
