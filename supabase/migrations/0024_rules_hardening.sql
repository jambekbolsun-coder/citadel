-- 0024 · Этап 1 исправлений (docs/SECURITY_FIX_PLAN.md): деньги и статусы.
-- Только добавления: create or replace функций, новые триггеры, уточнение политики. Данные не меняются.
-- Принцип триггеров-сторожей тот же, что у content_guard: запрет действует для прямых запросов из приложения
-- (current_user = authenticated / anon); функции бизнес-правил (security definer) работают от владельца схемы и проходят.

-- ───────────── 1. Материал: исполнитель не принимает работу сам ─────────────
-- С паузы / блокировки исполнитель возвращает материал только в статус, где он был до паузы.
-- Руководитель (can_manage_project / content.manage) — без ограничений, как раньше.
create or replace function public.content_transition(p_id uuid, p_to public.content_status, p_note text default null, p_result_url text default null)
returns void language plpgsql security definer set search_path = public as $$
declare c public.content_items; ok boolean; is_mgr boolean; is_exec boolean; is_rev boolean; v_before public.content_status;
begin
  select * into c from public.content_items where id = p_id for update;
  if not found then raise exception 'Материал не найден'; end if;
  is_mgr := public.can_manage_project(c.project_id) or public.has_perm('content.manage');
  is_exec := c.assignee_id = auth.uid();
  is_rev := c.reviewer_id = auth.uid() or is_mgr;
  if not (is_mgr or is_exec or is_rev) then raise exception 'Нет прав на материал'; end if;
  if c.status in ('paused','blocked') and not is_mgr and p_to not in ('paused','blocked','cancelled') then
    select h.from_status into v_before from public.content_history h
     where h.content_id = p_id and h.to_status in ('paused','blocked')
       and h.from_status is not null and h.from_status not in ('paused','blocked')
     order by h.id desc limit 1;
    if p_to is distinct from coalesce(v_before, 'in_progress'::public.content_status) then
      raise exception 'С паузы материал возвращается в статус «%» — дальше по обычному пути через проверку',
        coalesce(v_before, 'in_progress'::public.content_status);
    end if;
  end if;
  ok := case
    when p_to = 'cancelled' then is_mgr and c.status not in ('published','cancelled')
    when p_to in ('paused','blocked') then (is_mgr or is_exec) and c.status not in ('published','cancelled')
    when c.status in ('paused','blocked') then is_mgr or is_exec
    when c.status = 'planned' then p_to in ('in_progress','ready_to_shoot','editing','design')
    when c.status = 'in_progress' then p_to in ('ready_to_shoot','editing','design','review')
    when c.status = 'ready_to_shoot' then p_to in ('shot')
    when c.status = 'shot' then p_to in ('processing','editing')
    when c.status = 'processing' then p_to in ('editing','design','review')
    when c.status = 'editing' then p_to in ('design','review')
    when c.status = 'design' then p_to in ('editing','review')
    when c.status = 'revision' then p_to in ('in_progress','editing','design','review')
    when c.status = 'review' then is_rev and p_to in ('done','revision')
    when c.status = 'done' then p_to in ('published','revision') and (is_mgr or is_rev or (p_to = 'published' and is_exec))
    else false end;
  if not ok then raise exception 'Недопустимый переход: % → %', c.status, p_to; end if;
  if c.assignee_id is null and p_to not in ('cancelled','paused','blocked') then raise exception 'Сначала назначьте исполнителя'; end if;
  if p_to = 'review' and coalesce(p_result_url, c.result_url, '') = '' then raise exception 'Прикрепите результат (ссылку на файл)'; end if;
  if p_to = 'revision' and coalesce(trim(p_note),'') = '' then raise exception 'Укажите причину и список правок'; end if;
  if p_to in ('blocked','paused') and coalesce(trim(p_note),'') = '' then raise exception 'Укажите причину'; end if;
  if p_to = 'published' and not exists (select 1 from public.placements where content_id = p_id) then
    raise exception 'Добавьте размещение (ссылку на публикацию)'; end if;
  update public.content_items set status = p_to,
    result_url = coalesce(p_result_url, result_url),
    submitted_at = case when p_to = 'review' then now() else submitted_at end,
    review_due = case when p_to = 'review' then now() + make_interval(hours => coalesce((select value::int from public.app_settings where key='review_hours'), 24)) else review_due end,
    prepared_at = case when p_to = 'done' then now() when p_to = 'revision' then null else prepared_at end,
    approved_at = case when p_to = 'done' then now() else approved_at end,
    version = case when p_to = 'revision' then version + 1 else version end,
    blocked_reason = case when p_to in ('blocked','paused') then p_note else blocked_reason end
  where id = p_id;
  insert into public.content_history(content_id, from_status, to_status, actor_id, note, data)
  values (p_id, c.status, p_to, auth.uid(), p_note, case when p_result_url is not null then jsonb_build_object('result_url', p_result_url) end);
  if p_to = 'review' and c.reviewer_id is not null then
    perform public.notify_user(c.reviewer_id, 'content.review', 'Материал на проверку', c.title, 'content', p_id::text, 'high', 'rev:' || p_id || ':' || c.version);
  elsif p_to = 'revision' and c.assignee_id is not null then
    perform public.notify_user(c.assignee_id, 'content.revision', 'Правки по материалу', c.title || ': ' || left(p_note, 140), 'content', p_id::text, 'high', 'fix:' || p_id || ':' || c.version);
  elsif p_to = 'done' and c.assignee_id is not null then
    perform public.notify_user(c.assignee_id, 'content.approved', 'Материал утверждён', c.title, 'content', p_id::text, 'normal', 'ok:' || p_id || ':' || c.version);
  end if;
