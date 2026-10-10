-- supabase/migrations/0011_unlimited_fair_use.sql
-- Run once, by hand, in the Supabase project's SQL Editor, after 0010. Safe to run again.
--
-- Unlimited's fair use, decided 2026-10-10 after the reading test (B1 in docs/LAUNCH-CHECKLIST.md): up to 200 reads a day
-- (the daily brake, unchanged since 0007) and now 3,000 a month (it was effectively uncapped at 1,000,000). At about ₹0.114
-- a card a heavy user costs about ₹342 a month against about ₹679 kept from ₹799. Past 3,000, pack cards are used, then
-- photos wait for the next month as on every other plan. Every other number is as in 0007 (shared/plans.ts).

create or replace function public._allow(p_tier text, out v_cards integer, out v_briefs integer)
language plpgsql immutable as $$
begin
  v_cards := case p_tier when 'unlimited' then 3000 when 'pro' then 400 when 'plus' then 250 when 'starter' then 100 else 20 end;
  v_briefs := case p_tier when 'unlimited' then 30 when 'pro' then 20 when 'plus' then 5 when 'starter' then 3 else 0 end;
end $$;
