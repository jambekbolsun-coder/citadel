import { Fragment } from "react";
import { requireActive } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Badge, Card, Notice, PageHeader } from "@/components/ui";
import { ActionForm } from "@/components/action-form";
import { toggleRolePerm } from "@/app/app/team/actions";

export const metadata = { title: "Роли и права" };

export default async function RolesMatrix() {
  const s = await requireActive("roles.manage");
  const supabase = await createClient();
  const [{ data: roles }, { data: perms }, { data: rp }] = await Promise.all([
    supabase.from("roles").select("code,name").neq("code", "owner").order("sort"),
    supabase.from("permissions").select("code,name,module,sensitive").order("module"),
    supabase.from("role_permissions").select("role_code,permission_code"),
  ]);
  const has = new Set((rp ?? []).map((x: { role_code: string; permission_code: string }) => `${x.role_code}|${x.permission_code}`));
  const rs = (roles ?? []) as { code: string; name: string }[];
  const modules = [...new Set((perms ?? []).map((p: { module: string }) => p.module))];
  return (
    <>
      <PageHeader title="Матрица прав" subtitle="По умолчанию — запрет. Права проверяются на сервере (RLS и функции БД), а не скрытием кнопок." />
      {!s.isOwner && <div className="mb-4"><Notice tone="warn">Просмотр. Изменять матрицу может только владелец.</Notice></div>}
      <Card className="p-0 md:p-0">
        <div className="scroll-x">
          <table className="tbl text-xs">
            <thead>
              <tr><th className="sticky left-0 bg-surface">Право</th>{rs.map((r) => <th key={r.code} className="min-w-[90px] whitespace-normal text-center">{r.name}</th>)}</tr>
            </thead>
            <tbody>
              {modules.map((m) => (
                <Fragment key={m}>
                  <tr><td colSpan={rs.length + 1} className="bg-surface-2 font-semibold">{m}</td></tr>
                  {(perms ?? []).filter((p: { module: string }) => p.module === m).map((p: { code: string; name: string; sensitive: boolean }) => (
                    <tr key={p.code}>
                      <td className="sticky left-0 bg-surface">{p.name} {p.sensitive && <Badge tone="warn">чувств.</Badge>}<div className="text-[10px] text-muted">{p.code}</div></td>
                      {rs.map((r) => {
                        const on = has.has(`${r.code}|${p.code}`);
                        return (
                          <td key={r.code} className="text-center">
                            {s.isOwner ? (
                              <ActionForm action={toggleRolePerm}>
                                <input type="hidden" name="role" value={r.code} /><input type="hidden" name="perm" value={p.code} /><input type="hidden" name="on" value={on ? "0" : "1"} />
                                <button className={`h-6 w-6 rounded-md text-xs font-bold ${on ? "bg-primary text-primary-ink" : "bg-surface-2 text-muted ring-1 ring-line"}`} aria-label={`${on ? "Снять" : "Выдать"} ${p.name} для ${r.name}`}>{on ? "✓" : ""}</button>
                              </ActionForm>
                            ) : on ? "✓" : ""}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <p className="mt-3 text-xs text-muted">Владелец имеет все права. Глобальные права не открывают секреты и оплаты автоматически — для них выделены отдельные чувствительные права. Все изменения пишутся в журнал аудита.</p>
    </>
  );
}
