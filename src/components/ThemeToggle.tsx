"use client";

import { useEffect, useState } from "react";

type Theme = "chalk" | "white";
const KEY = "mc-theme";

/** 칠판(어두운 초록)과 화이트보드(밝은 면) 중 고른다. 고른 값은 이 기기에만 저장한다. */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    const current = document.documentElement.dataset.theme;
    setTheme(current === "white" ? "white" : "chalk");
  }, []);

  const choose = (next: Theme) => {
    document.documentElement.dataset.theme = next;
    setTheme(next);
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* 저장하지 못해도 이번 화면에서는 바뀐다 */
    }
  };

  return (
    <div className="seg" role="group" aria-label="화면 색">
      <button type="button" className="seg-btn" aria-pressed={theme === "chalk"} onClick={() => choose("chalk")}>
        칠판
      </button>
      <button type="button" className="seg-btn" aria-pressed={theme === "white"} onClick={() => choose("white")}>
        화이트보드
      </button>
    </div>
  );
}
