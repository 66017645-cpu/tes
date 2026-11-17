create extension if not exists pgcrypto;

create table if not exists public.store_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function public.is_store_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.store_admins
    where user_id = (select auth.uid())
  );
$$;

revoke all on function public.is_store_admin() from public;
grant execute on function public.is_store_admin() to anon, authenticated;

create table if not exists public.store_settings (
  id integer primary key check (id = 1),
  payment_qr_path text,
  pickup_instructions text not null default 'โปรดติดต่อร้านเพื่อรับรายละเอียดจุดรับสินค้า',
  updated_at timestamptz not null default now()
);

insert into public.store_settings (id)
values (1)
on conflict (id) do nothing;

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id),
  customer_name text not null check (char_length(customer_name) between 2 and 120),
  phone text not null check (phone ~ '^[0-9]{9,10}$'),
  fulfillment text not null check (fulfillment in ('delivery', 'pickup')),
  address text,
  shirt_color text not null check (shirt_color in ('cream', 'forest', 'terracotta', 'ink')),
  shirt_size text not null check (shirt_size in ('S', 'M', 'L', 'XL', '2XL')),
  quantity integer not null check (quantity between 1 and 20),
  subtotal integer not null check (subtotal = quantity * 390),
  shipping_fee integer not null check (
    shipping_fee = case
      when fulfillment = 'pickup' or quantity >= 2 then 0
      else 40
    end
  ),
  total integer not null check (total = subtotal + shipping_fee),
  slip_path text not null,
  payment_status text not null default 'awaiting_review'
    check (payment_status in ('awaiting_review', 'paid', 'rejected')),
  created_at timestamptz not null default now(),
  check (
    (fulfillment = 'delivery' and address is not null and char_length(address) between 5 and 500)
    or (fulfillment = 'pickup' and address is null)
  ),
  check (split_part(slip_path, '/', 1) = user_id::text)
);

create index if not exists orders_created_at_idx on public.orders (created_at desc);
create index if not exists orders_payment_status_idx on public.orders (payment_status);

alter table public.store_admins enable row level security;
alter table public.store_settings enable row level security;
alter table public.orders enable row level security;

drop policy if exists "Public can read store settings" on public.store_settings;
create policy "Public can read store settings"
on public.store_settings for select
to anon, authenticated
using (true);

drop policy if exists "Admins can update store settings" on public.store_settings;
create policy "Admins can update store settings"
on public.store_settings for update
to authenticated
using ((select public.is_store_admin()))
with check ((select public.is_store_admin()));

drop policy if exists "Customers can create their own orders" on public.orders;
create policy "Customers can create their own orders"
on public.orders for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and payment_status = 'awaiting_review'
);

drop policy if exists "Customers and admins can read orders" on public.orders;
create policy "Customers and admins can read orders"
on public.orders for select
to authenticated
using (
  user_id = (select auth.uid())
  or (select public.is_store_admin())
);

drop policy if exists "Admins can update order payment status" on public.orders;
create policy "Admins can update order payment status"
on public.orders for update
to authenticated
using ((select public.is_store_admin()))
with check ((select public.is_store_admin()));

grant select on public.store_settings to anon, authenticated;
grant update on public.store_settings to authenticated;
grant insert, select, update on public.orders to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('payment-slips', 'payment-slips', false, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('store-assets', 'store-assets', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Customers upload their own slips" on storage.objects;
create policy "Customers upload their own slips"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'payment-slips'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "Admins and owners can read payment slips" on storage.objects;
create policy "Admins and owners can read payment slips"
on storage.objects for select
to authenticated
using (
  bucket_id = 'payment-slips'
  and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or (select public.is_store_admin())
  )
);

drop policy if exists "Customers can remove their own slips" on storage.objects;
create policy "Customers can remove their own slips"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'payment-slips'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "Anyone can view store QR images" on storage.objects;
create policy "Anyone can view store QR images"
on storage.objects for select
to anon, authenticated
using (bucket_id = 'store-assets');

drop policy if exists "Admins manage store QR images" on storage.objects;
create policy "Admins manage store QR images"
on storage.objects for all
to authenticated
using (
  bucket_id = 'store-assets'
  and (select public.is_store_admin())
)
with check (
  bucket_id = 'store-assets'
  and (select public.is_store_admin())
);
