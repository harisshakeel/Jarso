begin;
\ir _helpers.psql
select plan(27);

select tests.create_user('pa@example.com') as pa \gset
select tests.create_user('pb@example.com') as pb \gset
select tests.create_user('c1@example.com', 'child') as c1 \gset

select tests.authenticate_as(:'pb'::uuid);
select public.create_family('INR', 'Asia/Kolkata') as fb \gset

select tests.authenticate_as(:'pa'::uuid);
select public.create_family('GBP', 'UTC') as fa \gset
select public.register_child(:'c1'::uuid, :'fa'::uuid, 'Sam', '1234', true);
select tests.clear_auth();

-- Access
select tests.authenticate_as(:'c1'::uuid);
select throws_ok($$select public.set_money_rule(auth.uid(), 'spend_limit', 'week', 1000)$$, 'JA403', null, 'child cannot set a rule');
select throws_ok($$select public.set_allow_negative_spend(auth.uid(), true)$$, 'JA403', null, 'child cannot set overspend');
select tests.authenticate_as(:'pb'::uuid);
select throws_ok(format($$select public.set_money_rule(%L, 'spend_limit', 'week', 1000)$$, :'c1'), 'JA403', null, 'other family parent cannot set a rule');
select throws_ok(format($$select public.set_allow_negative_spend(%L, true)$$, :'c1'), 'JA403', null, 'other family parent cannot set overspend');
select tests.clear_auth();
set local role anon;
select throws_ok(format($$select public.set_money_rule(%L, 'spend_limit', 'week', 1000)$$, :'c1'), '42501', null, 'anon cannot set a rule');
reset role;

-- Rules
select tests.authenticate_as(:'pa'::uuid);
select public.set_money_rule(:'c1'::uuid, 'spend_limit', 'week', 1000);
select public.set_money_rule(:'c1'::uuid, 'spend_limit', 'month', 3000);
select is((select count(*) from public.money_rules where child_id = :'c1'::uuid), 2::bigint, 'two rules');
select is((select family_id from public.money_rules where period = 'week'), :'fa'::uuid, 'family derived from membership');

select public.set_money_rule(:'c1'::uuid, 'spend_limit', 'week', 500);
select is((select count(*) from public.money_rules where period = 'week'), 1::bigint, 'still one week row');
select is((select amount_minor from public.money_rules where period = 'week'), 500::bigint, 'week amount updated');

select public.set_money_rule(:'c1'::uuid, 'spend_limit', 'week', null);
select is((select count(*) from public.money_rules where period = 'week'), 0::bigint, 'null deletes the rule');
select lives_ok(format($$select public.set_money_rule(%L, 'spend_limit', 'week', null)$$, :'c1'), 'clearing a missing rule is fine');

select throws_ok(format($$select public.set_money_rule(%L, 'spend_limit', 'day', 100)$$, :'c1'), '22023', null, 'bad period');
select throws_ok(format($$select public.set_money_rule(%L, 'bogus', 'week', 100)$$, :'c1'), '22023', null, 'bad kind');
select throws_ok(format($$select public.set_money_rule(%L, 'spend_limit', 'week', 0)$$, :'c1'), '22023', null, 'zero amount');
select throws_ok(format($$select public.set_money_rule(%L, 'spend_limit', 'week', 100000000001)$$, :'c1'), '22023', null, 'amount over max');

-- Overspend setting
select is((select count(*) from public.child_settings), 0::bigint, 'no settings row until set');
select public.set_allow_negative_spend(:'c1'::uuid, true);
select is((select allow_negative_spend from public.child_settings where child_id = :'c1'::uuid), true, 'overspend allowed');
select public.set_allow_negative_spend(:'c1'::uuid, false);
select is((select allow_negative_spend from public.child_settings where child_id = :'c1'::uuid), false, 'overspend off again');

-- Audit
select is((select count(*) from public.audit_log where action = 'rule.set' and family_id = :'fa'::uuid), 3::bigint, 'rule.set audited');
select is((select count(*) from public.audit_log where action = 'rule.cleared' and family_id = :'fa'::uuid), 1::bigint, 'rule.cleared audited once');
select is((select count(*) from public.audit_log where action = 'settings.overspend' and family_id = :'fa'::uuid), 2::bigint, 'settings.overspend audited');

-- Child reads own
select tests.authenticate_as(:'c1'::uuid);
select is((select count(*) from public.money_rules), 1::bigint, 'child sees own rules');
select is((select count(*) from public.child_settings), 1::bigint, 'child sees own settings');
select tests.authenticate_as(:'pb'::uuid);
select is((select count(*) from public.money_rules), 0::bigint, 'other family sees none');
select tests.clear_auth();

-- Windows (internal)
select is(public.rule_window_start(:'fb'::uuid, 'week', '2026-11-01 19:00+00'), '2026-11-01 18:30+00'::timestamptz, 'IST week starts Monday 00:00');
select is(public.rule_window_start(:'fb'::uuid, 'week', '2026-11-01 18:00+00'), '2026-10-25 18:30+00'::timestamptz, 'IST Sunday before cutover is previous week');
select is(public.rule_window_start(:'fb'::uuid, 'month', '2026-10-31 19:00+00'), '2026-10-31 18:30+00'::timestamptz, 'IST month start');

select * from finish();
rollback;
