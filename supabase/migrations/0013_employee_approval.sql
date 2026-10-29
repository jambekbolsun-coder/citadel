-- 0013. Утверждение и блокировка сотрудника одной серверной функцией.
-- Причина: setEmployeeStatus делал UPDATE без проверки числа изменённых строк (ложное «Доступ открыт»),
-- повторное нажатие плодило задачи на отзыв доступов, сотрудник не получал уведомление об открытии доступа.

create or replace function public.employee_set_status(p_id uuid, p_status text, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare p public.profiles; n int; v_name text;
begin
  if auth.uid() is null or not public.is_active() then raise exception 'Требуется активный вход'; end if;
  if not public.has_perm('employees.manage') then raise exception 'Недостаточно прав: нужно право employees.manage'; end if;
  if p_status not in ('active', 'blocked') then raise exception 'Недопустимый статус'; end if;
  if p_id = auth.uid() then raise exception 'Нельзя менять собственный статус'; end if;

  select * into p from public.profiles where id = p_id for update;
  if not found then raise exception 'Сотрудник не найден'; end if;
  if public.is_owner(p_id) and not public.is_owner() then raise exception 'Статус владельца меняет только владелец'; end if;

  -- идемпотентно: повторное нажатие ничего не меняет и не создаёт уведомлений/задач
  if p.status::text = p_status then
    return jsonb_build_object('id', p.id, 'status', p.status, 'changed', false);
  end if;
  if p_status = 'active' and not exists (select 1 from public.user_roles where user_id = p_id) then
    raise exception 'У сотрудника нет ни одной роли — назначьте роль перед утверждением';
  end if;

  update public.profiles set status = p_status::public.profile_status where id = p_id;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'Статус не изменён (затронуто строк: %)', n; end if;

  v_name := coalesce(nullif(p.full_name, ''), p.email, 'Сотрудник');
  if p_reason is not null and trim(p_reason) <> '' then
    perform public.audit('profile.status_reason', 'profile', p_id::text, jsonb_build_object('to', p_status, 'reason', p_reason));
  end if;

  if p_status = 'active' then
    perform public.notify_user(p_id, 'employee.approved', 'Ваш доступ открыт',
      'Руководитель утвердил ваш профиль. Откройте Цитадель — рабочий кабинет уже доступен.', 'profile', p_id::text, 'high',
      'approved:' || p_id || ':' || extract(epoch from now())::bigint);
    -- уведомления «ожидает утверждения» больше не актуальны
    update public.notifications set read_at = coalesce(read_at, now())
     where type = 'employee.joined' and entity_id = p_id::text;
  else
    -- блокировка: доверенные устройства и сеансы сотрудника больше не действуют
    delete from public.device_pins where user_id = p_id;
    begin
      delete from auth.sessions where user_id = p_id;
    exception when insufficient_privilege or undefined_table then null; -- RLS и is_active() всё равно закрывают данные
    end;
    insert into public.tasks(title, description, priority, type, assignee_id, created_by, due_at)
    values ('Отозвать внешние доступы: ' || v_name,
      'Сотрудник заблокирован. Отзовите доступы к рекламным кабинетам, соцсетям клиентов и общим ресурсам; смените пароли, которые он знал.',
      'critical', 'offboarding', auth.uid(), auth.uid(), now() + interval '1 day');
  end if;
  return jsonb_build_object('id', p_id, 'status', p_status, 'changed', true);
end $$;

revoke execute on function public.employee_set_status(uuid, text, text) from public, anon;
grant execute on function public.employee_set_status(uuid, text, text) to authenticated;
