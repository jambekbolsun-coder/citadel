-- Цитадель · 0005 · справочники, матрица прав, тарифы, контент сайта, Storage, Realtime, Cron

-- ───────────── права ─────────────
insert into public.permissions(code, name, module, sensitive) values
 ('leads.view','Видеть свои/свободные заявки','Продажи',false),
 ('leads.receive','Получать уведомления о новых заявках','Продажи',false),
 ('leads.manage','Управлять всеми заявками','Продажи',false),
 ('clients.view','Видеть всех клиентов','Продажи',false),
 ('clients.manage','Создавать/редактировать клиентов','Продажи',false),
 ('tariffs.manage','Редактировать тарифы','Продажи',true),
 ('prices.view','Видеть коммерческие цены и договоры','Продажи',true),
 ('projects.view_all','Видеть все проекты','Производство',false),
 ('projects.create','Создавать проекты','Производство',false),
 ('projects.manage','Управлять всеми проектами','Производство',false),
 ('projects.launch_override','Запуск без 100% оплаты (с причиной)','Производство',true),
 ('content.plan','Формировать план контента','Производство',false),
 ('content.manage','Управлять всем контентом','Производство',false),
 ('content.publish','Публиковать материалы','Производство',false),
 ('tasks.view_all','Видеть все задачи','Производство',false),
 ('tasks.manage','Управлять задачами','Производство',false),
 ('shoots.manage','Планировать съёмки','Производство',false),
 ('calendar.view_all','Видеть календарь всей команды','Производство',false),
 ('campaigns.view_all','Видеть все рекламные кампании','Реклама',false),
 ('campaigns.manage','Создавать рекламные кампании','Реклама',false),
 ('credentials.manage','Добавлять доступы соцсетей','Безопасность',true),
 ('credentials.reveal','Просматривать доступы соцсетей','Безопасность',true),
 ('finance.view','Видеть финансы','Финансы',true),
 ('finance.manage','Управлять счетами и финансами','Финансы',true),
 ('payments.create','Вносить поступления','Финансы',true),
 ('payments.confirm','Подтверждать поступления','Финансы',true),
 ('expenses.create','Вносить расходы','Финансы',true),
 ('expenses.confirm','Подтверждать расходы','Финансы',true),
 ('payroll.view','Видеть зарплаты сотрудников','Зарплаты',true),
 ('payroll.manage','Начислять зарплаты и условия','Зарплаты',true),
 ('payroll.approve','Утверждать начисления','Зарплаты',true),
 ('payroll.pay','Регистрировать выплаты','Зарплаты',true),
 ('employees.view','Видеть сотрудников и профили','Команда',false),
 ('employees.invite','Приглашать сотрудников (QR)','Команда',false),
 ('employees.manage','Утверждать/блокировать сотрудников','Команда',true),
 ('roles.manage','Назначать роли и права','Команда',true),
 ('cms.manage','Редактировать публичный сайт','Сайт',false),
 ('reports.view','Видеть отчёты компании','Отчёты',false),
 ('audit.view','Журнал аудита','Безопасность',true);

insert into public.roles(code, name, is_system, sort) values
 ('owner','Владелец',true,1),('manager','Управляющий',true,2),('accountant','Бухгалтер',false,3),
 ('department_head','Руководитель отдела',false,4),('sales','Менеджер продаж',false,5),('project_admin','Администратор проекта',false,6),
 ('project_manager','Проект-менеджер',false,7),('planning_director','Директор по планированию',false,8),
 ('creative_director','Креативный директор',false,9),('mobilographer','Мобилограф',false,10),('editor','Монтажёр',false,11),
 ('storymaker','Сторисмейкер',false,12),('designer','Дизайнер',false,13),('targetologist','Таргетолог',false,14),
 ('ambassador','Амбассадор',false,15),('publisher','Контент-менеджер / публикатор',false,16);

