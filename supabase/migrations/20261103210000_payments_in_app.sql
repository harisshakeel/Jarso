-- Card handover on the phone (spec 2026-11-03-mobile-wave-3-design §4): a manual payment can be
-- paid in the phone's native sheet (Stripe PaymentSheet / Razorpay Checkout) instead of a hosted
-- page. The PaymentIntent or order id is already in provider_ref; the client secret is re-read
-- from the provider on reuse, so no confirmable secret is stored here. The flag lets the sweep
-- and reuse tell an in-app payment from a hosted one that is still opening. Written by the
-- service role only; the existing payments policies cover the column.

alter table public.payments
  add column in_app boolean not null default false,
  add constraint payments_in_app_manual check (not in_app or trigger = 'manual'),
  add constraint payments_in_app_no_redirect check (not in_app or redirect_url is null);

comment on column public.payments.in_app is 'Paid in the phone''s native sheet (Stripe PaymentIntent / Razorpay order in provider_ref); false for hosted checkouts and auto charges.';
