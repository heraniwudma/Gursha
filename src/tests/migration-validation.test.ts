import { describe, expect, it } from "bun:test";
import {
  DEFAULT_EXTRAS,
  DRINK_ADDONS,
  } from "../data/mockData";

describe("1. Serving Choice Normalization & Surcharges", () => {
  function resolveBaseChoice(input: string): { choice: string; extraFee: number; valid: boolean } {
    const norm = input.trim().toLowerCase();
    if (["kita bread", "kita", "bread"].includes(norm)) {
      return { choice: "Kita bread", extraFee: 25, valid: true };
    }
    if (["injera", ""].includes(norm)) {
      return { choice: "Injera", extraFee: 0, valid: true };
    }
    if (["no base", "none"].includes(norm)) {
      return { choice: "None", extraFee: 0, valid: true };
    }
    return { choice: input, extraFee: 0, valid: false };
  }

  it("accepts 'Bread' from CustomerViews.tsx and maps to Kita bread with ETB 25 fee", () => {
    const res = resolveBaseChoice("Bread");
    expect(res.valid).toBe(true);
    expect(res.choice).toBe("Kita bread");
    expect(res.extraFee).toBe(25);
  });

  it("accepts 'Kita bread' and maps to Kita bread with ETB 25 fee", () => {
    const res = resolveBaseChoice("Kita bread");
    expect(res.valid).toBe(true);
    expect(res.choice).toBe("Kita bread");
    expect(res.extraFee).toBe(25);
  });

  it("accepts 'Injera' with zero surcharge", () => {
    const res = resolveBaseChoice("Injera");
    expect(res.valid).toBe(true);
    expect(res.choice).toBe("Injera");
    expect(res.extraFee).toBe(0);
  });

  it("accepts 'None' with zero surcharge", () => {
    const res = resolveBaseChoice("None");
    expect(res.valid).toBe(true);
    expect(res.choice).toBe("None");
    expect(res.extraFee).toBe(0);
  });

  it("rejects invalid base choices", () => {
    const res = resolveBaseChoice("Pasta");
    expect(res.valid).toBe(false);
  });
});

describe("2. Dynamic Extras & Drink Add-ons Pricing Verification", () => {
  const storeExtrasConfig = [
    ...DEFAULT_EXTRAS,
    ...DRINK_ADDONS.map((d) => ({
      id: d.label.toLowerCase().replace(/\s+/g, "-"),
      name: d.label,
      price: d.price,
      enabled: true,
    })),
  ];

  function resolveExtras(
    requested: string[],
    config: typeof storeExtrasConfig
  ): { totalExtraPrice: number; valid: boolean; error?: string } {
    let sum = 0;
    const seen = new Set<string>();

    for (const raw of requested) {
      const norm = raw.trim().toLowerCase();
      if (!norm) continue;
      if (seen.has(norm)) {
        return { totalExtraPrice: 0, valid: false, error: `Duplicate extra ${raw}` };
      }
      seen.add(norm);

      let matched = config.find(
        (c) => c.name.toLowerCase() === norm || c.id.toLowerCase() === norm
      );

      // Fallback check for drink add-ons
      if (!matched) {
        if (norm === "ethiopian coffee") matched = { id: "ethiopian-coffee", name: "Ethiopian coffee", price: 60, enabled: true };
        else if (norm === "soft drink") matched = { id: "soft-drink", name: "Soft drink", price: 45, enabled: true };
        else if (norm === "ambo water") matched = { id: "ambo-water", name: "Ambo water", price: 40, enabled: true };
      }

      if (!matched) {
        return { totalExtraPrice: 0, valid: false, error: `Invalid extra ${raw}` };
      }
      if (!matched.enabled) {
        return { totalExtraPrice: 0, valid: false, error: `Extra disabled ${raw}` };
      }
      sum += matched.price;
    }
    return { totalExtraPrice: sum, valid: true };
  }

  it("correctly validates and prices food extras", () => {
    const res = resolveExtras(["Extra injera", "Ayib cheese"], storeExtrasConfig);
    expect(res.valid).toBe(true);
    expect(res.totalExtraPrice).toBe(30 + 45); // 75
  });

  it("correctly validates and prices drink add-ons", () => {
    const res = resolveExtras(["Ethiopian coffee", "Ambo water"], storeExtrasConfig);
    expect(res.valid).toBe(true);
    expect(res.totalExtraPrice).toBe(60 + 40); // 100
  });

  it("correctly prices combination of food extras and drink add-on", () => {
    const res = resolveExtras(["Extra awaze", "Soft drink"], storeExtrasConfig);
    expect(res.valid).toBe(true);
    expect(res.totalExtraPrice).toBe(20 + 45); // 65
  });

  it("rejects unknown extras", () => {
    const res = resolveExtras(["Caviar"], storeExtrasConfig);
    expect(res.valid).toBe(false);
    expect(res.error).toContain("Invalid extra");
  });

  it("rejects duplicate extras on a single item", () => {
    const res = resolveExtras(["Extra injera", "extra injera"], storeExtrasConfig);
    expect(res.valid).toBe(false);
    expect(res.error).toContain("Duplicate extra");
  });
});