insert into public.role_permissions(role_code, permission_code)
select r, p from (values
 ('manager', array['leads.view','leads.receive','leads.manage','clients.view','clients.manage','projects.view_all','projects.create','projects.manage',
   'content.plan','content.manage','content.publish','tasks.view_all','tasks.manage','shoots.manage','calendar.view_all','campaigns.view_all',
   'employees.view','employees.invite','reports.view','prices.view','payments.create']),
 ('accountant', array['finance.view','finance.manage','payments.create','payments.confirm','expenses.create','expenses.confirm',
   'payroll.view','payroll.manage','payroll.pay','prices.view','reports.view','clients.view','projects.view_all']),
 ('department_head', array['employees.view','tasks.view_all','calendar.view_all','reports.view']),
 ('sales', array['leads.view','leads.receive','clients.manage','prices.view','projects.create','payments.create']),
 ('project_admin', array['content.publish','tasks.manage']),
 ('project_manager', array['projects.create','content.plan','content.manage','tasks.manage','shoots.manage','calendar.view_all']),
 ('planning_director', array['shoots.manage','content.plan','calendar.view_all','projects.view_all']),
 ('creative_director', array['content.plan','content.manage','projects.view_all','calendar.view_all']),
 ('publisher', array['content.publish']),
 ('targetologist', array['campaigns.manage'])
) as m(r, ps), unnest(ps) as p;

-- ───────────── справочники ─────────────
insert into public.departments(name) values ('Продажи'),('Производство'),('Креатив'),('Реклама'),('Финансы'),('Управление');

insert into public.app_settings(key, value, label) values
 ('work_days','[1,2,3,4,5]','Рабочие дни недели (ISO: 1=Пн)'),
 ('lead_sla_minutes','15','SLA взятия заявки, мин'),
 ('invite_ttl_hours','72','Срок действия QR-приглашения, ч'),
 ('review_hours','24','Срок проверки материала, ч'),
 ('payroll_notify_days','3','Уведомлять о выплате за N дней'),
 ('company_name','SMM KADR','Название компании');

-- Нормативы не выдумываем: значения пустые до утверждения владельцем
insert into public.capacity_rules(key, label, value, unit) values
 ('script_hours','Подготовка сценария',null,'ч/видео'),
 ('shoot_hours','Длительность выезда',null,'ч'),
 ('videos_per_shoot','Видео за одну съёмку',null,'шт'),
 ('edit_hours','Монтаж одного видео',null,'ч'),
 ('design_hours','Дизайн поста/карусели',null,'ч'),
 ('story_minutes','Подготовка одного кадра сторис',null,'мин'),
 ('shift_hours','Рабочая смена',null,'ч/день');

insert into public.financial_accounts(name, kind) values ('Касса (наличные)','cash'),('Расчётный счёт','bank');

insert into public.expense_categories(name, sort) values
 ('Аренда',1),('Офис и коммунальные',2),('Еда и встречи',3),('Транспорт',4),('Техника',5),('Мебель',6),('Подписки и сервисы',7),
 ('Подрядчики',8),('Командировки',9),('Налоги и сборы',10),('Реклама агентства',11),('Прочее',99);

-- ───────────── тарифы (стартовый справочник, редактируемый) ─────────────
with t as (
  insert into public.tariffs(code, name, sort) values
   ('one_time_launch','Разовый запуск',1),('startup','Стартап',2),('pro','Про',3),('pro_max','Про Макс',4),
   ('ultra','Ультра',5),('yearly','Годовая подписка',6),('construction','Строительные компании',7)
  returning id, code)
insert into public.tariff_versions(tariff_id, version, price_minor, period_type, period_months, composition, stories_method, description, notes)
select t.id, 1, v.price * 100, v.ptype, v.months, v.comp::jsonb, v.sm, v.descr, v.notes
from t join (values
 ('one_time_launch', 10500, 'one_time', 1, '{"video":1,"ad_creative":1}', null, '1 видео для таргета + сценарий + настройка рекламы, без амбассадора', null),
 ('startup', 15500, 'one_time', 1, '{"video":2,"post":2}', null, '2 видео + сценарии/таргет + оформление + дизайн + 2 поста', null),
 ('pro', 43999, 'monthly', 1, '{"video":5}', null, '5 видео в месяц, без сторис', null),
 ('pro_max', 60000, 'monthly', 1, '{"video":8,"story":120}', 'fixed_per_period', '8 видео + 120 сторис в месяц', 'Метод сторис уточняется в договоре'),
 ('ultra', 80000, 'monthly', 1, '{"video":10,"story":120}', 'fixed_per_period', '10 видео + 120 сторис в месяц', 'Метод сторис уточняется в договоре'),
 ('yearly', 300000, 'yearly', 12, '{"video":10,"story":120}', 'fixed_per_period', '120 видео + 1 440 сторис в год; единая предоплата', 'Состав на месяц: 10 видео + 120 сторис'),
 ('construction', 500000, 'yearly', 12, '{"video":8,"story":120}', 'fixed_per_period', '8 видео в месяц (2 продакшн + 6 мобильных), 120 сторис в месяц', 'Ролики с дроном: входят ли в 8 видео — указывается в договоре')
) as v(code, price, ptype, months, comp, sm, descr, notes) on v.code = t.code;

