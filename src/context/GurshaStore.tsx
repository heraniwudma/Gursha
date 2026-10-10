import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type {
  AuthResult, BaseChoice, CartItem, CartOptions, Cms, DeliverySettings, GurshaContextValue, GurshaState,
  Lang, MenuItem, Order, OrderStatus, PaymentMethod, PlaceInput, ProofStatus,
  ServiceType, Session, Theme,
} from "../types";
import {
  DEFAULT_DELIVERY_SETTINGS, MENU, SEED_CMS, T, zoneFee,
} from "../data/mockData";
import { supabase } from "@/integrations/supabase/client";
import { normalizePhoneNumber, validatePhoneNumber } from "../lib/phone";
import {
  checkIsAdmin, sendEmailOtp, sendPhoneOtp, signOutAuth,
  validateEmail, verifyEmailOtp as verifyEmailOtpLib, verifyPhoneOtp,
} from "../lib/auth";

const KEY = "gursha.hawassa.state.v1";
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
  cms: SEED_CMS,
  deliverySettings: DEFAULT_DELIVERY_SETTINGS,
  cart: [],
  session: null,
  adminAuthed: false,
  adminOtp: "",
  lang: "en",
  theme: "light",
  service: "dine-in",
  serviceChosen: false,
};

const FLOW: OrderStatus[] = ["placed", "accepted", "preparing", "ready", "dispatched", "completed"];

const etaFor = (s: ServiceType) => (s === "delivery" ? 40 : s === "takeaway" ? 20 : 25);

function load(): GurshaState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<GurshaState>;
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

      return {
        ...SEED,
        ...parsed,
        cms: cmsData,
        deliverySettings: deliveryData,
      };
    }
  } catch {
    /* corrupted store — fall back to seed */
  }
  return SEED;
}

const Ctx = createContext<GurshaContextValue | null>(null);

