import { notFound } from "next/navigation";
import { requireActive } from "@/lib/auth";
import { LessonView } from "@/components/learn/views";
import { LearnSeen } from "@/components/learn/learn-home-card";
import { LESSONS, lessonFor } from "@/lib/learn";

export async function generateMetadata({ params }: PageProps<"/app/learn/[id]">) {
  const { id } = await params;
  return { title: LESSONS.find((l) => l.id === id)?.title ?? "Обучение" };
}

export default async function LessonPage({ params }: PageProps<"/app/learn/[id]">) {
  const { id } = await params;
  const s = await requireActive();
  // Чужой урок (другая роль) для сотрудника не существует
  const found = lessonFor(s, id);
  if (!found) notFound();
  return (
    <>
      <LearnSeen userId={s.userId} />
      <LessonView {...found} />
    </>
  );
}
