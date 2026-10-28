-- Цитадель · 0007 · ужесточение: анонимам доступны только публичные RPC; фиксированный search_path
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.prokind = 'f' loop
    execute format('revoke execute on function %s from public, anon', f.sig);
  end loop;
end $$;
grant execute on function public.invite_preview(text) to anon;
grant execute on function public.submit_lead(jsonb) to anon;
grant execute on function public.public_tariffs() to anon;
grant execute on function public.owner_exists() to anon;
-- функции, используемые в RLS-политиках, вызываются от имени authenticated
alter default privileges in schema public revoke execute on functions from public, anon;

alter function public.recent_password_auth(int) set search_path = public;
alter function public.touch_updated_at() set search_path = public;
alter function public.content_guard() set search_path = public;
alter function public.payments_guard() set search_path = public;
alter function public.expenses_guard() set search_path = public;
alter function public.accruals_guard() set search_path = public;

-- служебные функции не должны вызываться клиентами напрямую
revoke execute on function public.audit(text,text,text,jsonb) from authenticated;
revoke execute on function public.notify_user(uuid,text,text,text,text,text,text,text) from authenticated;
revoke execute on function public.notify_perm(text,text,text,text,text,text,text,text) from authenticated;
revoke execute on function public.run_reminders() from authenticated;
revoke execute on function public.handle_new_user() from authenticated;