export function GurshaProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<GurshaState>(load);
  const [cartOpen, setCartOpen] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* storage full or blocked */
    }
  }, [state]);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
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
          if (authSession.user.email) {
            const normEmail = authSession.user.email.trim().toLowerCase();
            const { data: profile } = await supabase
              .from("customer_sessions")
              .select("name, verified, otp")
              .eq("phone", `email:${normEmail}`)
              .maybeSingle();

            const resolvedName =
              profile?.name ||
              authSession.user.user_metadata?.full_name ||
              normEmail.split("@")[0] ||
              "Customer";
            const linkedPhone = profile?.otp || "";
            const isAdmin = await checkIsAdmin(normEmail);

            setState((prev) => ({
              ...prev,
              session: {
                name: resolvedName,
                phone: linkedPhone,
                email: normEmail,
                verified: true,
                at: Date.now(),
              },
              adminAuthed: isAdmin,
            }));
          } else if (authSession.user.phone) {
            const normPhone = normalizePhoneNumber(authSession.user.phone);
            const { data: profile } = await supabase
              .from("customer_sessions")
              .select("name, verified")
              .eq("phone", normPhone)
              .maybeSingle();

            const resolvedName = profile?.name || authSession.user.user_metadata?.full_name || "Customer";
            const isAdmin = await checkIsAdmin(normPhone);

            setState((prev) => ({
              ...prev,
              session: {
                name: resolvedName,
                phone: normPhone,
                verified: true,
                at: Date.now(),
              },
              adminAuthed: isAdmin,
            }));
          }
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
        if (authSession.user.email) {
          const normEmail = authSession.user.email.trim().toLowerCase();
          const isAdmin = await checkIsAdmin(normEmail);
          const { data: profile } = await supabase
            .from("customer_sessions")
            .select("name, verified, otp")
            .eq("phone", `email:${normEmail}`)
            .maybeSingle();

          const resolvedName =
            profile?.name ||
            authSession.user.user_metadata?.full_name ||
            normEmail.split("@")[0] ||
            "Customer";
          const linkedPhone = profile?.otp || "";

          setState((prev) => ({
            ...prev,
            session: {
              name: resolvedName,
              phone: linkedPhone,
              email: normEmail,
              verified: true,
              at: Date.now(),
            },
            adminAuthed: isAdmin,
          }));
        } else if (authSession.user.phone) {
          const normPhone = normalizePhoneNumber(authSession.user.phone);
          const isAdmin = await checkIsAdmin(normPhone);
          const { data: profile } = await supabase
            .from("customer_sessions")
            .select("name, verified")
            .eq("phone", normPhone)
            .maybeSingle();

          const resolvedName = profile?.name || authSession.user.user_metadata?.full_name || "Customer";

          setState((prev) => ({
            ...prev,
            session: {
              name: resolvedName,
              phone: normPhone,
              verified: true,
              at: Date.now(),
            },
            adminAuthed: isAdmin,
          }));
        }
      }
    });

    return () => {
      mounted = false;
      subscription?.unsubscribe();
    };
  }, []);

  const refreshCms = useCallback(async () => {
    try {
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
          table: "customer_sessions",
          filter: "phone=eq.__cms_storefront__",
        },
        (payload: any) => {
          if (payload?.new?.name) {
            try {
              const parsed = JSON.parse(payload.new.name);
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
        } else if (!error && !data) {
          // Initialize Supabase customer_sessions with default delivery settings (Main & Techno Campus)
          await supabase.from("customer_sessions").insert({
            phone: "__delivery_settings__",
            name: JSON.stringify(DEFAULT_DELIVERY_SETTINGS),
            verified: true,
            updated_at: new Date().toISOString(),
          });
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
        const [ordersRes, overridesRes] = await Promise.all([
          supabase
            .from("orders")
            .select("*, order_items(*)")
            .order("created_at", { ascending: false }),
          supabase
            .from("customer_sessions")
            .select("name")
            .eq("phone", "__order_updates__")
            .maybeSingle(),
        ]);

        let overrides: Record<string, any> = {};
        if (overridesRes.data?.name) {
          try {
            overrides = JSON.parse(overridesRes.data.name) || {};
          } catch {}
        }

        const dbOrders = ordersRes.data;
        if (!ordersRes.error && dbOrders && dbOrders.length > 0) {
          const mappedOrders: Order[] = dbOrders.map((o) => {
            const ov = overrides[o.code] || {};
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
              proofStatus: (ov.proofStatus || o.proof_status || "none") as ProofStatus,
              proofImage: ov.proofImage !== undefined ? ov.proofImage : (o.proof_image || ""),
              proofNote: ov.proofNote !== undefined ? ov.proofNote : (o.proof_note || ""),
              status: (ov.status || o.status || "placed") as OrderStatus,
              eta: o.eta || 25,
              staffNote: ov.staffNote !== undefined ? ov.staffNote : (o.staff_note || ""),
            };
          });

          setState((prev) => {
            const map = new Map<string, Order>();
            prev.orders.forEach((o) => map.set(o.code, o));
            mappedOrders.forEach((o) => {
              const local = map.get(o.code);
              if (local) {
                // Protect local approval / rejection if remote is older
                if (local.proofStatus === "approved" && o.proofStatus !== "approved") {
                  return;
                }
                if (local.proofStatus === "rejected" && o.proofStatus === "none") {
                  return;
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
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", state.theme === "dark");
  }, [state.theme]);

  const patch = useCallback((p: Partial<GurshaState>) => setState((s) => ({ ...s, ...p })), []);

  const t = useCallback((k: string) => T[state.lang][k] ?? T.en[k] ?? k, [state.lang]);

  const setLang = useCallback((lang: Lang) => patch({ lang }), [patch]);
  const setTheme = useCallback((theme: Theme) => patch({ theme }), [patch]);
  const setService = useCallback(
    (service: ServiceType, chosen = true) => patch({ service, serviceChosen: chosen }),
    [patch],
  );

  /* ---------------------------------------------------------------- cart */
  const addToCart = useCallback((item: MenuItem, o: CartOptions) => {
    const ci: CartItem = {
      uid: uid(), itemId: item.id, name: item.name, basePrice: item.price,
      qty: o.qty, base: o.base, spice: o.spice, extras: o.extras,
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

  /* ---------------------------------------------------------------- order sync helper */
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
    ) => {
      // 1. Direct Supabase orders update attempt
      supabase
        .from("orders")
        .update({
          ...(diff.status ? { status: diff.status } : {}),
          ...(diff.proofStatus ? { proof_status: diff.proofStatus } : {}),
          ...(diff.proofImage !== undefined ? { proof_image: diff.proofImage } : {}),
          ...(diff.proofNote !== undefined ? { proof_note: diff.proofNote } : {}),
          ...(diff.staffNote !== undefined ? { staff_note: diff.staffNote } : {}),
        })
        .eq("code", code)
        .then(({ error }) => {
          if (error) {
            console.warn(`[GurshaStore] Supabase orders table update notice: ${error.message}`);
          }
        });

      // 2. Persistent Supabase backup sync layer via customer_sessions (__order_updates__)
      try {
        const { data } = await supabase
          .from("customer_sessions")
          .select("name")
          .eq("phone", "__order_updates__")
          .maybeSingle();

        let existing: Record<string, any> = {};
        if (data?.name) {
          try {
            existing = JSON.parse(data.name) || {};
          } catch {}
        }

        existing[code] = {
          ...(existing[code] || {}),
          ...diff,
          updatedAt: Date.now(),
        };

        await supabase.from("customer_sessions").upsert(
          {
            phone: "__order_updates__",
            name: JSON.stringify(existing),
            updated_at: new Date().toISOString(),
          },
          { onConflict: "phone" },
        );
      } catch (err) {
        console.warn("Could not sync order override to customer_sessions:", err);
      }
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

      // Backend delivery validation
      let resolvedZone = i.zone || "";
      let resolvedDistance = i.distanceKm || 0;

      if (i.service === "delivery") {
        if (!state.deliverySettings.enabled) {
          toast.error("Delivery service is currently disabled. Please select Dine-in or Takeaway.");
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
      const deliveryFee = i.service === "delivery" ? zoneFee(resolvedDistance) : 0;
      const serviceCharge = i.service === "dine-in" ? Math.round(subtotal * 0.05) : 0;
      const total = subtotal + deliveryFee + serviceCharge;
      const status: OrderStatus = i.payment === "cash" ? "placed" : "payment_pending";
      const eta = etaFor(i.service);
      const scheduledIso = i.scheduledFor ? new Date(i.scheduledFor).toISOString() : null;

      // 1. Persist or update customer session in Supabase
      const { error: sessionError } = await supabase
        .from("customer_sessions")
        .upsert(
          {
            phone: i.phone.trim(),
            name: i.customerName.trim(),
            updated_at: new Date().toISOString(),
          },
          { onConflict: "phone" },
        );

      if (sessionError) {
        console.warn("Could not sync customer session to Supabase:", sessionError);
      }

      // 2. Insert order record into Supabase with collision-resistant code & retry guard
      const knownCodes = new Set(state.orders.map((o) => o.code));
      const MAX_ATTEMPTS = 5;
      let dbOrder: any = null;
      let orderError: any = null;
      let code = "";

      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        let candidate = generateCandidateOrderCode();
        while (knownCodes.has(candidate)) {
          candidate = generateCandidateOrderCode();
        }
        code = candidate;

        // Pre-check DB to avoid hitting unique constraint when possible
        const { data: existingInDb } = await supabase
          .from("orders")
          .select("code")
          .eq("code", code)
          .maybeSingle();

        if (existingInDb) {
          knownCodes.add(code);
          continue;
        }

        const { data, error } = await supabase
          .from("orders")
          .insert({
            code,
            customer_name: i.customerName,
            phone: i.phone,
            service_type: i.service,
            zone: resolvedZone,
            distance_km: resolvedDistance,
            address: i.address || "",
            subtotal,
            delivery_fee: deliveryFee,
            service_charge: serviceCharge,
            total,
            payment_method: i.payment,
            proof_status: i.payment === "cash" ? "none" : (i.proofImage && i.proofImage.trim().length > 0 ? "pending" : "none"),
            proof_image: i.proofImage || "",
            proof_note: i.proofNote || "",
            status,
            eta,
            staff_note: "",
            scheduled_for: scheduledIso,
          })
          .select()
          .single();

        if (!error && data) {
          dbOrder = data;
          orderError = null;
          break;
        }

        const isDuplicateKey =
          error?.code === "23505" ||
          error?.message?.includes("orders_code_key") ||
          error?.details?.includes("orders_code_key");

        if (isDuplicateKey) {
          console.warn(`[GurshaStore] Order code collision on ${code}. Retrying attempt ${attempt + 1}/${MAX_ATTEMPTS}...`);
          knownCodes.add(code);
          continue;
        }

        orderError = error;
        break;
      }

      if (orderError || !dbOrder) {
        console.error("Supabase order creation error:", orderError);
        toast.error(`Order failed: ${orderError?.message || "Could not save to database"}`);
        throw new Error(orderError?.message || "Could not save order to Supabase");
      }

      // 2. Insert line items into Supabase
      const itemsPayload = state.cart.map((c) => ({
        order_id: dbOrder.id,
        menu_item_id: c.itemId,
        name: c.name,
        base_price: c.basePrice,
        quantity: c.qty,
        base_choice: c.base,
        spice_level: c.spice,
        extras: c.extras || [],
        extra_price: c.extraPrice || 0,
        item_total: (c.basePrice + c.extraPrice) * c.qty,
        note: c.note || "",
      }));

      const { error: itemsError } = await supabase
        .from("order_items")
        .insert(itemsPayload);

      if (itemsError) {
        console.error("Supabase order_items creation error:", itemsError);
        toast.error(`Order items error: ${itemsError.message}`);
        throw new Error(itemsError.message);
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
        service: i.service,
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
      };

      // 4. Update local state and clear cart ONLY after successful database save
      setState((s) => ({
        ...s,
        orders: [order, ...s.orders],
        cart: [],
        service: i.service,
        serviceChosen: true,
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
        toast.success(`Order ${code} confirmed! Cash on delivery selected.`);
      }
      return order;
    },
    [state.cart, state.orders, state.deliverySettings, persistOrderSync],
  );

  const setStatus = useCallback((code: string, status: OrderStatus) => {
    let blocked = false;
    setState((s) => {
      const order = s.orders.find((o) => o.code === code);
      // Enforcement: Electronic payment orders cannot be accepted/preparing/dispatched/completed without approved proof
      if (
        order &&
        order.payment !== "cash" &&
        order.proofStatus !== "approved" &&
        status !== "cancelled" &&
        status !== "payment_pending"
      ) {
        blocked = true;
        return s;
      }
      return { ...s, orders: s.orders.map((o) => (o.code === code ? { ...o, status } : o)) };
    });

    if (blocked) {
      toast.error(`Cannot change status to "${status}": Payment proof has not been approved.`);
      return;
    }

    persistOrderSync(code, { status });
  }, [persistOrderSync]);

  const advance = useCallback((code: string) => {
    let blocked = false;
    let nextStatus: OrderStatus | null = null;

    setState((s) => {
      const order = s.orders.find((o) => o.code === code);
      if (!order) return s;

      // Critical Rule: An order must not be accepted or move to the next processing stage
      // until an authorized administrator has approved the customer's submitted payment proof.
      if (order.payment !== "cash" && order.proofStatus !== "approved") {
        blocked = true;
        return s;
      }

      if (order.status === "cancelled" || order.status === "completed") return s;
      const idx = FLOW.indexOf(order.status);
      const next: OrderStatus = idx === -1 ? "accepted" : FLOW[Math.min(idx + 1, FLOW.length - 1)];
      nextStatus = next;

      const updated = s.orders.map((o) => (o.code === code ? { ...o, status: next } : o));
      return { ...s, orders: updated };
    });

    if (blocked) {
      toast.error(`Order ${code} cannot advance: Payment proof must be approved by an administrator first.`);
      return;
    }

    if (nextStatus) {
      persistOrderSync(code, { status: nextStatus });
      toast.success(`Order ${code} moved forward`);
    }
  }, [persistOrderSync]);

  const submitProof = useCallback((code: string, image: string, note?: string) => {
    if (!image || !image.trim()) {
      toast.error("Please attach a valid payment screenshot.");
      return;
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

    persistOrderSync(code, {
      proofImage: image,
      proofNote: cleanNote,
      proofStatus: "pending",
      status: "payment_pending",
      staffNote: "",
    });

    toast.info("Payment proof submitted — awaiting administrator verification");
  }, [persistOrderSync]);

  const approveProof = useCallback((code: string) => {
    let authFailed = false;
    let missingImage = false;
    let alreadyApproved = false;
    let success = false;

    setState((s) => {
      if (!s.adminAuthed) {
        authFailed = true;
        return s;
      }
      const order = s.orders.find((o) => o.code === code);
      if (!order) return s;
      if (order.proofStatus === "approved") {
        alreadyApproved = true;
        return s;
      }
      if (!order.proofImage) {
        missingImage = true;
        return s;
      }

      success = true;
      const approvalTimestamp = new Date().toLocaleString();
      const approvalNote = `Payment verified & approved by Admin (${approvalTimestamp})`;
      const nextStatus: OrderStatus = order.status === "payment_pending" ? "accepted" : order.status;

      const updated = s.orders.map((o) =>
        o.code === code
          ? {
              ...o,
              proofStatus: "approved" as ProofStatus,
              status: nextStatus,
              staffNote: approvalNote,
            }
          : o,
      );

      persistOrderSync(code, {
        proofStatus: "approved",
        status: nextStatus,
        staffNote: approvalNote,
      });

      return { ...s, orders: updated };
    });

    if (authFailed) {
      toast.error("Unauthorized: Please sign in as an administrator to verify payments.");
    } else if (missingImage) {
      toast.error("Cannot approve: No payment proof screenshot attached.");
    } else if (alreadyApproved) {
      toast.info(`Payment for order ${code} is already approved.`);
    } else if (success) {
      toast.success(`Payment verified! Order ${code} is accepted and queued.`);
    }
  }, [persistOrderSync]);

  const rejectProof = useCallback((code: string, reason: string) => {
    let authFailed = false;
    let success = false;

    setState((s) => {
      if (!s.adminAuthed) {
        authFailed = true;
        return s;
      }
      const order = s.orders.find((o) => o.code === code);
      if (!order) return s;

      success = true;
      const rejectionReason = reason.trim() || "Payment screenshot unclear or amount mismatch.";
      const updated = s.orders.map((o) =>
        o.code === code
          ? {
              ...o,
              proofStatus: "rejected" as ProofStatus,
              status: "payment_pending" as OrderStatus,
              staffNote: rejectionReason,
            }
          : o,
      );

      persistOrderSync(code, {
        proofStatus: "rejected",
        status: "payment_pending",
        staffNote: rejectionReason,
      });

      return { ...s, orders: updated };
    });

    if (authFailed) {
      toast.error("Unauthorized: Please sign in as an administrator to reject payments.");
    } else if (success) {
      toast.error(`Payment proof rejected for order ${code}`);
    }
  }, [persistOrderSync]);

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

      const isAdmin = await checkIsAdmin(normalized);

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
    async (phone: string): Promise<AuthResult> => {
      const { valid, normalized, error: valErr } = validatePhoneNumber(phone);
      if (!valid) {
        toast.error(valErr || "Invalid administrator phone number.");
        return { success: false, error: valErr };
      }

      // Pre-check authorization: Only authorized admin phone numbers can request admin OTP
      const isAdmin = await checkIsAdmin(normalized);
      if (!isAdmin) {
        const err = `Access Denied: ${normalized} is not registered as an authorized administrator.`;
        toast.error(err);
        return { success: false, error: err };
      }

      const res = await sendPhoneOtp(normalized);
      if (!res.success) {
        toast.error(res.error || "Failed to dispatch administrator verification SMS.");
        return { success: false, error: res.error };
      }

      toast.success(`Admin verification code sent to ${normalized}`);
      return { success: true };
    },
    [],
  );

  const verifyAdminOtp = useCallback(
    async (code: string, phoneOverride?: string): Promise<AuthResult> => {
      const targetPhone = phoneOverride || state.session?.phone;
      if (!targetPhone) {
        toast.error("Please enter your administrator phone number.");
        return { success: false, error: "No phone number provided." };
      }

      const { valid, normalized, error: valErr } = validatePhoneNumber(targetPhone);
      if (!valid) {
        toast.error(valErr || "Invalid administrator phone number.");
        return { success: false, error: valErr };
      }

      // 1. Verify real OTP via Supabase Auth
      const res = await verifyPhoneOtp(normalized, code);
      if (!res.success) {
        toast.error(res.error || "Invalid or expired administrator OTP.");
        return { success: false, error: res.error };
      }

      // 2. Strict Role Check: Verify phone is in authorized administrators list
      const isAdmin = await checkIsAdmin(normalized);
      if (!isAdmin) {
        await signOutAuth();
        const err = `Access Denied: ${normalized} is not authorized for administrator access.`;
        toast.error(err);
        patch({ adminAuthed: false, adminOtp: "" });
        return { success: false, error: err };
      }

      patch({ adminAuthed: true, adminOtp: "" });
      toast.success("Administrator session verified — welcome to Gursha Admin");
      return { success: true };
    },
    [state.session, patch],
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

      const isAdmin = await checkIsAdmin(normalized);

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
      const isAdmin = await checkIsAdmin(normalized);
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

      // 2. Strict Role Check: Verify email is in authorized administrators list
      const isAdmin = await checkIsAdmin(normalized);
      if (!isAdmin) {
        await signOutAuth();
        const err = `Access Denied: ${normalized} is not authorized for administrator access.`;
        toast.error(err);
        patch({ adminAuthed: false, adminOtp: "" });
        return { success: false, error: err };
      }

      patch({ adminAuthed: true, adminOtp: "" });
      toast.success("Administrator session verified — welcome to Gursha Admin");
      return { success: true };
    },
    [patch],
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

      const normalizedEmail = state.session.email.toLowerCase();
      try {
        await supabase.from("customer_sessions").upsert(
          {
            phone: `email:${normalizedEmail}`,
            name: state.session.name || "Customer",
            otp: normalized, // store linked phone number safely
            verified: true,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "phone" },
        );
      } catch (e) {
        console.warn("Could not persist linked phone to database:", e);
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

  /* ----------------------------------------------------------- menu CRUD */
  const saveMenuItem = useCallback((item: MenuItem) => {
    setState((s) => {
      const updatedMenu = s.menu.some((m) => m.id === item.id)
        ? s.menu.map((m) => (m.id === item.id ? item : m))
        : [item, ...s.menu];

      const customItems = updatedMenu.filter((m) => m.id.startsWith("m-") || !MENU.some((d) => d.id === m.id));
      supabase.from("customer_sessions").upsert({
        phone: "__custom_menu__",
        name: JSON.stringify(customItems),
        verified: true,
        updated_at: new Date().toISOString(),
      }).then(({ error }) => {
        if (error) console.warn("Notice: Saved locally. Supabase menu sync warning:", error);
      });

      return { ...s, menu: updatedMenu };
    });
    toast.success(`${item.name} saved to the menu`);
  }, []);

  const deleteMenuItem = useCallback((id: string) => {
    setState((s) => {
      const updatedMenu = s.menu.filter((m) => m.id !== id);
      const customItems = updatedMenu.filter((m) => m.id.startsWith("m-") || !MENU.some((d) => d.id === m.id));
      supabase.from("customer_sessions").upsert({
        phone: "__custom_menu__",
        name: JSON.stringify(customItems),
        verified: true,
        updated_at: new Date().toISOString(),
      }).then(({ error }) => {
        if (error) console.warn("Notice: Removed locally. Supabase menu sync warning:", error);
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
          const { data, error } = await supabase
            .from("customer_sessions")
            .upsert(
              {
                phone: "__cms_storefront__",
                name: JSON.stringify(published),
                verified: true,
                updated_at: new Date().toISOString(),
              },
              { onConflict: "phone" }
            )
            .select("name")
            .maybeSingle();

          if (error) {
            console.error("Failed to save CMS settings to Supabase:", error);
            toast.error(`Database save notice: ${error.message || "Unknown error"}`);
          } else if (data?.name) {
            try {
              const parsed = JSON.parse(data.name);
              if (parsed && typeof parsed === "object") {
                confirmedCms = { ...SEED_CMS, ...parsed };
              }
            } catch (e) {
              console.warn("Could not re-parse confirmed CMS payload:", e);
            }
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
      const { error } = await supabase
        .from("customer_sessions")
        .upsert(
          {
            phone: "__cms_storefront__",
            name: JSON.stringify(SEED_CMS),
            verified: true,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "phone" }
        );

      if (error) {
        toast.error(`Restore failed: ${error.message}`);
        throw error;
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
        const { error } = await supabase.from("customer_sessions").upsert(
          {
            phone: "__delivery_settings__",
            name: JSON.stringify(payload),
            verified: true,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "phone" },
        );
        if (error) {
          console.error("Failed to save delivery settings to Supabase:", error);
          toast.error("Failed to persist delivery settings to database");
          throw error;
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
      saveMenuItem, deleteMenuItem, toggleStock,
      saveCms, restoreDefaultCms, refreshCms, resetDemo,
      saveDeliverySettings,
    }),
    [
      state, cartOpen, cartCount, cartSubtotal, setLang, setTheme, setService, t,
      addToCart, setQty, removeFromCart, clearCart,
      placeOrder, setStatus, advance, submitProof, approveProof, rejectProof,
      requestOtp, verifyOtp, logout, requestAdminOtp, verifyAdminOtp, adminLogout,
      requestEmailOtp, verifyEmailOtp, requestAdminEmailOtp, verifyAdminEmailOtp, linkCustomerPhone,
      saveMenuItem, deleteMenuItem, toggleStock,
      saveCms, restoreDefaultCms, refreshCms, resetDemo,
      saveDeliverySettings,
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