end $$;

-- Сторож материала: кроме статуса и исполнителя — проверяющий, сроки, отметки сдачи и привязка к проекту/плану.
-- Сроки переносятся через content_reschedule, назначение — через content_assign.
create or replace function public.content_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user in ('authenticated','anon') and (
       new.status is distinct from old.status or new.assignee_id is distinct from old.assignee_id
    or new.approved_at is distinct from old.approved_at or new.prepared_at is distinct from old.prepared_at
    or new.reviewer_id is distinct from old.reviewer_id or new.submitted_at is distinct from old.submitted_at
    or new.review_due is distinct from old.review_due or new.prep_due is distinct from old.prep_due
    or new.publish_due is distinct from old.publish_due or new.project_id is distinct from old.project_id
    or new.period_id is distinct from old.period_id or new.plan_item_id is distinct from old.plan_item_id) then
    raise exception 'Статус, исполнитель, проверяющий и сроки материала меняются только через рабочий процесс';
  end if;
  return new;
end $$;

-- ───────────── 2. Проект: статус и запуск — только через функции ─────────────
create or replace function public.projects_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user not in ('authenticated','anon') then return new; end if;
  if tg_op = 'INSERT' then
    if new.status is distinct from 'draft' or new.launched_at is not null or new.launched_by is not null
       or new.launch_override_reason is not null then
      raise exception 'Новый проект создаётся только черновиком';
    end if;
  elsif new.status is distinct from old.status or new.launched_at is distinct from old.launched_at
     or new.launched_by is distinct from old.launched_by or new.launch_override_reason is distinct from old.launch_override_reason then
    raise exception 'Статус проекта меняется только через «Статус проекта» и «Допустить к производству»';
  end if;
  return new;
end $$;
create trigger projects_guard_trg before insert or update on public.projects for each row execute function public.projects_guard();

