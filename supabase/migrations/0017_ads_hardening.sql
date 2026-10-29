-- 0017. Замечания Supabase Advisors к 0014–0015: фиксированный search_path и закрытые от anon проверки прав.
alter function public.bishkek_today() set search_path = public;
alter function public.spend_guard() set search_path = public;
alter function public.money_tx_currency_guard() set search_path = public;
alter function public.payments_currency_guard() set search_path = public;

revoke execute on function public.campaign_can_view(uuid) from public, anon;
revoke execute on function public.campaign_can_edit(uuid) from public, anon;
revoke execute on function public.is_ad_member(uuid) from public, anon;
grant execute on function public.campaign_can_view(uuid) to authenticated;
grant execute on function public.campaign_can_edit(uuid) to authenticated;
grant execute on function public.is_ad_member(uuid) to authenticated;
revoke execute on function public.spend_guard() from public, anon, authenticated;
revoke execute on function public.money_tx_currency_guard() from public, anon, authenticated;
revoke execute on function public.payments_currency_guard() from public, anon, authenticated;
