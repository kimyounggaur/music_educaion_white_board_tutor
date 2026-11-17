"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePlayer } from "../lib/player/store";
import type { Lesson } from "../lib/script/schema";
import { buildStaffColumns, describeBoard, keyboardMarks } from "../lib/script/board";
import { parsePitch } from "../lib/theory/pitch";
import { Keyboard } from "./Keyboard";
import { Staff } from "./staff/Staff";
import { ThemeToggle } from "./ThemeToggle";
import { ArrowLeft, Check, ChevronLeft, ChevronRight, Fullscreen, Restart, Speaker, SpeakerOff } from "./icons";

function toggleFullscreen() {
  try {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen();
  } catch {
    /* 전체 화면을 쓸 수 없는 기기 */
  }
}

const EMPTY_SET: ReadonlySet<number> = new Set();

/** 세로로 긴 화면(폰 세로, 태블릿 세로)인지 */
function usePortrait(): boolean {
  const [portrait, setPortrait] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-aspect-ratio: 4/5)");
    const update = () => setPortrait(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return portrait;
}

export function LessonPlayer({ lesson }: { lesson: Lesson }) {
  const step = usePlayer((s) => s.step);
  const scene = usePlayer((s) => s.scene);
  const sounding = usePlayer((s) => s.sounding);
  const newElements = usePlayer((s) => s.newElements);
  const autoPlay = usePlayer((s) => s.autoPlay);
  const audioOn = usePlayer((s) => s.audioOn);
  const askPlan = usePlayer((s) => s.askPlan);
  const askProgress = usePlayer((s) => s.askProgress);
  const lastTap = usePlayer((s) => s.lastTap);
  const { next, prev, goTo, restart, replay, tapKey, setAutoPlay } = usePlayer.getState();

  const [canFullscreen, setCanFullscreen] = useState(false);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const portrait = usePortrait();

  // 수업 불러오기: 주소의 ?step=번호(1부터)가 있으면 그 단계에서 시작한다
  useEffect(() => {
    const n = Number(new URL(window.location.href).searchParams.get("step"));
    const start = Number.isInteger(n) && n >= 1 ? n - 1 : 0;
    usePlayer.getState().load(lesson, start);
    setCanFullscreen(Boolean(document.fullscreenEnabled));
    return () => usePlayer.getState().unload();
  }, [lesson]);

  // 키보드·발표용 리모컨(PageUp/PageDown 등) 조작
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target?.isContentEditable) return;
      const onButton = tag === "BUTTON" || tag === "A";
      const st = usePlayer.getState();
      switch (e.key) {
        case "ArrowRight":
        case "ArrowDown":
        case "PageDown":
          st.next();
          break;
        case " ":
        case "Enter":
          if (onButton) return;
          st.next();
          break;
        case "ArrowLeft":
        case "ArrowUp":
        case "PageUp":
        case "Backspace":
          st.prev();
          break;
        case "Home":
          st.restart();
          break;
        case "r":
        case "R":
          st.replay();
          break;
        case "f":
        case "F":
          toggleFullscreen();
          break;
        default:
          return;
      }
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const columns = useMemo(
    () => (scene ? buildStaffColumns(lesson, scene, sounding, newElements) : []),
    [lesson, scene, sounding, newElements],
  );
  const marks = useMemo(() => (scene ? keyboardMarks(lesson, scene, sounding) : null), [lesson, scene, sounding]);
  const description = scene ? describeBoard(lesson, scene) : "오선보";

  const range = useMemo(() => {
    const from = parsePitch(lesson.keyboard.from);
    const to = parsePitch(lesson.keyboard.to);
    return { from: from?.midi ?? 60, to: to?.midi ?? 72 };
  }, [lesson]);

  const total = lesson.steps.length;
  const isLast = step >= total - 1;
  const hasSound = (scene?.play.length ?? 0) > 0;
  const reviewed = lesson.review.status === "검토 완료";
  const wrong =
    askProgress?.wrongMidi != null && lastTap ? { midi: askProgress.wrongMidi, seq: lastTap.seq } : null;

  const askText = askProgress
    ? askProgress.message || (askPlan?.order === "차례로" ? "순서대로 건반을 눌러 보세요." : "건반을 눌러 보세요.")
    : "";

  return (
    <div className="player">
      <header className="topbar">
        <div className="header-main">
          <Link href="/" className="chip-btn" aria-label="수업 목록으로">
            <ArrowLeft />
            <span className="hide-narrow">수업 목록</span>
          </Link>
          <div className="title">
            <h1>{lesson.title}</h1>
            <span className={`badge${reviewed ? " badge-ok" : ""}`}>{reviewed ? "교사 검토 완료" : "AI 초안 · 교사 검토 전"}</span>
          </div>
          <div className="tools" aria-label="화면 및 소리 설정">
            <button type="button" className="icon-btn" aria-pressed={autoPlay}
              aria-label={`단계를 넘길 때 소리 자동 재생: ${autoPlay ? "켜짐" : "꺼짐"}`}
              title={`자동 재생 ${autoPlay ? "켬" : "끔"}`} onClick={() => setAutoPlay(!autoPlay)}>
              {autoPlay ? <Speaker /> : <SpeakerOff />}
            </button>
            <button type="button" className="icon-btn" onClick={restart} aria-label="처음부터 다시" title="처음부터 (Home)"><Restart /></button>
            {canFullscreen ? <button type="button" className="icon-btn" onClick={toggleFullscreen} aria-label="전체 화면" title="전체 화면 (F)"><Fullscreen /></button> : null}
            <ThemeToggle />
          </div>
        </div>
        <nav className="controls" aria-label="수업 진행">
          <button type="button" className="btn" onClick={prev} disabled={step === 0}><ChevronLeft /><span>이전</span></button>
          <span className="stepno" aria-label={`전체 ${total}단계 중 ${step + 1}단계`}>{step + 1} / {total}</span>
          <label className="step-select"><span className="sr-only">수업 단계 선택</span><select value={step} onChange={(event) => goTo(Number(event.target.value))}>{lesson.steps.map((_, i) => <option key={i} value={i}>{i + 1}단계</option>)}</select></label>
          <ol className="dots" aria-label="단계 이동">
            {lesson.steps.map((_, i) => <li key={i}><button type="button" className={`dot${i === step ? " dot-now" : ""}${i < step ? " dot-done" : ""}`} onClick={() => goTo(i)} aria-label={`${i + 1}단계로 이동`} aria-current={i === step ? "step" : undefined} /></li>)}
          </ol>
          {isLast ? <Link href="/" className="btn btn-primary"><span>수업 목록으로</span></Link> : <button type="button" className="btn btn-primary" onClick={next}><span>다음</span><ChevronRight /></button>}
          <button type="button" className="btn keyboard-toggle" aria-expanded={keyboardOpen} aria-controls="lesson-keyboard" onClick={() => setKeyboardOpen(!keyboardOpen)}>건반 {keyboardOpen ? "닫기" : "열기"}</button>
          <button type="button" className={`btn btn-quiet${audioOn ? "" : " pulse"}`} onClick={replay} disabled={!hasSound} title="다시 듣기 (R)"><Speaker /><span>{audioOn ? "다시 듣기" : "소리 켜고 듣기"}</span></button>
        </nav>
        {keyboardOpen ? <div className="keyboard-menu" id="lesson-keyboard" role="region" aria-label="연주 건반">
          <div className="keyboard-menu-head"><strong>연주 건반</strong><span>건반을 눌러 소리를 듣거나 문제를 풀어 보세요.</span></div>
          <div className="menu-keywrap"><Keyboard fromMidi={range.from} toMidi={range.to} tonic={lesson.key.tonic} keyLabels={scene?.keyLabels ?? "없음"} hot={marks?.hot ?? EMPTY_SET} sounding={marks?.sounding ?? EMPTY_SET} found={askProgress?.mine ?? []} wrong={wrong} onTap={tapKey} tall={portrait} /></div>
        </div> : null}
      </header>

      <div className="board-frame">
        <main className="board">
          <div className="staffwrap"><Staff lesson={lesson} columns={columns} description={description} /></div>
          <section className="captionbar">
            {askProgress ? <p className={`ask ask-${askProgress.tone}`} role="status">{askProgress.done ? <Check /> : null}<span>{askText} {!askProgress.done ? "상단의 건반 열기를 눌러 주세요." : ""}</span></p> : null}
            <p className="caption" aria-live="polite">{scene?.caption ?? ""}</p>
          </section>
        </main>
        <svg className="marker-tray" viewBox="44 315 362 30" preserveAspectRatio="none" aria-hidden="true" focusable="false"><image href="/whiteboard-reference.svg" x="0" y="0" width="450" height="450" /></svg>
      </div>
    </div>
  );
}
