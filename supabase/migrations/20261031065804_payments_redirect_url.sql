-- Card handover: keep the hosted checkout URL on the payment, so a second Pay by card click
-- (double click, second tab) within the 30-minute expiry returns the same checkout instead
-- of opening a new one (spec 2026-10-31-stripe-card-handover-design §6.6). Written by the
-- service role with provider_ref; null for auto charges, which have no hosted page.

alter table public.payments
  add column redirect_url text
    check (char_length(redirect_url) between 1 and 2048 and redirect_url ~ '^https?://');

comment on column public.payments.redirect_url is 'Hosted checkout URL for a manual payment, reused while the payment is live and before expires_at; null for auto charges.';
