-- 0016. План-факт: просрочка исполнителя отдельно от просрочки проверяющего; сторис — согласованный остаток.
--  • overdue — только материалы на стороне исполнителя (не «на проверке» и не «на паузе») с истёкшим сроком подготовки;
--  • overdue_review (новая колонка) — материалы «на проверке» с истёкшим сроком проверки руководителя;
--  • сторис: «готово» считалось как сумма min(факт, план дня), а «осталось» — как план − сумма факта;
--    перевыполнение одного дня скрывало недостачу другого (7/10 и «осталось 0»). Теперь обе цифры по одной формуле.
-- План по-прежнему берётся из plan_items и не уменьшается удалением/отменой материалов.

create or replace view public.v_period_progress with (security_invoker = true) as
select pi.period_id, pi.project_id, pi.kind, pi.planned_qty as planned,
  count(c.id) filter (where c.status in ('in_progress','ready_to_shoot','shot','processing')) as in_work,
  count(c.id) filter (where c.status in ('editing','design','review','revision')) as in_post,
  count(c.id) filter (where c.status in ('done','published')) as prepared,
  count(c.id) filter (where c.status = 'published') as published,
  count(c.id) filter (where c.status = 'published' and exists (select 1 from public.placements pl where pl.content_id = c.id and pl.checked_at is not null)) as verified,
  greatest(0, pi.planned_qty - count(c.id) filter (where c.status in ('done','published'))) as left_to_prepare,
  greatest(0, pi.planned_qty - count(c.id) filter (where c.status = 'published')) as left_to_publish,
  greatest(0, count(c.id) filter (where c.status in ('done','published')) - pi.planned_qty) as overflow,
  count(c.id) filter (where c.status not in ('done','published','cancelled','review','paused') and c.prep_due < now()) as overdue,
  count(c.id) filter (where c.status = 'review' and c.review_due < now()) as overdue_review
from public.plan_items pi
left join public.content_items c on c.plan_item_id = pi.id and c.status <> 'cancelled'
where pi.kind not in ('story','shoot')
group by pi.id
union all
select pi.period_id, pi.project_id, pi.kind, pi.planned_qty,
  0, 0, coalesce(sum(least(s.actual, s.planned)),0)::bigint, coalesce(sum(s.actual) filter (where s.confirmed_at is not null),0)::bigint,
  coalesce(sum(s.actual) filter (where s.confirmed_at is not null),0)::bigint,
  greatest(0, pi.planned_qty - coalesce(sum(least(s.actual, s.planned)),0))::bigint,
  greatest(0, pi.planned_qty - coalesce(sum(s.actual) filter (where s.confirmed_at is not null),0))::bigint,
  greatest(0, coalesce(sum(s.actual),0) - pi.planned_qty)::bigint,
  count(s.id) filter (where s.day < current_date and s.actual < s.planned),
  0::bigint
from public.plan_items pi
left join public.story_daily_plans s on s.period_id = pi.period_id
where pi.kind = 'story'
group by pi.id
union all
select pi.period_id, pi.project_id, pi.kind, pi.planned_qty, 0, 0,
  count(sh.id) filter (where sh.status = 'done'), count(sh.id) filter (where sh.status = 'done'), count(sh.id) filter (where sh.status = 'done'),
  greatest(0, pi.planned_qty - count(sh.id) filter (where sh.status = 'done')), 0,
  greatest(0, count(sh.id) filter (where sh.status = 'done') - pi.planned_qty), 0,
  0::bigint
from public.plan_items pi
left join public.shoots sh on sh.period_id = pi.period_id
where pi.kind = 'shoot'
group by pi.id;
