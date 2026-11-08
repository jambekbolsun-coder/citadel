import { requireActive } from "@/lib/auth";
import { LearnIndex } from "@/components/learn/views";
import { isLeader, lessonsFor } from "@/lib/learn";

export const metadata = { title: "Обучение" };

export default async function LearnPage() {
  const s = await requireActive();
  return <LearnIndex lessons={lessonsFor(s)} leader={isLeader(s)} />;
}
