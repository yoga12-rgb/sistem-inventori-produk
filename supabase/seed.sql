-- =========================================================================
--  Seed data — locations, product_categories, products
--
--  Dijalankan otomatis oleh Supabase CLI setelah `db reset` selesai apply
--  semua migrations. Data ini idempotent: pakai INSERT ... ON CONFLICT DO
--  NOTHING dengan kolom unique (`code` untuk locations & categories, `sku`
--  untuk products) sebagai pivot.
--
--  ID UUID di-hardcode dari snapshot DB lokal supaya FK tetap valid kalau
--  kelak Anda mau re-import data lain (mis. stock_batches, sales) yang
--  reference ID ini.
--
--  Cara update: edit data di app, lalu dump ulang via:
--    docker exec <db> psql -U postgres -d postgres -c "select ..."
--  dan paste ke file ini.
-- =========================================================================

-- ---------- LOCATIONS ----------------------------------------------------
insert into public.locations (id, code, name, type, is_active) values
  ('ffed5c04-6068-4725-bba2-10227997b32e', 'PRO', 'Produksi',  'central_kitchen', true),
  ('ccd70600-286a-4a32-966e-a997cb1b1fd0', 'CLD', 'Ciledug',   'outlet',          true),
  ('5f17bf5f-5d16-4b81-a7bb-a51666d5b13f', 'CPT', 'Ciputat',   'outlet',          true),
  ('c751552f-c70a-476a-b4eb-a1f9a341915e', 'DGO', 'Dago',      'outlet',          true),
  ('6ace0d3e-fb9e-4ce5-a92d-a5c482de9760', 'JBG', 'Jombang',   'outlet',          true),
  ('4c153838-7245-4428-b5ac-780a93afebb3', 'PHL', 'Pahlawan',  'outlet',          true),
  ('0b74bc31-8f28-4efc-8b02-a6b8d4fa3f12', 'PJJ', 'Pajajaran', 'outlet',          true),
  ('0a8694ec-0128-4baa-8da4-92eeae978d21', 'PML', 'Pamulang',  'outlet',          true),
  ('4528cee8-9b3c-4531-898a-e70df48d1659', 'SWG', 'Sawangan',  'outlet',          true)
on conflict (code) do nothing;

-- ---------- PRODUCT CATEGORIES ------------------------------------------
insert into public.product_categories (id, code, name, icon, color, sort, is_active) values
  ('f9e5e1cf-229c-4246-9b5a-88d34e633559', 'ag',    'Abon Gulung',        null, '#fbff00', 1,  true),
  ('35a5359b-28df-4024-bec5-7813751461b5', 'agm',   'Abon Gulung Mini',   null, '#b9db0f', 2,  true),
  ('e573a7d3-e8db-4e6e-8383-353557cca2f6', 'bs',    'Bolu Susu',          null, '#0033ff', 3,  true),
  ('7012e8b3-81ce-4bf7-9613-59b823a519ae', 'bsm',   'Bolu Susu Mini',     null, '#0011ff', 4,  true),
  ('9d5306e9-48df-48b8-933a-865a801ede1d', 'rt',    'Roti Durian Sobek',  null, '#ff6a00', 5,  true),
  ('81d17fa5-20ef-4f32-828d-3e3c99f8cf6c', 'at100', 'Abon Toples 100grm', null, '#00ff04', 6,  true),
  ('61bd84e5-9f52-408b-b26c-f502aeabff86', 'at200', 'Abon Toples 200grm', null, '#00ff7b', 7,  true),
  ('07db3854-e03f-43e7-b378-c2ad11c224d1', 'si',    'Sambal Iris',        null, '#ff0000', 9,  true),
  ('6a5360e0-56cf-4a09-b58d-a239a4d1a1ff', 'box',   'Box',                null, '#ffffff', 10, true)
on conflict (code) do nothing;

-- ---------- PRODUCTS -----------------------------------------------------
-- Catatan: untuk produk perishable, `default_shelf_life_hours` adalah jam
-- ketahanan default; trigger `tg_batch_set_expiry` akan auto-isi
-- expires_at saat batch dibuat. Untuk produk non-perishable, kolom ini
-- NULL.
insert into public.products
  (id, sku, name, unit, category_id, is_perishable, default_shelf_life_hours,
   expiry_warning_hours, expiry_discount_percent, is_active) values

