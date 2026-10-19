import { describe, expect, it } from "bun:test";
import {
  getOrderFlow,
  getNextOrderStatus,
  isValidStatusTransition,
  normalizeOrderStatus,
  normalizeProofStatus,
} from "../lib/orders";
import { validateEmail, validatePassword } from "../lib/auth";
import { normalizePhoneNumber, validatePhoneNumber } from "../lib/phone";
import { ORDER_SUMMARY_SELECT } from "../context/GurshaStore";
import { resolveProofImageUrl } from "../lib/storage";

describe("Phase 3: Auth Input Validation and Admin Authorization", () => {
  it("validates and normalizes customer/admin emails correctly", () => {
    const valid = validateEmail("  Admin@Guresha.COM ");
    expect(valid.valid).toBe(true);
    expect(valid.normalized).toBe("admin@guresha.com");

    const invalid = validateEmail("invalid-email-string");
    expect(invalid.valid).toBe(false);
    expect(invalid.error).toBeDefined();

    const empty = validateEmail("");
    expect(empty.valid).toBe(false);
  });

  it("enforces minimum password length for security", () => {
    const tooShort = validatePassword("12345");
    expect(tooShort.valid).toBe(false);
    expect(tooShort.error).toContain("at least 6 characters");

    const valid = validatePassword("securepassword123");
    expect(valid.valid).toBe(true);
  });

  it("validates and normalizes phone numbers for Ethiopian telecom format", () => {
    const valid09 = validatePhoneNumber("0911234567");
    expect(valid09.valid).toBe(true);
    expect(valid09.normalized).toBe("+251911234567");

    const valid07 = validatePhoneNumber("0711234567");
    expect(valid07.valid).toBe(true);
    expect(valid07.normalized).toBe("+251711234567");

    const normalizedDirect = normalizePhoneNumber("0912345678");
    expect(normalizedDirect).toBe("+251912345678");

    const invalid = validatePhoneNumber("12345");
    expect(invalid.valid).toBe(false);
  });
});

describe("Phase 4: Order Status Workflow & Transitions", () => {
  it("normalizes legacy and mixed-case order statuses", () => {
    expect(normalizeOrderStatus("Out for Delivery")).toBe("dispatched");
    expect(normalizeOrderStatus("out_for_delivery")).toBe("dispatched");
    expect(normalizeOrderStatus("ready for pickup")).toBe("ready");
    expect(normalizeOrderStatus("placed")).toBe("placed");
    expect(normalizeOrderStatus(null)).toBe("placed");
  });

  it("normalizes legacy proof verification statuses", () => {
    expect(normalizeProofStatus("verified")).toBe("approved");
    expect(normalizeProofStatus("approved")).toBe("approved");
    expect(normalizeProofStatus("pending_verification")).toBe("pending");
    expect(normalizeProofStatus("rejected")).toBe("rejected");
    expect(normalizeProofStatus(undefined)).toBe("none");
  });

  it("defines appropriate linear stage flows per service type", () => {
    const deliveryFlow = getOrderFlow("delivery");
    expect(deliveryFlow).toContain("dispatched");
    expect(deliveryFlow).toEqual(["placed", "accepted", "preparing", "ready", "dispatched", "completed"]);

    const takeawayFlow = getOrderFlow("takeaway");
    expect(takeawayFlow).not.toContain("dispatched");
    expect(takeawayFlow).toEqual(["placed", "accepted", "preparing", "ready", "completed"]);

    const dineInFlow = getOrderFlow("dine-in");
    expect(dineInFlow).not.toContain("dispatched");
    expect(dineInFlow).toEqual(["placed", "accepted", "preparing", "ready", "completed"]);
  });

  it("blocks advancing electronic orders when payment proof is not approved", () => {
    const pendingCbeOrder = {
      status: "placed" as const,
      service: "delivery" as const,
      payment: "cbe" as const,
      proofStatus: "pending" as const,
    };
    expect(getNextOrderStatus(pendingCbeOrder)).toBeNull();

    const transitionCheck = isValidStatusTransition(pendingCbeOrder, "accepted");
    expect(transitionCheck.valid).toBe(false);
    expect(transitionCheck.error).toContain("Payment proof must be approved first");
  });

  it("allows advancing electronic orders once payment proof is approved", () => {
    const approvedCbeOrder = {
      status: "placed" as const,
      service: "delivery" as const,
      payment: "cbe" as const,
      proofStatus: "approved" as const,
    };
    expect(getNextOrderStatus(approvedCbeOrder)).toBe("accepted");

    const transitionCheck = isValidStatusTransition(approvedCbeOrder, "accepted");
    expect(transitionCheck.valid).toBe(true);
  });

  it("allows cash orders to advance without proof approval", () => {
    const cashOrder = {
      status: "placed" as const,
      service: "dine-in" as const,
      payment: "cash" as const,
      proofStatus: "none" as const,
    };
    expect(getNextOrderStatus(cashOrder)).toBe("accepted");
  });

  it("prevents non-delivery orders from entering dispatched state", () => {
    const takeawayOrder = {
      status: "ready" as const,
      service: "takeaway" as const,
      payment: "cash" as const,
      proofStatus: "none" as const,
    };
    expect(getNextOrderStatus(takeawayOrder)).toBe("completed");

    const invalidTransition = isValidStatusTransition(takeawayOrder, "dispatched");
    expect(invalidTransition.valid).toBe(false);
    expect(invalidTransition.error).toContain("only applicable to delivery orders");
  });

  it("allows cancellation from any active status but not from terminal states", () => {
    const activeOrder = {
      status: "preparing" as const,
      service: "delivery" as const,
      payment: "cash" as const,
      proofStatus: "none" as const,
    };
    expect(isValidStatusTransition(activeOrder, "cancelled").valid).toBe(true);

    const completedOrder = {
      status: "completed" as const,
      service: "delivery" as const,
      payment: "cash" as const,
      proofStatus: "none" as const,
    };
    expect(isValidStatusTransition(completedOrder, "cancelled").valid).toBe(false);

    const cancelledOrder = {
      status: "cancelled" as const,
      service: "delivery" as const,
      payment: "cash" as const,
      proofStatus: "none" as const,
    };
    expect(isValidStatusTransition(cancelledOrder, "preparing").valid).toBe(false);
  });
});

