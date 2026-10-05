-- supabase/migrations/0006_trial_ends_on_pro.sql
-- The 3 trial Pulse Briefs are a taste of Pro: subscribing to Pro ends them, so a Pro account shows its 20 a month,
-- not 23. Re-runnable. Run it in the Supabase SQL editor after 0005.

create or replace function public.grant_plan(p_user uuid, p_tier text, p_months integer) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if p_tier not in ('plus', 'pro') or p_months < 1 or p_months > 24 then raise exception 'bad grant'; end if;
  insert into public.plans as x (owner_id, tier, period_start, period_end) values (p_user, p_tier, now(), now() + make_interval(months => p_months))
    on conflict (owner_id) do update set
      period_start = case when x.tier = excluded.tier and x.period_end > now() then x.period_start else now() end,
      period_end = case when x.tier = excluded.tier and x.period_end > now() then x.period_end + make_interval(months => p_months) else excluded.period_end end,
      tier = excluded.tier;
  perform public._ensure_credits(p_user);
  if p_tier = 'pro' then update public.credits set trial_briefs = 0 where owner_id = p_user; end if;
  return public._balance(p_user);
end $$;
revoke execute on function public.grant_plan(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.grant_plan(uuid, text, integer) to service_role;

-- Accounts already on Pro when this runs.
update public.credits c set trial_briefs = 0
  from public.plans p where p.owner_id = c.owner_id and p.tier = 'pro' and p.period_end > now() and c.trial_briefs > 0;
