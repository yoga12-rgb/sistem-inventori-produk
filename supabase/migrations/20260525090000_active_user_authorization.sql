-- =========================================================================
-- Active-user authorization hardening
--
-- `read_all_auth` remains the access model for authenticated active users.
-- This migration makes inactive profiles lose app/database authorization while
-- preserving the existing cross-outlet read decision for active users.
-- =========================================================================

create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select is_active = true from public.profiles where id = auth.uid()),
    false
  );
$$;

create or replace function public.current_role()
returns user_role
language sql
stable
security definer
set search_path = public
as $$
  select role
    from public.profiles
   where id = auth.uid()
     and is_active = true;
$$;

create or replace function public.current_outlet_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select outlet_id
    from public.profiles
   where id = auth.uid()
     and is_active = true;
$$;

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select role = 'super_admin'
        from public.profiles
       where id = auth.uid()
         and is_active = true
    ),
    false
  );
$$;

-- Harden functions that perform their own profile lookup, including
-- SECURITY DEFINER transfer functions that bypass table RLS internally.
do $$
declare
  fn oid;
  ddl text;
begin
  for fn in
    select p.oid
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prokind = 'f'
       and pg_get_functiondef(p.oid) like '%from public.profiles where id = v_user;%'
  loop
    ddl := pg_get_functiondef(fn);
    ddl := replace(
      ddl,
      'from public.profiles where id = v_user;',
      'from public.profiles where id = v_user and is_active = true;'
    );
    execute ddl;
  end loop;
end;
$$;

drop policy if exists "locations_read_all_auth" on public.locations;
create policy "locations_read_all_auth"
  on public.locations for select
  to authenticated using (public.is_active_user());

drop policy if exists "profiles_read_all_auth" on public.profiles;
create policy "profiles_read_all_auth"
  on public.profiles for select
  to authenticated using (public.is_active_user());

drop policy if exists "products_read_all_auth" on public.products;
create policy "products_read_all_auth"
  on public.products for select
  to authenticated using (public.is_active_user());

drop policy if exists "batches_read_all_auth" on public.stock_batches;
create policy "batches_read_all_auth"
  on public.stock_batches for select
  to authenticated using (public.is_active_user());

drop policy if exists "movements_read_all_auth" on public.stock_movements;
create policy "movements_read_all_auth"
  on public.stock_movements for select
  to authenticated using (public.is_active_user());

drop policy if exists "sales_read_all_auth" on public.sales;
create policy "sales_read_all_auth"
  on public.sales for select
  to authenticated using (public.is_active_user());

drop policy if exists "sale_items_read_all_auth" on public.sale_items;
create policy "sale_items_read_all_auth"
  on public.sale_items for select
  to authenticated using (public.is_active_user());

drop policy if exists "transfers_read_all_auth" on public.transfers;
create policy "transfers_read_all_auth"
  on public.transfers for select
  to authenticated using (public.is_active_user());

drop policy if exists "transfer_items_read_all_auth" on public.transfer_items;
create policy "transfer_items_read_all_auth"
  on public.transfer_items for select
  to authenticated using (public.is_active_user());

drop policy if exists "categories_read_all_auth" on public.product_categories;
create policy "categories_read_all_auth"
  on public.product_categories for select
  to authenticated using (public.is_active_user());