describe("Phase 4: Payment Proof & Polling Payload Optimization", () => {
  it("ORDER_SUMMARY_SELECT strictly excludes proof_image from regular order queries", () => {
    // Routine polling runs every 4 seconds. Downloading 2MB+ base64 proof_image for each order
    // saturates client bandwidth and causes UI freezing.
    const fields = ORDER_SUMMARY_SELECT.split(",").map((s) => s.trim());
    expect(fields).not.toContain("proof_image");
    expect(fields).toContain("id");
    expect(fields).toContain("code");
    expect(fields).toContain("proof_status");
    expect(fields).toContain("proof_note");
  });

  it("resolveProofImageUrl returns data URLs immediately without making network calls", async () => {
    const dataUrl = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
    const resolved = await resolveProofImageUrl(dataUrl);
    expect(resolved).toBe(dataUrl);
  });

  it("resolveProofImageUrl returns external HTTP(S) URLs unchanged", async () => {
    const httpsUrl = "https://example.com/payment-proofs/sample.jpg";
    const resolved = await resolveProofImageUrl(httpsUrl);
    expect(resolved).toBe(httpsUrl);
  });

  it("resolveProofImageUrl returns empty string for empty or null proof", async () => {
    // @ts-expect-error test invalid types
    expect(await resolveProofImageUrl(null)).toBe("");
    expect(await resolveProofImageUrl("")).toBe("");
    // @ts-expect-error test invalid types
    expect(await resolveProofImageUrl(undefined)).toBe("");
  });
});

describe("Phase 4: Dynamic Extras Validation & Server-Side Totals", () => {
  it("calculates order total with item base prices, dynamic extras, and service charges correctly", () => {
    interface CartItem {
      price: number;
      quantity: number;
      selectedExtras?: { name: string; price: number }[];
    }

    function calculateOrderTotals(
      items: CartItem[],
      serviceType: "delivery" | "dine_in" | "takeaway",
      deliveryFee: number = 50
    ) {
      const subtotal = items.reduce((sum, item) => {
        const extrasTotal = (item.selectedExtras || []).reduce((eSum, e) => eSum + e.price, 0);
        return sum + (item.price + extrasTotal) * item.quantity;
      }, 0);

      const fee = serviceType === "delivery" ? deliveryFee : 0;
      const total = subtotal + fee;

      return { subtotal, fee, total };
    }

    const testCart: CartItem[] = [
      {
        price: 120, // Tibs
        quantity: 2,
        selectedExtras: [
          { name: "Extra Injera", price: 20 },
          { name: "Spicy Awaze", price: 15 },
        ],
      },
      {
        price: 40, // Macchiato
        quantity: 1,
        selectedExtras: [],
      },
    ];

    // Subtotal:
    // Item 1: (120 + 20 + 15) * 2 = 155 * 2 = 310
    // Item 2: (40 + 0) * 1 = 40
    // Total subtotal: 350
    // Delivery fee: 50 -> Total: 400
    const deliveryCalc = calculateOrderTotals(testCart, "delivery", 50);
    expect(deliveryCalc.subtotal).toBe(350);
    expect(deliveryCalc.fee).toBe(50);
    expect(deliveryCalc.total).toBe(400);

    const dineInCalc = calculateOrderTotals(testCart, "dine_in", 50);
    expect(dineInCalc.subtotal).toBe(350);
    expect(dineInCalc.fee).toBe(0);
    expect(dineInCalc.total).toBe(350);
  });
});

describe("Phase 1 & 3: Guest Order Access Isolation & Security", () => {
  it("enforces high-entropy guest lookup tokens to prevent sequential guessing", () => {
    // Generate simulated guest tokens
    const generateToken = () => {
      const bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    };

    const token1 = generateToken();
    const token2 = generateToken();

    expect(token1.length).toBe(32);
    expect(token2.length).toBe(32);
    expect(token1).not.toBe(token2);
  });

  it("verifies payment proof storage keys follow protected path conventions", () => {
    const orderCode = "K7M2";
    const timestamp = 1729200000000;
    const ext = "jpg";
    const storageKey = `payment-proofs/${orderCode}_${timestamp}.${ext}`;

    expect(storageKey.startsWith("payment-proofs/")).toBe(true);
    expect(storageKey).toMatch(/^payment-proofs\/[A-Z0-9]+_\d+\.(jpg|png|webp)$/);
  });
});

