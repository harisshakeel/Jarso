begin;
select plan(3);

select has_column('public', 'payments', 'redirect_url', 'payments has redirect_url');
select col_is_null('public', 'payments', 'redirect_url', 'redirect_url is nullable (auto charges have none)');
select col_type_is('public', 'payments', 'redirect_url', 'text', 'redirect_url is text');

select * from finish();
rollback;