-- Bolu Susu
  ('185a7a64-74be-43e3-8f42-06f808e8ff47', 'BC',     'Bolu Susu Coklat',
     'box',    'e573a7d3-e8db-4e6e-8383-353557cca2f6', true, 168, 24, 50.00, true),
  ('31449c84-344d-49e6-9a61-532760a1a74c', 'BCM',    'Bolu Susu Coklat Mini',
     'box',    '7012e8b3-81ce-4bf7-9613-59b823a519ae', true, 168, 24, 50.00, true),
  ('c3259a99-eab7-4449-8572-7eec85b1baf6', 'BD',     'Bolu Susu Durian',
     'box',    'e573a7d3-e8db-4e6e-8383-353557cca2f6', true, 168, 24, 50.00, true),
  ('8847ecfb-39b3-479b-a2ca-72ba85bc149a', 'BDM',    'Bolu Susu Durian Mini',
     'box',    '7012e8b3-81ce-4bf7-9613-59b823a519ae', true, 168, 24, 50.00, true),
  ('d7f8cb3e-a0d8-40fb-a08e-595cd9520706', 'BK',     'Bolu Susu Keju',
     'box',    'e573a7d3-e8db-4e6e-8383-353557cca2f6', true, 168, 24, 50.00, true),
  ('19506c97-6e4e-47ab-82cd-32fb4c368fb6', 'BKM',    'Bolu Susu Keju Mini',
     'box',    '7012e8b3-81ce-4bf7-9613-59b823a519ae', true, 168, 24, 50.00, true),

-- Abon Gulung — Sapi Ori / Pedas (regular & mini)
  ('0a330d58-d64a-4305-854e-3f3d85d288ea', 'SO',     'Sapi Ori',
     'box',    'f9e5e1cf-229c-4246-9b5a-88d34e633559', true, 72,  24, 50.00, true),
  ('56ce6c15-a67e-4505-965d-0dc8fcaf5439', 'SOM',    'Sapi Ori Mini',
     'box',    '35a5359b-28df-4024-bec5-7813751461b5', true, 72,  24, 50.00, true),
  ('fc537a09-2844-4ad6-bbf3-72eff34ec536', 'SP',     'Sapi Pedas',
     'box',    'f9e5e1cf-229c-4246-9b5a-88d34e633559', true, 72,  24, 50.00, true),
  ('f598c0bb-a7aa-4fa3-9226-d99e333f40c7', 'SPM',    'Sapi Pedas Mini',
     'box',    '35a5359b-28df-4024-bec5-7813751461b5', true, 72,  24, 50.00, true),

-- Abon Gulung — Ayam Ori / Pedas (regular & mini)
  ('53c4aa70-92fc-493f-9a12-7dbf42633082', 'AO',     'Ayam Ori',
     'box',    'f9e5e1cf-229c-4246-9b5a-88d34e633559', true, 72,  24, 50.00, true),
  ('15c37e5d-2c79-415d-a75e-2182daa0b634', 'AOM',    'Ayam Ori Mini',
     'box',    '35a5359b-28df-4024-bec5-7813751461b5', true, 72,  24, 50.00, true),
  ('759b8511-0279-4c47-9f74-f3b8f62448af', 'AP',     'Ayam Pedas',
     'box',    'f9e5e1cf-229c-4246-9b5a-88d34e633559', true, 72,  24, 50.00, true),
  ('bbd36d77-42d8-46bb-ba39-0d85711236a7', 'APM',    'Ayam Pedas Mini',
     'box',    '35a5359b-28df-4024-bec5-7813751461b5', true, 72,  24, 50.00, true),

-- Roti Durian Sobek
  ('bb74a7f6-023b-4984-b4c2-94500e358096', 'DS',     'Roti Durian Sobek',
     'box',    '9d5306e9-48df-48b8-933a-865a801ede1d', true, 72,  24, 50.00, true),
  ('9e91854f-a6d8-45b1-ab36-48b27b8a9a25', 'DSM',    'Roti Durian Sobek Mini',
     'box',    '9d5306e9-48df-48b8-933a-865a801ede1d', true, 72,  24, 50.00, true),