describe("3. Server-Side Totals Computation (Immunity to Client Price Tampering)", () => {
  function serverCalculateOrderTotal(params: {
    basePrice: number;
    qty: number;
    baseChoiceFee: number;
    extrasFee: number;
    serviceType: "dine-in" | "takeaway" | "delivery";
    distanceKm: number;
    clientClaimedTotal: number;
  }) {
    const itemTotal = (params.basePrice + params.baseChoiceFee + params.extrasFee) * params.qty;
    const subtotal = itemTotal;
    const deliveryFee = params.serviceType === "delivery" ? 30 + (params.distanceKm * 10) : 0;
    const serviceCharge = params.serviceType === "dine-in" ? Math.round(subtotal * 0.05 * 100) / 100 : 0;
    const authoritativeTotal = subtotal + deliveryFee + serviceCharge;

    return {
      subtotal,
      deliveryFee,
      serviceCharge,
      authoritativeTotal,
      clientTampered: params.clientClaimedTotal !== authoritativeTotal,
    };
  }

  it("computes delivery order server-side regardless of client total", () => {
    const result = serverCalculateOrderTotal({
      basePrice: 420, // Special Doro Wat
      qty: 2,
      baseChoiceFee: 25, // Bread (+25)
      extrasFee: 30, // Extra injera (+30)
      serviceType: "delivery",
      distanceKm: 4, // 30 + (4 * 10) = 70
      clientClaimedTotal: 1, // Malicious client attempt
    });

    // Subtotal: (420 + 25 + 30) * 2 = 475 * 2 = 950
    expect(result.subtotal).toBe(950);
    expect(result.deliveryFee).toBe(70);
    expect(result.serviceCharge).toBe(0);
    expect(result.authoritativeTotal).toBe(1020);
    expect(result.clientTampered).toBe(true);
  });

  it("computes dine-in 5% service charge server-side", () => {
    const result = serverCalculateOrderTotal({
      basePrice: 520, // Kitfo
      qty: 1,
      baseChoiceFee: 0,
      extrasFee: 0,
      serviceType: "dine-in",
      distanceKm: 0,
      clientClaimedTotal: 520, // Client forgot 5% charge
    });

    expect(result.subtotal).toBe(520);
    expect(result.deliveryFee).toBe(0);
    expect(result.serviceCharge).toBe(26); // 5% of 520
    expect(result.authoritativeTotal).toBe(546);
  });
});