-- ───────────── контент сайта (черновик = опубликовано на старте) ─────────────
insert into public.site_settings(id) values (1);
insert into public.site_blocks(key, type, sort, draft) values
 ('hero','hero',1,'{"eyebrow":"SMM-агентство · Бишкек","title":"Контент, который продаёт","subtitle":"Стратегия, съёмка Reels и сторис, дизайн и таргет — одной командой, по графику и с отчётностью.","cta":"Оставить заявку","secondary":"Смотреть тарифы"}'),
 ('benefits','benefits',2,'{"title":"Почему KADR","items":[{"title":"Один договор — один план","text":"Объём видео, сторис и публикаций фиксируется в договоре и выполняется по календарю."},{"title":"Своя продакшн-команда","text":"Мобилографы, монтажёры, дизайнеры и амбассадоры работают в связке."},{"title":"Прозрачная отчётность","text":"Вы видите, что подготовлено, опубликовано и что в работе."},{"title":"Реклама с контролем","text":"Таргетолог ведёт кампании и регулярно проверяет показатели."}]}'),
 ('services','services',3,'{"title":"Услуги","items":[{"title":"SMM под ключ","text":"Контент-план, сценарии, съёмка, монтаж, публикации и сторис."},{"title":"Таргетированная реклама","text":"Настройка и ведение рекламы в Meta, работа с заявками."},{"title":"Продакшн","text":"Reels, рекламные ролики, съёмки с амбассадором и дроном."},{"title":"Стратегия","text":"Анализ ниши, позиционирование и контентная стратегия."}]}'),
 ('tariffs','tariffs',4,'{"title":"Тарифы","subtitle":"Цены из актуального прайса. Индивидуальные условия — по запросу."}'),
 ('cases','cases',5,'{"title":"Кейсы","items":[]}'),
 ('team','team',6,'{"title":"О компании","text":"SMM KADR — команда маркетологов, сценаристов, мобилографов и дизайнеров из Бишкека. Работаем с бизнесом, которому важен системный контент и измеримый результат."}'),
 ('faq','faq',7,'{"title":"Вопросы и ответы","items":[{"q":"Когда начинается работа?","a":"После подписания договора и 100% оплаты — команда формирует план и начинает производство."},{"q":"Можно ли изменить тариф?","a":"Да, изменения оформляются поправкой к договору; уже согласованный объём не теряется."},{"q":"Как я увижу результат?","a":"Ежемесячно вы получаете отчёт: сколько материалов подготовлено и опубликовано."}]}'),
 ('contacts','contacts',8,'{"title":"Контакты","text":"Оставьте заявку — менеджер свяжется с вами в рабочее время."}');
update public.site_blocks set published = draft, published_at = now() where true;

-- ───────────── Storage ─────────────
insert into storage.buckets(id, name, public, file_size_limit) values
 ('avatars','avatars',true, 5242880),
 ('files','files',false, 524288000),
 ('finance','finance',false, 20971520),
 ('site','site',true, 10485760)
on conflict (id) do nothing;

create policy avatars_read on storage.objects for select using (bucket_id = 'avatars');
create policy avatars_write on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy avatars_update on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy site_read on storage.objects for select using (bucket_id = 'site');
create policy site_write on storage.objects for insert to authenticated with check (bucket_id = 'site' and public.has_perm('cms.manage'));
-- files: projects/<project_id>/...
create policy files_read on storage.objects for select to authenticated
  using (bucket_id = 'files' and (storage.foldername(name))[1] = 'projects' and public.can_view_project(((storage.foldername(name))[2])::uuid));
create policy files_write on storage.objects for insert to authenticated
  with check (bucket_id = 'files' and (storage.foldername(name))[1] = 'projects'
    and (public.is_project_member(((storage.foldername(name))[2])::uuid) or public.can_manage_project(((storage.foldername(name))[2])::uuid)));
create policy finance_read on storage.objects for select to authenticated using (bucket_id = 'finance' and public.has_perm('finance.view'));
create policy finance_write on storage.objects for insert to authenticated
  with check (bucket_id = 'finance' and (public.has_perm('expenses.create') or public.has_perm('payments.create')));

-- ───────────── Realtime ─────────────
alter publication supabase_realtime add table public.notifications;
alter publication supabase_realtime add table public.leads;
