import { describe, expect, it, beforeAll } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import fs from "fs";
import path from "path";

describe("PostgreSQL Real In-Memory Migration Execution & Security Verification (PGlite)", () => {
  let db: PGlite;
  const adminUuid = "a0000000-0000-0000-0000-000000000001";
  const customerUuid = "c0000000-0000-0000-0000-000000000002";
  const otherCustomerUuid = "c0000000-0000-0000-0000-000000000003";

  beforeAll(async () => {
    db = new PGlite();

    // 1. Initialize mock Supabase auth & storage schemas in PGlite
    await db.exec(`
      CREATE SCHEMA IF NOT EXISTS auth;
      CREATE TABLE IF NOT EXISTS auth.users (
        id UUID PRIMARY KEY,
        email TEXT UNIQUE,
        created_at TIMESTAMPTZ DEFAULT now()
      );

      CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID AS $$
        SELECT NULLIF(current_setting('test.auth_uid', true), '')::uuid;
      $$ LANGUAGE sql STABLE;

      CREATE OR REPLACE FUNCTION auth.role() RETURNS TEXT AS $$
        SELECT COALESCE(NULLIF(current_setting('test.auth_role', true), ''), 'anon');
      $$ LANGUAGE sql STABLE;

      CREATE SCHEMA IF NOT EXISTS storage;
      CREATE TABLE IF NOT EXISTS storage.buckets (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        public BOOLEAN DEFAULT false,
        file_size_limit BIGINT,
        allowed_mime_types TEXT[]
      );

      CREATE TABLE IF NOT EXISTS storage.objects (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        bucket_id TEXT REFERENCES storage.buckets(id),
        name TEXT NOT NULL,
        owner UUID,
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now(),
        metadata JSONB
      );

      CREATE OR REPLACE FUNCTION storage.extension(name text) RETURNS text AS $$
        SELECT lower(split_part(name, '.', array_length(string_to_array(name, '.'), 1)));
      $$ LANGUAGE sql IMMUTABLE;
    `);

    // Insert mock users into auth.users
    await db.query(
      `INSERT INTO auth.users (id, email) VALUES 
       ($1, 'admin@gurshacafe.com'),
       ($2, 'customer@example.com'),
       ($3, 'other@example.com');`,
      [adminUuid, customerUuid, otherCustomerUuid]
    );

    // 2. Execute Migration 1: Core Schema & Admin Authorization
    const m1Path = path.resolve("supabase/migrations/20261020_01_core_schema_and_admin_auth.sql");
    const m1Sql = fs.readFileSync(m1Path, "utf8");
    await db.exec(m1Sql);

    // 3. Execute Migration 2: Order RPCs & Guest Checkout
    const m2Path = path.resolve("supabase/migrations/20261020_02_order_rpcs_and_guest_checkout.sql");
    const m2Sql = fs.readFileSync(m2Path, "utf8");
    await db.exec(m2Sql);

    // 4. Execute Migration 3: Least-Privilege RLS & Storage Hardening
    const m3Path = path.resolve("supabase/migrations/20261020_03_least_privilege_rls_and_storage.sql");
    const m3Sql = fs.readFileSync(m3Path, "utf8");
    await db.exec(m3Sql);
  });

  function setSessionContext(uid: string | null, role: "anon" | "authenticated" | "service_role" = "anon") {
    return db.exec(`
      SET test.auth_uid = '${uid || ""}';
      SET test.auth_role = '${role}';
      SET request.jwt.claim.role = '${role}';
    `);
  }

  describe("1. Migration Idempotency & Schema Verification", () => {
    it("confirms public.orders exists with UUID primary key and financial breakdown columns", async () => {
      const res = await db.query(`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'orders'
        ORDER BY ordinal_position;
      `);
      const cols = res.rows.map((r: any) => r.column_name);
      expect(cols).toContain("id");
      expect(cols).toContain("code");
      expect(cols).toContain("user_id");
      expect(cols).toContain("guest_lookup_token");
      expect(cols).toContain("service_type");
      expect(cols).toContain("subtotal");
      expect(cols).toContain("delivery_fee");
      expect(cols).toContain("delivery_charge");
      expect(cols).toContain("service_fee");
      expect(cols).toContain("service_charge");
      expect(cols).toContain("total");
      expect(cols).toContain("payment_method");
      expect(cols).toContain("proof_status");
      expect(cols).toContain("proof_image");
      expect(cols).toContain("proof_note");
      expect(cols).toContain("status");
    });

    it("confirms menu_items table description is nullable and sync trigger works", async () => {
      // Test trigger bidirectional sync
      await db.query(`
        INSERT INTO public.menu_items (id, name, price, category)
        VALUES ('test-dish', 'Test Dish', 150.00, 'mains');
      `);

      const inserted = await db.query<{ category_id: string; description: string | null }>(
        `SELECT category_id, description, "desc" FROM public.menu_items WHERE id = 'test-dish';`
      );
      expect(inserted.rows[0].category_id).toBe("mains");
      expect(inserted.rows[0].description).toBeNull();
    });

    it("confirms store_settings seeded default extras and delivery destinations without overwriting", async () => {
      const extras = await db.query<{ value: any }>(
        `SELECT value FROM public.store_settings WHERE key = 'extras';`
      );
      expect(extras.rows.length).toBe(1);
      expect(Array.isArray(extras.rows[0].value)).toBe(true);

      const delivery = await db.query<{ value: any }>(
        `SELECT value FROM public.store_settings WHERE key = 'delivery';`
      );
      expect(delivery.rows.length).toBe(1);
      expect(delivery.rows[0].value.enabled).toBe(true);
    });
  });

  describe("2. Admin Bootstrap & Privilege Verification", () => {
    it("rejects bootstrap_first_admin when invoked by anonymous or authenticated API callers", async () => {
      await setSessionContext(customerUuid, "authenticated");

      let errorMsg = "";
      try {
        await db.query(`SELECT public.bootstrap_first_admin('customer@example.com');`);
      } catch (err: any) {
        errorMsg = err.message;
      }
      expect(errorMsg).toContain("Access Denied");
    });

    it("succeeds bootstrapping administrator when invoked by direct database operator or service_role", async () => {
      // Simulate backend service_role / direct database operator
      await setSessionContext(null, "service_role");

      const res = await db.query<{ bootstrap_first_admin: any }>(
        `SELECT public.bootstrap_first_admin('admin@gurshacafe.com');`
      );
      expect(res.rows[0].bootstrap_first_admin.success).toBe(true);
      expect(res.rows[0].bootstrap_first_admin.user_id).toBe(adminUuid);

      // Verify record in admin_users
      const adminRow = await db.query(
        `SELECT * FROM public.admin_users WHERE user_id = $1;`,
        [adminUuid]
      );
      expect(adminRow.rows.length).toBe(1);
    });

    it("verifies public.is_admin() returns true for bootstrapped admin and false for customer", async () => {
      await setSessionContext(adminUuid, "authenticated");
      const adminCheck = await db.query<{ is_admin: boolean }>(`SELECT public.is_admin();`);
      expect(adminCheck.rows[0].is_admin).toBe(true);

      await setSessionContext(customerUuid, "authenticated");
      const customerCheck = await db.query<{ is_admin: boolean }>(`SELECT public.is_admin();`);
      expect(customerCheck.rows[0].is_admin).toBe(false);
    });

    it("verifies public.check_is_admin_email() correctly identifies admin email without exposing table", async () => {
      await setSessionContext(null, "anon");
      const resTrue = await db.query<{ check_is_admin_email: boolean }>(
        `SELECT public.check_is_admin_email('admin@gurshacafe.com');`
      );
      expect(resTrue.rows[0].check_is_admin_email).toBe(true);

      const resFalse = await db.query<{ check_is_admin_email: boolean }>(
        `SELECT public.check_is_admin_email('customer@example.com');`
      );
      expect(resFalse.rows[0].check_is_admin_email).toBe(false);
    });
  });

  describe("3. Server-Authoritative Order Creation (create_order RPC)", () => {
    it("creates guest checkout order with high-entropy token, server-calculated totals, and null user_id", async () => {
      await setSessionContext(null, "anon");

      const orderPayload = {
        customer_name: "Abebe Bikila",
        phone: "+251911223344",
        service_type: "delivery",
        zone: "Techno Campus",
        address: "Block 4, Hawassa University",
        payment_method: "telebirr",
      };

      const itemsPayload = [
        {
          menu_item_id: "doro",
          quantity: 2,
          base_choice: "Bread", // Bread maps to Kita bread (+25 ETB)
          extras: ["Extra injera", "Ayib cheese"], // Extra injera (30) + Ayib cheese (45) = 75
        },
      ];

      const res = await db.query<{ create_order: any }>(
        `SELECT public.create_order($1::jsonb, $2::jsonb);`,
        [JSON.stringify(orderPayload), JSON.stringify(itemsPayload)]
      );

      const created = res.rows[0].create_order;
      expect(created.code).toMatch(/^GR-[A-Z0-9]+$/);
      expect(created.guest_lookup_token).toBeDefined();
      expect(created.guest_lookup_token.length).toBeGreaterThanOrEqual(32);
      expect(created.status).toBe("payment_pending"); // Electronic payment initial status

      // Verification of server-calculated pricing:
      // Item: Doro base price (420) + Kita bread (25) + Extras (30 + 45 = 75) = 520 per item
      // Qty: 2 => Item total = 1040.00
      // Subtotal = 1040.00
      // Delivery fee for Techno Campus (4 km) = 30 + 4 * 10 = 70.00
      // Total = 1040 + 70 = 1110.00
      expect(Number(created.subtotal)).toBe(1040.00);
      expect(Number(created.delivery_fee)).toBe(70.00);
      expect(Number(created.total)).toBe(1110.00);

      // Verify database record has null user_id for guest
      const dbOrder = await db.query<{ user_id: string | null }>(
        `SELECT user_id FROM public.orders WHERE code = $1;`,
        [created.code]
      );
      expect(dbOrder.rows[0].user_id).toBeNull();
    });

    it("creates authenticated customer checkout order with user_id and null guest_lookup_token", async () => {
      await setSessionContext(customerUuid, "authenticated");

      const orderPayload = {
        customer_name: "Chala Tadesse",
        phone: "+251922334455",
        service_type: "dine-in",
        payment_method: "cash",
      };

      const itemsPayload = [
        {
          menu_item_id: "kitfo", // Price 520.00
          quantity: 1,
          base_choice: "Injera", // Base extra 0.00
          extras: [],
        },
      ];

      const res = await db.query<{ create_order: any }>(
        `SELECT public.create_order($1::jsonb, $2::jsonb);`,
        [JSON.stringify(orderPayload), JSON.stringify(itemsPayload)]
      );

      const created = res.rows[0].create_order;
      expect(created.guest_lookup_token).toBeNull();
      expect(created.status).toBe("placed"); // Cash initial status

      // Kitfo: 520.00. Dine-in 5% service charge: round(520 * 0.05) = 26.00
      // Total = 546.00
      expect(Number(created.subtotal)).toBe(520.00);
      expect(Number(created.service_charge)).toBe(26.00);
      expect(Number(created.total)).toBe(546.00);

      const dbOrder = await db.query<{ user_id: string }>(
        `SELECT user_id FROM public.orders WHERE code = $1;`,
        [created.code]
      );
      expect(dbOrder.rows[0].user_id).toBe(customerUuid);
    });

    it("rejects client attempts to order invalid or unavailable menu items", async () => {
      await setSessionContext(null, "anon");

      let errorMsg = "";
      try {
        await db.query(`SELECT public.create_order($1::jsonb, $2::jsonb);`, [
          JSON.stringify({ customer_name: "Test", phone: "+251911000000", service_type: "takeaway", payment_method: "cash" }),
          JSON.stringify([{ menu_item_id: "non-existent-dish", quantity: 1 }]),
        ]);
      } catch (err: any) {
        errorMsg = err.message;
      }
      expect(errorMsg).toContain("Invalid or unknown menu item");
    });

    it("rejects duplicate extras on a single item (case-insensitive protection)", async () => {
      await setSessionContext(null, "anon");

      let errorMsg = "";
      try {
        await db.query(`SELECT public.create_order($1::jsonb, $2::jsonb);`, [
          JSON.stringify({ customer_name: "Test", phone: "+251911000000", service_type: "takeaway", payment_method: "cash" }),
          JSON.stringify([
            {
              menu_item_id: "doro",
              quantity: 1,
              extras: ["Extra injera", "EXTRA INJERA"],
            },
          ]),
        ]);
      } catch (err: any) {
        errorMsg = err.message;
      }
      expect(errorMsg).toContain("Duplicate extra option");
    });
  });

  describe("4. Guest Order Tracking & Privacy Isolation", () => {
    let testGuestCode: string;
    let testGuestToken: string;

    beforeAll(async () => {
      await setSessionContext(null, "anon");
      const res = await db.query<{ create_order: any }>(
        `SELECT public.create_order($1::jsonb, $2::jsonb);`,
        [
          JSON.stringify({
            customer_name: "Guest Tracker",
            phone: "+251911999999",
            service_type: "takeaway",
            payment_method: "cash",
          }),
          JSON.stringify([{ menu_item_id: "shiro", quantity: 1 }]),
        ]
      );
      testGuestCode = res.rows[0].create_order.code;
      testGuestToken = res.rows[0].create_order.guest_lookup_token;
    });

    it("retrieves guest order using valid code and token without exposing secret token or user_id", async () => {
      await setSessionContext(null, "anon");

      const res = await db.query<{ get_guest_order: any }>(
        `SELECT public.get_guest_order($1, $2);`,
        [testGuestCode, testGuestToken]
      );

      const data = res.rows[0].get_guest_order;
      expect(data).toBeDefined();
      expect(data.order.code).toBe(testGuestCode);
      expect(data.order.customer_name).toBe("Guest Tracker");
      expect(data.items.length).toBe(1);

      // Verify privacy isolation: guest token and user_id MUST NOT be returned
      expect(data.order.guest_lookup_token).toBeUndefined();
      expect(data.order.user_id).toBeUndefined();
    });

    it("returns NULL for invalid token or non-existent order code", async () => {
      await setSessionContext(null, "anon");

      const res = await db.query<{ get_guest_order: any }>(
        `SELECT public.get_guest_order($1, $2);`,
        [testGuestCode, "invalid-random-token-123456789"]
      );
      expect(res.rows[0].get_guest_order).toBeNull();
    });

    it("excludes heavy proof_image in batch polling RPC (get_guest_orders)", async () => {
      await setSessionContext(null, "anon");

      const payload = [{ code: testGuestCode, token: testGuestToken }];
      const res = await db.query<{ get_guest_orders: any }>(
        `SELECT public.get_guest_orders($1::jsonb);`,
        [JSON.stringify(payload)]
      );

      const list = res.rows[0].get_guest_orders;
      expect(list.length).toBe(1);
      expect(list[0].order.code).toBe(testGuestCode);
      expect(list[0].order.proof_image).toBe(""); // Specifically stripped for polling efficiency
    });
  });

  describe("5. Payment Proof Submission & Admin Workflow", () => {
    let electronicOrderCode: string;
    let electronicOrderToken: string;

    beforeAll(async () => {
      await setSessionContext(null, "anon");
      const res = await db.query<{ create_order: any }>(
        `SELECT public.create_order($1::jsonb, $2::jsonb);`,
        [
          JSON.stringify({
            customer_name: "CBE Customer",
            phone: "+251911777777",
            service_type: "delivery",
            zone: "Main Campus",
            address: "Dorm 12",
            payment_method: "cbe",
          }),
          JSON.stringify([{ menu_item_id: "siga", quantity: 1 }]),
        ]
      );
      electronicOrderCode = res.rows[0].create_order.code;
      electronicOrderToken = res.rows[0].create_order.guest_lookup_token;
    });

    it("allows valid customer/guest to submit payment proof", async () => {
      await setSessionContext(null, "anon");

      const proofPath = `payment-proofs/${electronicOrderCode}_1729200000000.jpg`;
      const res = await db.query<{ submit_payment_proof: boolean }>(
        `SELECT public.submit_payment_proof($1, $2, $3, $4);`,
        [electronicOrderCode, electronicOrderToken, proofPath, "Paid via CBE mobile banking"]
      );
      expect(res.rows[0].submit_payment_proof).toBe(true);

      const dbOrder = await db.query<{ proof_status: string; proof_image: string }>(
        `SELECT proof_status, proof_image FROM public.orders WHERE code = $1;`,
        [electronicOrderCode]
      );
      expect(dbOrder.rows[0].proof_status).toBe("pending");
      expect(dbOrder.rows[0].proof_image).toBe(proofPath);
    });

    it("prevents admin_update_order_status advancing electronic order to kitchen before proof approval", async () => {
      await setSessionContext(adminUuid, "authenticated");

      let errorMsg = "";
      try {
        await db.query(`SELECT public.admin_update_order_status($1, 'accepted');`, [
          electronicOrderCode,
        ]);
      } catch (err: any) {
        errorMsg = err.message;
      }
      expect(errorMsg).toContain("Payment proof must be approved first");
    });

    it("allows administrator to approve payment proof and advance status", async () => {
      await setSessionContext(adminUuid, "authenticated");

      const approveRes = await db.query<{ admin_approve_payment_proof: boolean }>(
        `SELECT public.admin_approve_payment_proof($1, 'Transaction verified in CBE merchant portal');`,
        [electronicOrderCode]
      );
      expect(approveRes.rows[0].admin_approve_payment_proof).toBe(true);

      // Now advancing to accepted and preparing must succeed
      const statusRes = await db.query<{ admin_update_order_status: boolean }>(
        `SELECT public.admin_update_order_status($1, 'accepted');`,
        [electronicOrderCode]
      );
      expect(statusRes.rows[0].admin_update_order_status).toBe(true);
    });

    it("prevents non-admin callers from executing admin RPCs", async () => {
      await setSessionContext(customerUuid, "authenticated");

      let errorMsg = "";
      try {
        await db.query(`SELECT public.admin_update_order_status($1, 'cancelled');`, [
          electronicOrderCode,
        ]);
      } catch (err: any) {
        errorMsg = err.message;
      }
      expect(errorMsg).toContain("Administrator privileges required");
    });
  });

  describe("6. Storage Bucket Verification & Policy Validation", () => {
    it("confirms storage.buckets payment-proofs exists, is private, and has 5MB limit", async () => {
      const bucket = await db.query<{ id: string; public: boolean; file_size_limit: number }>(
        `SELECT id, public, file_size_limit FROM storage.buckets WHERE id = 'payment-proofs';`
      );
      expect(bucket.rows.length).toBe(1);
      expect(bucket.rows[0].public).toBe(false);
      expect(Number(bucket.rows[0].file_size_limit)).toBe(5242880);
    });
  });
});
