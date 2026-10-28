-- 0010: остановить серию задач может только постановщик / менеджер, а не исполнитель.
create or replace function public.series_cancel(p_series uuid, p_from timestamptz, p_reason text)
returns int language plpgsql security definer set search_path = public as $$
declare ser public.recurrence_series; r record; n int := 0;
begin
  select * into ser from public.recurrence_series where id = p_series;
  if not found then raise exception 'Серия не найдена'; end if;
  if coalesce(trim(p_reason),'') = '' then raise exception 'Укажите причину'; end if;
  if ser.entity = 'task' then
    for r in select * from public.tasks where series_id = p_series and due_at >= p_from and status not in ('done','cancelled') loop
      if not (public.has_perm('tasks.manage') or r.created_by = auth.uid() or (r.project_id is not null and public.can_manage_project(r.project_id))) then
        raise exception 'Остановить серию может постановщик или руководитель'; end if;
      perform public.task_transition(r.id, 'cancelled', 'Серия остановлена: ' || p_reason, null);
      n := n + 1;
    end loop;
  else
    for r in select s.* from public.shoots s where s.series_id = p_series and s.starts_at >= p_from and s.status = 'planned' loop
      if not (public.has_perm('shoots.manage') or public.can_manage_project(r.project_id)
              or exists (select 1 from public.projects where id = r.project_id and planning_director_id = auth.uid())) then
        raise exception 'Нет прав'; end if;
      update public.shoots set status = 'cancelled', cancel_reason = 'Серия остановлена: ' || p_reason where id = r.id;
      insert into public.shoot_history(shoot_id, actor_id, kind, data) values (r.id, auth.uid(), 'cancel', jsonb_build_object('reason', p_reason, 'series', p_series));
      perform public.notify_user(sp.user_id, 'shoot.cancelled', 'Съёмка отменена', r.title || ': ' || p_reason, 'shoot', r.id::text, 'normal', 'scan:' || r.id || ':' || sp.user_id)
        from public.shoot_participants sp where sp.shoot_id = r.id;
      n := n + 1;
    end loop;
  end if;
  return n;
end $$;
revoke execute on function public.series_cancel(uuid, timestamptz, text) from public, anon;
grant execute on function public.series_cancel(uuid, timestamptz, text) to authenticated;
