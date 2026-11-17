import { notFound } from "next/navigation";
import { fixtures, getFixture } from "../../../lessons/fixtures";
import { LessonPlayer } from "../../../components/LessonPlayer";

/** 개발용 시험 대본 화면. 개발 중이거나 NEXT_PUBLIC_DEV_LESSONS=1로 빌드했을 때만 열린다. */
const enabled = process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_DEV_LESSONS === "1";

export const dynamicParams = false;

export function generateStaticParams() {
  return enabled ? fixtures.map((l) => ({ id: l.id })) : [];
}

export default async function DevLessonPage({ params }: { params: Promise<{ id: string }> }) {
  if (!enabled) notFound();
  const { id } = await params;
  const lesson = getFixture(id);
  if (!lesson) notFound();
  return <LessonPlayer lesson={lesson} />;
}
