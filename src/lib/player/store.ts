/**
 * 수업 진행 상태. 어느 단계인지, 지금 울리는 음, 해보기 진행을 한곳에서 들고 있다.
 * 소리와 타이머는 모두 여기서 시작하고 끝낸다(단계를 넘기면 항상 먼저 멈춘다).
 */

import { create } from "zustand";
import type { Lesson } from "../script/schema";
import { computeScene, newlyShown, type Scene } from "../script/scene";
import { buildPlayPlan, type SoundRef } from "../script/board";
import { parsePitch } from "../theory/pitch";
import { judgeTap, planAsk, startAsk, type AskPlan, type AskProgress } from "./ask";
import * as audio from "../audio/engine";

const AUTOPLAY_KEY = "mc-autoplay";

export interface PlayerState {
  lesson: Lesson | null;
  step: number;
  scene: Scene | null;
  /** 이번 단계에서 새로 나타난 요소(나타나는 동작에 쓴다) */
  newElements: string[];
  /** 지금 울리고 있는 음 */
  sounding: SoundRef[];
  /** 학생이 방금 누른 건반(깜빡임용, 누를 때마다 번호가 바뀐다) */
  lastTap: { midi: number; seq: number } | null;
  autoPlay: boolean;
  audioOn: boolean;
  askPlan: AskPlan | null;
  askProgress: AskProgress | null;

  load: (lesson: Lesson, startStep?: number) => void;
  unload: () => void;
  goTo: (step: number) => void;
  next: () => void;
  prev: () => void;
  restart: () => void;
  replay: () => void;
  tapKey: (midi: number) => void;
  setAutoPlay: (on: boolean) => void;
  /** 처음 누름·터치 안에서 소리를 켠다 */
  wake: () => void;
}

let timers: ReturnType<typeof setTimeout>[] = [];
let tapSeq = 0;

function clearTimers() {
  for (const t of timers) clearTimeout(t);
  timers = [];
}

function stopSound() {
  clearTimers();
  audio.stopAll();
}

function readAutoPlay(): boolean {
  try {
    return localStorage.getItem(AUTOPLAY_KEY) !== "off";
  } catch {
    return true;
  }
}

function syncUrl(step: number) {
  try {
    const url = new URL(window.location.href);
    url.searchParams.set("step", String(step + 1));
    window.history.replaceState(window.history.state, "", url);
  } catch {
    /* 주소를 바꿀 수 없으면 넘어간다 */
  }
}

export const usePlayer = create<PlayerState>((set, get) => {
  /** 지금 단계의 소리 계획을 시간표대로 낸다. 칠판의 강조도 같은 시간표로 켜고 끈다. */
  function playCurrent() {
    const { lesson, scene } = get();
    // 소리가 아직 켜지지 않았어도(처음 누르는 순간) 칠판 강조는 시간표대로 진행한다
    if (!lesson || !scene) return;
    stopSound();
    const { events } = buildPlayPlan(lesson, scene.play);
    for (const ev of events) {
      const p = parsePitch(ev.pitch);
      if (!p) continue;
      const fire = () => {
        audio.playNote(p.midi, ev.soundDur);
        set((s) => ({ sounding: [...s.sounding, ev.ref] }));
        timers.push(
          setTimeout(() => {
            set((s) => {
              const i = s.sounding.findIndex((r) => r.elementId === ev.ref.elementId && r.index === ev.ref.index);
              if (i < 0) return s;
              const next = s.sounding.slice();
              next.splice(i, 1);
              return { sounding: next };
            });
          }, ev.showDur * 1000),
        );
      };
      if (ev.at <= 0) fire();
      else timers.push(setTimeout(fire, ev.at * 1000));
    }
  }

  function enter(step: number, opts: { silent?: boolean } = {}) {
    const { lesson, scene: prev } = get();
    if (!lesson) return;
    const clamped = Math.min(Math.max(step, 0), lesson.steps.length - 1);
    stopSound();
    const scene = computeScene(lesson, clamped);
    const ask = scene.ask ? planAsk(lesson, scene.ask) : null;
    const forward = prev !== null && clamped > prev.stepIndex;
    set({
      step: clamped,
      scene,
      newElements: forward && prev ? newlyShown(prev, scene) : [],
      sounding: [],
      askPlan: ask,
      askProgress: ask ? startAsk(ask) : null,
    });
    syncUrl(clamped);
    if (!opts.silent && get().autoPlay) playCurrent();
  }

  return {
    lesson: null,
    step: 0,
    scene: null,
    newElements: [],
    sounding: [],
    lastTap: null,
    autoPlay: true,
    audioOn: false,
    askPlan: null,
    askProgress: null,

    load(lesson, startStep = 0) {
      stopSound();
      set({
        lesson,
        scene: null,
        autoPlay: readAutoPlay(),
        audioOn: audio.isRunning(),
        lastTap: null,
      });
      enter(startStep, { silent: true });
    },

    unload() {
      stopSound();
      set({ lesson: null, scene: null, step: 0, sounding: [], newElements: [], askPlan: null, askProgress: null });
    },

    wake() {
      audio.unlock();
      set({ audioOn: audio.isRunning() });
    },

    goTo(step) {
      get().wake();
      enter(step);
    },

    next() {
      const { lesson, step } = get();
      if (!lesson) return;
      get().wake();
      if (step < lesson.steps.length - 1) enter(step + 1);
    },

    prev() {
      const { step } = get();
      get().wake();
      if (step > 0) enter(step - 1);
    },

    restart() {
      get().wake();
      enter(0);
    },

    replay() {
      get().wake();
      playCurrent();
    },

    tapKey(midi) {
      get().wake();
      audio.playNote(midi, 0.9);
      const { askPlan, askProgress } = get();
      const nextProgress = askPlan && askProgress ? judgeTap(askPlan, askProgress, midi) : askProgress;
      set({ lastTap: { midi, seq: ++tapSeq }, askProgress: nextProgress });
    },

    setAutoPlay(on) {
      try {
        localStorage.setItem(AUTOPLAY_KEY, on ? "on" : "off");
      } catch {
        /* 저장하지 못해도 동작은 한다 */
      }
      if (!on) stopSound();
      set({ autoPlay: on, sounding: on ? get().sounding : [] });
    },
  };
});

// 소리 켜짐 상태가 바뀌면(예: 브라우저가 멈췄다가 다시 켬) 화면에 반영한다
if (typeof window !== "undefined") {
  audio.subscribe(() => usePlayer.setState({ audioOn: audio.isRunning() }));
}
