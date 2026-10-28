-- Цитадель · 0006 · фоновые напоминания (pg_cron), каждые 15 минут
create extension if not exists pg_cron;
select cron.schedule('citadel-reminders', '*/15 * * * *', $$select public.run_reminders();$$);
