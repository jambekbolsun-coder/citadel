import { createClient } from "@/lib/supabase/server";
import { Card, Field, LoadError, Notice } from "@/components/ui";
import { ActionForm, Submit } from "@/components/action-form";
import { RevealForm } from "@/components/reveal-form";
import { reauth } from "@/app/auth-actions";
import * as A from "@/app/app/projects/actions";

/**
 * Доступы к соцсетям проекта: значения в Supabase Vault, список виден только с credentials.reveal на проекте,
 * показ — через secret_reveal с недавним вводом пароля и записью в журнал.
 */
export async function ProjectAccess({ projectId, canManage }: { projectId: string; canManage: boolean }) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("project_secrets").select("id,label,platform,login_hint,created_at").eq("project_id", projectId).order("created_at");
  if (error) return <LoadError />;
  const rows = (data ?? []) as { id: string; label: string; platform: string | null; login_hint: string | null; created_at: string }[];
  return (
    <div className="space-y-4">
      <Notice>Рекомендуется выдавать агентству делегированные роли в Meta Business / ID кабинетов. Пароли хранятся только с согласия клиента, в зашифрованном хранилище; каждый просмотр требует свежего входа паролем и записывается в журнал. Коды восстановления и коды двухфакторной защиты сюда не вносятся.</Notice>
      <Card title="Сохранённые доступы">
        {rows.length === 0 ? <p className="text-sm text-muted">Нет сохранённых доступов.</p> : (
          <ul className="divide-y divide-line">{rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
              <span className="min-w-0 break-words"><b>{r.label}</b> · {r.platform ?? "—"} · логин: {r.login_hint ?? "—"}</span>
              <span className="flex items-center gap-2">
                <RevealForm action={A.revealSecret} reauth={reauth} secretId={r.id} />
                {canManage && <ActionForm action={A.deleteSecret} confirm="Удалить доступ?"><input type="hidden" name="id" value={projectId} /><input type="hidden" name="secret_id" value={r.id} /><Submit variant="ghost" className="min-h-[44px] px-3 text-xs">Удалить</Submit></ActionForm>}
              </span>
            </li>
          ))}</ul>
        )}
      </Card>
      {canManage && (
        <Card title="Добавить доступ">
          <ActionForm action={A.createSecret} reset className="grid gap-2 sm:grid-cols-2">
            <input type="hidden" name="id" value={projectId} />
            <Field label="Название"><input name="label" required className="input" placeholder="Instagram клиента" /></Field>
            <Field label="Платформа"><input name="platform" className="input" /></Field>
            <Field label="Логин (виден в списке)"><input name="login_hint" className="input" autoComplete="off" /></Field>
            <Field label="Пароль / секрет"><input name="value" type="password" required className="input" autoComplete="new-password" /></Field>
            <div className="sm:col-span-2"><Submit variant="secondary">Сохранить в хранилище</Submit></div>
          </ActionForm>
          <p className="mt-2 text-xs text-muted">Если появится «Подтвердите пароль» — нажмите «Показать» у любого доступа и подтвердите пароль, затем повторите.</p>
        </Card>
      )}
    </div>
  );
}
