import type { Person } from "@/lib/data";

export function PeopleSelect({ name, people, defaultValue, required, empty = "— не назначен —" }: { name: string; people: Person[]; defaultValue?: string | null; required?: boolean; empty?: string }) {
  return (
    <select name={name} className="input" defaultValue={defaultValue ?? ""} required={required}>
      <option value="">{empty}</option>
      {people.map((p) => (
        <option key={p.id} value={p.id}>
          {p.full_name}{p.job_title ? ` · ${p.job_title}` : ""}
        </option>
      ))}
    </select>
  );
}
