import { describe, expect, it, beforeAll } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import fs from "fs";
import path from "path";

describe("Production Checkout Migration Verification (20261023_fix_production_create_order_and_checkout.sql)", () => {
  let db: PGlite;
  const adminUuid = "a0000000-0000-0000-0000-000000000001";
  const customerUuid = "c0000000-0000-0000-0000-000000000002";
  const otherCustomerUuid = "c0000000-0000-0000-0000-000000000003";

  beforeAll(async () => {
    db = new PGlite();

    // 1. Setup mock Supabase auth schema and standard environment
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

      -- Create standard roles if missing
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
          CREATE ROLE anon;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
          CREATE ROLE authenticated;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
          CREATE ROLE service_role;
        END IF;
      END $$;

      -- Base production tables that already exist in production
      CREATE TABLE IF NOT EXISTS public.menu_items (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        name_am TEXT,
        name_sid TEXT,
        price NUMERIC(10,2) NOT NULL,
        category TEXT NOT NULL,
        image TEXT DEFAULT '',
        spice INTEGER DEFAULT 0,
        rating NUMERIC(3,2) DEFAULT 5.0,
        popular BOOLEAN DEFAULT false,
        fasting BOOLEAN DEFAULT false,
        in_stock BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS public.orders (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        code TEXT UNIQUE NOT NULL,
        created_at TIMESTAMPTZ DEFAULT now(),
        scheduled_for TIMESTAMPTZ,
        customer_name TEXT NOT NULL,
        phone TEXT NOT NULL,
        service_type TEXT NOT NULL DEFAULT 'takeaway',
        zone TEXT NOT NULL DEFAULT '',
        distance_km NUMERIC(6,2) NOT NULL DEFAULT 0,
        address TEXT NOT NULL DEFAULT '',
        subtotal NUMERIC(10,2) NOT NULL DEFAULT 0,
        delivery_fee NUMERIC(10,2) NOT NULL DEFAULT 0,
        delivery_charge NUMERIC(10,2) NOT NULL DEFAULT 0,
        service_fee NUMERIC(10,2) NOT NULL DEFAULT 0,
        service_charge NUMERIC(10,2) NOT NULL DEFAULT 0,
        total NUMERIC(10,2) NOT NULL DEFAULT 0,
        payment_method TEXT NOT NULL DEFAULT 'cash',
        proof_status TEXT NOT NULL DEFAULT 'none',
        proof_image TEXT NOT NULL DEFAULT '',
        proof_note TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'placed',
        eta INTEGER NOT NULL DEFAULT 25,
        staff_note TEXT NOT NULL DEFAULT ''
      );

      CREATE TABLE IF NOT EXISTS public.order_items (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
        menu_item_id TEXT NOT NULL,
        name TEXT NOT NULL,
        base_price NUMERIC(10,2) NOT NULL,
        quantity INTEGER NOT NULL,
        base_choice TEXT DEFAULT 'Injera',
        spice_level INTEGER DEFAULT 0,
        extras TEXT[] DEFAULT '{}',
        extra_price NUMERIC(10,2) DEFAULT 0,
        item_total NUMERIC(10,2) NOT NULL,
        note TEXT DEFAULT '',
        created_at TIMESTAMPTZ DEFAULT now()
      );
    `);

    // Insert mock users
    await db.query(
      `INSERT INTO auth.users (id, email) VALUES
       ($1, 'admin@gurshacafe.com'),
       ($2, 'customer@example.com'),
       ($3, 'other@example.com');`,
      [adminUuid, customerUuid, otherCustomerUuid]
    );

    // Insert mock menu items
    await db.query(`
      INSERT INTO public.menu_items (id, name, price, category, in_stock) VALUES
      ('doro', 'Special Doro Wat', 420.00, 'mains', true),
      ('kitfo', 'Special Kitfo', 520.00, 'mains', true),
      ('chechebsa', 'Chechebsa', 190.00, 'breakfast', true),
      ('sold_out_dish', 'Out of Stock Dish', 200.00, 'mains', false);
    `);

    // 2. Execute the migration file to repair production
    const migrationPath = path.resolve("supabase/migrations/20261023_fix_production_create_order_and_checkout.sql");
    const migrationSql = fs.readFileSync(migrationPath, "utf8");
    await db.exec(migrationSql);
  });

  function setSessionContext(uid: string | null, role: "anon" | "authenticated" | "service_role" = "anon") {
    return db.exec(`
      SET test.auth_uid = '${uid || ""}';
      SET test.auth_role = '${role}';
      SET request.jwt.claim.role = '${role}';
    `);
  }

  describe("1. Guest Checkout & Token Generation", () => {
    let guestOrderCode = "";
    let guestOrderToken = "";

    it("creates guest order without user registration and generates high-entropy 48-char lookup token", async () => {
      await setSessionContext(null, "anon");

      const res = await db.query<{ create_order: any }>(
        `SELECT public.create_order($1::jsonb, $2::jsonb);`,
        [
          JSON.stringify({
            customer_name: "Almaz Kebede",
            phone: "0911223344",
            service_type: "takeaway",
            payment_method: "cash",
          }),
          JSON.stringify([
            {
              menu_item_id: "doro",
              quantity: 1,
              base_choice: "Injera",
              spice_level: 2,
              extras: [],
              note: "Extra spicy please",
            },
          ]),
        ]
      );

      const created = res.rows[0].create_order;
      expect(created).toBeDefined();
      expect(created.code).toMatch(/^GR-[A-Z0-9]{4}/);
      expect(created.total).toBe(420);
      expect(created.subtotal).toBe(420);
      expect(created.delivery_fee).toBe(0);
      expect(created.service_charge).toBe(0);
      expect(created.status).toBe("placed");
      expect(created.guest_lookup_token).toBeDefined();
      expect(created.guest_lookup_token.length).toBe(48);

      guestOrderCode = created.code;
      guestOrderToken = created.guest_lookup_token;

      // Verify orders table record
      const orderRow = await db.query<any>(
        `SELECT user_id, guest_lookup_token FROM public.orders WHERE code = $1;`,
        [guestOrderCode]
      );
      expect(orderRow.rows[0].user_id).toBeNull();
      expect(orderRow.rows[0].guest_lookup_token).toBe(guestOrderToken);
    });

    it("retrieves guest order using get_guest_order with valid token without exposing secret token or user_id", async () => {
      await setSessionContext(null, "anon");

      const res = await db.query<{ get_guest_order: any }>(
        `SELECT public.get_guest_order($1, $2);`,
        [guestOrderCode, guestOrderToken]
      );

      const data = res.rows[0].get_guest_order;
      expect(data).toBeDefined();
      expect(data.order).toBeDefined();
      expect(data.order.code).toBe(guestOrderCode);
      expect(data.order.customer_name).toBe("Almaz Kebede");
      expect(data.order.guest_lookup_token).toBeUndefined();
      expect(data.order.user_id).toBeUndefined();
      expect(data.items.length).toBe(1);
      expect(data.items[0].name).toBe("Special Doro Wat");
      expect(data.items[0].item_total).toBe(420);
    });

    it("rejects guest lookup with wrong or short token", async () => {
      const wrong = await db.query<{ get_guest_order: any }>(
        `SELECT public.get_guest_order($1, $2);`,
        [guestOrderCode, "wrong_token_1234567890123456"]
      );
      expect(wrong.rows[0].get_guest_order).toBeNull();

      const short = await db.query<{ get_guest_order: any }>(
        `SELECT public.get_guest_order($1, $2);`,
        [guestOrderCode, "short"]
      );
      expect(short.rows[0].get_guest_order).toBeNull();
    });

    it("retrieves batch guest orders using get_guest_orders and excludes proof_image", async () => {
      const res = await db.query<{ get_guest_orders: any }>(
        `SELECT public.get_guest_orders($1::jsonb);`,
        [JSON.stringify([{ code: guestOrderCode, token: guestOrderToken }])]
      );

      const list = res.rows[0].get_guest_orders;
      expect(Array.isArray(list)).toBe(true);
      expect(list.length).toBe(1);
      expect(list[0].order.code).toBe(guestOrderCode);
      expect(list[0].order.proof_image).toBe(""); // Excluded in batch polling
      expect(list[0].items.length).toBe(1);
    });
  });

  describe("2. Authenticated Customer Checkout", () => {
    let authOrderCode = "";

    it("creates authenticated customer order bound to auth.uid() with null guest lookup token", async () => {
      await setSessionContext(customerUuid, "authenticated");

      const res = await db.query<{ create_order: any }>(
        `SELECT public.create_order($1::jsonb, $2::jsonb);`,
        [
          JSON.stringify({
            customer_name: "Customer User",
            phone: "0912345678",
            service_type: "dine-in",
            payment_method: "cash",
          }),
          JSON.stringify([
            {
              menu_item_id: "kitfo",
              quantity: 2,
              base_choice: "Kita bread", // +25 surcharge per item
              spice_level: 1,
              extras: ["Extra injera"], // +30 per item
            },
          ]),
        ]
      );

      const created = res.rows[0].create_order;
      expect(created).toBeDefined();
      // Item: (520 base + 25 kita bread + 30 extra injera) * 2 = 575 * 2 = 1150
      // Dine-in 5% service charge: round(1150 * 0.05) = 58
      // Total: 1150 + 58 = 1208
      expect(created.subtotal).toBe(1150);
      expect(created.service_charge).toBe(58);
      expect(created.total).toBe(1208);
      expect(created.guest_lookup_token).toBeNull();

      authOrderCode = created.code;

      const orderRow = await db.query<any>(
        `SELECT user_id, guest_lookup_token FROM public.orders WHERE code = $1;`,
        [authOrderCode]
      );
      expect(orderRow.rows[0].user_id).toBe(customerUuid);
      expect(orderRow.rows[0].guest_lookup_token).toBeNull();
    });
  });

  describe("3. Server-Authoritative Price Tampering Immunity & Delivery Fees", () => {
    it("computes delivery fee server-side and ignores client-submitted price fields", async () => {
      await setSessionContext(null, "anon");

      const res = await db.query<{ create_order: any }>(
        `SELECT public.create_order($1::jsonb, $2::jsonb);`,
        [
          JSON.stringify({
            customer_name: "Delivery Customer",
            phone: "+251911998877",
            service_type: "delivery",
            zone: "Main Campus", // 2 km -> ETB 30 + (2 * 10) = 50
            address: "Building A, Room 101",
            payment_method: "telebirr",
            // Attacker attempts to send fake totals and fees
            subtotal: 1,
            delivery_fee: 0,
            total: 1,
          }),
          JSON.stringify([
            {
              menu_item_id: "chechebsa",
              quantity: 1,
              base_choice: "No base",
              extras: [],
              // Attacker attempts to override base price
              base_price: 10,
              item_total: 10,
            },
          ]),
        ]
      );

      const created = res.rows[0].create_order;
      // Authoritative Chechebsa price is ETB 190, delivery fee is 50, total is 240
      expect(created.subtotal).toBe(190);
      expect(created.delivery_fee).toBe(50);
      expect(created.total).toBe(240);
      expect(created.status).toBe("payment_pending");
    });

    it("rejects delivery order when destination is disabled in store_settings", async () => {
      // Temporarily disable main-campus in store_settings
      await db.exec(`
        UPDATE public.store_settings
        SET value = '{
          "enabled": true,
          "destinations": [
            {"id": "main-campus", "name": "Main Campus", "distanceKm": 2, "enabled": false}
          ]
        }'::jsonb
        WHERE key = 'delivery';
      `);

      expect(async () => {
        await db.query(
          `SELECT public.create_order($1::jsonb, $2::jsonb);`,
          [
            JSON.stringify({
              customer_name: "Delivery Customer",
              phone: "0911223344",
              service_type: "delivery",
              zone: "Main Campus",
              address: "Building A",
              payment_method: "cash",
            }),
            JSON.stringify([{ menu_item_id: "doro", quantity: 1 }]),
          ]
        );
      }).toThrow(/disabled/i);

      // Re-enable
      await db.exec(`
        UPDATE public.store_settings
        SET value = '{
          "enabled": true,
          "destinations": [
            {"id": "main-campus", "name": "Main Campus", "distanceKm": 2, "enabled": true},
            {"id": "techno-campus", "name": "Techno Campus", "distanceKm": 4, "enabled": true}
          ]
        }'::jsonb
        WHERE key = 'delivery';
      `);
    });
  });

  describe("4. Extras Validation & Disallow Removed Drinks", () => {
    it("rejects drink extras (Ethiopian coffee, Soft drink, Ambo water) as food dish extras", async () => {
      for (const drink of ["Ethiopian coffee", "Soft drink", "Ambo water"]) {
        expect(async () => {
          await db.query(
            `SELECT public.create_order($1::jsonb, $2::jsonb);`,
            [
              JSON.stringify({
                customer_name: "Test Customer",
                phone: "0911223344",
                service_type: "takeaway",
                payment_method: "cash",
              }),
              JSON.stringify([
                {
                  menu_item_id: "doro",
                  quantity: 1,
                  extras: [drink],
                },
              ]),
            ]
          );
        }).toThrow(/Invalid food extra/i);
      }
    });

    it("rejects disabled extras without bypassing via hardcoded fallback branches", async () => {
      // Disable 'Extra injera' in store_settings
      await db.exec(`
        UPDATE public.store_settings
        SET value = '[
          {"id":"extra-injera","name":"Extra injera","price":30,"enabled":false},
          {"id":"ayib-cheese","name":"Ayib cheese","price":45,"enabled":true}
        ]'::jsonb
        WHERE key = 'extras';
      `);

      expect(async () => {
        await db.query(
          `SELECT public.create_order($1::jsonb, $2::jsonb);`,
          [
            JSON.stringify({
              customer_name: "Test Customer",
              phone: "0911223344",
              service_type: "takeaway",
              payment_method: "cash",
            }),
            JSON.stringify([
              {
                menu_item_id: "doro",
                quantity: 1,
                extras: ["Extra injera"],
              },
            ]),
          ]
        );
      }).toThrow(/disabled/i);

      // Restore enabled
      await db.exec(`
        UPDATE public.store_settings
        SET value = '[
          {"id":"extra-injera","name":"Extra injera","price":30,"enabled":true},
          {"id":"ayib-cheese","name":"Ayib cheese","price":45,"enabled":true},
          {"id":"boiled-egg","name":"Boiled egg","price":35,"enabled":true},
          {"id":"extra-awaze","name":"Extra awaze","price":20,"enabled":true}
        ]'::jsonb
        WHERE key = 'extras';
      `);
    });

    it("rejects duplicate extras on a single dish (case-insensitive)", async () => {
      expect(async () => {
        await db.query(
          `SELECT public.create_order($1::jsonb, $2::jsonb);`,
          [
            JSON.stringify({
              customer_name: "Test Customer",
              phone: "0911223344",
              service_type: "takeaway",
              payment_method: "cash",
            }),
            JSON.stringify([
              {
                menu_item_id: "doro",
                quantity: 1,
                extras: ["Ayib cheese", "ayib cheese"],
              },
            ]),
          ]
        );
      }).toThrow(/Duplicate extra/i);
    });
  });

  describe("5. Input Validation, Inventory & Timestamp Constraints", () => {
    it("rejects out-of-stock menu items", async () => {
      expect(async () => {
        await db.query(
          `SELECT public.create_order($1::jsonb, $2::jsonb);`,
          [
            JSON.stringify({
              customer_name: "Test Customer",
              phone: "0911223344",
              service_type: "takeaway",
              payment_method: "cash",
            }),
            JSON.stringify([{ menu_item_id: "sold_out_dish", quantity: 1 }]),
          ]
        );
      }).toThrow(/out of stock/i);
    });

    it("rejects unknown menu items", async () => {
      expect(async () => {
        await db.query(
          `SELECT public.create_order($1::jsonb, $2::jsonb);`,
          [
            JSON.stringify({
              customer_name: "Test Customer",
              phone: "0911223344",
              service_type: "takeaway",
              payment_method: "cash",
            }),
            JSON.stringify([{ menu_item_id: "non_existent_item", quantity: 1 }]),
          ]
        );
      }).toThrow(/Invalid or unknown menu item/i);
    });

    it("rejects scheduled orders with past timestamps", async () => {
      const pastTime = new Date(Date.now() - 3600000).toISOString();
      expect(async () => {
        await db.query(
          `SELECT public.create_order($1::jsonb, $2::jsonb);`,
          [
            JSON.stringify({
              customer_name: "Test Customer",
              phone: "0911223344",
              service_type: "takeaway",
              payment_method: "cash",
              scheduled_for: pastTime,
            }),
            JSON.stringify([{ menu_item_id: "doro", quantity: 1 }]),
          ]
        );
      }).toThrow(/Scheduled order time cannot be in the past/i);
    });

    it("rejects invalid Ethiopian mobile phone numbers", async () => {
      expect(async () => {
        await db.query(
          `SELECT public.create_order($1::jsonb, $2::jsonb);`,
          [
            JSON.stringify({
              customer_name: "Test Customer",
              phone: "12345", // Invalid
              service_type: "takeaway",
              payment_method: "cash",
            }),
            JSON.stringify([{ menu_item_id: "doro", quantity: 1 }]),
          ]
        );
      }).toThrow(/Invalid Ethiopian mobile phone number/i);
    });
  });

  describe("6. Payment Proof Submission & Guest Ownership Enforcement", () => {
    let guestCode = "";
    let guestToken = "";

    beforeAll(async () => {
      await setSessionContext(null, "anon");
      const res = await db.query<{ create_order: any }>(
        `SELECT public.create_order($1::jsonb, $2::jsonb);`,
        [
          JSON.stringify({
            customer_name: "Proof Customer",
            phone: "0977889900",
            service_type: "takeaway",
            payment_method: "telebirr",
          }),
          JSON.stringify([{ menu_item_id: "doro", quantity: 1 }]),
        ]
      );
      guestCode = res.rows[0].create_order.code;
      guestToken = res.rows[0].create_order.guest_lookup_token;
    });

    it("allows guest with matching secret token to submit payment proof", async () => {
      await setSessionContext(null, "anon");

      const res = await db.query<{ submit_payment_proof: boolean }>(
        `SELECT public.submit_payment_proof($1, $2, $3, $4);`,
        [guestCode, guestToken, "https://example.com/receipt.jpg", "Telebirr transaction 123456"]
      );

      expect(res.rows[0].submit_payment_proof).toBe(true);

      const check = await db.query<any>(
        `SELECT proof_status, proof_image, proof_note FROM public.orders WHERE code = $1;`,
        [guestCode]
      );
      expect(check.rows[0].proof_status).toBe("pending");
      expect(check.rows[0].proof_image).toBe("https://example.com/receipt.jpg");
      expect(check.rows[0].proof_note).toBe("Telebirr transaction 123456");
    });

    it("denies payment proof submission with invalid guest token", async () => {
      await setSessionContext(null, "anon");

      expect(async () => {
        await db.query(
          `SELECT public.submit_payment_proof($1, $2, $3, $4);`,
          [guestCode, "invalid_guest_token_1234567890", "receipt.jpg", "note"]
        );
      }).toThrow(/Access Denied/i);
    });
  });

  describe("7. Concurrent Order Code Generation & Collision Safety", () => {
    it("generates 20 unique order codes without collision or exceptions", async () => {
      const codes = new Set<string>();
      for (let i = 0; i < 20; i++) {
        const res = await db.query<{ generate_order_code: string }>(
          `SELECT public.generate_order_code();`
        );
        const code = res.rows[0].generate_order_code;
        expect(code).toMatch(/^GR-[A-Z0-9]{4}/);
        expect(codes.has(code)).toBe(false);
        codes.add(code);
      }
      expect(codes.size).toBe(20);
    });
  });
});
