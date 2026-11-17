import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLesson, lessons } from "../../../lessons";
import { LessonPlayer } from "../../../components/LessonPlayer";

export const dynamicParams = false;

export function generateStaticParams() {
  return lessons.map((l) => ({ id: l.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return { title: getLesson(id)?.title ?? "수업" };
}

export default async function LessonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const lesson = getLesson(id);
  if (!lesson) notFound();
  return <LessonPlayer lesson={lesson} />;
}
