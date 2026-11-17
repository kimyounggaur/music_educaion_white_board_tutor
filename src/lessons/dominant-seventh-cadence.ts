import type { Lesson } from "../lib/script/schema";

/** 중학교 확장 1편. 딸림화음에 7음을 더한 딸림7화음이 으뜸화음으로 풀리는 마침꼴을 듣고 본다. */
export const dominantSeventhCadence: Lesson = {
  schema: 1,
  id: "dominant-seventh-cadence",
  title: "딸림7화음과 마침꼴",
  subtitle: "딸림7화음이 으뜸화음으로 풀리는 소리",
  grade: "중1-3",
  key: { tonic: "C", mode: "major" },
  keyboard: { from: "C4", to: "G5" },
  review: {
    author: "AI",
    status: "교사 검토 전",
    note: "용어 확인 필요: 마침꼴(종지) 표현, 긴장 설명의 수준",
  },
  elements: {
    dom: { type: "chord", pitches: ["G4", "B4", "D5"], degree: 5 },
    dom7: { type: "chord", pitches: ["G4", "B4", "D5", "F5"], degree: 5, kind: "seventh" },
    tonic: { type: "chord", pitches: ["C5", "E5", "G5"], degree: 1 },
  },
  steps: [
    {
      caption: "{key}의 {dom.name:이에요/예요}. {dom.solfege:을/를} 쌓았어요.",
      show: ["dom"],
      play: { target: "dom", how: "동시에" },
    },
    {
      caption: "맨 위에 {dom7[4].solfege:을/를} 더 쌓으면 {dom7.name:이/가} 돼요.",
      hide: ["dom"],
      show: ["dom7"],
      highlight: { target: "dom7", notes: [4] },
      play: { target: "dom7", how: "동시에" },
    },
    {
      caption: "{dom7[2].solfege:과/와} {dom7[4].solfege:이/가} 만드는 긴장 때문에 {tonic.name:으로/로} 가고 싶어 해요.",
      highlight: { target: "dom7", notes: [2, 4] },
      play: { target: "dom7", how: "동시에" },
    },
    {
      caption: "{tonic.name:으로/로} 가면 소리가 편안하게 풀려요.",
      show: ["tonic"],
      play: [
        { target: "dom7", how: "동시에" },
        { target: "tonic", how: "동시에" },
      ],
    },
    {
      caption: "{dom7[2].solfege:은/는} {tonic[1].solfege:으로/로}, {dom7[4].solfege:은/는} {tonic[2].solfege:으로/로} 풀려요.",
      highlight: [
        { target: "dom7", notes: [2, 4] },
        { target: "tonic", notes: [1, 2] },
      ],
      play: [
        { target: "dom7", how: "동시에" },
        { target: "tonic", how: "동시에" },
      ],
    },
    {
      caption: "{dom7.name}에서 {tonic.name:으로/로} 끝나는 이 꼴을 마침꼴이라고 해요.",
      highlight: [{ target: "dom7" }, { target: "tonic" }],
      play: [
        { target: "dom7", how: "동시에" },
        { target: "tonic", how: "동시에" },
      ],
    },
    {
      caption: "{dom7.name:을/를} 이루는 네 음을 건반에서 모두 눌러 보세요.",
      ask: { type: "건반", answer: "dom7" },
    },
  ],
};
