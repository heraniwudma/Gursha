import type { Order, OrderStatus, ProofStatus, ServiceType } from "../types";

/**
 * Normalizes any database or legacy proof status string into a type-safe ProofStatus.
 * Handles 'verified' -> 'approved' and 'pending_verification' -> 'pending'.
 */
export function normalizeProofStatus(raw: string | null | undefined): ProofStatus {
  if (!raw) return "none";
  const clean = raw.trim().toLowerCase();
  if (clean === "verified" || clean === "approved") return "approved";
  if (clean === "pending_verification" || clean === "pending") return "pending";
  if (clean === "rejected") return "rejected";
  return "none";
}

/**
 * Normalizes any database or legacy order status string into a type-safe OrderStatus.
 */
export function normalizeOrderStatus(raw: string | null | undefined): OrderStatus {
  if (!raw) return "placed";
  const clean = raw.trim().toLowerCase();
  if (clean === "out for delivery" || clean === "out_for_delivery" || clean === "on the way") {
    return "dispatched";
  }
  if (clean === "ready for pickup" || clean === "ready_for_pickup") {
    return "ready";
  }
  const valid: OrderStatus[] = [
    "placed",
    "payment_pending",
    "accepted",
    "preparing",
    "ready",
    "dispatched",
    "completed",
    "cancelled",
  ];
  return valid.includes(clean as OrderStatus) ? (clean as OrderStatus) : "placed";
}

/**
 * Returns the linear stage progression for an order based on service type.
 * Delivery orders include 'dispatched' (Out for delivery).
 * Dine-in and Takeaway orders advance directly from 'ready' to 'completed'.
 */
export function getOrderFlow(service: ServiceType): OrderStatus[] {
  if (service === "delivery") {
    return ["placed", "accepted", "preparing", "ready", "dispatched", "completed"];
  }
  return ["placed", "accepted", "preparing", "ready", "completed"];
}

/**
 * Computes the next valid order status in the sequence.
 * Enforces business rules:
 * - Electronic payment orders cannot move forward until proof is approved.
 * - Non-delivery orders never enter 'dispatched'.
 * - Terminal states ('completed', 'cancelled') have no next state.
 */
export function getNextOrderStatus(order: Pick<Order, "status" | "service" | "payment" | "proofStatus">): OrderStatus | null {
  if (order.status === "completed" || order.status === "cancelled") {
    return null;
  }

  // Guard: Electronic orders must have approved payment before moving forward
  if (order.payment !== "cash" && order.proofStatus !== "approved") {
    return null;
  }

  if (order.status === "placed" || order.status === "payment_pending") {
    return "accepted";
  }
  if (order.status === "accepted") {
    return "preparing";
  }
  if (order.status === "preparing") {
    return "ready";
  }
  if (order.status === "ready") {
    return order.service === "delivery" ? "dispatched" : "completed";
  }
  if (order.status === "dispatched") {
    return "completed";
  }

  return null;
}

/**
 * Validates whether a target status transition is permitted from the current order state.
 */
export function isValidStatusTransition(
  order: Pick<Order, "status" | "service" | "payment" | "proofStatus">,
  targetStatus: OrderStatus
): { valid: boolean; error?: string } {
  if (order.status === targetStatus) {
    return { valid: false, error: `Order is already ${targetStatus}.` };
  }

  if (order.status === "cancelled") {
    return { valid: false, error: "Cannot modify status of a cancelled order." };
  }

  if (order.status === "completed") {
    return { valid: false, error: "Cannot modify status of a completed order." };
  }

  // Cancellation is allowed from any active state
  if (targetStatus === "cancelled") {
    return { valid: true };
  }

  // Dispatched is strictly for delivery orders
  if (targetStatus === "dispatched" && order.service !== "delivery") {
    return { valid: false, error: "Out for delivery stage is only applicable to delivery orders." };
  }

  // Electronic payment verification guard
  if (
    order.payment !== "cash" &&
    order.proofStatus !== "approved" &&
    targetStatus !== "payment_pending" &&
    targetStatus !== "placed"
  ) {
    return {
      valid: false,
      error: `Cannot transition to "${targetStatus}": Payment proof must be approved first.`,
    };
  }

  return { valid: true };
}
