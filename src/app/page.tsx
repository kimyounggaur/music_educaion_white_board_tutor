import { GRADE_ORDER, lessons } from "../lessons";
import { GRADE_LABEL } from "../lib/script/schema";
import { LessonLink } from "../components/LessonLink";
import { ThemeToggle } from "../components/ThemeToggle";

export default function PickerPage() {
  const groups = GRADE_ORDER.map((grade) => ({
    grade,
    items: lessons.filter((lesson) => lesson.grade === grade),
  })).filter((group) => group.items.length > 0);

  return (
    <div className="home">
      <header className="home-header">
        <div className="home-brand">
          <span aria-hidden="true" className="home-brand-mark">♪</span>
          <h1>음악 칠판</h1>
        </div>
        <nav className="home-nav" aria-label="첫 화면 메뉴">
          <details className="home-dropdown" name="home-menu">
            <summary className="home-menu-button">수업 선택 <span aria-hidden="true">▾</span></summary>
            <div className="home-panel home-lessons">
              <p className="home-panel-heading">어떤 수업을 시작할까요?</p>
              {groups.map(({ grade, items }) => (
                <section className="home-lesson-group" key={grade} aria-labelledby={`home-grade-${grade}`}>
                  <h2 id={`home-grade-${grade}`}>{GRADE_LABEL[grade]}</h2>
                  <ul>
                    {items.map((lesson) => (
                      <li key={lesson.id}>
                        <LessonLink id={lesson.id} className="home-lesson-link">
                          <span className="home-lesson-title">{lesson.title}</span>
                          {lesson.subtitle ? <span className="home-lesson-subtitle">{lesson.subtitle}</span> : null}
                          <span className="home-lesson-meta">
                            {lesson.steps.length}단계 · {lesson.review.status === "검토 완료" ? "교사 검토 완료" : "AI 초안 · 교사 검토 전"}
                          </span>
                        </LessonLink>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </details>
          <details className="home-dropdown home-help-dropdown" name="home-menu">
            <summary className="home-menu-button">사용 방법 <span aria-hidden="true">▾</span></summary>
            <div className="home-panel home-help-panel">
              <h2>사용 방법</h2>
              <p>수업을 고른 뒤 <strong>→ 키</strong>, <strong>스페이스바</strong>, 발표용 리모컨의 다음 버튼 또는 화면 상단의 <strong>다음</strong> 버튼으로 단계를 넘기세요. 상단의 <strong>건반 열기</strong> 메뉴에서 건반을 눌러 소리를 낼 수 있어요.</p>
              <p>소리가 나지 않으면 기기의 볼륨을 올리고, 아이폰은 옆면의 무음 스위치를 확인해 주세요. 교실 컴퓨터는 스피커 연결을 확인해 주세요.</p>
            </div>
          </details>
          <ThemeToggle />
        </nav>
      </header>
      <main className="home-board-area" aria-label="음악 화이트보드">
        <div className="home-frame">
          <div className="home-surface">
            <p className="home-board-hint">상단의 <strong>수업 선택</strong> 메뉴에서 수업을 시작하세요.</p>
          </div>
          <svg className="home-marker-tray" viewBox="44 315 362 30" preserveAspectRatio="none" aria-hidden="true" focusable="false">
            <image href="/whiteboard-reference.svg" x="0" y="0" width="450" height="450" />
          </svg>
        </div>
      </main>
    </div>
  );
}
