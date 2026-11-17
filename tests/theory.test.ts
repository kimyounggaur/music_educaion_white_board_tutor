import { describe, expect, it } from "vitest";
import { Chord, Key, Midi, Note, Scale } from "tonal";
import {
  diatonicChordNames,
  isSupportedMajorKey,
  keySignatureAccidentals,
  majorScale,
  MAJOR_KEY_TONICS,
} from "../src/lib/theory/scale";
import {
  chordNameKo,
  chordNumeral,
  keyNameKo,
  letterNameKo,
  scaleDegreeIndex,
  solfegeInKey,
} from "../src/lib/theory/korean";
import { frequency, formatPitch, parsePitch, pitchClassName, pitchClassNumber } from "../src/lib/theory/pitch";
import { countWhiteKeys, isWhiteMidi, keyboardKeys, pitchFromMidi } from "../src/lib/theory/keyboard";

const p = (text: string) => {
  const v = parsePitch(text);
  if (!v) throw new Error(`음 표기 오류: ${text}`);
  return v;
};

describe("음 표기", () => {
  it("올바른 표기를 해석한다", () => {
    expect(p("C4").midi).toBe(60);
    expect(p("A4").midi).toBe(69);
    expect(p("F#5").midi).toBe(78);
    expect(p("Bb3").midi).toBe(58);
    expect(p("Cb4").midi).toBe(59);
    expect(p("B#3").midi).toBe(60);
  });

  it("틀린 표기는 null", () => {
    for (const bad of ["H4", "C", "c4", "C##4", "Cbb4", "C44", "", "4C", "C 4"]) {
      expect(parsePitch(bad), bad).toBeNull();
    }
  });

  it("Tonal과 MIDI 번호가 같다", () => {
    for (const name of ["C4", "D4", "E4", "F#4", "Gb4", "A5", "Bb5", "B#4", "Cb5", "C6", "E#4", "Fb5"]) {
      expect(p(name).midi, name).toBe(Note.midi(name));
    }
  });

  it("글자 이름과 옥타브를 뺀 이름", () => {
    expect(formatPitch(p("F#5"))).toBe("F#5");
    expect(pitchClassName(p("Bb3"))).toBe("Bb");
    expect(pitchClassNumber(61)).toBe(1);
    expect(pitchClassNumber(72)).toBe(0);
  });

  it("주파수: A4=440Hz, Tonal과 같다", () => {
    expect(frequency(p("A4"))).toBeCloseTo(440, 6);
    for (let m = 60; m <= 84; m++) {
      expect(frequency(pitchFromMidi(m)), String(m)).toBeCloseTo(Midi.midiToFreq(m) as number, 6);
    }
  });
});

describe("장음계: 15개 장조 전부 Tonal과 대조", () => {
  it("지원하는 조는 15개", () => {
    expect(MAJOR_KEY_TONICS).toHaveLength(15);
    expect(isSupportedMajorKey("C")).toBe(true);
    expect(isSupportedMajorKey("G#")).toBe(false);
    expect(isSupportedMajorKey("Fb")).toBe(false);
  });

  for (const tonic of MAJOR_KEY_TONICS) {
    it(`${tonic} 장조: 음계·조표·화음`, () => {
      // 음계 7음 (옥타브 없이)
      const mine = majorScale(tonic, 4, 7).map(pitchClassName);
      expect(mine).toEqual(Scale.get(`${tonic} major`).notes);

      // 8번째 음은 한 옥타브 위의 으뜸음
      const eight = majorScale(tonic, 4, 8);
      expect(eight[7]!.midi - eight[0]!.midi).toBe(12);
      expect(pitchClassName(eight[7]!)).toBe(tonic);

      // 위로 갈수록 음높이가 올라간다
      for (let i = 1; i < eight.length; i++) expect(eight[i]!.midi).toBeGreaterThan(eight[i - 1]!.midi);

      // 인접한 음 사이는 온음(2) 또는 반음(1), 장음계 모양
      const gaps = eight.slice(1).map((n, i) => n.midi - eight[i]!.midi);
      expect(gaps).toEqual([2, 2, 1, 2, 2, 2, 1]);

      // 조표: 올림표(+1)/내림표(-1) 개수의 합이 Tonal의 alteration과 같다
      const sig = keySignatureAccidentals(tonic);
      const sum = Object.values(sig).reduce<number>((a, b) => a + b, 0);
      expect(sum).toBe(Key.majorKey(tonic).alteration);

      // 으뜸화음~7화음: 1~7도 모두 Tonal의 다이어토닉 화음과 같다
      const key = Key.majorKey(tonic);
      for (let degree = 1; degree <= 7; degree++) {
        expect(diatonicChordNames(tonic, degree, "triad"), `${tonic} ${degree}도 3화음`).toEqual(
          Chord.get(key.triads[degree - 1] as string).notes,
        );
        expect(diatonicChordNames(tonic, degree, "seventh"), `${tonic} ${degree}도 7화음`).toEqual(
          Chord.get(key.chords[degree - 1] as string).notes,
        );
      }
    });
  }

  it("옥타브가 넘어가도 높이가 맞다(나장조 4옥타브 시작)", () => {
    const names = majorScale("B", 4, 8).map(formatPitch);
    expect(names).toEqual(["B4", "C#5", "D#5", "E5", "F#5", "G#5", "A#5", "B5"]);
  });

  it("지원하지 않는 조는 오류", () => {
    expect(() => majorScale("G#")).toThrow();
  });
});

