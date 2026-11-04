-- Интеграционный тест 0026: утечки и мелкие лазейки (docs/SECURITY_FIX_PLAN.md, этап 2).
-- Откатывается целиком; ожидается ERROR "TEST OK: {...}", при любой ошибке — "TEST FAILED: {...}".
do $$
declare
  o uuid := gen_random_uuid(); mgr uuid := gen_random_uuid(); sm uuid := gen_random_uuid();
  outsider uuid := gen_random_uuid(); seller uuid := gen_random_uuid();
  v_client uuid; v_project uuid; v_project2 uuid; v_period uuid; v_period2 uuid; v_story uuid; v_c uuid; v_c2 uuid; v_lead uuid;
  ok boolean; n0 int; n1 int; v_today date := (now() at time zone 'Asia/Bishkek')::date; res jsonb := '{}';
begin
  insert into auth.users(id, email, email_confirmed_at, aud, role) values
    (o, 'lk-own@citadel.test', now(), 'authenticated', 'authenticated'),
    (mgr, 'lk-mgr@citadel.test', now(), 'authenticated', 'authenticated'),
    (sm, 'lk-story@citadel.test', now(), 'authenticated', 'authenticated'),
    (outsider, 'lk-out@citadel.test', now(), 'authenticated', 'authenticated'),
    (seller, 'lk-sales@citadel.test', now(), 'authenticated', 'authenticated');
  perform set_config('citadel.bypass', 'on', true);
  update public.profiles set status = 'active', full_name = 'Тест 0026' where id in (o, mgr, sm, outsider, seller);
  update public.profiles set birth_date = make_date(1995, extract(month from v_today)::int, extract(day from v_today)::int) where id = sm;
  insert into public.user_roles(user_id, role_code) values
    (o, 'owner'), (mgr, 'project_admin'), (sm, 'storymaker'), (outsider, 'mobilographer'), (seller, 'sales');
  perform set_config('citadel.bypass', 'off', true);

  insert into public.clients(company_name, contact_name, phone, created_by) values ('Тест 0026', 'Нурлан', '+996555002600', o) returning id into v_client;
  insert into public.projects(name, client_id, kind, status, admin_id, stories_method, created_by)
  values ('Тест 0026', v_client, 'monthly', 'in_progress', mgr, 'fixed_per_period', o) returning id into v_project;
  insert into public.projects(name, client_id, kind, status, stories_method, created_by)
  values ('Тест 0026 чужой', v_client, 'monthly', 'in_progress', 'fixed_per_period', o) returning id into v_project2;
  insert into public.project_members(project_id, user_id, role) values (v_project, sm, 'executor');
  insert into public.project_periods(project_id, seq, label, starts_on, ends_on) values (v_project, 1, 'тест', v_today, v_today + 30) returning id into v_period;
  insert into public.project_periods(project_id, seq, label, starts_on, ends_on) values (v_project2, 1, 'тест', v_today, v_today + 30) returning id into v_period2;
  insert into public.story_daily_plans(project_id, period_id, day, planned, assignee_id) values (v_project, v_period, v_today, 4, sm) returning id into v_story;
  insert into public.content_items(project_id, period_id, kind, title, assignee_id) values (v_project, v_period, 'video', 'Рилс 0026', sm) returning id into v_c;
  insert into public.content_items(project_id, period_id, kind, title) values (v_project2, v_period2, 'video', 'Чужой рилс') returning id into v_c2;
  insert into public.leads(name, phone, consent, assignee_id) values ('Клиент 0026', '+996555002601', true, seller) returning id into v_lead;

  -- ───── A. сторис ─────
  perform set_config('request.jwt.claims', json_build_object('sub', sm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update public.story_daily_plans set actual = 3, shortfall_reason = 'клиент не прислал фото' where id = v_story;
  begin update public.story_daily_plans set planned = 3 where id = v_story; ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('a_storymaker_cannot_change_plan', ok);
  begin update public.story_daily_plans set confirmed_at = now(), confirmed_by = sm where id = v_story; ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('a_storymaker_cannot_self_confirm', ok);
  reset role;
  res := res || jsonb_build_object('a_storymaker_marks_actual', (select actual from public.story_daily_plans where id = v_story) = 3);
  perform set_config('request.jwt.claims', json_build_object('sub', mgr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update public.story_daily_plans set confirmed_at = now(), confirmed_by = mgr where id = v_story;
  reset role;
  res := res || jsonb_build_object('a_manager_confirms', (select confirmed_by from public.story_daily_plans where id = v_story) = mgr);

  -- ───── B. комментарии ─────
  perform set_config('request.jwt.claims', json_build_object('sub', outsider, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin insert into public.comments(entity_type, entity_id, project_id, author_id, body) values ('content', v_c, v_project, outsider, 'спам'); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('b_outsider_cannot_comment', ok);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', sm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.comments(entity_type, entity_id, project_id, author_id, body) values ('content', v_c, v_project, sm, 'готово к вечеру');
  begin insert into public.comments(entity_type, entity_id, project_id, author_id, body) values ('content', v_c2, v_project, sm, 'подмена'); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('b_cannot_attach_to_foreign_object', ok);
  begin insert into public.comments(entity_type, entity_id, project_id, author_id, body) values ('content', v_c, null, sm, 'без проекта'); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('b_project_required', ok);
  reset role;
  res := res || jsonb_build_object('b_member_comments', exists (select 1 from public.comments where entity_id = v_c and author_id = sm));

  -- ───── C. заявки ─────
  perform set_config('request.jwt.claims', json_build_object('sub', seller, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin update public.leads set stage = 'won' where id = v_lead; ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('c_seller_cannot_set_stage_directly', ok);
  update public.leads set next_action = 'перезвонить' where id = v_lead;
  reset role;
  perform public.lead_set_stage(v_lead, 'contacted');
  res := res || jsonb_build_object('c_seller_edits_details', (select next_action from public.leads where id = v_lead) = 'перезвонить',
    'c_stage_via_function', (select stage::text from public.leads where id = v_lead) = 'contacted');

  -- ───── D. таймер писем ─────
  select count(*) into n0 from public.mail_sends;
  perform set_config('request.jwt.claims', '', true);
  if not exists (select 1 from auth.users where confirmation_sent_at > now() - interval '2 minutes') then
    set local role anon;
    perform public.mail_quota_note('signup');
    reset role;
    select count(*) into n1 from public.mail_sends;
    res := res || jsonb_build_object('d_fake_note_ignored', n1 = n0);
  else
    res := res || jsonb_build_object('d_fake_note_ignored', true); -- реальное письмо только что ушло — проверка неприменима
  end if;
  update auth.users set confirmation_sent_at = now() where id = outsider;
  perform public.mail_quota_note('signup');
  select count(*) into n1 from public.mail_sends;
  res := res || jsonb_build_object('d_real_note_counted', n1 >= n0 + 1);

  -- ───── E. дата рождения и черновики сайта ─────
  perform set_config('request.jwt.claims', json_build_object('sub', sm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  res := res || jsonb_build_object('e_own_birth_date', public.my_birth_date() = make_date(1995, extract(month from v_today)::int, extract(day from v_today)::int),
    'e_mood_birthday', (public.my_mood()->>'birthday')::boolean);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', outsider, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform (select birth_date from public.profiles where id = sm); ok := false; exception when others then ok := sqlerrm like '%permission denied%'; end;
  res := res || jsonb_build_object('e_colleague_cannot_read_birth_date', ok,
    'e_colleague_sees_name', (select full_name from public.profiles where id = sm) = 'Тест 0026',
    'e_birthday_card_still_works', exists (select 1 from public.birthdays_today() where id = sm));
  reset role;
  perform set_config('request.jwt.claims', '', true);
  set local role anon;
  begin perform (select draft from public.site_blocks limit 1); ok := false; exception when others then ok := sqlerrm like '%permission denied%'; end;
  res := res || jsonb_build_object('e_visitor_cannot_read_site_drafts', ok,
    'e_visitor_reads_published_site', (select count(*) from public.site_blocks where published is not null) > 0);
  reset role;

  if exists (select 1 from jsonb_each(res) where value <> 'true'::jsonb) then raise exception 'TEST FAILED: %', res; end if;
  raise exception 'TEST OK: %', res;
end $$;
