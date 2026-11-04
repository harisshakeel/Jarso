begin;
\ir _helpers.psql
select plan(5);

-- In-app card payments (spec 2026-11-03-mobile-wave-3-design §4): a manual payment paid in the
-- phone's native sheet. Only manual payments can be in-app, and an in-app one has no hosted page.

select tests.create_user('pa@example.com') as pa \gset
select tests.create_user('c1@example.com', 'child') as c1 \gset

select tests.authenticate_as(:'pa'::uuid);
select public.create_family('GBP', 'UTC') as fa \gset
select public.register_child(:'c1'::uuid, :'fa'::uuid, 'Sam', '1234', true);
select tests.clear_auth();

select has_column('public', 'payments', 'in_app', 'payments has in_app');
select col_default_is('public', 'payments', 'in_app', 'false', 'in_app defaults to false');

set local role service_role;

select throws_ok(
  format($$insert into public.payments (family_id, child_id, payer_id, provider, source_type, source_id,
             amount_minor, currency, cash_minor, saved_minor, trigger, in_app)
           values (%L, %L, %L, 'stripe', 'occurrence', gen_random_uuid(), 500, 'GBP', 500, 0, 'auto', true)$$,
         :'fa', :'c1', :'pa'),
  '23514', null, 'an auto charge cannot be in-app');

select throws_ok(
  format($$insert into public.payments (family_id, child_id, payer_id, provider, source_type, source_id,
             amount_minor, currency, cash_minor, saved_minor, in_app, redirect_url)
           values (%L, %L, %L, 'stripe', 'occurrence', gen_random_uuid(), 500, 'GBP', 500, 0, true, 'https://x.test')$$,
         :'fa', :'c1', :'pa'),
  '23514', null, 'an in-app payment has no hosted page');

select lives_ok(
  format($$insert into public.payments (family_id, child_id, payer_id, provider, provider_ref, source_type,
             source_id, amount_minor, currency, cash_minor, saved_minor, trigger, in_app)
           values (%L, %L, %L, 'stripe', 'pi_test_1', 'occurrence', gen_random_uuid(), 500, 'GBP', 500, 0,
             'manual', true)$$,
         :'fa', :'c1', :'pa'),
  'a manual in-app payment with its intent id inserts');

reset role;

select * from finish();
rollback;