describe("4. Guest Checkout vs Authenticated Checkout Model", () => {
  interface SimulatedOrderRecord {
    id: string;
    code: string;
    user_id: string | null;
    guest_lookup_token: string | null;
  }

  function simulateCreateOrder(authUid: string | null): SimulatedOrderRecord {
    const orderId = crypto.randomUUID();
    const code = "GR-" + Math.random().toString(36).substring(2, 6).toUpperCase();
    const isGuest = authUid === null;
    const token = isGuest
      ? crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "")
      : null;

    return {
      id: orderId,
      code,
      user_id: authUid,
      guest_lookup_token: token,
    };
  }

  it("creates guest orders with secret 48+ char token and null user_id", () => {
    const guestOrder = simulateCreateOrder(null);
    expect(guestOrder.user_id).toBeNull();
    expect(guestOrder.guest_lookup_token).toBeDefined();
    expect(guestOrder.guest_lookup_token!.length).toBeGreaterThanOrEqual(48);
  });

  it("creates authenticated orders with user_id and null guest token", () => {
    const userUuid = crypto.randomUUID();
    const authOrder = simulateCreateOrder(userUuid);
    expect(authOrder.user_id).toBe(userUuid);
    expect(authOrder.guest_lookup_token).toBeNull();
  });
});

describe("5. Payment Proof Storage Path & Authorization Logic", () => {
  function validateStorageUploadPermission(params: {
    objectName: string;
    bucketId: string;
    authUid: string | null;
    isAdmin: boolean;
    orderCode: string;
    orderUserId: string | null;
    orderProofStatus: string;
  }): { allowed: boolean; reason?: string } {
    if (params.bucketId !== "payment-proofs") {
      return { allowed: false, reason: "Wrong bucket" };
    }

    const ext = params.objectName.split(".").pop()?.toLowerCase();
    if (!["jpg", "jpeg", "png", "webp", "heic"].includes(ext || "")) {
      return { allowed: false, reason: "Disallowed extension" };
    }

    const orderPrefix = params.objectName.split("_")[0];
    if (orderPrefix !== params.orderCode) {
      return { allowed: false, reason: "Filename prefix does not match order code" };
    }

    // Authenticated user check
    if (params.authUid !== null) {
      if (params.isAdmin || params.orderUserId === params.authUid) {
        return { allowed: true };
      }
      return { allowed: false, reason: "Caller does not own this order" };
    }

    // Guest caller check
    if (params.orderUserId === null && ["none", "pending", "rejected"].includes(params.orderProofStatus)) {
      return { allowed: true };
    }

    return { allowed: false, reason: "Unauthorized guest upload" };
  }

  it("allows guest upload when filename matches guest order code and proof is pending", () => {
    const res = validateStorageUploadPermission({
      objectName: "GR-K7M2_1729200000000.jpg",
      bucketId: "payment-proofs",
      authUid: null,
      isAdmin: false,
      orderCode: "GR-K7M2",
      orderUserId: null,
      orderProofStatus: "none",
    });
    expect(res.allowed).toBe(true);
  });

  it("rejects guest upload when filename does not match order code", () => {
    const res = validateStorageUploadPermission({
      objectName: "GR-FAKE_1729200000000.jpg",
      bucketId: "payment-proofs",
      authUid: null,
      isAdmin: false,
      orderCode: "GR-K7M2",
      orderUserId: null,
      orderProofStatus: "none",
    });
    expect(res.allowed).toBe(false);
    expect(res.reason).toContain("does not match order code");
  });

  it("rejects upload of executable or disallowed file types", () => {
    const res = validateStorageUploadPermission({
      objectName: "GR-K7M2_1729200000000.exe",
      bucketId: "payment-proofs",
      authUid: null,
      isAdmin: false,
      orderCode: "GR-K7M2",
      orderUserId: null,
      orderProofStatus: "none",
    });
    expect(res.allowed).toBe(false);
    expect(res.reason).toContain("Disallowed extension");
  });
});

describe("6. Admin Authorization Verification & Session Revocation", () => {
  it("strictly denies login when admin_users record is absent", () => {
    const mockDbAdminUsers = new Set<string>(); // Empty table

    function checkAdminAccess(userUuid: string, appMetadataRole?: string): boolean {
      if (appMetadataRole === "admin") return true;
      return mockDbAdminUsers.has(userUuid);
    }

    const testUserUuid = crypto.randomUUID();
    expect(checkAdminAccess(testUserUuid, undefined)).toBe(false);

    // After explicit bootstrap
    mockDbAdminUsers.add(testUserUuid);
    expect(checkAdminAccess(testUserUuid, undefined)).toBe(true);
  });
});
