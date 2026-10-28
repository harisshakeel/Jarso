begin;
\ir _helpers.psql
select plan(2);

select tests.create_user('harness@example.com') as uid \gset
select tests.authenticate_as(:'uid'::uuid);
select is(auth.uid(), :'uid'::uuid, 'auth.uid() matches authenticated user');

select tests.clear_auth();
select is(current_user::text, 'postgres', 'clear_auth resets role to postgres');

select * from finish();
rollback;
