begin;
\ir _helpers.psql
select plan(17);

-- The shared check
select ok(public.is_valid_nickname('Zoë O''Neil-2'), 'Latin letters, digits and _ . '' - pass');
select ok(public.is_valid_nickname('अनु'), 'Devanagari with a vowel sign passes');
select ok(public.is_valid_nickname('किरण'), 'Devanagari with a vowel sign before a letter passes');
select ok(public.is_valid_nickname('कृष्ण'), 'Devanagari with a virama passes');
select ok(public.is_valid_nickname('น้อย'), 'Thai with a tone mark passes');
select ok(public.is_valid_nickname(U&'Jose\0301'), 'a decomposed accent (combining acute) passes');
select ok(not public.is_valid_nickname('sam@example.com'), '@ is refused');
select ok(not public.is_valid_nickname('a/b:c'), '/ and : are refused');
select ok(not public.is_valid_nickname('<b>'), '< and > are refused');
select ok(not public.is_valid_nickname(U&'Sam\+01F600'), 'emoji are refused');
select ok(not public.is_valid_nickname(U&'Sa\200Dm'), 'a zero-width joiner is refused');
select ok(not public.is_valid_nickname(U&'Sam\202E'), 'a bidi override is refused');
select ok(not public.is_valid_nickname(U&'Sa\034Fm'), 'a combining grapheme joiner is refused');

-- Through the three callers
select tests.create_user('pa@example.com') as pa \gset
select tests.create_user('c@example.com', 'child') as c \gset

select tests.authenticate_as(:'pa'::uuid);
select public.create_family('INR', 'Asia/Kolkata') as fa \gset
select lives_ok(
  format($$ select public.register_child(%L, %L, 'कृष्ण', '1234', true) $$, :'c', :'fa'),
  'register_child accepts a Devanagari name with a virama');
select lives_ok(
  format($$ select public.rename_child(%L, 'น้อย') $$, :'c'),
  'rename_child accepts a Thai name with a tone mark');
select throws_ok(
  format($$ select public.rename_child(%L, 'a@b') $$, :'c'),
  '22023', null, 'rename_child still refuses @');

select tests.clear_auth();
set local role service_role;
select lives_ok(
  $$ select public.create_invitation('किरण', 'pa@example.com', 'tok-marks', 'code-marks') $$,
  'create_invitation accepts a Devanagari name');

select * from finish();
rollback;
