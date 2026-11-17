import type { ReactNode } from "react";

/** 외부 아이콘 글꼴 없이 쓰는 작은 선 그림들 */
function Icon({ children, size = 22 }: { children: ReactNode; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

export const ChevronLeft = () => (
  <Icon>
    <path d="M15 18l-6-6 6-6" />
  </Icon>
);
export const ChevronRight = () => (
  <Icon>
    <path d="M9 18l6-6-6-6" />
  </Icon>
);
export const ArrowLeft = () => (
  <Icon>
    <path d="M19 12H5M12 19l-7-7 7-7" />
  </Icon>
);
export const Speaker = () => (
  <Icon>
    <path d="M11 5L6 9H3v6h3l5 4V5z" />
    <path d="M15.5 8.5a5 5 0 010 7M18.5 5.5a9 9 0 010 13" />
  </Icon>
);
export const SpeakerOff = () => (
  <Icon>
    <path d="M11 5L6 9H3v6h3l5 4V5z" />
    <path d="M22 9l-6 6M16 9l6 6" />
  </Icon>
);
export const Restart = () => (
  <Icon>
    <path d="M3 12a9 9 0 109-9 9.7 9.7 0 00-6.7 2.8L3 8" />
    <path d="M3 3v5h5" />
  </Icon>
);
export const Fullscreen = () => (
  <Icon>
    <path d="M8 3H5a2 2 0 00-2 2v3M21 8V5a2 2 0 00-2-2h-3M3 16v3a2 2 0 002 2h3M16 21h3a2 2 0 002-2v-3" />
  </Icon>
);
export const Check = () => (
  <Icon>
    <path d="M20 6L9 17l-5-5" />
  </Icon>
);
