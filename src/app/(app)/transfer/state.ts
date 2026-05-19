/**
 * Tipe state untuk Server Actions di modul Transfer.
 *
 * Tipe-tipe ini WAJIB hidup di luar file `"use server"` (lihat
 * `actions.ts`). Server-action loader Next.js 16 + Turbopack hanya
 * mengizinkan async function sebagai export top-level, jadi semua
 * `export type` ditaruh di sini dan diimpor balik oleh `actions.ts`.
 */

export type CreateTransferState = {
  ok: boolean;
  message?: string;
  fieldErrors?: {
    from_location_id?: string;
    to_location_id?: string;
    mode?: string;
    notes?: string;
    items?: string;
  };
};

export type RpcState = {
  ok: boolean;
  message?: string;
};
