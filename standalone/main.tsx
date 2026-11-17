import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import PickerPage from "../src/app/page";
import NotFound from "../src/app/not-found";
import { LessonPlayer } from "../src/components/LessonPlayer";
import { getLesson } from "../src/lessons";

/**
 * 한 파일 배포판의 시작점(npm run build:standalone). 서버가 없어서 수업 이동은 주소의 # 뒤 이름으로 한다.
 *   (이름 없음)        → 수업 고르기
 *   #c-major-scale     → 그 수업(수업 아이디)
 * 화면 구성요소와 수업 대본은 서버 버전과 같은 파일을 그대로 쓴다.
 */

function readRoute(): string {
  try {
    return decodeURIComponent(window.location.hash.replace(/^#/, ""));
  } catch {
    return "";
  }
}

function useRoute(): string {
  const [route, setRoute] = useState<string>(readRoute);
  useEffect(() => {
    const onChange = () => setRoute(readRoute());
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return route;
}

function App() {
  const route = useRoute();
  const lesson = route ? getLesson(route) : undefined;

  useEffect(() => {
    document.title = lesson ? `${lesson.title} · 음악 칠판` : "음악 칠판 (가칭)";
  }, [lesson]);

  if (!route) return <PickerPage />;
  if (!lesson) return <NotFound />;
  return <LessonPlayer key={lesson.id} lesson={lesson} />;
}

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
