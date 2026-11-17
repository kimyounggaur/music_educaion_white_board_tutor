"use client";

import { useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { LessonLink } from "./LessonLink";

export type SearchLesson = { id: string; title: string; subtitle?: string; grade: string };

// 공백이나 대소문자가 달라도 찾을 수 있게 비교한다.
const normalize = (value: string) => value.normalize("NFKC").toLocaleLowerCase("ko-KR").replace(/\s+/g, "");

export function LessonSearch({ lessons }: { lessons: SearchLesson[] }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const composing = useRef(false);
  const resultsId = useId();
  const term = normalize(query);
  const results = useMemo(() => term ? lessons.filter((lesson) =>
    normalize(`${lesson.title} ${lesson.subtitle ?? ""} ${lesson.grade}`).includes(term),
  ) : [], [lessons, term]);
  const visible = open && term.length > 0;

  const resultLinks = () => Array.from(rootRef.current?.querySelectorAll<HTMLAnchorElement>(".home-search-result") ?? []);
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Escape" && visible) {
      event.preventDefault();
      inputRef.current?.focus();
      setOpen(false);
    } else if (event.key === "ArrowDown" && visible && results.length) {
      event.preventDefault();
      const links = resultLinks();
      const current = links.indexOf(document.activeElement as HTMLAnchorElement);
      links[Math.min(current + 1, links.length - 1)]?.focus();
    } else if (event.key === "ArrowUp" && visible) {
      event.preventDefault();
      const links = resultLinks();
      const current = links.indexOf(document.activeElement as HTMLAnchorElement);
      if (current <= 0) inputRef.current?.focus();
      else links[current - 1]?.focus();
    }
  };

  return (
    <div className="home-search" ref={rootRef} onKeyDown={onKeyDown}
      onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
      <form role="search" onSubmit={(event) => {
        event.preventDefault();
        if (composing.current) return;
        if (!visible && term) { setOpen(true); return; }
        if (visible && results.length) resultLinks()[0]?.click();
      }}>
        <label className="sr-only" htmlFor={`${resultsId}-input`}>수업 검색</label>
        <span className="home-search-icon" aria-hidden="true">⌕</span>
        <input ref={inputRef} id={`${resultsId}-input`} type="search" autoComplete="off"
          placeholder="수업 검색" value={query} aria-controls={visible ? resultsId : undefined}
          onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }}
          onFocus={() => setOpen(true)} onChange={(event) => { setQuery(event.target.value); setOpen(true); }} />
      </form>
      {visible ? <div className="home-search-panel" id={resultsId}>
        <p className="home-search-count" role="status" aria-live="polite">
          {results.length ? `검색 결과 ${results.length}개` : "검색 결과가 없습니다."}
        </p>
        {results.length ? <ul>
          {results.map((lesson) => <li key={lesson.id}>
            <LessonLink id={lesson.id} className="home-search-result">
              <span className="home-lesson-title">{lesson.title}</span>
              {lesson.subtitle ? <span className="home-lesson-subtitle">{lesson.subtitle}</span> : null}
              <span className="home-lesson-meta">{lesson.grade}</span>
            </LessonLink>
          </li>)}
        </ul> : <p className="home-search-empty">다른 수업 이름이나 키워드를 입력해 보세요.</p>}
      </div> : null}
    </div>
  );
}
