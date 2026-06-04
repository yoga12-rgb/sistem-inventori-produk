import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

function loadDotEnv() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index);
    const value = trimmed.slice(index + 1);
    process.env[key] ??= value;
  }
}

async function must(label, promise) {
  const result = await promise;
  if (result.error) {
    throw new Error(`${label}: ${result.error.message}`);
  }
  return result.data;
}

test("inventory RPC flows: initial stock, sale void, and partial transfer", async (t) => {
  loadDotEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !anon || !service) {
    t.skip("Supabase env vars are not configured.");
    return;
  }

  if (!url.includes("127.0.0.1") && !url.includes("localhost")) {
    t.skip("Inventory RPC regression test only runs against local Supabase.");
    return;
  }

  const admin = createClient(url, service, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const runId = `inventory-rpc-${Date.now()}`;
  const password = `Test-${Date.now()}-password`;
  const email = `${runId}@example.test`;

  const created = await must(
    "create auth user",
    admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: "Inventory RPC Test" },
    }),
  );
  const userId = created.user.id;

  t.after(async () => {
    await admin.from("profiles").delete().eq("id", userId);
    await admin.auth.admin.deleteUser(userId);
  });

  const [locations, products] = await Promise.all([
    must(
      "fetch locations",
      admin
        .from("locations")
        .select("id, code, type")
        .eq("is_active", true)
        .order("code", { ascending: true }),
    ),
    must(
      "fetch products",
      admin
        .from("products")
        .select("id, sku, is_perishable")
        .eq("is_active", true)
        .eq("is_perishable", true)
        .order("sku", { ascending: true })
        .limit(1),
    ),
  ]);

  const central = locations.find((location) => location.type === "central_kitchen");
  const outlets = locations.filter((location) => location.type === "outlet");
  const product = products[0];

  assert.ok(central, "seed data must include a central kitchen");
  assert.ok(outlets.length >= 2, "seed data must include at least two outlets");
  assert.ok(product, "seed data must include a perishable product");

  await must(
    "insert test profile",
    admin.from("profiles").insert({
      id: userId,
      full_name: "Inventory RPC Test",
      role: "super_admin",
      outlet_id: null,
      is_active: true,
    }),
  );

  const client = createClient(url, anon, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  await must(
    "sign in test user",
    client.auth.signInWithPassword({ email, password }),
  );

  const producedAt = "2026-06-04T01:00:00.000Z";
  const expiresAt = "2026-06-07T01:00:00.000Z";
  const saleOutlet = outlets[0];
  const transferTo = outlets[1];

  const initialCount = await must(
    "record atomic initial stock",
    client.rpc("fn_initial_stock_entry_batch", {
      p_items: [
        {
          location_id: saleOutlet.id,
          product_id: product.id,
          quantity: 20,
          produced_at: producedAt,
          expires_at: expiresAt,
          notes: `${runId}:sale-stock`,
        },
        {
          location_id: central.id,
          product_id: product.id,
          quantity: 10,
          produced_at: producedAt,
          expires_at: expiresAt,
          notes: `${runId}:transfer-stock`,
        },
      ],
    }),
  );
  assert.equal(initialCount, 2);

  const saleBatch = await must(
    "fetch sale batch",
    admin
      .from("stock_batches")
      .select("id, remaining_qty")
      .eq("location_id", saleOutlet.id)
      .eq("product_id", product.id)
      .eq("notes", `${runId}:sale-stock`)
      .single(),
  );
  assert.equal(saleBatch.remaining_qty, 20);

  const saleId = await must(
    "record sale",
    client.rpc("fn_record_sale", {
      p_location_id: saleOutlet.id,
      p_occurred_at: "2026-06-04T03:00:00.000Z",
      p_notes: runId,
      p_items: [
        {
          product_id: product.id,
          quantity: 5,
          override_batch_id: saleBatch.id,
        },
      ],
    }),
  );
  assert.ok(saleId);

  const afterSale = await must(
    "fetch stock after sale",
    admin.from("stock_batches").select("remaining_qty").eq("id", saleBatch.id).single(),
  );
  assert.equal(afterSale.remaining_qty, 15);

  await must(
    "void sale",
    client.rpc("fn_void_sale", {
      p_sale_id: saleId,
      p_reason: "regression test",
    }),
  );

  const afterVoid = await must(
    "fetch stock after void",
    admin.from("stock_batches").select("remaining_qty").eq("id", saleBatch.id).single(),
  );
  assert.equal(afterVoid.remaining_qty, 20);

  const transferBatch = await must(
    "fetch transfer source batch",
    admin
      .from("stock_batches")
      .select("id, remaining_qty")
      .eq("location_id", central.id)
      .eq("product_id", product.id)
      .eq("notes", `${runId}:transfer-stock`)
      .single(),
  );

  const transferId = await must(
    "create transfer",
    client.rpc("fn_create_transfer", {
      p_from_location_id: central.id,
      p_to_location_id: transferTo.id,
      p_mode: "two_way",
      p_notes: runId,
      p_items: [{ source_batch_id: transferBatch.id, quantity: 6 }],
    }),
  );
  assert.ok(transferId);

  await must(
    "ship transfer",
    client.rpc("fn_ship_transfer", { p_transfer_id: transferId }),
  );

  const transferItem = await must(
    "fetch transfer item",
    admin
      .from("transfer_items")
      .select("id, quantity")
      .eq("transfer_id", transferId)
      .single(),
  );
  assert.equal(transferItem.quantity, 6);

  await must(
    "confirm partial transfer",
    client.rpc("fn_confirm_transfer", {
      p_transfer_id: transferId,
      p_items: [
        {
          item_id: transferItem.id,
          received_qty: 4,
          loss_reason: "regression test loss",
        },
      ],
    }),
  );

  const updatedItem = await must(
    "fetch received transfer item",
    admin
      .from("transfer_items")
      .select("received_qty, loss_reason")
      .eq("id", transferItem.id)
      .single(),
  );
  assert.equal(updatedItem.received_qty, 4);
  assert.equal(updatedItem.loss_reason, "regression test loss");

  const lossMovement = await must(
    "fetch transfer loss movement",
    admin
      .from("stock_movements")
      .select("quantity")
      .eq("reference_id", transferId)
      .eq("movement_type", "transfer_loss")
      .single(),
  );
  assert.equal(lossMovement.quantity, 2);

  const destinationBatches = await must(
    "fetch destination transfer batch",
    admin
      .from("stock_batches")
      .select("remaining_qty")
      .eq("source_batch_id", transferBatch.id)
      .eq("location_id", transferTo.id),
  );
  assert.equal(destinationBatches.length, 1);
  assert.equal(destinationBatches[0].remaining_qty, 4);
});
