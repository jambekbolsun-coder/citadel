import { requireActive } from "@/lib/auth";
import { LearnIndex } from "@/components/learn/views";
import { LearnSeen } from "@/components/learn/learn-home-card";
import { isLeader, lessonsFor } from "@/lib/learn";

export const metadata = { title: "Обучение" };

export default async function LearnPage() {
  const s = await requireActive();
  return (
    <>
      <LearnSeen userId={s.userId} />
      <LearnIndex lessons={lessonsFor(s)} leader={isLeader(s)} />
    </>
  );
}
