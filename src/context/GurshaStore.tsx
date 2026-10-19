import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type {
  AuthResult, BaseChoice, CartItem, CartOptions, Cms, DeliverySettings, ExtraOption, GurshaContextValue, GurshaState,
  Lang, MenuItem, Order, OrderStatus, PaymentMethod, PlaceInput, ProofStatus,
  ServiceType, Session, Theme,
} from "../types";
import {
  DEFAULT_DELIVERY_SETTINGS, DEFAULT_EXTRAS, MENU, SEED_CMS, T, zoneFee,
} from "../data/mockData";
import { supabase } from "@/integrations/supabase/client";
import { normalizePhoneNumber, validatePhoneNumber } from "../lib/phone";
import {
  checkIsAdmin,
  checkIsAdminEmail,
  resendVerificationEmail,
  sendEmailOtp,
  sendPhoneOtp,
  signInAdmin as signInAdminLib,
  signInCustomer as signInCustomerLib,
  signOutAuth,
  signUpCustomer as signUpCustomerLib,
  requestPasswordReset as requestPasswordResetLib,
  verifyPasswordResetOtp as verifyPasswordResetOtpLib,
  updateUserPassword as updateUserPasswordLib,
  changeAdminPassword as changeAdminPasswordLib,
  validateEmail,
  verifyCurrentUserIsAdmin,
  verifyEmailOtp as verifyEmailOtpLib,
  verifyPhoneOtp,
} from "../lib/auth";
import {
  normalizeProofStatus,
  normalizeOrderStatus,
  getNextOrderStatus,
  isValidStatusTransition,
} from "../lib/orders";
import { uploadPaymentProofImage } from "../lib/storage";

export const ORDER_SUMMARY_SELECT =
  "id, code, created_at, scheduled_for, customer_name, phone, service_type, zone, distance_km, address, subtotal, delivery_fee, service_charge, total, payment_method, proof_status, proof_note, status, eta, staff_note, user_id, guest_lookup_token, order_items(*)";

const KEY = "gursha.hawassa.state.v1";
const LANG_KEY = "gursha.hawassa.lang.v1";
const GUEST_ORDERS_KEY = "gursha.guest.orders.v1";
const GUEST_TOKENS_KEY = "gursha.guest.tokens.v1";
const uid = () => Math.random().toString(36).slice(2, 10);

// 32 unambiguous uppercase alphanumeric characters (avoids 0/O, 1/I, powers of 2 for zero modulo bias)
const ORDER_CODE_CHARSET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

function generateCandidateOrderCode(): string {
  const bytes = new Uint8Array(4);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 4; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  let suffix = "";
  for (let i = 0; i < 4; i++) {
    suffix += ORDER_CODE_CHARSET[bytes[i] & 31];
  }
  return `GR-${suffix}`;
}

const SEED: GurshaState = {
  menu: MENU,
  orders: [],
  extras: DEFAULT_EXTRAS,
  cms: SEED_CMS,
  deliverySettings: DEFAULT_DELIVERY_SETTINGS,
  cart: [],
  session: null,
  adminAuthed: false,
  adminOtp: "",
  lang: "en",
  theme: "light",
  service: "takeaway",
  serviceChosen: false,
  guestOrderCodes: [],
  guestTokens: {},
};

const FLOW: OrderStatus[] = ["placed", "accepted", "preparing", "ready", "dispatched", "completed"];

const etaFor = (s: ServiceType) => (s === "delivery" ? 40 : s === "takeaway" ? 20 : 25);

function load(): GurshaState {
  let initialLang: Lang = "en";
  try {
    const storedLang = localStorage.getItem(LANG_KEY);
    if (storedLang === "en" || storedLang === "am" || storedLang === "sid") {
      initialLang = storedLang as Lang;
    }
  } catch {}

  try {
    const raw = localStorage.getItem(KEY);
    let guestCodes: string[] = [];
    let guestTokens: Record<string, string> = {};
    try {
      const storedGuestCodes = localStorage.getItem(GUEST_ORDERS_KEY);
      if (storedGuestCodes) {
        guestCodes = JSON.parse(storedGuestCodes);
      }
      const storedGuestTokens = localStorage.getItem(GUEST_TOKENS_KEY);
      if (storedGuestTokens) {
        guestTokens = JSON.parse(storedGuestTokens);
      }
    } catch {}

    if (raw) {
      const parsed = JSON.parse(raw) as Partial<GurshaState>;
      if (!localStorage.getItem(LANG_KEY) && (parsed.lang === "en" || parsed.lang === "am" || parsed.lang === "sid")) {
        initialLang = parsed.lang;
      }
      const cmsData = { ...SEED_CMS, ...(parsed.cms || {}) };
      if (
        cmsData.promoBanner?.badge?.toLowerCase().includes("lakeside special") ||
        cmsData.promoBanner?.code === "GURSHA10" ||
        cmsData.promoBanner?.title?.toLowerCase().includes("lakeside special")
      ) {
        cmsData.promoBanner = {
          ...cmsData.promoBanner,
          enabled: false,
          badge: "",
          title: "",
          description: "",
          code: "",
        };
      }
      if (cmsData.announcement?.includes("GURSHA10")) {
        cmsData.announcement = "Live now — free injera refills on dine-in.";
      }
      const deliveryData =
        parsed.deliverySettings && Array.isArray(parsed.deliverySettings.destinations)
          ? parsed.deliverySettings
          : DEFAULT_DELIVERY_SETTINGS;

      const extrasData =
        parsed.extras && Array.isArray(parsed.extras) && parsed.extras.length > 0
          ? parsed.extras
          : DEFAULT_EXTRAS;

      const mergedGuestCodes = Array.from(new Set([...(parsed.guestOrderCodes || []), ...guestCodes]));
      const mergedGuestTokens = { ...(parsed.guestTokens || {}), ...guestTokens };

      return {
        ...SEED,
        ...parsed,
        lang: initialLang,
        adminAuthed: false,
        cms: cmsData,
        extras: extrasData,
        deliverySettings: deliveryData,
        guestOrderCodes: mergedGuestCodes,
        guestTokens: mergedGuestTokens,
      };
    }
  } catch {
    /* corrupted store — fall back to seed */
  }
  return { ...SEED, lang: initialLang };
}

const Ctx = createContext<GurshaContextValue | null>(null);

