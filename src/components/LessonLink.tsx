"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { unlock } from "../lib/audio/engine";

/** 수업 카드를 누르는 순간(사용자 동작 안)에 소리를 미리 켜 둔다. 수업 화면에서 바로 소리가 난다. */
export function LessonLink({ id, className, children }: { id: string; className?: string; children: ReactNode }) {
  return (
    <Link href={`/lesson/${id}`} className={className} onClick={() => unlock()}>
      {children}
    </Link>
  );
}