describe("건반", () => {
  it("MIDI 60~84 이름이 Tonal(올림표 표기)과 같다", () => {
    for (let m = 60; m <= 84; m++) {
      expect(formatPitch(pitchFromMidi(m)), String(m)).toBe(Midi.midiToNoteName(m, { sharps: true }));
    }
  });

  it("흰 건반 판정과 개수", () => {
    expect([60, 62, 64, 65, 67, 69, 71].every(isWhiteMidi)).toBe(true);
    expect([61, 63, 66, 68, 70].some(isWhiteMidi)).toBe(false);
    expect(countWhiteKeys(60, 72)).toBe(8);
    expect(countWhiteKeys(60, 84)).toBe(15);
  });

  it("건반 배치: 흰 건반 순번과 검은 건반의 왼쪽 이웃", () => {
    const keys = keyboardKeys(60, 72);
    expect(keys).toHaveLength(13);
    const white = keys.filter((k) => k.white);
    expect(white.map((k) => k.whiteIndex)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    const cSharp = keys.find((k) => k.name === "C#4")!;
    expect(cSharp.white).toBe(false);
    expect(cSharp.whiteIndex).toBe(0);
    const aSharp = keys.find((k) => k.name === "A#4")!;
    expect(aSharp.whiteIndex).toBe(5);
  });
});

describe("한국어 음악 이름", () => {
  it("음이름(다 라 마 바 사 가 나)", () => {
    const names = ["C4", "D4", "E4", "F4", "G4", "A4", "B4"].map((t) => letterNameKo(p(t)));
    expect(names).toEqual(["다", "라", "마", "바", "사", "가", "나"]);
    expect(letterNameKo(p("F#4"))).toBe("올림바");
    expect(letterNameKo(p("Bb4"))).toBe("내림나");
  });

  it("15개 조 이름", () => {
    const expected: Record<string, string> = {
      C: "다장조", G: "사장조", D: "라장조", A: "가장조", E: "마장조", B: "나장조",
      "F#": "올림바장조", "C#": "올림다장조",
      F: "바장조", Bb: "내림나장조", Eb: "내림마장조", Ab: "내림가장조",
      Db: "내림라장조", Gb: "내림사장조", Cb: "내림다장조",
    };
    expect(Object.keys(expected).sort()).toEqual([...MAJOR_KEY_TONICS].sort());
    for (const [tonic, name] of Object.entries(expected)) expect(keyNameKo(tonic), tonic).toBe(name);
  });

  it("계이름은 조의 으뜸음이 도(이동도)", () => {
    const names = ["도", "레", "미", "파", "솔", "라", "시"];
    for (const tonic of MAJOR_KEY_TONICS) {
      majorScale(tonic, 4, 7).forEach((note, i) => {
        expect(solfegeInKey(note, tonic), `${tonic} ${i + 1}째`).toBe(names[i]);
        expect(scaleDegreeIndex(note, tonic)).toBe(i);
      });
    }
  });

  it("조 밖의 음에는 계이름이 없다", () => {
    expect(solfegeInKey(p("F#4"), "C")).toBeNull();
    expect(solfegeInKey(p("F4"), "G")).toBeNull();
    expect(solfegeInKey(p("Bb4"), "C")).toBeNull();
    // 같은 소리지만 철자가 다르면 조 안의 음이 아니다(E# ≠ F)
    expect(solfegeInKey(p("E#4"), "C")).toBeNull();
  });

  it("화음 이름과 로마 숫자는 확인된 것만", () => {
    expect(chordNameKo(1, "triad")).toBe("으뜸화음");
    expect(chordNameKo(4, "triad")).toBe("버금딸림화음");
    expect(chordNameKo(5, "triad")).toBe("딸림화음");
    expect(chordNameKo(5, "seventh")).toBe("딸림7화음");
    expect(chordNameKo(2, "triad")).toBeNull();
    expect(chordNameKo(1, "seventh")).toBeNull();
    expect(chordNumeral(1, "triad")).toBe("I");
    expect(chordNumeral(4, "triad")).toBe("IV");
    expect(chordNumeral(5, "triad")).toBe("V");
    expect(chordNumeral(5, "seventh")).toBe("V7");
    expect(chordNumeral(6, "triad")).toBeNull();
  });
});
