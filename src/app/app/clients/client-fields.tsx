import { Field } from "@/components/ui";

type C = Partial<{ company_name: string; contact_name: string | null; phone: string | null; whatsapp: string | null; email: string | null; niche: string | null; address: string | null; source: string | null; notes: string | null; socials: Record<string, string> }>;

export function ClientFields({ c = {} }: { c?: C }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Контактное лицо (ФИО) *"><input name="contact_name" required minLength={2} defaultValue={c.contact_name ?? ""} className="input" /></Field>
      <Field label="Компания / бренд" hint="Пусто — используем ФИО"><input name="company_name" defaultValue={c.company_name ?? ""} className="input" /></Field>
      <Field label="Телефон" hint="+996 XXX XXX XXX или международный"><input name="phone" type="tel" inputMode="tel" defaultValue={c.phone ?? ""} className="input" /></Field>
      <Field label="WhatsApp" hint="Если отличается от телефона"><input name="whatsapp" type="tel" inputMode="tel" defaultValue={c.whatsapp ?? ""} className="input" /></Field>
      <Field label="Email"><input name="email" type="email" inputMode="email" defaultValue={c.email ?? ""} className="input" /></Field>
      <Field label="Ниша"><input name="niche" defaultValue={c.niche ?? ""} className="input" /></Field>
      <Field label="Адрес / локация"><input name="address" defaultValue={c.address ?? ""} className="input" /></Field>
      <Field label="Источник"><input name="source" defaultValue={c.source ?? ""} className="input" /></Field>
      <Field label="Instagram"><input name="instagram" defaultValue={c.socials?.instagram ?? ""} className="input" /></Field>
      <Field label="TikTok"><input name="tiktok" defaultValue={c.socials?.tiktok ?? ""} className="input" /></Field>
      <Field label="Facebook"><input name="facebook" defaultValue={c.socials?.facebook ?? ""} className="input" /></Field>
      <Field label="Заметки и пожелания" className="sm:col-span-2"><textarea name="notes" defaultValue={c.notes ?? ""} className="input" /></Field>
    </div>
  );
}