export function GurshaProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<GurshaState>(load);
  const [cartOpen, setCartOpen] = useState(false);
  const inFlightOps = useRef<Set<string>>(new Set());

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* storage full or blocked */
    }
  }, [state]);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === LANG_KEY && e.newValue) {
        const incomingLang = e.newValue as Lang;
        if (incomingLang === "en" || incomingLang === "am" || incomingLang === "sid") {
          setState((prev) => (prev.lang === incomingLang ? prev : { ...prev, lang: incomingLang }));
        }
        return;
      }
      if (e.key !== KEY || !e.newValue) return;
      try {
        const incoming = { ...SEED, ...(JSON.parse(e.newValue) as Partial<GurshaState>) };
        setState((prev) => {
          if (incoming.orders.length > prev.orders.length) {
            const fresh = incoming.orders.length - prev.orders.length;
            setTimeout(() => toast.info(`Live sync · ${fresh} new order${fresh > 1 ? "s" : ""} received`), 0);
          }
          return incoming;
        });
      } catch {
        /* ignore malformed cross-tab payload */
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // Supabase Auth real session persistence & synchronization
  useEffect(() => {
    let mounted = true;

    async function restoreAuthSession() {
      try {
        const { data: { session: authSession } } = await supabase.auth.getSession();
        if (mounted && authSession?.user) {
          const u = authSession.user;
          const normEmail = u.email ? u.email.trim().toLowerCase() : "";
          const isAdmin = await verifyCurrentUserIsAdmin();

          // Try fetching from profiles table
          let resolvedName = u.user_metadata?.full_name || normEmail.split("@")[0] || "Customer";
          let resolvedPhone = u.user_metadata?.phone || u.phone || "";

          try {
            const { data: profile } = await supabase
              .from("profiles")
              .select("full_name, phone")
              .eq("id", u.id)
              .maybeSingle();

            if (profile?.full_name) resolvedName = profile.full_name;
            if (profile?.phone) resolvedPhone = profile.phone;
          } catch {}

          const isVerified = Boolean(u.email_confirmed_at || u.confirmed_at || u.phone_confirmed_at);

          setState((prev) => ({
            ...prev,
            session: {
              id: u.id,
              name: resolvedName,
              phone: resolvedPhone,
              email: normEmail || undefined,
              verified: isVerified,
              at: Date.now(),
            },
            adminAuthed: isAdmin,
          }));
        }
      } catch (err) {
        console.warn("[GurshaStore] restoreAuthSession notice:", err);
      }
    }

    restoreAuthSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, authSession) => {
      if (event === "SIGNED_OUT" && mounted) {
        setState((prev) => ({ ...prev, session: null, adminAuthed: false, adminOtp: "" }));
      } else if (mounted && authSession?.user) {
        const u = authSession.user;
        const normEmail = u.email ? u.email.trim().toLowerCase() : "";
        const isAdmin = await verifyCurrentUserIsAdmin();

        let resolvedName = u.user_metadata?.full_name || normEmail.split("@")[0] || "Customer";
        let resolvedPhone = u.user_metadata?.phone || u.phone || "";

        try {
          const { data: profile } = await supabase
            .from("profiles")
            .select("full_name, phone")
            .eq("id", u.id)
            .maybeSingle();

          if (profile?.full_name) resolvedName = profile.full_name;
          if (profile?.phone) resolvedPhone = profile.phone;
        } catch {}

        const isVerified = Boolean(u.email_confirmed_at || u.confirmed_at || u.phone_confirmed_at);

        setState((prev) => ({
          ...prev,
          session: {
            id: u.id,
            name: resolvedName,
            phone: resolvedPhone,
            email: normEmail || undefined,
            verified: isVerified,
            at: Date.now(),
          },
          adminAuthed: isAdmin,
        }));
      }
    });

    return () => {
      mounted = false;
      subscription?.unsubscribe();
    };
  }, []);

  const refreshCms = useCallback(async () => {
    try {
      // Primary: query public store_settings table
      const { data: ssData, error: ssErr } = await (supabase.from("store_settings") as any)
        .select("value")
        .eq("key", "cms")
        .maybeSingle();

      if (!ssErr && ssData?.value) {
        const parsed = typeof ssData.value === "string" ? JSON.parse(ssData.value) : ssData.value;
        if (parsed && typeof parsed === "object") {
          setState((prev) => ({
            ...prev,
            cms: { ...SEED_CMS, ...parsed },
          }));
          return;
        }
      }

      // Backward-compatible fallback to customer_sessions
      const { data, error } = await supabase
        .from("customer_sessions")
        .select("name")
        .eq("phone", "__cms_storefront__")
        .maybeSingle();

      if (!error && data?.name) {
        const parsed = JSON.parse(data.name);
        if (parsed && typeof parsed === "object") {
          setState((prev) => ({
            ...prev,
            cms: { ...SEED_CMS, ...parsed },
          }));
        }
      }
    } catch (err) {
      console.warn("Notice: Local CMS active. Supabase CMS sync available.", err);
    }
  }, []);

  useEffect(() => {
    refreshCms();

    // Supabase Realtime channel subscription for CMS updates
    const channel = supabase
      .channel("cms_storefront_sync")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "store_settings",
          filter: "key=eq.cms",
        },
        (payload: any) => {
          if (payload?.new?.value) {
            try {
              const parsed = typeof payload.new.value === "string" ? JSON.parse(payload.new.value) : payload.new.value;
              if (parsed && typeof parsed === "object") {
                setState((prev) => ({
                  ...prev,
                  cms: { ...SEED_CMS, ...parsed },
                }));
              }
            } catch (err) {
              console.warn("Realtime CMS parse error:", err);
            }
          }
        }
      )
      .subscribe();

    const onFocus = () => { refreshCms(); };
    window.addEventListener("focus", onFocus);

    return () => {
      supabase.removeChannel(channel);
      window.removeEventListener("focus", onFocus);
    };
  }, [refreshCms]);

  useEffect(() => {
    async function loadSupabaseDeliverySettings() {
      try {
        // Primary: query public store_settings table
        const { data: ssData, error: ssErr } = await (supabase.from("store_settings") as any)
          .select("value")
          .eq("key", "delivery")
          .maybeSingle();

        if (!ssErr && ssData?.value) {
          const parsed = typeof ssData.value === "string" ? JSON.parse(ssData.value) : ssData.value;
          if (parsed && typeof parsed === "object" && Array.isArray(parsed.destinations)) {
            setState((prev) => ({
              ...prev,
              deliverySettings: parsed,
            }));
            return;
          }
        }

        // Backward-compatible fallback to customer_sessions
        const { data, error } = await supabase
          .from("customer_sessions")
          .select("name")
          .eq("phone", "__delivery_settings__")
          .maybeSingle();

        if (!error && data?.name) {
          const parsed = JSON.parse(data.name);
          if (parsed && typeof parsed === "object" && Array.isArray(parsed.destinations)) {
            setState((prev) => ({
              ...prev,
              deliverySettings: parsed,
            }));
          }
        }
      } catch (err) {
        console.warn("Notice: Local delivery settings active. Supabase sync available.", err);
      }
    }
    loadSupabaseDeliverySettings();
  }, []);

  useEffect(() => {
    async function loadSupabaseCustomMenu() {
      try {
        // Primary: query public store_settings table
        const { data: ssData, error: ssErr } = await (supabase.from("store_settings") as any)
          .select("value")
          .eq("key", "menu")
          .maybeSingle();

        if (!ssErr && ssData?.value) {
          const parsed = typeof ssData.value === "string" ? JSON.parse(ssData.value) : ssData.value;
          if (Array.isArray(parsed) && parsed.length > 0) {
            setState((prev) => {
              const map = new Map<string, MenuItem>();
              prev.menu.forEach((m) => map.set(m.id, m));
              parsed.forEach((m: MenuItem) => map.set(m.id, m));
              return { ...prev, menu: Array.from(map.values()) };
            });
            return;
          }
        }

        // Backward-compatible fallback to customer_sessions
        const { data, error } = await supabase
          .from("customer_sessions")
          .select("name")
          .eq("phone", "__custom_menu__")
          .maybeSingle();

        if (!error && data?.name) {
          const parsed = JSON.parse(data.name);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setState((prev) => {
              const map = new Map<string, MenuItem>();
              prev.menu.forEach((m) => map.set(m.id, m));
              parsed.forEach((m: MenuItem) => map.set(m.id, m));
              return { ...prev, menu: Array.from(map.values()) };
            });
          }
        }
      } catch (err) {
        console.warn("Notice: Local menu active. Supabase sync available.", err);
      }
    }
    loadSupabaseCustomMenu();
  }, []);

  useEffect(() => {
    async function loadSupabaseExtras() {
      try {
        // Primary: query public store_settings table
        const { data: ssData, error: ssErr } = await (supabase.from("store_settings") as any)
          .select("value")
          .eq("key", "extras")
          .maybeSingle();

        if (!ssErr && ssData?.value) {
          const parsed = typeof ssData.value === "string" ? JSON.parse(ssData.value) : ssData.value;
          if (Array.isArray(parsed) && parsed.length > 0) {
            setState((prev) => ({ ...prev, extras: parsed }));
            return;
          }
        }

        // Backward-compatible fallback to customer_sessions
        const { data, error } = await supabase
          .from("customer_sessions")
          .select("name")
          .eq("phone", "__store_extras__")
          .maybeSingle();

        if (!error && data?.name) {
          const parsed = JSON.parse(data.name);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setState((prev) => ({ ...prev, extras: parsed }));
          }
        }
      } catch (err) {
        console.warn("Notice: Local extras active. Supabase sync available.", err);
      }
    }
    loadSupabaseExtras();
  }, []);

  useEffect(() => {
    if (state.cms?.appearance?.primaryColor) {
      document.documentElement.style.setProperty("--brand-primary", state.cms.appearance.primaryColor);
    }
    if (state.cms?.appearance?.fontFamily === "serif") {
      document.body.style.fontFamily = "Georgia, Cambria, 'Times New Roman', Times, serif";
    } else if (state.cms?.appearance?.fontFamily === "display") {
      document.body.style.fontFamily = "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    } else {
      document.body.style.fontFamily = "";
    }
  }, [state.cms?.appearance]);

  useEffect(() => {
    async function loadSupabaseOrders() {
      try {
        let dbOrders: any[] = [];

        if (state.adminAuthed) {
          // Authorized Admin: can view all incoming orders via DB RLS (excludes heavy proof_image from polling)
          const { data, error } = await supabase
            .from("orders")
            .select(ORDER_SUMMARY_SELECT)
            .order("created_at", { ascending: false });
          if (!error && data) dbOrders = data;
        } else if (state.session?.id && state.session?.verified) {
          // Authenticated Customer: strictly limited to their own orders via DB RLS (excludes heavy proof_image)
          const { data, error } = await supabase
            .from("orders")
            .select(ORDER_SUMMARY_SELECT)
            .eq("user_id", state.session.id)
            .order("created_at", { ascending: false });
          if (!error && data) dbOrders = data;
        } else if (state.guestOrderCodes && state.guestOrderCodes.length > 0) {
          // Guest: securely retrieve only their own orders using their per-order tokens via security-definer RPC
          const lookupPayload = state.guestOrderCodes.map((c) => ({
            code: c,
            token: state.guestTokens?.[c] || "",
          }));

          const { data: rpcData, error: rpcErr } = await (supabase.rpc as any)(
            "get_guest_orders",
            { p_orders: lookupPayload }
          );

          if (!rpcErr && Array.isArray(rpcData)) {
            dbOrders = rpcData.map((entry: any) => ({
              ...entry.order,
              order_items: entry.items || [],
            }));
          } else {
            // Fallback for individual get_guest_order
            const fetched = await Promise.all(
              state.guestOrderCodes.map(async (c) => {
                const token = state.guestTokens?.[c] || "";
                const { data } = await (supabase.rpc as any)("get_guest_order", {
                  p_code: c,
                  p_token: token,
                });
                if (data?.order) {
                  return {
                    ...data.order,
                    order_items: data.items || [],
                  };
                }
                return null;
              })
            );
            dbOrders = fetched.filter(Boolean);
          }
        } else {
          // Unauthenticated visitor with no placed orders: never query orders table
          return;
        }

        if (dbOrders && dbOrders.length > 0) {
          const mappedOrders: Order[] = dbOrders.map((o) => {
            return {
              id: o.id,
              code: o.code,
              createdAt: o.created_at ? new Date(o.created_at).getTime() : Date.now(),
              scheduledFor: o.scheduled_for ? new Date(o.scheduled_for).getTime() : null,
              customerName: o.customer_name,
              phone: o.phone,
              service: (o.service_type || "dine-in") as ServiceType,
              zone: o.zone || "",
              distanceKm: Number(o.distance_km) || 0,
              address: o.address || "",
              items: (o.order_items || []).map((it: any) => ({
                uid: it.id,
                itemId: it.menu_item_id,
                name: it.name,
                basePrice: Number(it.base_price),
                qty: it.quantity,
                base: (it.base_choice || "Injera") as BaseChoice,
                spice: it.spice_level ?? 0,
                extras: it.extras || [],
                extraPrice: Number(it.extra_price) || 0,
                note: it.note || "",
              })),
              subtotal: Number(o.subtotal),
              deliveryFee: Number(o.delivery_fee) || 0,
              serviceCharge: Number(o.service_charge) || 0,
              total: Number(o.total),
              payment: (o.payment_method || "cash") as PaymentMethod,
              proofStatus: normalizeProofStatus(o.proof_status),
              proofImage: o.proof_image || "",
              proofNote: o.proof_note || "",
              status: normalizeOrderStatus(o.status),
              eta: o.eta || 25,
              staffNote: o.staff_note || "",
              userId: o.user_id,
              guestLookupToken: o.guest_lookup_token,
            };
          });

          setState((prev) => {
            const map = new Map<string, Order>();
            prev.orders.forEach((o) => map.set(o.code, o));
            mappedOrders.forEach((o) => {
              const local = map.get(o.code);
              if (local) {
                // If local has approved proof and remote hasn't updated yet, keep approved
                if (local.proofStatus === "approved" && o.proofStatus !== "approved") {
                  o.proofStatus = local.proofStatus;
                }
                // Preserve full proofImage in state if routine polling query omitted it
                if (!o.proofImage && local.proofImage) {
                  o.proofImage = local.proofImage;
                }
              }
              map.set(o.code, o);
            });
            const merged = Array.from(map.values()).sort((a, b) => b.createdAt - a.createdAt);
            return { ...prev, orders: merged };
          });
        }
      } catch (err) {
        console.warn("Could not sync orders from Supabase:", err);
      }
    }
    loadSupabaseOrders();
    const interval = setInterval(loadSupabaseOrders, 4000);
    return () => clearInterval(interval);
  }, [state.adminAuthed, state.session?.id, state.session?.verified, state.guestOrderCodes, state.guestTokens]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", state.theme === "dark");
  }, [state.theme]);

  const patch = useCallback((p: Partial<GurshaState>) => setState((s) => ({ ...s, ...p })), []);

  const t = useCallback((k: string) => T[state.lang][k] ?? T.en[k] ?? k, [state.lang]);

  const setLang = useCallback(
    (lang: Lang) => {
      if (lang !== "en" && lang !== "am" && lang !== "sid") return;
      try {
        localStorage.setItem(LANG_KEY, lang);
      } catch {}
      patch({ lang });
    },
    [patch],
  );
  const setTheme = useCallback((theme: Theme) => patch({ theme }), [patch]);
  const setService = useCallback(
    (service: ServiceType, chosen = true) => patch({ service, serviceChosen: chosen }),
    [patch],
  );

  /* ---------------------------------------------------------------- cart */
  const addToCart = useCallback((item: MenuItem, o: CartOptions) => {
    const ci: CartItem = {
      uid: uid(), itemId: item.id, name: item.name, basePrice: item.price,
      qty: o.qty, base: o.base, spice: o.spice ?? item.spice ?? 0, extras: o.extras,
      extraPrice: o.extraPrice, note: o.note,
    };
    setState((s) => ({ ...s, cart: [...s.cart, ci] }));
    toast.success(`${item.name} added to your cart`);
  }, []);

  const setQty = useCallback((id: string, qty: number) => {
    setState((s) => ({
      ...s,
      cart: qty <= 0 ? s.cart.filter((c) => c.uid !== id) : s.cart.map((c) => (c.uid === id ? { ...c, qty } : c)),
    }));
  }, []);

  const removeFromCart = useCallback((id: string) => {
    setState((s) => ({ ...s, cart: s.cart.filter((c) => c.uid !== id) }));
    toast.info("Item removed from cart");
  }, []);

  const clearCart = useCallback(() => patch({ cart: [] }), [patch]);

  const cartCount = useMemo(() => state.cart.reduce((a, c) => a + c.qty, 0), [state.cart]);
  const cartSubtotal = useMemo(
    () => state.cart.reduce((a, c) => a + (c.basePrice + c.extraPrice) * c.qty, 0),
    [state.cart],
  );

  const persistOrderSync = useCallback(
    async (
      code: string,
      diff: {
        status?: OrderStatus;
        proofStatus?: ProofStatus;
        proofImage?: string;
        proofNote?: string;
        staffNote?: string;
      },
    ): Promise<{ error?: string }> => {
      // 1. Admin approving payment proof via secure RPC
      if (diff.proofStatus === "approved") {
        const { error } = await (supabase.rpc as any)("admin_approve_payment_proof", {
          p_code: code,
          p_staff_note: diff.staffNote || null,
        });
        if (error) {
          console.warn(`[GurshaStore] admin_approve_payment_proof error: ${error.message}`);
          return { error: error.message || "Failed to approve payment proof" };
        }
        return { error: undefined };
      }

      // 2. Admin rejecting payment proof via secure RPC
      if (diff.proofStatus === "rejected") {
        const { error } = await (supabase.rpc as any)("admin_reject_payment_proof", {
          p_code: code,
          p_staff_note: diff.staffNote || "Payment verification failed",
        });
        if (error) {
          console.warn(`[GurshaStore] admin_reject_payment_proof error: ${error.message}`);
          return { error: error.message || "Failed to reject payment proof" };
        }
        return { error: undefined };
      }

      // 3. Admin setting or advancing status via secure RPC
      if (diff.status) {
        const { error } = await (supabase.rpc as any)("admin_update_order_status", {
          p_code: code,
          p_status: diff.status,
          p_staff_note: diff.staffNote || null,
        });
        if (error) {
          console.warn(`[GurshaStore] admin_update_order_status error: ${error.message}`);
          return { error: error.message || `Failed to update status to ${diff.status}` };
        }
        return { error: undefined };
      }
      return { error: undefined };
    },
    [],
  );

  /* --------------------------------------------------------------- order */
  const placeOrder = useCallback(
    async (i: PlaceInput): Promise<Order> => {
      if (state.cart.length === 0) {
        toast.error("Your cart is empty.");
        throw new Error("Cart is empty");
      }

      // Default to "takeaway" if customer does not choose an order type
      const resolvedService: ServiceType = i.service || "takeaway";
      let resolvedZone = i.zone || "";
      let resolvedDistance = i.distanceKm || 0;

      if (resolvedService === "delivery") {
        if (!state.deliverySettings.enabled) {
          toast.error("Delivery service is currently disabled.");
          throw new Error("Delivery service is currently disabled");
        }
        const target = (i.zone || "").trim().toLowerCase();
        const matched = state.deliverySettings.destinations.find(
          (d) => d.id.toLowerCase() === target || d.name.toLowerCase() === target,
        );
        if (!matched || !matched.enabled) {
          toast.error(`The destination "${i.zone || "unspecified"}" is not currently available for delivery.`);
          throw new Error("Invalid or disabled delivery destination");
        }
        resolvedZone = matched.name;
        resolvedDistance = matched.distanceKm;
      }

      const subtotal = state.cart.reduce((a, c) => a + (c.basePrice + c.extraPrice) * c.qty, 0);
      const deliveryFee = resolvedService === "delivery" ? zoneFee(resolvedDistance) : 0;
      const serviceCharge = resolvedService === "dine-in" ? Math.round(subtotal * 0.05) : 0;
      const total = subtotal + deliveryFee + serviceCharge;
      const status: OrderStatus = i.payment === "cash" ? "placed" : "payment_pending";
      const eta = etaFor(resolvedService);
      const scheduledIso = i.scheduledFor ? new Date(i.scheduledFor).toISOString() : null;

      // 1. Insert order record atomically via database create_order RPC
      let dbOrder: any = null;
      let code = "";
      let guestLookupToken = !state.session?.id
        ? (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2))
        : null;

      const { data: rpcRes, error: rpcErr } = await (supabase.rpc as any)("create_order", {
        p_order: {
          customer_name: i.customerName.trim(),
          phone: i.phone.trim(),
          service_type: resolvedService,
          zone: resolvedZone,
          distance_km: resolvedDistance,
          address: i.address || "",
          payment_method: i.payment,
          scheduled_for: scheduledIso,
        },
        p_items: state.cart.map((c) => ({
          menu_item_id: c.itemId,
          quantity: c.qty,
          base_choice: c.base,
          spice_level: c.spice,
          extras: c.extras || [],
          note: c.note || "",
        })),
      });

      if (rpcErr || !rpcRes || !rpcRes.code) {
        const msg = rpcErr?.message || "Order creation could not be verified by the database";
        console.error("Supabase order creation error:", rpcErr);
        toast.error(`Order failed: ${msg}`);
        throw new Error(msg);
      }

      dbOrder = {
        id: rpcRes.order_id,
        created_at: new Date().toISOString(),
      };
      code = rpcRes.code;
      if (rpcRes.guest_lookup_token) {
        guestLookupToken = rpcRes.guest_lookup_token;
      }

      // If proof was provided at checkout, upload to storage bucket or fallback to data URL
      let proofPayload = i.proofImage;
      if (i.payment !== "cash" && i.proofImage && i.proofImage.trim().length > 0) {
        try {
          proofPayload = await uploadPaymentProofImage(i.proofImage, code);
          await (supabase.rpc as any)("submit_payment_proof", {
            p_code: code,
            p_token: guestLookupToken || "",
            p_image: proofPayload,
            p_note: i.proofNote || "",
          });
        } catch (proofErr) {
          console.warn("Payment proof auto-submit error:", proofErr);
        }
      }

      // 3. Assemble local Order representation
      const initialProofStatus: ProofStatus = i.payment === "cash" ? "none" : (i.proofImage && i.proofImage.trim().length > 0 ? "pending" : "none");
      const order: Order = {
        id: dbOrder.id,
        code,
        createdAt: dbOrder.created_at ? new Date(dbOrder.created_at).getTime() : Date.now(),
        scheduledFor: i.scheduledFor,
        customerName: i.customerName,
        phone: i.phone,
        service: resolvedService,
        zone: resolvedZone,
        distanceKm: resolvedDistance,
        address: i.address,
        items: state.cart,
        subtotal,
        deliveryFee,
        serviceCharge,
        total,
        payment: i.payment,
        proofStatus: initialProofStatus,
        proofImage: i.proofImage,
        proofNote: i.proofNote,
        status,
        eta,
        staffNote: "",
        userId: state.session?.id || null,
        guestLookupToken: guestLookupToken,
      };

      // 4. Update local state and clear cart ONLY after successful database save
      const nextGuestCodes = !state.session?.id
        ? Array.from(new Set([...state.guestOrderCodes, code]))
        : state.guestOrderCodes;

      const nextGuestTokens = {
        ...state.guestTokens,
        ...(guestLookupToken ? { [code]: guestLookupToken } : {}),
      };

      try {
        localStorage.setItem(GUEST_ORDERS_KEY, JSON.stringify(nextGuestCodes));
        if (guestLookupToken) {
          localStorage.setItem(GUEST_TOKENS_KEY, JSON.stringify(nextGuestTokens));
        }
      } catch {}

      setState((s) => ({
        ...s,
        orders: [order, ...s.orders],
        cart: [],
        service: resolvedService,
        serviceChosen: true,
        guestOrderCodes: nextGuestCodes,
        guestTokens: nextGuestTokens,
        session: s.session ?? { name: i.customerName, phone: normalizePhoneNumber(i.phone), otp: "", verified: false, at: Date.now() },
      }));

      // Synchronize initial proof status to persistent sync layer
      persistOrderSync(order.code, {
        status,
        proofStatus: initialProofStatus,
        proofImage: i.proofImage,
        proofNote: i.proofNote,
      });

      if (i.payment !== "cash") {
        if (i.proofImage) {
          toast.info(`Order ${code} submitted! Payment screenshot is awaiting administrator verification.`);
        } else {
          toast.info(`Order ${code} placed. Please attach your payment screenshot.`);
        }
      } else {
        toast.success(`Order ${code} confirmed! Cash payment selected.`);
      }
      return order;
    },
    [state.cart, state.orders, state.deliverySettings, persistOrderSync],
  );

  const setStatus = useCallback(
    async (code: string, status: OrderStatus): Promise<{ success: boolean; error?: string }> => {
      const opKey = `status:${code}`;
      if (inFlightOps.current.has(opKey)) {
        return { success: false, error: "An update for this order is already in progress." };
      }

      const order = state.orders.find((o) => o.code === code);
      if (!order) {
        toast.error(`Order ${code} not found.`);
        return { success: false, error: "Order not found" };
      }

      const check = isValidStatusTransition(order, status);
      if (!check.valid) {
        toast.error(check.error || `Cannot change status to "${status}".`);
        return { success: false, error: check.error };
      }

      inFlightOps.current.add(opKey);
      try {
        const { error } = await persistOrderSync(code, { status });
        if (error) {
          toast.error(`Order ${code} update failed: ${error}`);
          return { success: false, error };
        }

        setState((s) => ({
          ...s,
          orders: s.orders.map((o) => (o.code === code ? { ...o, status } : o)),
        }));

        const statusLabels: Record<OrderStatus, string> = {
          placed: "Placed",
          payment_pending: "Payment Pending",
          accepted: "Accepted",
          preparing: "Preparing",
          ready: "Ready",
          dispatched: "Out for delivery",
          completed: "Completed",
          cancelled: "Cancelled",
        };
        toast.success(`Order ${code} marked as ${statusLabels[status] || status}.`);
        return { success: true };
      } finally {
        inFlightOps.current.delete(opKey);
      }
    },
    [state.orders, persistOrderSync],
  );

  const advance = useCallback(
    async (code: string): Promise<{ success: boolean; error?: string }> => {
      const opKey = `advance:${code}`;
      if (inFlightOps.current.has(opKey)) {
        return { success: false, error: "An update for this order is already in progress." };
      }

      const order = state.orders.find((o) => o.code === code);
      if (!order) {
        toast.error(`Order ${code} not found.`);
        return { success: false, error: "Order not found" };
      }

      if (order.status === "cancelled" || order.status === "completed") {
        toast.info(`Order ${code} is already ${order.status}.`);
        return { success: false, error: `Order is already ${order.status}` };
      }

      if (order.payment !== "cash" && order.proofStatus !== "approved") {
        toast.error(`Order ${code} cannot advance: Payment proof must be approved by an administrator first.`);
        return { success: false, error: "Payment proof must be approved first" };
      }

      const next = getNextOrderStatus(order);
      if (!next) {
        toast.error(`Order ${code} cannot advance further from ${order.status}.`);
        return { success: false, error: "No next valid status" };
      }

      inFlightOps.current.add(opKey);
      try {
        const { error } = await persistOrderSync(code, { status: next });
        if (error) {
          toast.error(`Order ${code} could not advance: ${error}`);
          return { success: false, error };
        }

        setState((s) => ({
          ...s,
          orders: s.orders.map((o) => (o.code === code ? { ...o, status: next } : o)),
        }));

        const statusLabels: Record<OrderStatus, string> = {
          placed: "Placed",
          payment_pending: "Payment Pending",
          accepted: "Accepted",
          preparing: "Preparing",
          ready: "Ready",
          dispatched: "Out for delivery",
          completed: "Completed",
          cancelled: "Cancelled",
        };
        toast.success(`Order ${code} moved forward → ${statusLabels[next] || next}.`);
        return { success: true };
      } finally {
        inFlightOps.current.delete(opKey);
      }
    },
    [state.orders, persistOrderSync],
  );

  const submitProof = useCallback(
    async (code: string, image: string, note?: string): Promise<{ success: boolean; error?: string }> => {
      if (!image || !image.trim()) {
        toast.error("Please attach a valid payment screenshot.");
        return { success: false, error: "Payment screenshot is required" };
      }

      // Client-side payload size check (max 5MB in binary ~= 7MB in base64 string)
      if (image.length > 7000000) {
        toast.error("Payment proof image exceeds maximum allowed size (5MB). Please upload a smaller image.");
        return { success: false, error: "Image exceeds 5MB limit" };
      }

      const cleanNote = note?.trim() || "";
      setState((s) => ({
        ...s,
        orders: s.orders.map((o) =>
          o.code === code
            ? {
                ...o,
                proofImage: image,
                proofNote: cleanNote,
                proofStatus: "pending",
                status: "payment_pending",
                staffNote: "", // Reset rejection note upon resubmission
              }
            : o),
      }));

      let proofPayload = image;
      try {
        proofPayload = await uploadPaymentProofImage(image, code);
      } catch (uploadErr) {
        console.warn("Payment proof storage upload notice, using direct payload:", uploadErr);
      }

      const token = state.guestTokens?.[code] || "";
      try {
        const { error } = await (supabase.rpc as any)("submit_payment_proof", {
          p_code: code,
          p_token: token,
          p_image: proofPayload,
          p_note: cleanNote,
        });

        if (error) {
          console.error("Payment proof submission notice:", error);
          toast.error(`Payment proof error: ${error.message || "Failed to submit"}`);
          return { success: false, error: error.message };
        }

        toast.info("Payment proof submitted — awaiting administrator verification");
        return { success: true };
      } catch (err: any) {
        toast.error(`Payment proof error: ${err?.message || "Failed to submit"}`);
        return { success: false, error: err?.message };
      }
    },
    [state.guestTokens],
  );

  const approveProof = useCallback(
    async (code: string): Promise<{ success: boolean; error?: string }> => {
      const opKey = `proof-approve:${code}`;
      if (inFlightOps.current.has(opKey)) {
        return { success: false, error: "Action already in progress" };
      }

      if (!state.adminAuthed) {
        toast.error("Unauthorized: Please sign in as an administrator to verify payments.");
        return { success: false, error: "Unauthorized" };
      }

      const order = state.orders.find((o) => o.code === code);
      if (!order) {
        toast.error(`Order ${code} not found.`);
        return { success: false, error: "Order not found" };
      }

      if (order.proofStatus === "approved") {
        toast.info(`Payment for order ${code} is already approved.`);
        return { success: true };
      }

      if (!order.proofImage) {
        toast.error("Cannot approve: No payment proof screenshot attached.");
        return { success: false, error: "No payment screenshot" };
      }

      inFlightOps.current.add(opKey);
      try {
        const approvalTimestamp = new Date().toLocaleString();
        const approvalNote = `Payment verified & approved by Admin (${approvalTimestamp})`;

        const { error } = await persistOrderSync(code, {
          proofStatus: "approved",
          staffNote: approvalNote,
        });

        if (error) {
          toast.error(`Failed to approve payment: ${error}`);
          return { success: false, error };
        }

        // Decoupled: approval of payment verifies payment proof.
        // It does NOT automatically accept the order or change order status.
        setState((s) => ({
          ...s,
          orders: s.orders.map((o) =>
            o.code === code
              ? {
                  ...o,
                  proofStatus: "approved",
                  staffNote: approvalNote,
                }
              : o
          ),
        }));

        toast.success(`Payment verified for order ${code}. Order is ready to be accepted.`);
        return { success: true };
      } finally {
        inFlightOps.current.delete(opKey);
      }
    },
    [state.adminAuthed, state.orders, persistOrderSync],
  );

  const rejectProof = useCallback(
    async (code: string, reason: string): Promise<{ success: boolean; error?: string }> => {
      const opKey = `proof-reject:${code}`;
      if (inFlightOps.current.has(opKey)) {
        return { success: false, error: "Action already in progress" };
      }

      if (!state.adminAuthed) {
        toast.error("Unauthorized: Please sign in as an administrator to reject payments.");
        return { success: false, error: "Unauthorized" };
      }

      const order = state.orders.find((o) => o.code === code);
      if (!order) {
        toast.error(`Order ${code} not found.`);
        return { success: false, error: "Order not found" };
      }

      const rejectionReason = reason.trim() || "Payment screenshot unclear or amount mismatch.";

      inFlightOps.current.add(opKey);
      try {
        const { error } = await persistOrderSync(code, {
          proofStatus: "rejected",
          staffNote: rejectionReason,
        });

        if (error) {
          toast.error(`Failed to reject payment: ${error}`);
          return { success: false, error };
        }

        setState((s) => ({
          ...s,
          orders: s.orders.map((o) =>
            o.code === code
              ? {
                  ...o,
                  proofStatus: "rejected",
                  staffNote: rejectionReason,
                }
              : o
          ),
        }));

        toast.info(`Payment proof rejected for order ${code}. Customer has been notified.`);
        return { success: true };
      } finally {
        inFlightOps.current.delete(opKey);
      }
    },
    [state.adminAuthed, state.orders, persistOrderSync],
  );

  /* ---------------------------------------------------------------- auth */
  const requestOtp = useCallback(
    async (arg1: string, arg2?: string): Promise<AuthResult> => {
      // Allow flexible signature: requestOtp(name, phone) or requestOtp(phone, name)
      let phone = arg1;
      let name = arg2 || "";
      if (arg2 && validatePhoneNumber(arg2).valid && !validatePhoneNumber(arg1).valid) {
        phone = arg2;
        name = arg1;
      }

      const { valid, normalized, error: valErr } = validatePhoneNumber(phone);
      if (!valid) {
        toast.error(valErr || "Invalid phone number.");
        return { success: false, error: valErr };
      }

      const cleanName = (name || state.session?.name || "").trim() || "Guest";

      const res = await sendPhoneOtp(normalized);
      if (!res.success) {
        toast.error(res.error || "Failed to dispatch verification SMS.");
        return { success: false, error: res.error };
      }

      patch({
        session: {
          name: cleanName,
          phone: normalized,
          verified: false,
          at: Date.now(),
        },
      });

      toast.success(`Verification code sent to ${normalized}`);
      return { success: true };
    },
    [state.session, patch],
  );

  const verifyOtp = useCallback(
    async (code: string, phoneOverride?: string): Promise<AuthResult> => {
      const targetPhone = phoneOverride || state.session?.phone;
      if (!targetPhone) {
        toast.error("Please enter your phone number first.");
        return { success: false, error: "No phone number provided." };
      }

      const { valid, normalized, error: valErr } = validatePhoneNumber(targetPhone);
      if (!valid) {
        toast.error(valErr || "Invalid phone number.");
        return { success: false, error: valErr };
      }

      const res = await verifyPhoneOtp(normalized, code);
      if (!res.success) {
        toast.error(res.error || "Verification failed.");
        return { success: false, error: res.error };
      }

      // Check existing profile in customer_sessions to preserve existing customer records
      const { data: existingProfile } = await supabase
        .from("customer_sessions")
        .select("name, verified")
        .eq("phone", normalized)
        .maybeSingle();

      const resolvedName = existingProfile?.name || state.session?.name || "Customer";

      // Securely upsert customer session into Supabase (never store OTP)
      await supabase
        .from("customer_sessions")
        .upsert(
          {
            phone: normalized,
            name: resolvedName,
            otp: null,
            verified: true,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "phone" },
        );

      const verifiedSession = {
        name: resolvedName,
        phone: normalized,
        verified: true,
        at: Date.now(),
      };

      const isAdmin = await verifyCurrentUserIsAdmin(res.user);

      patch({
        session: verifiedSession,
        adminAuthed: isAdmin,
      });

      toast.success(`Phone verified — welcome, ${resolvedName}!`);
      return { success: true, session: verifiedSession };
    },
    [state.session, patch],
  );

  const logout = useCallback(async () => {
    await signOutAuth();
    patch({ session: null, adminAuthed: false, adminOtp: "" });
    toast.info("Signed out of Gursha");
  }, [patch]);

  const requestAdminOtp = useCallback(
    async (_phone: string): Promise<AuthResult> => {
      void _phone;
      const err = "Administrator authentication is standardized on email and password via /admin.";
      toast.info(err);
      return { success: false, error: err };
    },
    [],
  );

  const verifyAdminOtp = useCallback(
    async (_code: string, _phoneOverride?: string): Promise<AuthResult> => {
      void _code;
      void _phoneOverride;
      const err = "Administrator authentication is standardized on email and password via /admin.";
      toast.info(err);
      return { success: false, error: err };
    },
    [],
  );

  const adminLogout = useCallback(async () => {
    await signOutAuth();
    patch({ adminAuthed: false, adminOtp: "" });
    toast.info("Admin session closed");
  }, [patch]);

  /* ---------------------------------------------------------------- email OTP */
  const requestEmailOtp = useCallback(
    async (email: string, name?: string): Promise<AuthResult> => {
      const { valid, normalized, error: valErr } = validateEmail(email);
      if (!valid) {
        toast.error(valErr || "Please enter a valid email address.");
        return { success: false, error: valErr };
      }

      const cleanName = (name || state.session?.name || "").trim() || "Customer";

      const res = await sendEmailOtp(normalized);
      if (!res.success) {
        toast.error(res.error || "Failed to dispatch verification email.");
        return { success: false, error: res.error };
      }

      patch({
        session: {
          name: cleanName,
          phone: state.session?.phone || "",
          email: normalized,
          verified: false,
          at: Date.now(),
        },
      });

      toast.success(`Verification code sent to ${normalized}`);
      return { success: true };
    },
    [state.session, patch],
  );

  const verifyEmailOtp = useCallback(
    async (email: string, code: string): Promise<AuthResult> => {
      const { valid, normalized, error: valErr } = validateEmail(email || state.session?.email || "");
      if (!valid) {
        toast.error(valErr || "Please enter your email address.");
        return { success: false, error: valErr };
      }

      const cleanCode = (code || "").trim();
      if (!cleanCode || cleanCode.length < 6) {
        toast.error("Please enter the 6-digit verification code received in your email.");
        return { success: false, error: "Invalid verification code." };
      }

      const res = await verifyEmailOtpLib(normalized, cleanCode);
      if (!res.success) {
        toast.error(res.error || "Verification failed.");
        return { success: false, error: res.error };
      }

      // Check existing profile in customer_sessions to preserve existing customer records
      const { data: existingProfile } = await supabase
        .from("customer_sessions")
        .select("name, verified, otp")
        .eq("phone", `email:${normalized}`)
        .maybeSingle();

      const resolvedName =
        existingProfile?.name ||
        state.session?.name ||
        res.user?.user_metadata?.full_name ||
        normalized.split("@")[0] ||
        "Customer";
      const linkedPhone = existingProfile?.otp || state.session?.phone || "";

      // Securely upsert customer session into Supabase (never store OTP)
      await supabase
        .from("customer_sessions")
        .upsert(
          {
            phone: `email:${normalized}`,
            name: resolvedName,
            otp: linkedPhone || null,
            verified: true,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "phone" },
        );

      const isAdmin = await verifyCurrentUserIsAdmin(res.user);

      const verifiedSession: Session = {
        name: resolvedName,
        phone: linkedPhone,
        email: normalized,
        verified: true,
        at: Date.now(),
      };

      patch({
        session: verifiedSession,
        adminAuthed: isAdmin,
      });

      toast.success(`Email verified — welcome, ${resolvedName}!`);
      return { success: true, session: verifiedSession };
    },
    [state.session, patch],
  );

  const requestAdminEmailOtp = useCallback(
    async (email: string): Promise<AuthResult> => {
      const { valid, normalized, error: valErr } = validateEmail(email);
      if (!valid) {
        toast.error(valErr || "Please enter a valid administrator email address.");
        return { success: false, error: valErr };
      }

      // Pre-check authorization: Only authorized admin emails can request admin OTP
      const isAdmin = await checkIsAdminEmail(normalized);
      if (!isAdmin) {
        const err = `Access Denied: ${normalized} is not registered as an authorized administrator.`;
        toast.error(err);
        return { success: false, error: err };
      }

      const res = await sendEmailOtp(normalized);
      if (!res.success) {
        toast.error(res.error || "Failed to dispatch administrator verification email.");
        return { success: false, error: res.error };
      }

      toast.success(`Admin verification code sent to ${normalized}`);
      return { success: true };
    },
    [],
  );

  const verifyAdminEmailOtp = useCallback(
    async (email: string, code: string): Promise<AuthResult> => {
      const { valid, normalized, error: valErr } = validateEmail(email);
      if (!valid) {
        toast.error(valErr || "Invalid administrator email address.");
        return { success: false, error: valErr };
      }

      const cleanCode = (code || "").trim();
      if (!cleanCode || cleanCode.length < 6) {
        toast.error("Please enter the 6-digit administrator code.");
        return { success: false, error: "Invalid code." };
      }

      // 1. Verify real OTP via Supabase Auth
      const res = await verifyEmailOtpLib(normalized, cleanCode);
      if (!res.success) {
        toast.error(res.error || "Invalid or expired administrator OTP.");
        return { success: false, error: res.error };
      }

      // 2. Strict Role Check: Verify administrator privileges via database
      const isAdmin = await verifyCurrentUserIsAdmin(res.user);
      if (!isAdmin) {
        await signOutAuth();
        const err = `Access Denied: ${normalized} is not authorized for administrator access.`;
        toast.error(err);
        patch({ adminAuthed: false, adminOtp: "" });
        return { success: false, error: err };
      }

      patch({
        session: {
          id: res.user?.id || "",
          name: res.user?.user_metadata?.full_name || normalized.split("@")[0] || "Admin",
          phone: res.user?.user_metadata?.phone || "",
          email: normalized,
          verified: true,
          at: Date.now(),
        },
        adminAuthed: true,
        adminOtp: "",
      });
      toast.success("Administrator session verified — welcome to Gursha Admin");
      return { success: true };
    },
    [patch],
  );

  const updateCustomerProfile = useCallback(
    async (fullName: string, phone: string): Promise<AuthResult> => {
      if (!state.session?.id || !state.session?.verified) {
        toast.error("Please sign in to update your profile.");
        return { success: false, error: "Not authenticated" };
      }

      const cleanName = fullName.trim();
      if (!cleanName) {
        toast.error("Please enter your name.");
        return { success: false, error: "Name is required." };
      }

      let cleanPhone = phone.trim();
      if (cleanPhone) {
        const { valid, normalized, error: valErr } = validatePhoneNumber(cleanPhone);
        if (!valid) {
          toast.error(valErr || "Invalid phone number format.");
          return { success: false, error: valErr };
        }
        cleanPhone = normalized;
      }

      try {
        const userId = state.session.id;
        const { error: updateErr } = await supabase
          .from("profiles")
          .upsert({
            id: userId,
            email: state.session.email || undefined,
            full_name: cleanName,
            phone: cleanPhone || null,
            updated_at: new Date().toISOString(),
          });

        if (updateErr) {
          console.error("[GurshaStore] updateCustomerProfile error:", updateErr);
          toast.error("Failed to update profile. Please try again.");
          return { success: false, error: updateErr.message };
        }

        try {
          await supabase.auth.updateUser({
            data: {
              full_name: cleanName,
              phone: cleanPhone || undefined,
            },
          });
        } catch (metaErr) {
          console.warn("[GurshaStore] Could not update auth user metadata:", metaErr);
        }

        const updatedSession: Session = {
          ...state.session,
          name: cleanName,
          phone: cleanPhone,
        };

        patch({ session: updatedSession });
        toast.success("Profile updated successfully!");
        return { success: true, session: updatedSession };
      } catch (err: any) {
        console.error("[GurshaStore] Unexpected updateCustomerProfile error:", err);
        toast.error("Failed to update profile.");
        return { success: false, error: err?.message || "Failed to update profile." };
      }
    },
    [state.session, patch],
  );

  const linkCustomerPhone = useCallback(
    async (phone: string): Promise<AuthResult> => {
      if (!state.session?.email || !state.session?.verified) {
        toast.error("Please sign in with your email first.");
        return { success: false, error: "Not authenticated" };
      }

      const { valid, normalized, error: valErr } = validatePhoneNumber(phone);
      if (!valid) {
        toast.error(valErr || "Invalid phone number format.");
        return { success: false, error: valErr };
      }

      if (state.session.id) {
        try {
          await supabase
            .from("profiles")
            .update({
              phone: normalized,
              updated_at: new Date().toISOString(),
            })
            .eq("id", state.session.id);
        } catch (e) {
          console.warn("Could not persist linked phone to profiles table:", e);
        }
      }

      const updatedSession: Session = {
        ...state.session,
        phone: normalized,
      };

      patch({ session: updatedSession });
      toast.success(`Phone number ${normalized} linked to your account!`);
      return { success: true, session: updatedSession };
    },
    [state.session, patch],
  );

  const signUpCustomer = useCallback(
    async (email: string, password: string, name: string, phone?: string): Promise<AuthResult> => {
      const res = await signUpCustomerLib(email, password, name, phone);
      if (!res.success) {
        toast.error(res.error || "Failed to register.");
        return { success: false, error: res.error };
      }

      if (res.needsEmailVerification) {
        toast.info(`Account created! A verification email has been sent to ${email}. Please check your inbox.`);
        return {
          success: true,
          needsEmailVerification: true,
          session: null,
        };
      }

      toast.success(`Welcome to Gursha Cafe, ${name || "Customer"}!`);
      return { success: true, session: state.session };
    },
    [state.session],
  );

  const signInCustomer = useCallback(
    async (email: string, password: string): Promise<AuthResult> => {
      const res = await signInCustomerLib(email, password);
      if (!res.success) {
        toast.error(res.error || "Failed to sign in.");
        return { success: false, error: res.error, unverified: res.unverified };
      }

      toast.success("Welcome back to Gursha Cafe!");
      return { success: true, session: state.session };
    },
    [state.session],
  );

  const resendVerification = useCallback(
    async (email: string): Promise<AuthResult> => {
      const res = await resendVerificationEmail(email);
      if (!res.success) {
        toast.error(res.error || "Failed to resend verification email.");
        return { success: false, error: res.error };
      }
      toast.success(`Verification email resent to ${email}. Please check your inbox.`);
      return { success: true };
    },
    [],
  );

  const requestPasswordReset = useCallback(
    async (email: string): Promise<AuthResult> => {
      const res = await requestPasswordResetLib(email);
      if (!res.success) {
        toast.error(res.error || "Failed to send recovery code.");
        return { success: false, error: res.error };
      }
      toast.success("If an account exists, a recovery code was sent.");
      return { success: true };
    },
    [],
  );

  const verifyPasswordResetOtp = useCallback(
    async (email: string, code: string): Promise<AuthResult> => {
      const res = await verifyPasswordResetOtpLib(email, code);
      if (!res.success) {
        toast.error(res.error || "Failed to verify recovery code.");
        return { success: false, error: res.error };
      }
      toast.success("Recovery code verified!");
      return { success: true };
    },
    [],
  );

  const updatePassword = useCallback(
    async (password: string): Promise<AuthResult> => {
      const res = await updateUserPasswordLib(password);
      if (!res.success) {
        toast.error(res.error || "Failed to update password.");
        return { success: false, error: res.error };
      }
      toast.success("Password updated successfully!");
      return { success: true };
    },
    [],
  );

  const signInAdmin = useCallback(
    async (email: string, password: string): Promise<AuthResult> => {
      const res = await signInAdminLib(email, password);
      if (!res.success) {
        toast.error(res.error || "Administrator sign in failed.");
        patch({ adminAuthed: false, adminOtp: "" });
        return { success: false, error: res.error };
      }

      const normEmail = email.trim().toLowerCase();
      const adminUser = res.user;
      const resolvedName = adminUser?.user_metadata?.full_name || normEmail.split("@")[0] || "Admin";
      patch({
        session: {
          id: adminUser?.id || "",
          name: resolvedName,
          phone: adminUser?.user_metadata?.phone || "",
          email: normEmail,
          verified: true,
          at: Date.now(),
        },
        adminAuthed: true,
        adminOtp: "",
      });
      toast.success("Administrator session verified — welcome to Gursha Admin");
      return { success: true };
    },
    [patch],
  );

  const changeAdminPassword = useCallback(
    async (currentPassword: string, newPassword: string, confirmPassword: string): Promise<AuthResult> => {
      const res = await changeAdminPasswordLib(currentPassword, newPassword, confirmPassword);
      if (!res.success) {
        toast.error(res.error || "Failed to change admin password.");
        return { success: false, error: res.error };
      }
      toast.success("Administrator password changed successfully!");
      return { success: true };
    },
    [],
  );

  const claimGuestOrder = useCallback(
    async (code: string, token: string): Promise<{ success: boolean; error?: string }> => {
      if (!state.session?.id || !state.session?.verified) {
        toast.error("Please sign in to link this order to your account.");
        return { success: false, error: "Authentication required" };
      }
      const cleanCode = code.trim();
      const cleanToken = token.trim();
      if (!cleanCode || !cleanToken) {
        toast.error("Order code and tracking token are required.");
        return { success: false, error: "Missing parameters" };
      }

      try {
        const { data: claimed, error } = await (supabase.rpc as any)("claim_guest_order", {
          p_code: cleanCode,
          p_token: cleanToken,
        });

        if (error || !claimed) {
          const msg = error?.message || "Order not found, token invalid, or already linked to an account.";
          toast.error(msg);
          return { success: false, error: msg };
        }

        // Update local state: associate order with current user
        setState((prev) => ({
          ...prev,
          orders: prev.orders.map((o) => (o.code === cleanCode ? { ...o, userId: prev.session?.id || null } : o)),
        }));

        toast.success(`Order ${cleanCode} linked to your account!`);
        return { success: true };
      } catch (err: any) {
        toast.error(err?.message || "Could not link order.");
        return { success: false, error: err?.message };
      }
    },
    [state.session],
  );

  const fetchOrderDetails = useCallback(
    async (code: string, forceFresh = false): Promise<Order | null> => {
      if (!code) return null;
      if (!forceFresh) {
        const existing = state.orders.find((o) => o.code === code);
        if (existing) return existing;
      }

      try {
        let rawData: any = null;

        if (state.adminAuthed) {
          const { data, error } = await supabase
            .from("orders")
            .select("*, order_items(*)")
            .eq("code", code)
            .maybeSingle();
          if (!error && data) rawData = data;
        } else if (state.session?.id && state.session?.verified) {
          const { data, error } = await supabase
            .from("orders")
            .select("*, order_items(*)")
            .eq("code", code)
            .eq("user_id", state.session.id)
            .maybeSingle();
          if (!error && data) rawData = data;
        } else {
          // Guest: strictly require code in session and retrieve using secret per-order token
          if (!state.guestOrderCodes.includes(code)) {
            return state.orders.find((o) => o.code === code) || null;
          }
          const token = state.guestTokens?.[code] || "";
          const { data: rpcData, error: rpcErr } = await (supabase.rpc as any)(
            "get_guest_order",
            { p_code: code, p_token: token }
          );
          if (!rpcErr && rpcData?.order) {
            rawData = {
              ...rpcData.order,
              order_items: rpcData.items || [],
            };
          }
        }

        if (rawData) {
          const mappedOrder: Order = {
            id: rawData.id,
            code: rawData.code,
            createdAt: rawData.created_at ? new Date(rawData.created_at).getTime() : Date.now(),
            scheduledFor: rawData.scheduled_for ? new Date(rawData.scheduled_for).getTime() : null,
            customerName: rawData.customer_name,
            phone: rawData.phone,
            service: (rawData.service_type || "dine-in") as ServiceType,
            zone: rawData.zone || "",
            distanceKm: Number(rawData.distance_km) || 0,
            address: rawData.address || "",
            items: (rawData.order_items || []).map((it: any) => ({
              uid: it.id,
              itemId: it.menu_item_id,
              name: it.name,
              basePrice: Number(it.base_price),
              qty: it.quantity,
              base: (it.base_choice || "Injera") as BaseChoice,
              spice: it.spice_level ?? 0,
              extras: it.extras || [],
              extraPrice: Number(it.extra_price) || 0,
              note: it.note || "",
            })),
            subtotal: Number(rawData.subtotal),
            deliveryFee: Number(rawData.delivery_fee) || 0,
            serviceCharge: Number(rawData.service_charge) || 0,
            total: Number(rawData.total),
            payment: (rawData.payment_method || "cash") as PaymentMethod,
            proofStatus: normalizeProofStatus(rawData.proof_status),
            proofImage: rawData.proof_image || "",
            proofNote: rawData.proof_note || "",
            status: normalizeOrderStatus(rawData.status),
            eta: rawData.eta || 25,
            staffNote: rawData.staff_note || "",
            userId: rawData.user_id,
            guestLookupToken: rawData.guest_lookup_token,
          };

          setState((prev) => ({
            ...prev,
            orders: [mappedOrder, ...prev.orders.filter((o) => o.code !== code)],
          }));
          return mappedOrder;
        }
      } catch (err) {
        console.warn("fetchOrderDetails notice:", err);
      }
      return state.orders.find((o) => o.code === code) || null;
    },
    [state.orders, state.adminAuthed, state.session, state.guestOrderCodes, state.guestTokens],
  );

  /* ----------------------------------------------------------- menu CRUD */
  const saveMenuItem = useCallback((item: MenuItem) => {
    setState((s) => {
      const updatedMenu = s.menu.some((m) => m.id === item.id)
        ? s.menu.map((m) => (m.id === item.id ? item : m))
        : [item, ...s.menu];

      const customItems = updatedMenu.filter((m) => m.id.startsWith("m-") || !MENU.some((d) => d.id === m.id));
      (supabase.from("store_settings") as any).upsert({
        key: "menu",
        value: customItems,
        updated_at: new Date().toISOString(),
      }).then(({ error }: any) => {
        if (error) {
          // Fallback to customer_sessions
          supabase.from("customer_sessions").upsert({
            phone: "__custom_menu__",
            name: JSON.stringify(customItems),
            verified: true,
            updated_at: new Date().toISOString(),
          }).then(null, () => {});
        }
      });

      return { ...s, menu: updatedMenu };
    });
    toast.success(`${item.name} saved to the menu`);
  }, []);

  const deleteMenuItem = useCallback((id: string) => {
    setState((s) => {
      const updatedMenu = s.menu.filter((m) => m.id !== id);
      const customItems = updatedMenu.filter((m) => m.id.startsWith("m-") || !MENU.some((d) => d.id === m.id));
      (supabase.from("store_settings") as any).upsert({
        key: "menu",
        value: customItems,
        updated_at: new Date().toISOString(),
      }).then(({ error }: any) => {
        if (error) {
          supabase.from("customer_sessions").upsert({
            phone: "__custom_menu__",
            name: JSON.stringify(customItems),
            verified: true,
            updated_at: new Date().toISOString(),
          }).then(null, () => {});
        }
      });

      return { ...s, menu: updatedMenu };
    });
    toast.info("Dish removed from the menu");
  }, []);

  const toggleStock = useCallback((id: string) => {
    setState((s) => ({ ...s, menu: s.menu.map((m) => (m.id === id ? { ...m, inStock: !m.inStock } : m)) }));
  }, []);

  /* ----------------------------------------------------------------- CMS */
  const saveCms = useCallback(
    async (cmsPayload: Cms): Promise<Cms> => {
      if (!state.adminAuthed) {
        toast.error("Unauthorized: Admin sign-in required to update storefront settings.");
        throw new Error("Unauthorized: Admin sign-in required.");
      }

      const published: Cms = {
        ...cmsPayload,
        lastPublishedAt: Date.now(),
        publishedBy: "Admin",
      };

      try {
        let confirmedCms = published;
        try {
          // Primary: save to public store_settings table
          const { error: ssError } = await (supabase.from("store_settings") as any).upsert({
            key: "cms",
            value: published,
            updated_at: new Date().toISOString(),
          });

          if (ssError) {
            // Fallback to customer_sessions
            await supabase.from("customer_sessions").upsert(
              {
                phone: "__cms_storefront__",
                name: JSON.stringify(published),
                verified: true,
                updated_at: new Date().toISOString(),
              },
              { onConflict: "phone" }
            );
          }
        } catch (netErr: any) {
          console.warn("Notice: Database network sync unavailable. Settings saved to local persistent store.", netErr);
        }

        setState((prev) => ({ ...prev, cms: confirmedCms }));

        try {
          localStorage.setItem(KEY, JSON.stringify({ ...state, cms: confirmedCms }));
        } catch {}

        toast.success("Café and storefront settings saved successfully");
        return confirmedCms;
      } catch (err: any) {
        console.error("Could not sync CMS settings:", err);
        throw err;
      }
    },
    [state.adminAuthed, state]
  );

  const restoreDefaultCms = useCallback(async () => {
    if (!state.adminAuthed) {
      toast.error("Unauthorized: Admin sign-in required.");
      throw new Error("Unauthorized");
    }

    try {
      const { error: ssError } = await (supabase.from("store_settings") as any).upsert({
        key: "cms",
        value: SEED_CMS,
        updated_at: new Date().toISOString(),
      });

      if (ssError) {
        await supabase.from("customer_sessions").upsert(
          {
            phone: "__cms_storefront__",
            name: JSON.stringify(SEED_CMS),
            verified: true,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "phone" }
        );
      }

      setState((prev) => ({ ...prev, cms: SEED_CMS }));
      try {
        localStorage.setItem(KEY, JSON.stringify({ ...state, cms: SEED_CMS }));
      } catch {}

      toast.info("Storefront content restored to defaults");
    } catch (err) {
      console.error("Could not restore default CMS:", err);
      throw err;
    }
  }, [state.adminAuthed, state]);

  const resetDemo = useCallback(() => {
    setState((s) => ({ ...SEED, lang: s.lang, theme: s.theme }));
    toast.info("Data restored to factory seed");
  }, []);

  /* ----------------------------------------------------------- delivery CRUD */
  const saveDeliverySettings = useCallback(
    async (settings: DeliverySettings) => {
      if (!state.adminAuthed) {
        toast.error("Unauthorized: Admin sign-in required to update delivery settings.");
        throw new Error("Unauthorized");
      }
      const payload: DeliverySettings = {
        ...settings,
        updatedAt: Date.now(),
        updatedBy: "Admin",
      };
      patch({ deliverySettings: payload });

      try {
        const { error: ssError } = await (supabase.from("store_settings") as any).upsert({
          key: "delivery",
          value: payload,
          updated_at: new Date().toISOString(),
        });

        if (ssError) {
          await supabase.from("customer_sessions").upsert(
            {
              phone: "__delivery_settings__",
              name: JSON.stringify(payload),
              verified: true,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "phone" },
          );
        }
      } catch (err) {
        console.error("Could not sync delivery settings to Supabase:", err);
        toast.error("Database sync failed for delivery settings");
        throw err;
      }

      toast.success("Delivery settings updated and saved persistently");
    },
    [state.adminAuthed, patch],
  );

  /* ----------------------------------------------------------- extras CRUD */
  const saveExtras = useCallback(
    async (extrasList: ExtraOption[]) => {
      if (!state.adminAuthed) {
        toast.error("Unauthorized: Admin sign-in required to manage extras.");
        throw new Error("Unauthorized");
      }
      patch({ extras: extrasList });

      try {
        const { error: ssError } = await (supabase.from("store_settings") as any).upsert({
          key: "extras",
          value: extrasList,
          updated_at: new Date().toISOString(),
        });

        if (ssError) {
          await supabase.from("customer_sessions").upsert(
            {
              phone: "__store_extras__",
              name: JSON.stringify(extrasList),
              verified: true,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "phone" },
          );
        }
      } catch (err) {
        console.error("Could not sync extras to Supabase:", err);
        toast.error("Database sync failed for extras");
        throw err;
      }

      toast.success("Extras updated and saved successfully");
    },
    [state.adminAuthed, patch],
  );

  const saveExtraItem = useCallback(
    async (extra: ExtraOption) => {
      const trimmedName = extra.name.trim();
      if (!trimmedName) {
        toast.error("Extra name cannot be empty.");
        throw new Error("Name is required");
      }
      if (typeof extra.price !== "number" || isNaN(extra.price) || extra.price < 0) {
        toast.error("Price must be a valid, non-negative amount.");
        throw new Error("Invalid price");
      }

      const existingIndex = state.extras.findIndex((e) => e.id === extra.id);
      let updated: ExtraOption[];
      if (existingIndex >= 0) {
        updated = state.extras.map((e, idx) => (idx === existingIndex ? { ...extra, name: trimmedName } : e));
      } else {
        const newExtra: ExtraOption = {
          ...extra,
          id: extra.id || `extra-${Date.now()}`,
          name: trimmedName,
          enabled: extra.enabled ?? true,
        };
        updated = [...state.extras, newExtra];
      }

      await saveExtras(updated);
    },
    [state.extras, saveExtras],
  );

  const toggleExtraStatus = useCallback(
    async (id: string) => {
      const updated = state.extras.map((e) => (e.id === id ? { ...e, enabled: !e.enabled } : e));
      await saveExtras(updated);
    },
    [state.extras, saveExtras],
  );

  const deleteExtraItem = useCallback(
    async (id: string) => {
      const updated = state.extras.filter((e) => e.id !== id);
      await saveExtras(updated);
    },
    [state.extras, saveExtras],
  );

  const value = useMemo<GurshaContextValue>(
    () => ({
      ...state,
      cartOpen, setCartOpen, cartCount, cartSubtotal,
      setLang, setTheme, setService, t,
      addToCart, setQty, removeFromCart, clearCart,
      placeOrder, setStatus, advance,
      submitProof, approveProof, rejectProof,
      requestOtp, verifyOtp, logout, requestAdminOtp, verifyAdminOtp, adminLogout,
      requestEmailOtp, verifyEmailOtp, requestAdminEmailOtp, verifyAdminEmailOtp, linkCustomerPhone,
      updateCustomerProfile,
      signUpCustomer, signInCustomer, resendVerification, requestPasswordReset, verifyPasswordResetOtp, updatePassword, signInAdmin,
      changeAdminPassword,
      claimGuestOrder,
      fetchOrderDetails,
      saveMenuItem, deleteMenuItem, toggleStock,
      saveCms, restoreDefaultCms, refreshCms, resetDemo,
      saveDeliverySettings,
      saveExtras, saveExtraItem, toggleExtraStatus, deleteExtraItem,
    }),
    [
      state, cartOpen, cartCount, cartSubtotal, setLang, setTheme, setService, t,
      addToCart, setQty, removeFromCart, clearCart,
      placeOrder, setStatus, advance, submitProof, approveProof, rejectProof,
      requestOtp, verifyOtp, logout, requestAdminOtp, verifyAdminOtp, adminLogout,
      requestEmailOtp, verifyEmailOtp, requestAdminEmailOtp, verifyAdminEmailOtp, linkCustomerPhone,
      updateCustomerProfile,
      signUpCustomer, signInCustomer, resendVerification, requestPasswordReset, verifyPasswordResetOtp, updatePassword, signInAdmin,
      changeAdminPassword,
      claimGuestOrder,
      fetchOrderDetails,
      saveMenuItem, deleteMenuItem, toggleStock,
      saveCms, restoreDefaultCms, refreshCms, resetDemo,
      saveDeliverySettings,
      saveExtras, saveExtraItem, toggleExtraStatus, deleteExtraItem,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useGursha(): GurshaContextValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useGursha must be used inside GurshaProvider");
  return ctx;
}

export type { PaymentMethod };