-- ───────────── 3. Оплата проекта: в валюте договора, суммы — только тем, кому положено ─────────────
-- Суммы видят: владелец, finance.view, prices.view, payments.create и те, кто управляет проектом
-- (projects.manage, администратор, менеджер проекта). Остальные — только «оплачено полностью / нет».
-- launch_project вызывается только управляющим проектом, поэтому получает полные суммы, как раньше.
create or replace function public.project_paid_status(p_project uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_cur text; v_price bigint; v_paid bigint; v_pending bigint; v_invoiced bigint;
begin
  if not (public.can_view_project(p_project) or public.can_manage_project(p_project)
          or public.has_perm('finance.view') or public.has_perm('prices.view') or public.has_perm('payments.create')) then
    return null;
  end if;
  select currency, price_minor into v_cur, v_price from public.project_contracts where project_id = p_project;
  v_cur := coalesce(v_cur, 'KGS');
  select coalesce(sum(case when kind = 'refund' then -amount_minor else amount_minor end), 0) into v_paid
    from public.payments where project_id = p_project and status = 'confirmed' and currency = v_cur;
  select coalesce(sum(amount_minor), 0) into v_pending
    from public.payments where project_id = p_project and status = 'pending' and kind = 'payment' and currency = v_cur;
  select coalesce(sum(amount_minor), 0) into v_invoiced
    from public.invoices where project_id = p_project and status <> 'void' and currency = v_cur;
  if public.has_perm('finance.view') or public.has_perm('prices.view') or public.has_perm('payments.create')
     or public.can_manage_project(p_project) then
    return jsonb_build_object('currency', v_cur, 'price', v_price, 'paid', v_paid, 'pending', v_pending,
      'invoiced', v_invoiced, 'fully_paid', coalesce(v_price, 0) > 0 and v_paid >= v_price, 'masked', false);
  end if;
  return jsonb_build_object('currency', v_cur, 'fully_paid', coalesce(v_price, 0) > 0 and v_paid >= v_price,
    'has_pending', v_pending > 0, 'masked', true);
end $$;
revoke execute on function public.project_paid_status(uuid) from public, anon;
grant execute on function public.project_paid_status(uuid) to authenticated;

-- Допуск: оплата считается в валюте договора; пустые суммы считаются нулём (раньше null мог «проскочить» проверку).
create or replace function public.launch_project(p_project uuid, p_override_reason text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare p public.projects; s jsonb; v_price bigint; v_paid bigint; v_period uuid; h jsonb; missing text[] := '{}';
begin
  select * into p from public.projects where id = p_project for update;
  if not found then raise exception 'Проект не найден'; end if;
  if not public.can_manage_project(p_project) then raise exception 'Нет прав на проект'; end if;
  if p.launched_at is not null then raise exception 'Проект уже запущен'; end if;
  if p.status in ('cancelled','closed') then raise exception 'Проект закрыт или отменён'; end if;
  if p.admin_id is null then raise exception 'Не назначен администратор проекта'; end if;
  s := coalesce(public.project_paid_status(p_project), '{}'::jsonb);
  v_price := coalesce((s->>'price')::bigint, 0); v_paid := coalesce((s->>'paid')::bigint, 0);
  h := p.handoff;
  if coalesce((h->>'client')::boolean,false) is not true then missing := missing || 'клиент'; end if;
  if coalesce((h->>'package')::boolean,false) is not true then missing := missing || 'пакет и объём'; end if;
  if coalesce((h->>'dates')::boolean,false) is not true then missing := missing || 'даты'; end if;
  if coalesce((h->>'wishes')::boolean,false) is not true then missing := missing || 'пожелания'; end if;
  if coalesce((h->>'admin_accepted')::boolean,false) is not true then missing := missing || 'принятие администратором'; end if;
  if v_price <= 0 or v_paid < v_price then
    missing := missing || ('оплата ' || (v_paid/100) || ' из ' || (v_price/100) || ' ' || coalesce(s->>'currency', 'KGS'));
  end if;
  if array_length(missing,1) > 0 then
    if coalesce(trim(p_override_reason),'') = '' or not public.has_perm('projects.launch_override') then
      raise exception 'Допуск невозможен: %', array_to_string(missing, ', ');
    end if;
  end if;
  update public.projects set launched_at = now(), launched_by = auth.uid(), status = 'in_progress',
     launch_override_reason = case when array_length(missing,1) > 0 then p_override_reason end,
     work_start = coalesce(work_start, current_date)
   where id = p_project;
  insert into public.project_status_history(project_id, from_status, to_status, reason, actor_id)
  values (p_project, p.status, 'in_progress', coalesce(p_override_reason, 'допуск: оплата 100% и чек-лист'), auth.uid());
  perform public.audit(case when array_length(missing,1) > 0 then 'project.launch_override' else 'project.launch' end,
     'project', p_project::text, jsonb_build_object('missing', missing, 'reason', p_override_reason));
  select id into v_period from public.project_periods where project_id = p_project order by seq limit 1;
  if v_period is null then
    v_period := public.create_period(p_project, coalesce(p.work_start, current_date), 1);
  end if;
  perform public.notify_user(p.admin_id, 'project.launched', 'Проект запущен', p.name, 'project', p_project::text, 'high', 'launch:' || p_project);
  return v_period;
end $$;

-- ───────────── 4. Задачи: статус — только через task_transition ─────────────
create or replace function public.tasks_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user not in ('authenticated','anon') then return new; end if;
  if tg_op = 'INSERT' then
    if new.status is distinct from 'todo' or new.completed_at is not null then
      raise exception 'Новая задача создаётся в статусе «К выполнению»';
    end if;
  elsif new.status is distinct from old.status or new.completed_at is distinct from old.completed_at then
    raise exception 'Статус задачи меняется только через кнопки задачи';
  end if;
  return new;
end $$;
create trigger tasks_guard_trg before insert or update on public.tasks for each row execute function public.tasks_guard();

-- Вернуть в работу сделанную или отменённую задачу может только автор, руководитель или проверяющий.
create or replace function public.task_transition(p_id uuid, p_to public.task_status, p_note text default null, p_result text default null)
returns void language plpgsql security definer set search_path = public as $$
declare t public.tasks; is_mgr boolean;
begin
  select * into t from public.tasks where id = p_id for update;
  if not found then raise exception 'Задача не найдена'; end if;
  is_mgr := public.has_perm('tasks.manage') or (t.project_id is not null and public.can_manage_project(t.project_id)) or t.created_by = auth.uid();
  if not (is_mgr or t.assignee_id = auth.uid() or t.reviewer_id = auth.uid()) then raise exception 'Нет прав на задачу'; end if;
  if p_to = t.status then raise exception 'Задача уже в этом статусе'; end if;
  if t.status in ('done','cancelled') and not (is_mgr or coalesce(t.reviewer_id = auth.uid(), false)) then
    raise exception 'Закрытую задачу возвращает в работу автор, руководитель или проверяющий'; end if;
  if p_to = 'done' and t.reviewer_id is not null and t.reviewer_id <> auth.uid() and not is_mgr then
    raise exception 'Задачу с проверяющим закрывает проверяющий — отправьте на проверку'; end if;
  if p_to in ('review','done') and coalesce(p_result, t.result_url, t.result_note, '') = '' then
    raise exception 'Укажите результат работы'; end if;
  if p_to in ('revision','blocked','cancelled') and coalesce(trim(p_note),'') = '' then raise exception 'Укажите причину'; end if;
  update public.tasks set status = p_to, completed_at = case when p_to = 'done' then now() else null end,
     result_note = coalesce(p_result, result_note) where id = p_id;
  insert into public.task_history(task_id, actor_id, kind, data) values (p_id, auth.uid(), 'status', jsonb_build_object('from', t.status, 'to', p_to, 'note', p_note));
  if p_to = 'review' and t.reviewer_id is not null then
    perform public.notify_user(t.reviewer_id, 'task.review', 'Задача на проверку', t.title, 'task', p_id::text, 'normal', 'trev:' || p_id || ':' || now()::date);
  elsif p_to = 'revision' and t.assignee_id is not null then
    perform public.notify_user(t.assignee_id, 'task.revision', 'Задача возвращена', t.title || ': ' || left(p_note, 140), 'task', p_id::text, 'high', null);
  end if;
end $$;

-- ───────────── 5. Съёмки: проведена / отменена — через функции, время и проект не правятся напрямую ─────────────
create or replace function public.shoots_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user not in ('authenticated','anon') then return new; end if;
  if tg_op = 'INSERT' then
    if new.status is distinct from 'planned' or new.actual_start is not null or new.actual_end is not null then
      raise exception 'Новая съёмка создаётся запланированной';
    end if;
  elsif new.status is distinct from old.status or new.starts_at is distinct from old.starts_at
     or new.ends_at is distinct from old.ends_at or new.project_id is distinct from old.project_id
     or new.period_id is distinct from old.period_id or new.series_id is distinct from old.series_id
     or new.created_by is distinct from old.created_by or new.actual_start is distinct from old.actual_start
     or new.actual_end is distinct from old.actual_end or new.sources_url is distinct from old.sources_url
     or new.cancel_reason is distinct from old.cancel_reason then
    raise exception 'Время, статус и итог съёмки меняются только кнопками съёмки';
  end if;
  return new;
end $$;
create trigger shoots_guard_trg before insert or update on public.shoots for each row execute function public.shoots_guard();

-- «Съёмка проведена»: мобилограф-участник или руководитель. Ссылка на исходники обязательна.
create or replace function public.shoot_complete(p_shoot uuid, p_actual_start timestamptz, p_actual_end timestamptz, p_sources_url text)
returns void language plpgsql security definer set search_path = public as $$
declare s public.shoots;
begin
  select * into s from public.shoots where id = p_shoot for update;
  if not found then raise exception 'Съёмка не найдена'; end if;
  if not (public.has_perm('shoots.manage') or public.can_manage_project(s.project_id)
          or public.is_shoot_participant(p_shoot, 'mobilographer')) then
    raise exception 'Отметить съёмку может мобилограф съёмки или руководитель'; end if;
  if s.status <> 'planned' then raise exception 'Съёмка уже отмечена'; end if;
  if coalesce(trim(p_sources_url), '') = '' then raise exception 'Прикрепите ссылку на исходники'; end if;
  if p_actual_start is not null and p_actual_end is not null and p_actual_end <= p_actual_start then
    raise exception 'Окончание должно быть позже начала'; end if;
  update public.shoots set status = 'done', actual_start = coalesce(p_actual_start, s.starts_at),
     actual_end = coalesce(p_actual_end, s.ends_at), sources_url = trim(p_sources_url) where id = p_shoot;
  insert into public.shoot_history(shoot_id, actor_id, kind, data)
  values (p_shoot, auth.uid(), 'complete', jsonb_build_object('actual_start', p_actual_start, 'actual_end', p_actual_end, 'sources_url', trim(p_sources_url)));
  insert into public.comments(entity_type, entity_id, author_id, body)
  values ('shoot', p_shoot, auth.uid(), 'Съёмка проведена. Исходники: ' || trim(p_sources_url));
end $$;

-- Отмена съёмки: руководитель или директор по планированию проекта, с причиной.
create or replace function public.shoot_cancel(p_shoot uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare s public.shoots; r record;
begin
  select * into s from public.shoots where id = p_shoot for update;
  if not found then raise exception 'Съёмка не найдена'; end if;
  if not (public.has_perm('shoots.manage') or public.can_manage_project(s.project_id)
          or exists (select 1 from public.projects where id = s.project_id and planning_director_id = auth.uid())) then
    raise exception 'Отменить съёмку может руководитель или директор по планированию'; end if;
  if s.status <> 'planned' then raise exception 'Отменить можно только запланированную съёмку'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Укажите причину отмены'; end if;
  update public.shoots set status = 'cancelled', cancel_reason = trim(p_reason) where id = p_shoot;
  insert into public.shoot_history(shoot_id, actor_id, kind, data) values (p_shoot, auth.uid(), 'cancel', jsonb_build_object('reason', trim(p_reason)));
  for r in select user_id from public.shoot_participants where shoot_id = p_shoot and user_id <> auth.uid() loop
    perform public.notify_user(r.user_id, 'shoot.cancelled', 'Съёмка отменена', s.title || ': ' || trim(p_reason), 'shoot', p_shoot::text, 'high', 'shc:' || p_shoot || ':' || r.user_id);
  end loop;
end $$;
revoke execute on function public.shoot_complete(uuid, timestamptz, timestamptz, text) from public, anon;
revoke execute on function public.shoot_cancel(uuid, text) from public, anon;
grant execute on function public.shoot_complete(uuid, timestamptz, timestamptz, text) to authenticated;
grant execute on function public.shoot_cancel(uuid, text) to authenticated;

-- Проверка записи при обновлении съёмки: та же область, что и для чтения строки (было with check (true)).
alter policy shoots_update on public.shoots
  with check (public.has_perm('shoots.manage') or public.can_manage_project(project_id)
    or exists (select 1 from public.projects p where p.id = project_id and auth.uid() in (p.planning_director_id, p.creative_director_id))
    or public.is_shoot_participant(id, 'mobilographer'));

-- ───────────── 6. Роли и права: изменение записи запрещено (только добавление и удаление) ─────────────
-- Раньше защита срабатывала только на INSERT/DELETE, а UPDATE мог «переписать» роль, например в owner.
create or replace function public.access_rows_no_update()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user in ('authenticated','anon') then
    raise exception 'Роль или право нельзя изменить — снимите и назначьте заново';
  end if;
  return new;
end $$;
create trigger user_roles_no_update before update on public.user_roles for each row execute function public.access_rows_no_update();
create trigger user_permissions_no_update before update on public.user_permissions for each row execute function public.access_rows_no_update();
create trigger role_permissions_no_update before update on public.role_permissions for each row execute function public.access_rows_no_update();

-- Служебные функции триггеров не вызываются через API.
revoke execute on function public.projects_guard() from public, anon, authenticated;
revoke execute on function public.tasks_guard() from public, anon, authenticated;
revoke execute on function public.shoots_guard() from public, anon, authenticated;
revoke execute on function public.access_rows_no_update() from public, anon, authenticated;
revoke execute on function public.content_guard() from public, anon, authenticated;