-- Abon Toples — 100gr (Ayam, Ayam Pedas, Sapi Ori, Sapi Pedas)
  ('86be5a3e-d398-4415-bf30-809c4c5895a5', 'AA100',  'Abon Ayam 100gr',
     'toples', '81d17fa5-20ef-4f32-828d-3e3c99f8cf6c', true, 8640, 4320, 10.00, true),
  ('9fc45e39-0ec9-499b-8e9a-237bc56a54fc', 'AAP100', 'Abon Ayam Pedas 100gr',
     'toples', '81d17fa5-20ef-4f32-828d-3e3c99f8cf6c', true, 8640, 4320, 10.00, true),
  ('5f47b18c-adef-4554-bc8d-bda217ecdf84', 'ASO100', 'Abon Sapi Ori 100gr',
     'toples', '81d17fa5-20ef-4f32-828d-3e3c99f8cf6c', true, 8640, 4320, 10.00, true),
  ('6ed81c7d-29b7-4dd8-94ee-19b4cdc43db7', 'ASP100', 'Abon Sapi Pedas 100gr',
     'toples', '81d17fa5-20ef-4f32-828d-3e3c99f8cf6c', true, 8640, 4320, 10.00, true),

-- Abon Toples — 200gr (Ayam, Ayam Pedas, Sapi Ori, Sapi Pedas)
  ('69cbe5c8-cd64-4a88-8ffe-b83dcc0ae455', 'AA200',  'Abon Ayam 200gr',
     'toples', '61bd84e5-9f52-408b-b26c-f502aeabff86', true, 8540, 4329, 10.00, true),
  ('1d676b54-623d-4910-809d-be5fe8f460ff', 'AAP200', 'Abon Ayam Pedas 200gr',
     'toples', '61bd84e5-9f52-408b-b26c-f502aeabff86', true, 8640, 4320, 10.00, true),
  ('16290b40-cb3f-4b1b-ae9a-859ebd5dfc0f', 'ASO200', 'Abon Sapi Ori 200gr',
     'toples', '61bd84e5-9f52-408b-b26c-f502aeabff86', true, 8640, 4320, 10.00, true),
  ('0242b845-c235-48af-966c-1be8780396e2', 'ASP200', 'Abon Sapi Pedas 200gr',
     'toples', '61bd84e5-9f52-408b-b26c-f502aeabff86', true, 8640, 4320, 10.00, true),

-- Sambal Iris (Sapi & Tuna)
  ('f67f3997-2e38-47c5-b71a-8a1a4b90ef94', 'SIS',    'Sambal Iris Sapi',
     'toples', '07db3854-e03f-43e7-b378-c2ad11c224d1', true, 8640, 4320, 10.00, true),
  ('5ebe8348-623d-4fe9-bea9-0353a3e83738', 'SIT',    'Sambal Iris Tuna',
     'toples', '07db3854-e03f-43e7-b378-c2ad11c224d1', true, 8640, 4320, 10.00, true),

-- Box / kemasan (non-perishable)
  ('66422815-1193-4256-a703-1464bd235f64', 'B-AG',   'Box Abon Gulung',
     'box',    '6a5360e0-56cf-4a09-b58d-a239a4d1a1ff', false, null, 24, 0.00, true),
  ('a07e3b78-8f45-4292-8d97-91f68e8fd152', 'B-AGM',  'Box Abon Gulung Mini',
     'box',    '6a5360e0-56cf-4a09-b58d-a239a4d1a1ff', false, null, 24, 0.00, true),
  ('e06feb96-e67a-447e-8413-72b27bc77abd', 'BOX12',  'Box Besar',
     'box',    '6a5360e0-56cf-4a09-b58d-a239a4d1a1ff', false, null, 24, 0.00, true),
  ('428f6a51-1cfb-4b76-b157-ce6699af8333', 'BOX2',   'Box Kecil',
     'box',    '6a5360e0-56cf-4a09-b58d-a239a4d1a1ff', false, null, 24, 0.00, true),
  ('66f8c6e5-85ec-479a-a3c0-c725f43a185b', 'BOX4',   'Box Sedang',
     'box',    '6a5360e0-56cf-4a09-b58d-a239a4d1a1ff', false, null, 24, 0.00, true)

on conflict (sku) do nothing;
