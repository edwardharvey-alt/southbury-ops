-- Migration: create catering_enquiries table
-- Front-of-funnel capture for catering interest. Writes happen only via the
-- submit-catering-enquiry Edge Function (service-role). RLS is enabled with NO policies:
-- deny-by-default for anon and authenticated PostgREST, consistent with the T5-A3 posture.

create table if not exists public.catering_enquiries (
  id                uuid primary key default gen_random_uuid(),
  vendor_id         uuid not null references public.vendors(id) on delete cascade,

  -- lifecycle (two states; resolution + converted_drop_id used in Phase 2)
  status            text not null default 'open' check (status in ('open','resolved')),
  resolution        text check (resolution in ('converted','archived')),
  converted_drop_id uuid references public.drops(id) on delete set null,

  -- customer-submitted
  contact_name      text not null,
  contact_email     text,
  contact_phone     text,
  event_date        date,
  guest_count       integer check (guest_count is null or guest_count >= 0),
  event_type        text,
  fulfilment        text check (fulfilment in ('collection','delivery')),
  brief             text,
  consent           boolean not null default false,

  -- metadata
  source            text not null default 'enquiry_page',
  created_at        timestamptz not null default now(),
  resolved_at       timestamptz,

  constraint catering_enquiries_contact_present
    check (contact_email is not null or contact_phone is not null)
);

comment on table public.catering_enquiries is
  'Catering interest captured from the public enquiry page. A proto-drop: converted into a catering drop or archived. Written only via the submit-catering-enquiry Edge Function.';

create index if not exists idx_catering_enquiries_vendor_status
  on public.catering_enquiries (vendor_id, status, created_at desc);

alter table public.catering_enquiries enable row level security;
-- No policies by design. All access is via service-role Edge Functions.
