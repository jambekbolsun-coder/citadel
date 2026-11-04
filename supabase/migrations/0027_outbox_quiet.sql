-- 0027 · Этап 3 (docs/SECURITY_FIX_PLAN.md): журнал event_outbox больше не пополняется лишними записями.
-- Раньше notify_perm писала в журнал при каждом вызове, даже если уведомление уже было (повтор напоминаний cron каждые
-- 15 минут) — около 330 записей в сутки, которые никто не читает. Теперь запись — только если ушло хотя бы одно новое уведомление.
-- Только create or replace; существующие записи журнала не удаляются (отдельное решение владельца).
create or replace function public.notify_perm(p_perm text, p_type text, p_title text, p_body text,
  p_entity_type text, p_entity_id text, p_priority text default 'normal', p_key text default null)
returns void language plpgsql security definer set search_path = public as $$
declare n int;
begin
  insert into public.notifications(user_id, type, title, body, entity_type, entity_id, priority, idempotency_key)
  select p.id, p_type, p_title, p_body, p_entity_type, p_entity_id, p_priority, p_key
    from public.profiles p where p.status = 'active' and public.has_perm(p_perm, p.id)
  on conflict (user_id, idempotency_key) do nothing;
  get diagnostics n = row_count;
  if n > 0 then
    insert into public.event_outbox(type, payload) values (p_type, jsonb_build_object('perm', p_perm, 'entity', p_entity_type, 'id', p_entity_id));
  end if;
end $$;
revoke execute on function public.notify_perm(text,text,text,text,text,text,text,text) from public, anon, authenticated;
