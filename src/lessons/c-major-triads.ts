import type { Lesson } from "../lib/script/schema";

/** 공통 기초 3/3. 음계 위에 3도씩 쌓아 으뜸·버금딸림·딸림화음(주요 3화음)을 만든다. */
export const cMajorTriads: Lesson = {
  schema: 1,
  id: "c-major-triads",
  title: "다장조 주요 3화음",
  subtitle: "으뜸화음, 버금딸림화음, 딸림화음",
  grade: "공통",
  key: { tonic: "C", mode: "major" },
  keyboard: { from: "C4", to: "D5" },
  review: { author: "AI", status: "교사 검토 전" },
  elements: {
    scale: {
      type: "notes",
      pitches: ["C4", "D4", "E4", "F4", "G4", "A4", "B4", "C5"],
      labels: "계이름",
      scale: "major",
    },
    tonic: { type: "chord", pitches: ["C4", "E4", "G4"], degree: 1 },
    subdom: { type: "chord", pitches: ["F4", "A4", "C5"], degree: 4 },
    dom: { type: "chord", pitches: ["G4", "B4", "D5"], degree: 5 },
  },
  steps: [
    {
      caption: "{key} 음계에서 시작해 볼게요.",
      show: ["scale"],
      play: { target: "scale", how: "차례로" },
    },
    {
      caption: "첫째, 셋째, 다섯째 음을 골라요.",
      highlight: { target: "scale", notes: [1, 3, 5] },
      play: { target: "scale", notes: [1, 3, 5], how: "차례로" },
    },
    {
      caption: "세 음을 쌓아 함께 울리면 {tonic.name:이/가} 돼요.",
      show: ["tonic"],
      play: { target: "tonic", how: "동시에" },
    },
    {
      caption: "넷째 음 {scale[4].solfege}에서 시작해 한 칸씩 건너뛰며 골라요.",
      highlight: { target: "scale", notes: [4, 6, 8] },
      play: { target: "scale", notes: [4, 6, 8], how: "차례로" },
    },
    {
      caption: "함께 울리면 {subdom.name:이/가} 돼요.",
      show: ["subdom"],
      play: { target: "subdom", how: "동시에" },
    },
    {
      caption: "다섯째 음 {scale[5].solfege}에서 시작하면요?",
      highlight: { target: "scale", notes: [5] },
      play: { target: "scale", notes: [5], how: "차례로" },
    },
    {
      caption: "이번에는 {dom.name:이/가} 돼요.",
      show: ["dom"],
      play: { target: "dom", how: "동시에" },
    },
    {
      caption: "이 세 화음을 주요 3화음이라고 해요. 차례로 들어 봐요.",
      highlight: [{ target: "tonic" }, { target: "subdom" }, { target: "dom" }],
      play: [
        { target: "tonic", how: "동시에" },
        { target: "subdom", how: "동시에" },
        { target: "dom", how: "동시에" },
      ],
    },
    {
      caption: "{dom.name:을/를} 이루는 세 음을 건반에서 모두 눌러 보세요.",
      ask: { type: "건반", answer: "dom" },
    },
  ],
};
