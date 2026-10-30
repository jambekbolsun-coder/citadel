# Схема БД (Supabase project ref `cdnveemxxgghhvrydtid`)

Миграции: `supabase/migrations/0001…0017`. Все таблицы — UUID/identity PK, `created_at`, RLS включён везде.

| Область | Таблицы |
|---|---|
| Персонал и доступ | profiles, departments, roles, permissions, role_permissions, user_roles, user_permissions, employee_invites, device_pins, audit_log |
| Уведомления | notifications (идемпотентный ключ на пользователя; push_status pending → sending → sent/failed/skipped), event_outbox, push_subscriptions |
| Повторы | recurrence_series (правило + описание); tasks.series_id, shoots.series_id |
| Сайт и продажи | site_blocks, site_versions, site_settings, tariffs, tariff_versions, clients, leads, lead_events |
| Производство | projects, project_members, project_contracts, project_amendments, project_status_history, project_periods, plan_items, content_items, content_history, placements, story_daily_plans, tasks, task_history, shoots, shoot_participants, shoot_history, campaigns, campaign_creatives, campaign_spend_entries, ad_status_history, ad_budget_history, ad_change_log, campaign_metrics (устар., только чтение), project_secrets, secret_access_log, project_admin_checks, calendar_events, capacity_rules, attachments, comments |
| Финансы | app_settings, financial_accounts, money_transactions, invoices, payments, expense_categories, expenses, asset_register, salary_terms, payroll_accruals, payroll_adjustments, salary_payments, export_history |

## Представления (security_invoker)
- `v_period_progress` — план-факт по периоду и виду: planned, in_work, in_post, prepared (= done+published), published, verified, left_to_prepare = max(0, план−подготовлено), left_to_publish, overflow, overdue (исполнитель: не «на проверке» и не «на паузе»), overdue_review (просрочена проверка, 0016). Сторис — по кадрам из `story_daily_plans`; съёмки — по проведённым.
- `v_invoice_status` — paid_minor только из подтверждённых платежей минус возвраты; pay_state unpaid/partial/paid/overdue/void.
- `v_payroll_balance` — по сотруднику и **валюте**: утверждённые начисления + корректировки к утверждённым начислениям − все выплаты (аванс, зарплата, бонус, зачёт). Черновики не входят (0015).
- `v_account_balances` — opening + inflow − outflow по каждому счёту (сверка).

## Ключевые функции (RPC)
- SMM KADR (0018): `normalize_phone(text)` (+996 / международный, ошибка — понятный текст), `phone_key(text)` (последние 9 цифр; вычисляемая колонка `clients.phone_key` с индексом), `client_lookup(q)` (поиск для мастера), `project_wizard_create(p jsonb)` — клиент (новый/выбранный, без дублей) + проект `draft` + договор со снимком тарифа + команда + счета + заявленный платёж `pending` + связь с заявкой, одна транзакция, ключ `projects.idempotency_key`. Новые колонки: `clients.whatsapp`, `clients.phone_key`, `projects.niche`, `projects.idempotency_key`. `submit_lead` принимает `tariff_code` → `leads.tariff_id`; `lead_convert` ищет клиента по `phone_key`.
- Сайт (0019): `site_blocks.type` += `slide` (схема секции — `src/lib/site-model.ts`, контент по умолчанию — `src/lib/site-defaults.json`), триггеры аудита `site_blocks_audit`, `site_settings_audit`, политика `site_update` для bucket `site`.
- Реклама (0014): `campaign_set_status`, `creative_set_status` (дата действия, причина для паузы/выключения, история), `ad_set_daily_budget` (с даты, без пересчёта прошлого), `ad_spend_add` (идемпотентный ключ; `p_from_unallocated` — распределение общего расхода дня по видео без удвоения), `ad_spend_correct` (исправление/аннулирование с причиной), `ad_check_reminders` (cron `citadel-ad-checks`, 04:00 UTC). Проверки прав: `campaign_can_view`, `campaign_can_edit`, `is_ad_member`.
- Сотрудники (0013): `employee_set_status(id, active|blocked, reason)` — право `employees.manage`, ровно одна строка, идемпотентно, уведомление `employee.approved`, при блокировке — сброс `device_pins` и сеансов, задача offboarding.
- `web_vitals` + `web_vitals_summary(days)` — обезличенные замеры скорости (без user_id и параметров адреса), читает `reports.view`, очистка cron через 30 дней; миграция 0012.
- `calendar_year_summary(from, to, project, person)` — счётчики календаря по месяцам (security invoker, учитывает RLS), миграция 0011. Там же индексы под фильтры мобильных экранов.
`claim_first_owner`, `create_invite`/`reissue_invite`/`revoke_invite`/`invite_preview`/`accept_invite`, `set_device_pin`/`verify_device_pin`, `submit_lead`, `lead_take`/`lead_set_stage`/`lead_convert`/`lead_mark_opened`, `new_tariff_version`, `publish_site`/`restore_site_version`, `project_set_status`, `launch_project`, `create_period`, `generate_period_plan`, `approve_period_plan`, `close_period`, `content_assign`, `content_transition`, `task_transition`, `task_reschedule`, `shoot_set_participant` (проверка конфликтов), `shoot_respond`, `shoot_reschedule`, `secret_create`/`secret_reveal`/`secret_delete` (Vault + свежий вход), `payment_confirm`/`payment_reject`, `expense_confirm`/`expense_cancel`, `payroll_compute`/`payroll_approve`/`salary_pay`, `run_reminders` (cron), `content_reschedule`, `series_cancel`, Web Push: `push_subscribe`/`push_public_key`/`push_test` (пользователь), `push_config`/`push_init_vapid`/`push_claim`/`push_result` (только service_role — edge-функция), `push_kick` (pg_net, триггер на notifications + cron раз в минуту).

## Защитные триггеры
- `profiles_guard` — сотрудник не меняет себе статус/отдел/должность; нельзя заблокировать единственного владельца.
- `user_roles_guard` — owner назначает только owner; нельзя снять последнего owner; аудит.
- `content_guard` — статус/исполнитель материала только через RPC.
- `payments_guard`, `expenses_guard`, `accruals_guard` — подтверждённые записи неизменяемы.
- `tasks_notify_assign`, `payments_notify` — уведомления.
- `campaigns_guard`, `creatives_guard` — статус и дневной бюджет только через RPC (с историей), прочие правки пишутся в `ad_change_log`; `campaigns_after` назначает таргетолога участником проекта.
- `spend_guard` — журнал расходов рекламы неизменяем (кроме пометки «заменено» внутри RPC); удаление — только каскадом вместе с кампанией.
- `money_tx_currency_guard` — движение по кассе только в валюте кассы; `payments_currency_guard` — платёж в валюте счёта (0015).
