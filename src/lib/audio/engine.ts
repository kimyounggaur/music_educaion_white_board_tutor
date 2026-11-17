/**
 * 소리 내기. 브라우저 기본 오디오(Web Audio)로 직접 만든다(외부 파일을 받지 않는다).
 * - unlock()은 반드시 사용자의 누르기·터치·키 입력 안에서 부른다(아이폰·사파리 규칙).
 * - 음 하나는 삼각파 + 두 배음 + 저역 통과 필터로 만든 부드러운 건반 소리다.
 */

interface Voice {
  gain: GainNode;
  oscillators: OscillatorNode[];
}

type WebkitWindow = Window & { webkitAudioContext?: typeof AudioContext };

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
const active = new Set<Voice>();
const listeners = new Set<() => void>();

function emit() {
  for (const fn of listeners) fn();
}

function createContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? (window as WebkitWindow).webkitAudioContext;
  if (!Ctor) return null;
  const c = new Ctor({ latencyHint: "interactive" });
  const out = c.createGain();
  out.gain.value = 0.75;
  // 음이 여러 개 겹쳐도 소리가 찢어지지 않게 눌러 준다
  const comp = c.createDynamicsCompressor();
  comp.threshold.value = -16;
  comp.knee.value = 24;
  comp.ratio.value = 5;
  comp.attack.value = 0.003;
  comp.release.value = 0.25;
  out.connect(comp);
  comp.connect(c.destination);
  master = out;
  c.addEventListener("statechange", emit);
  return c;
}

/** 사용자 동작 안에서 부른다. 이미 켜져 있으면 아무 일도 하지 않는다. */
export function unlock(): void {
  try {
    // 아이폰 무음 스위치가 켜져 있어도 소리가 나게 한다(지원하는 브라우저만)
    const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
    if (session) session.type = "playback";
  } catch {
    /* 지원하지 않으면 넘어간다 */
  }
  if (!ctx) {
    ctx = createContext();
    if (ctx) {
      // 아이폰: 소리 없는 아주 짧은 소리를 한 번 내야 완전히 켜진다
      try {
        const buffer = ctx.createBuffer(1, 1, 22050);
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        src.connect(ctx.destination);
        src.start(0);
      } catch {
        /* 무시 */
      }
    }
  }
  if (ctx && ctx.state !== "running") void ctx.resume().catch(() => undefined);
  emit();
}

export function isRunning(): boolean {
  return ctx?.state === "running";
}

/** 소리 켜짐 상태가 바뀔 때 알려 준다. 해제 함수를 돌려준다. */
export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

export function midiToFrequency(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** 음 하나를 낸다. durationSec은 건반을 누르고 있는 시간이고, 그 뒤에 여운이 조금 남는다. */
export function playNote(midi: number, durationSec: number, level = 0.34): void {
  if (!ctx || !master) return;
  if (ctx.state === "suspended") void ctx.resume().catch(() => undefined);
  const t0 = ctx.currentTime + 0.005;
  const f = midiToFrequency(midi);
  const hold = Math.max(0.12, durationSec);
  const end = t0 + hold;
  const stopAt = end + 0.9;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.linearRampToValueAtTime(level, t0 + 0.012);
  // 건반처럼 처음에 크고 점점 줄어든다
  gain.gain.setTargetAtTime(level * 0.42, t0 + 0.012, 0.32);
  gain.gain.setTargetAtTime(0.0001, end, 0.11);

  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.Q.value = 0.6;
  filter.frequency.setValueAtTime(Math.min(f * 9, 7000), t0);
  filter.frequency.setTargetAtTime(Math.min(f * 3, 2600), t0, 0.25);
  filter.connect(gain);
  gain.connect(master);

  const partials: Array<[OscillatorType, number, number]> = [
    ["triangle", 1, 1],
    ["sine", 2, 0.32],
    ["sine", 3, 0.1],
  ];
  const oscillators: OscillatorNode[] = [];
  for (const [type, mult, amount] of partials) {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = f * mult;
    const g = ctx.createGain();
    g.gain.value = amount;
    osc.connect(g);
    g.connect(filter);
    osc.start(t0);
    osc.stop(stopAt);
    oscillators.push(osc);
  }

  const voice: Voice = { gain, oscillators };
  active.add(voice);
  oscillators[0]?.addEventListener("ended", () => {
    active.delete(voice);
    try {
      gain.disconnect();
      filter.disconnect();
    } catch {
      /* 이미 끊김 */
    }
  });
}

/** 울리고 있는 소리를 바로 줄여서 끈다(단계를 넘길 때). */
export function stopAll(): void {
  if (!ctx) return;
  const now = ctx.currentTime;
  for (const v of active) {
    try {
      v.gain.gain.cancelScheduledValues(now);
      v.gain.gain.setTargetAtTime(0.0001, now, 0.02);
      for (const o of v.oscillators) o.stop(now + 0.12);
    } catch {
      /* 이미 멈춤 */
    }
  }
  active.clear();
}
