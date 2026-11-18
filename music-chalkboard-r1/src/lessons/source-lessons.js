// 수업 대본 원본: 6804a36의 src/lessons/. 표시 상태와 판서 ID는 index.js에서 계산한다.

/** 공통 기초 1/3. 같은 음을 부르는 두 가지 이름(계이름, 음이름)을 다장조 음계로 익힌다. */
const namesAndSolfege = {
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

/** 공통 기초 2/3. 온음과 반음의 배열로 다장조 장음계의 모양을 본다. */
const cMajorScale = {
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

/** 공통 기초 3/3. 음계 위에 3도씩 쌓아 으뜸·버금딸림·딸림화음(주요 3화음)을 만든다. */
const cMajorTriads = {
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

/** 중학교 확장 1편. 딸림화음에 7음을 더한 딸림7화음이 으뜸화음으로 풀리는 마침꼴을 듣고 본다. */
const dominantSeventhCadence = {
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

export const sourceLessons = [namesAndSolfege, cMajorScale, cMajorTriads, dominantSeventhCadence];
