import { describe, expect, it } from "bun:test";
import { createClient } from "@supabase/supabase-js";

const stagingUrl = "https://qwmgiamqheqadpyfrqvr.supabase.co";
const stagingKey = "sb_publishable_3Ss7NCkgSHtWsg2D7iVNjg_UpcAGK_s";
const supabase = createClient(stagingUrl, stagingKey);

describe("Staging Checkout Live Verification", () => {
  let validItemId = "doro";
  let validItemPrice = 420;

  it("fetches active menu items from Staging to get a valid item id", async () => {
    const { data, error } = await supabase.from("menu_items").select("id, name, price").limit(3);
    expect(error).toBeNull();
    expect(data).toBeDefined();
    expect(data!.length).toBeGreaterThan(0);
    validItemId = data![0].id;
    validItemPrice = Number(data![0].price);
  });

  it("fails with PGRST202 schema cache error when called with wrong RPC parameter names (contract mismatch verification)", async () => {
    // Calling with non-matching parameter names (e.g. order instead of p_order)
    const { data, error } = await (supabase.rpc as any)("create_order", {
      order: {
        customer_name: "Test Customer",
        phone: "0911223344",
      },
      items: [],
    });

    expect(data).toBeNull();
    expect(error).toBeDefined();
    expect(error!.message).toContain("Could not find the function public.create_order");
    expect(error!.details).toContain("parameters items, order");
    if (error!.hint) {
      expect(error!.hint).toContain("public.create_order(p_items, p_order)");
    }
  });

  it("successfully creates a guest order via public.create_order(p_order, p_items) with authoritative pricing", async () => {
    const testPhone = "0912345678";
    const testCustomer = "Automated Staging Test Customer";

    const { data, error } = await supabase.rpc("create_order", {
      p_order: {
        customer_name: testCustomer,
        phone: testPhone,
        service_type: "takeaway",
        zone: "",
        distance_km: 0,
        address: "",
        payment_method: "cash",
        scheduled_for: null,
      },
      p_items: [
        {
          menu_item_id: validItemId,
          quantity: 2,
          base_choice: "injera",
          spice_level: 2,
          extras: [],
          note: "Automated regression checkout verification",
        },
      ],
    });

    expect(error).toBeNull();
    expect(data).toBeDefined();
    expect(data.code).toMatch(/^GR-[A-Z0-9]{4,}$/);
    expect(data.order_id).toBeDefined();
    expect(data.status).toBe("placed");

    // Server-authoritative calculation: price * quantity
    expect(data.subtotal).toBe(validItemPrice * 2);
    expect(data.total).toBe(validItemPrice * 2);

    // Unauthenticated guest receives a 48-character cryptographic lookup token
    expect(data.guest_lookup_token).toBeDefined();
    expect(typeof data.guest_lookup_token).toBe("string");
    expect(data.guest_lookup_token.length).toBeGreaterThanOrEqual(32);

    // Verify guest order can be retrieved using get_guest_order(p_code, p_token)
    const { data: guestData, error: guestErr } = await supabase.rpc("get_guest_order", {
      p_code: data.code,
      p_token: data.guest_lookup_token,
    });

    expect(guestErr).toBeNull();
    expect(guestData).toBeDefined();
    expect(guestData.order).toBeDefined();
    expect(guestData.order.code).toBe(data.code);
    expect(guestData.order.customer_name).toBe(testCustomer);
    expect(guestData.items).toBeDefined();
    expect(guestData.items.length).toBe(1);
  });

  it("rejects order creation with an invalid phone number", async () => {
    const { data, error } = await supabase.rpc("create_order", {
      p_order: {
        customer_name: "Invalid Phone Test",
        phone: "12345",
        service_type: "takeaway",
        payment_method: "cash",
      },
      p_items: [
        {
          menu_item_id: validItemId,
          quantity: 1,
        },
      ],
    });

    expect(data).toBeNull();
    expect(error).toBeDefined();
    expect(error!.code).toBe("P0001");
    expect(error!.message.toLowerCase()).toContain("phone");
  });

  it("rejects order creation with an unknown or invalid menu item", async () => {
    const { data, error } = await supabase.rpc("create_order", {
      p_order: {
        customer_name: "Invalid Item Test",
        phone: "0911223344",
        service_type: "takeaway",
        payment_method: "cash",
      },
      p_items: [
        {
          menu_item_id: "non_existent_menu_dish_9999",
          quantity: 1,
        },
      ],
    });

    expect(data).toBeNull();
    expect(error).toBeDefined();
    expect(error!.code).toBe("P0001");
    expect(error!.message).toContain("non_existent_menu_dish_9999");
  });
});
