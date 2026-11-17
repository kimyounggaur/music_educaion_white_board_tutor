import { GRADE_ORDER, lessons } from "../lessons";
import { GRADE_LABEL } from "../lib/script/schema";
import { LessonLink } from "../components/LessonLink";
import { ThemeToggle } from "../components/ThemeToggle";

export default function PickerPage() {
  const groups = GRADE_ORDER.map((grade) => ({
    grade,
    items: lessons.filter((l) => l.grade === grade),
  })).filter((g) => g.items.length > 0);

  return (
    <main className="picker">
      <div className="picker-head">
        <div>
          <h1>음악 칠판</h1>
          <p className="lead">
            교실 화면에서 선생님이 한 단계씩 넘기며 쓰는 음악 이론 수업이에요. 오선보와 건반, 소리를 함께 보여 줘요.
          </p>
        </div>
        <ThemeToggle />
      </div>

      {groups.map(({ grade, items }) => (
        <section key={grade} className="group" aria-labelledby={`g-${grade}`}>
          <h2 id={`g-${grade}`}>{GRADE_LABEL[grade]}</h2>
          <ul className="cards">
            {items.map((lesson) => (
              <li key={lesson.id}>
                <LessonLink id={lesson.id} className="card">
                  <h3>{lesson.title}</h3>
                  {lesson.subtitle ? <p className="sub">{lesson.subtitle}</p> : null}
                  <p className="meta">
                    <span>{lesson.steps.length}단계</span>
                    <span>
                      {lesson.review.status === "검토 완료" ? "교사 검토 완료" : "AI 초안 · 교사 검토 전"}
                    </span>
                  </p>
                </LessonLink>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <p className="help">
        <strong>사용 방법</strong> 수업을 고른 뒤 <strong>→ 키</strong>, <strong>스페이스바</strong>, 발표용 리모컨의 다음 버튼, 또는 화면의{" "}
        <strong>다음</strong> 버튼으로 한 단계씩 넘기세요. 건반은 눌러서 소리를 낼 수 있어요.
        <br />
        소리가 나지 않으면 기기의 볼륨을 올리고, 아이폰은 옆면의 무음 스위치를 확인해 주세요. 교실 컴퓨터는 스피커 연결을 확인해 주세요.
      </p>
    </main>
  );
}
