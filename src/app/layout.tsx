import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "음악 칠판 (가칭)", template: "%s · 음악 칠판" },
  description: "교실 화면에서 선생님이 한 단계씩 넘기며 쓰는 음악 이론 수업 칠판. 오선보와 건반, 소리를 함께 보여 줘요.",
  // 시험 단계라서 검색 결과에 나오지 않게 한다
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

/** 화면이 그려지기 전에 저장된 색(칠판/화이트보드)을 적용해서 깜빡임을 막는다. */
const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("mc-theme");document.documentElement.dataset.theme=(t==="chalk")?"chalk":"white"}catch(e){document.documentElement.dataset.theme="white"}})()`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko" data-theme="white" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
