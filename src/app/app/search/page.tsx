import { requireActive } from "@/lib/auth";
import { cleanQuery } from "@/lib/search";
import { SearchBox } from "./search-box";

export const metadata = { title: "Поиск" };

export default async function SearchPage({ searchParams }: PageProps<"/app/search">) {
  await requireActive();
  const sp = await searchParams;
  return (
    <div className="mx-auto w-full max-w-2xl">
      <h1 className="sr-only">Поиск</h1>
      <SearchBox initial={cleanQuery(typeof sp.q === "string" ? sp.q : "")} />
    </div>
  );
}
