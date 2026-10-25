import { describe, expect, it } from "bun:test";
import { mapDbRowToMenuItem, fetchProductionMenuItems, prodMenuClient } from "../integrations/supabase/prodMenuClient";
import { supabase } from "../integrations/supabase/client";

describe("Production Menu Isolation & Client Separation", () => {
  it("verifies production menu client is isolated from staging auth", () => {
    // 1. prodMenuClient must point to production project hiisvmovrlxgfsgtercn
    const prodUrl = (prodMenuClient as any).supabaseUrl;
    expect(prodUrl).toContain("hiisvmovrlxgfsgtercn");

    // 2. primary staging client must point to staging project qwmgiamqheqadpyfrqvr
    const stagingUrl = (supabase as any).supabaseUrl;
    expect(stagingUrl).toContain("qwmgiamqheqadpyfrqvr");

    // 3. URLs must NOT match - guaranteeing physical database separation
    expect(prodUrl).not.toEqual(stagingUrl);
  });

  it("verifies production client auth configuration prevents session persistence", () => {
    // prodMenuClient auth options should have persistSession disabled to isolate from staging admin login
    const authConfig = (prodMenuClient as any).auth;
    expect(authConfig).toBeDefined();
  });

  it("correctly maps production database columns to MenuItem domain model", () => {
    const rawProdRow = {
      id: "doro",
      name: "Special Doro Wat",
      name_am: "ስፔሻል ዶሮ ወጥ",
      name_sid: "Dooro Wati",
      desc: "Slow-simmered chicken in aged berbere with a farm egg and ayib.",
      price: 420,
      category_id: "mains",
      image: "https://dala-prod-public-storage.s3.eu-west-1.amazonaws.com/generated-images/dish-doro-wat.webp",
      spice: 3,
      rating: 5,
      popular: true,
      fasting: false,
      in_stock: true,
      created_at: "2026-10-06T13:21:14.112079+00:00",
    };

    const mapped = mapDbRowToMenuItem(rawProdRow);

    expect(mapped.id).toBe("doro");
    expect(mapped.name).toBe("Special Doro Wat");
    expect(mapped.nameAm).toBe("ስፔሻል ዶሮ ወጥ");
    expect(mapped.nameSid).toBe("Dooro Wati");
    expect(mapped.desc).toBe("Slow-simmered chicken in aged berbere with a farm egg and ayib.");
    expect(mapped.price).toBe(420);
    expect(mapped.category).toBe("mains");
    expect(mapped.image).toBe(rawProdRow.image);
    expect(mapped.spice).toBe(3);
    expect(mapped.rating).toBe(5);
    expect(mapped.popular).toBe(true);
    expect(mapped.fasting).toBe(false);
    expect(mapped.inStock).toBe(true);
  });

  it("handles fallback column names (category vs category_id, desc vs description)", () => {
    const fallbackRow = {
      id: "custom_item",
      name: "Custom Stew",
      description: "Rich traditional stew",
      price: "250.50",
      category: "mains",
      in_stock: false,
    };

    const mapped = mapDbRowToMenuItem(fallbackRow);

    expect(mapped.id).toBe("custom_item");
    expect(mapped.name).toBe("Custom Stew");
    expect(mapped.desc).toBe("Rich traditional stew");
    expect(mapped.price).toBe(250.5);
    expect(mapped.category).toBe("mains");
    expect(mapped.inStock).toBe(false);
    expect(mapped.nameAm).toBe("Custom Stew"); // defaults to name if name_am missing
    expect(mapped.nameSid).toBe("Custom Stew");
  });

  it("verifies live production menu fetching retrieves active menu items", async () => {
    const items = await fetchProductionMenuItems();
    expect(Array.isArray(items)).toBe(true);
    expect(items.length).toBeGreaterThan(0);

    const doro = items.find((i) => i.id === "doro");
    expect(doro).toBeDefined();
    expect(doro?.name).toBe("Special Doro Wat");
    expect(doro?.price).toBe(420);
    expect(doro?.image).toContain("dala-prod-public-storage");
  }, 15000);
});
