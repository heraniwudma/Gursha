import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Bank, Check, Clock, CreditCard, CurrencyCircleDollar, EnvelopeSimple, Eye, Info, MapPin,
  NotePencil, PencilSimple, Phone, Printer, QrCode, Receipt, Scales, ShieldCheck, ShoppingCart,
  UploadSimple, UserCircle, WarningCircle, X, XCircle, ArrowCounterClockwise,
} from "@phosphor-icons/react";
import { useGursha } from "../context/GurshaStore";
import { Price, SectionHead } from "./CustomerViews";
import { DELIVERY_ZONES, STATUS_ORDER, zoneFee } from "../data/mockData";
import type { PaymentMethod, ServiceType } from "../types";
import { normalizePhoneNumber, validatePhoneNumber, formatPhoneDisplay } from "../lib/phone";
import { validateEmail } from "../lib/auth";

const money = (n: number) => `ETB ${n.toLocaleString()}`;
const fmt = (ts: number) => new Date(ts).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

const compressScreenshot = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const MAX = 1400;
        let { width, height } = img;
        if (width > MAX || height > MAX) {
          if (width > height) {
            height = Math.round((height * MAX) / width);
            width = MAX;
          } else {
            width = Math.round((width * MAX) / height);
            height = MAX;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(String(reader.result));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
};

const PAY_META: Record<PaymentMethod, { Icon: typeof Bank; title: string; hint: string }> = {
  telebirr: { Icon: CurrencyCircleDollar, title: "telebirr", hint: "Dial *127# → Pay Merchant → Gursha Café Hawassa → 0911 000 000. Paste the SMS reference." },
  cbe: { Icon: Bank, title: "CBE transfer", hint: "Gursha Trading PLC · 1000 2345 6789 at CBE Hawassa. Attach the transfer screenshot." },
  cash: { Icon: CreditCard, title: "Cash", hint: "Pay at the counter or to the rider. Your order is confirmed right away." },
};

const parseSchedule = (v: string): number | null => {
  if (!v) return null;
  const [h, m] = v.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  const d = new Date();
  d.setHours(h, m, 0, 0);
  if (d.getTime() < Date.now()) d.setDate(d.getDate() + 1);
  return d.getTime();
};

const scheduleLabel = (ts: number | null) =>
  ts ? new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "ASAP";

/* ------------------------------------------------------------------ checkout */
export function CheckoutPage() {
  const { t, cart, cartSubtotal, placeOrder, service, setService, session, deliverySettings } = useGursha();
  const navigate = useNavigate();

  const enabledDestinations = (deliverySettings.destinations || []).filter((d) => d.enabled);
  const deliveryAvailable = deliverySettings.enabled && enabledDestinations.length > 0;

  const [name, setName] = useState(session?.name ?? "");
  const [phone, setPhone] = useState(session?.phone ?? "");
  const [selectedDestId, setSelectedDestId] = useState(enabledDestinations[0]?.id ?? "");
  const [address, setAddress] = useState("");
  const [when, setWhen] = useState<"now" | "later">("now");
  const [scheduledFor, setScheduledFor] = useState("");
  const [payment, setPayment] = useState<PaymentMethod>("telebirr");
  const [proofImage, setProofImage] = useState("");
  const [proofNote, setProofNote] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const currentDest = enabledDestinations.find((d) => d.id === selectedDestId) ?? enabledDestinations[0];
  const subtotal = cartSubtotal;
  const deliveryFee = service === "delivery" && deliveryAvailable && currentDest ? zoneFee(currentDest.distanceKm) : 0;
  const serviceCharge = service === "dine-in" ? Math.round(subtotal * 0.05) : 0;
  const total = subtotal + deliveryFee + serviceCharge;

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setErrors((e) => [...e, "Upload a PNG or JPG screenshot."]);
      return;
    }
    try {
      const compressed = await compressScreenshot(file);
      setProofImage(compressed);
    } catch {
      const reader = new FileReader();
      reader.onload = () => setProofImage(String(reader.result ?? ""));
      reader.readAsDataURL(file);
    }
  };

  if (cart.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-20 sm:px-6">
        <div className="grid place-items-center rounded-3xl border border-dashed border-stone-300 py-20 text-center dark:border-white/15">
          <ShoppingCart size={34} className="text-stone-300" />
          <h2 className="font-display mt-4 text-xl font-extrabold text-stone-900 dark:text-white">{t("cart.empty")}</h2>
          <button type="button" onClick={() => navigate("/menu")} className="mt-4 rounded-full bg-orange-600 px-5 py-2.5 text-sm font-bold text-white">
            {t("menu.title")}
          </button>
        </div>
      </div>
    );
  }

  const submit = async () => {
    if (submitting) return;
    const next: string[] = [];
    if (!name.trim()) next.push("Enter the name for this order.");
    if (phone.trim().length < 9) next.push("Enter a valid Ethiopian phone number.");
    if (service === "delivery") {
      if (!deliverySettings.enabled) {
        next.push("Delivery is currently unavailable. Please choose Dine-in or Takeaway.");
      } else if (!currentDest) {
        next.push("No delivery destination is currently available. Please select Dine-in or Takeaway.");
      } else if (!address.trim()) {
        next.push("Add a delivery address or landmark.");
      }
    }
    if (payment !== "cash" && !proofImage) next.push("Attach your payment screenshot so we can verify it.");
    if (cart.length === 0) next.push("Your cart is empty.");
    setErrors(next);
    if (next.length) return;

    try {
      setSubmitting(true);
      const order = await placeOrder({
        customerName: name.trim(),
        phone: phone.trim(),
        service,
        zone: service === "delivery" && currentDest ? currentDest.name : "",
        distanceKm: service === "delivery" && currentDest ? currentDest.distanceKm : 0,
        address: service === "delivery" ? address.trim() : "",
        scheduledFor: when === "later" ? parseSchedule(scheduledFor) : null,
        payment,
        proofImage,
        proofNote,
      });
      navigate(`/orders/${order.code}`);
    } catch (err: any) {
      console.error("Order submission failed:", err);
      setErrors([err?.message || "Failed to submit order to database. Please try again."]);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      <SectionHead eyebrow={t("nav.orders")} title={t("checkout.title")} sub="Direct kitchen ordering — your order is sent to the Gursha team immediately." />
      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <div className="space-y-5">
          <section className="rounded-3xl border border-stone-200 bg-white p-5 dark:border-white/10 dark:bg-zinc-900">
            <h3 className="font-display mb-4 text-base font-bold text-stone-900 dark:text-white">1 · Who is ordering</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name"
                className="rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-orange-500 dark:border-white/15 dark:bg-white/5 dark:text-zinc-100" />
              <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+251 9xx xx xx xx" inputMode="tel"
                className="rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-orange-500 dark:border-white/15 dark:bg-white/5 dark:text-zinc-100" />
            </div>
          </section>

          <section className="rounded-3xl border border-stone-200 bg-white p-5 dark:border-white/10 dark:bg-zinc-900">
            <h3 className="font-display mb-4 text-base font-bold text-stone-900 dark:text-white">2 · How you want it</h3>
            <div className="mb-4 grid grid-cols-3 gap-2">
              {(["dine-in", "takeaway", "delivery"] as ServiceType[]).map((s) => {
                const isDeliveryUnavailable = s === "delivery" && !deliveryAvailable;
                return (
                  <button
                    key={s}
                    type="button"
                    disabled={isDeliveryUnavailable}
                    onClick={() => setService(s)}
                    className={`rounded-xl px-2 py-2.5 text-xs font-bold transition-colors ${
                      service === s
                        ? "bg-orange-600 text-white"
                        : isDeliveryUnavailable
                        ? "cursor-not-allowed border border-stone-200 bg-stone-100 text-stone-400 opacity-60 dark:border-white/5 dark:bg-white/5 dark:text-zinc-600"
                        : "border border-stone-300 text-stone-600 dark:border-white/15 dark:text-zinc-300"
                    }`}
                  >
                    {t(s === "dine-in" ? "svc.dineIn" : s === "takeaway" ? "svc.takeaway" : "svc.delivery")}
                    {isDeliveryUnavailable ? " (Off)" : ""}
                  </button>
                );
              })}
            </div>

            {service === "dine-in" && (
              <p className="flex items-center gap-2 rounded-xl bg-stone-100 p-3 text-sm text-stone-600 dark:bg-white/5 dark:text-zinc-300">
                <Clock size={16} weight="bold" className="text-orange-600" /> Dine in at Gursha — tell your server your order code when you are seated.
              </p>
            )}

            {service === "takeaway" && (
              <p className="flex items-center gap-2 rounded-xl bg-stone-100 p-3 text-sm text-stone-600 dark:bg-white/5 dark:text-zinc-300">
                <Clock size={16} weight="bold" className="text-orange-600" /> Collect from the Lake Shore Road counter in about 20 minutes.
              </p>
            )}

            {service === "delivery" && !deliveryAvailable && (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-800 dark:text-amber-300">
                <p className="font-bold flex items-center gap-2">
                  <WarningCircle size={18} weight="bold" /> Delivery is currently unavailable
                </p>
                <p className="mt-1 text-xs">
                  We are not accepting delivery orders at this time. Please select Dine-in or Takeaway above.
                </p>
              </div>
            )}

            {service === "delivery" && deliveryAvailable && (
              <div className="space-y-3">
                <label className="block text-xs font-bold uppercase tracking-wider text-stone-500 dark:text-zinc-400">
                  Select Delivery Destination
                </label>
                <select
                  value={currentDest?.id ?? ""}
                  onChange={(e) => setSelectedDestId(e.target.value)}
                  className="w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-sm font-semibold outline-none focus:border-orange-500 dark:border-white/15 dark:bg-zinc-950 dark:text-zinc-100"
                >
                  {enabledDestinations.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} · {d.distanceKm} km · {money(zoneFee(d.distanceKm))}
                    </option>
                  ))}
                </select>
                <div className="flex gap-2">
                  <input
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Specific hall, building, room or landmark"
                    className="flex-1 rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-orange-500 dark:border-white/15 dark:bg-white/5 dark:text-zinc-100"
                  />
                </div>
                <p className="flex items-center gap-2 text-xs text-stone-500 dark:text-zinc-400">
                  <MapPin size={14} weight="bold" /> Rider fee {money(deliveryFee)} to {currentDest?.name} ({currentDest?.distanceKm} km).
                </p>
              </div>
            )}
          </section>

          <section className="rounded-3xl border border-stone-200 bg-white p-5 dark:border-white/10 dark:bg-zinc-900">
            <h3 className="font-display mb-4 text-base font-bold text-stone-900 dark:text-white">3 · When</h3>
            <div className="flex flex-wrap items-center gap-2">
              {(["now", "later"] as const).map((w) => (
                <button key={w} type="button" onClick={() => setWhen(w)}
                  className={`rounded-full px-4 py-2 text-sm font-bold transition-colors ${when === w ? "bg-stone-900 text-white dark:bg-white dark:text-stone-900" : "border border-stone-300 text-stone-600 dark:border-white/15 dark:text-zinc-300"}`}>
                  {w === "now" ? "As soon as possible" : "Schedule"}
                </button>
              ))}
              {when === "later" && (
                <input type="time" value={scheduledFor} onChange={(e) => setScheduledFor(e.target.value)}
                  className="rounded-full border border-stone-300 bg-white px-4 py-2 text-sm outline-none focus:border-orange-500 dark:border-white/15 dark:bg-white/5 dark:text-zinc-100" />
              )}
            </div>
          </section>

          <section className="rounded-3xl border border-stone-200 bg-white p-5 dark:border-white/10 dark:bg-zinc-900">
            <h3 className="font-display mb-4 text-base font-bold text-stone-900 dark:text-white">4 · Payment</h3>
            <div className="grid gap-2 sm:grid-cols-3">
              {(Object.keys(PAY_META) as PaymentMethod[]).map((p) => {
                const { Icon, title } = PAY_META[p];
                return (
                  <button key={p} type="button" onClick={() => setPayment(p)}
                    className={`flex items-center gap-2.5 rounded-xl border px-3.5 py-3 text-left text-sm font-bold transition-colors ${payment === p ? "border-orange-600 bg-orange-600/10 text-orange-700 dark:text-orange-300" : "border-stone-300 text-stone-600 dark:border-white/15 dark:text-zinc-300"}`}>
                    <Icon size={18} weight="bold" />
                    {title}
                  </button>
                );
              })}
            </div>

            <p className="mt-3 flex items-start gap-2 rounded-xl bg-stone-100 p-3 text-xs leading-relaxed text-stone-600 dark:bg-white/5 dark:text-zinc-300">
              <Info size={15} weight="bold" className="mt-0.5 shrink-0 text-orange-600" />
              {PAY_META[payment].hint}
            </p>

            {payment !== "cash" && (
              <div className="mt-4 space-y-3">
                <label className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border border-dashed border-stone-300 p-5 text-center transition-colors hover:border-orange-500 dark:border-white/15">
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
                  {proofImage ? (
                    <img src={proofImage} alt="Payment screenshot preview" className="h-32 w-auto rounded-xl object-contain" />
                  ) : (
                    <>
                      <UploadSimple size={24} weight="bold" className="text-orange-600" />
                      <span className="text-sm font-bold text-stone-700 dark:text-zinc-200">Attach your payment screenshot</span>
                      <span className="text-xs text-stone-500 dark:text-zinc-400">PNG or JPG · stored on this device only</span>
                    </>
                  )}
                </label>
                <input value={proofNote} onChange={(e) => setProofNote(e.target.value)} placeholder="Transaction reference (e.g. TB-8891234)"
                  className="w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-orange-500 dark:border-white/15 dark:bg-white/5 dark:text-zinc-100" />
              </div>
            )}
          </section>
        </div>

        <aside className="space-y-4 self-start rounded-3xl border border-stone-200 bg-white p-5 dark:border-white/10 dark:bg-zinc-900">
          <h3 className="font-display text-base font-bold text-stone-900 dark:text-white">{t("checkout.summary")}</h3>
          <ul className="max-h-64 space-y-2.5 overflow-y-auto pr-1">
            {cart.map((c) => (
              <li key={c.uid} className="flex items-start justify-between gap-3 text-sm">
                <span className="text-stone-700 dark:text-zinc-200">
                  <span className="font-bold tabular-nums">{c.qty}×</span> {c.name}
                  <span className="block text-xs text-stone-400">{c.base}{c.extras.length ? ` · ${c.extras.join(", ")}` : ""}</span>
                </span>
                <Price n={(c.basePrice + c.extraPrice) * c.qty} className="shrink-0 font-bold text-stone-900 dark:text-white" />
              </li>
            ))}
          </ul>
          <dl className="space-y-2 border-t border-stone-200 pt-4 text-sm dark:border-white/10">
            <div className="flex justify-between text-stone-600 dark:text-zinc-300"><dt>Subtotal</dt><dd className="tabular-nums">{money(subtotal)}</dd></div>
            {deliveryFee > 0 && <div className="flex justify-between text-stone-600 dark:text-zinc-300"><dt>Delivery</dt><dd className="tabular-nums">{money(deliveryFee)}</dd></div>}
            {serviceCharge > 0 && <div className="flex justify-between text-stone-600 dark:text-zinc-300"><dt>Service (5%)</dt><dd className="tabular-nums">{money(serviceCharge)}</dd></div>}
            <div className="flex justify-between border-t border-stone-200 pt-3 text-lg font-extrabold text-stone-900 dark:border-white/10 dark:text-white">
              <dt>{t("checkout.total")}</dt><dd className="tabular-nums text-orange-600">{money(total)}</dd>
            </div>
          </dl>

          {errors.length > 0 && (
            <ul className="space-y-1.5 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs font-semibold text-red-700 dark:text-red-300">
              {errors.map((e) => <li key={e} className="flex gap-2"><XCircle size={14} weight="bold" className="mt-0.5 shrink-0" />{e}</li>)}
            </ul>
          )}

          <button
            type="button"
            disabled={submitting}
            onClick={submit}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-orange-600 px-5 py-3.5 text-sm font-bold text-white transition-colors hover:bg-orange-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                <span>Placing order...</span>
              </>
            ) : (
              <>
                <Check size={17} weight="bold" />
                <span>{t("checkout.place")}</span>
              </>
            )}
          </button>
          <p className="text-center text-xs text-stone-400">Direct payment verification with live kitchen preparation updates.</p>
        </aside>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------- orders */
function StatusBar({ status }: { status: string }) {
  const { t } = useGursha();
  const active = STATUS_ORDER.indexOf(status);
  return (
    <ol className="gursha-scroll flex items-center gap-2 overflow-x-auto pb-1">
      {STATUS_ORDER.map((s, i) => {
        const done = status === "cancelled" ? i === 0 : i <= active;
        return (
          <li key={s} className="flex shrink-0 items-center gap-2">
            <span className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold ${done ? "bg-orange-600 text-white" : "bg-stone-100 text-stone-400 dark:bg-white/5 dark:text-zinc-500"}`}>
              {done && <Check size={11} weight="bold" />}
              {t(`status.${s}`)}
            </span>
            {i < STATUS_ORDER.length - 1 && <span className={`h-px w-4 ${i < active ? "bg-orange-500" : "bg-stone-200 dark:bg-white/10"}`} />}
          </li>
        );
      })}
    </ol>
  );
}

export function OrdersPage() {
  const { t, orders, session, setCartOpen } = useGursha();
  const navigate = useNavigate();

  // Privacy protection: Customers only see their own orders tied to their phone number
  const userOrders = session?.phone
    ? orders.filter((o) => normalizePhoneNumber(o.phone) === normalizePhoneNumber(session.phone))
    : [];

  return (
    <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
      <SectionHead eyebrow="Live tracking" title={t("orders.title")} sub="Track your active orders and meal status in real time."
        right={<button type="button" onClick={() => setCartOpen(true)} className="rounded-full border border-stone-300 px-4 py-2 text-sm font-bold text-stone-700 dark:border-white/15 dark:text-zinc-200">{t("cart.title")}</button>} />
      {userOrders.length === 0 ? (
        <div className="grid place-items-center rounded-3xl border border-dashed border-stone-300 p-8 py-16 text-center dark:border-white/15">
          <Receipt size={36} className="text-stone-300 dark:text-zinc-600" />
          <p className="mt-3 text-base font-bold text-stone-900 dark:text-white">
            {session?.verified ? "No orders found for your phone number" : "No active orders in this session"}
          </p>
          <p className="mt-1 max-w-sm text-xs text-stone-500 dark:text-zinc-400">
            {session?.verified
              ? "Any orders you place with your verified phone number will automatically appear here."
              : "Sign in with your verified phone number on your Profile page to sync your order history across devices."}
          </p>
          <div className="mt-5 flex items-center gap-3">
            {!session?.verified && (
              <button type="button" onClick={() => navigate("/profile")} className="rounded-full border border-stone-300 px-5 py-2.5 text-xs font-bold text-stone-800 dark:border-white/20 dark:text-zinc-200">
                Sign in with phone
              </button>
            )}
            <button type="button" onClick={() => navigate("/menu")} className="rounded-full bg-orange-600 px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-orange-500">
              Browse menu
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {userOrders.map((o) => (
            <motion.button key={o.code} type="button" onClick={() => navigate(`/orders/${o.code}`)}
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, ease: "easeOut" }}
              className="block w-full rounded-2xl border border-stone-200 bg-white p-5 text-left transition-shadow hover:shadow-md dark:border-white/10 dark:bg-zinc-900">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-display text-base font-extrabold text-stone-900 dark:text-white">{o.code}</p>
                  <p className="text-xs text-stone-500 dark:text-zinc-400">{fmt(o.createdAt)} · {t(`status.${o.status}`)} · {o.items.length} item{o.items.length === 1 ? "" : "s"}</p>
                </div>
                <div className="text-right">
                  <Price n={o.total} className="block text-lg font-extrabold text-orange-600" />
                </div>
              </div>
              <div className="mt-4"><StatusBar status={o.status} /></div>
            </motion.button>
          ))}
        </div>
      )}
    </div>
  );
}

export function OrderDetailPage() {
  const { t, orders, setStatus, submitProof } = useGursha();
  const { code = "" } = useParams();
  const navigate = useNavigate();
  const order = orders.find((o) => o.code === code);

  const [newImage, setNewImage] = useState("");
  const [newNote, setNewNote] = useState("");
  const [submittingProof, setSubmittingProof] = useState(false);
  const [proofError, setProofError] = useState("");
  const [proofSuccess, setProofSuccess] = useState(false);
  const [showReplaceForm, setShowReplaceForm] = useState(false);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

  if (!order) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-20 text-center">
        <WarningCircle size={32} className="mx-auto text-stone-300" />
        <p className="mt-3 text-sm font-semibold text-stone-500">We could not find order {code}.</p>
        <button type="button" onClick={() => navigate("/orders")} className="mt-4 rounded-full bg-orange-600 px-5 py-2.5 text-sm font-bold text-white">{t("orders.title")}</button>
      </div>
    );
  }

  const cancellable = order.status === "placed" || order.status === "payment_pending";

  const handleProofFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setProofError("Please select an image (JPG, PNG, or WebP).");
      return;
    }
    setProofError("");
    try {
      const compressed = await compressScreenshot(file);
      setNewImage(compressed);
    } catch {
      const reader = new FileReader();
      reader.onload = () => setNewImage(String(reader.result ?? ""));
      reader.readAsDataURL(file);
    }
  };

  const handleUploadProof = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newImage) {
      setProofError("Please choose a screenshot or photo of your payment receipt.");
      return;
    }
    try {
      setSubmittingProof(true);
      setProofError("");
      await submitProof(order.code, newImage, newNote.trim() || undefined);
      setProofSuccess(true);
      setNewImage("");
      setNewNote("");
      setShowReplaceForm(false);
    } catch (err: any) {
      setProofError(err?.message || "Failed to upload payment proof. Please try again.");
    } finally {
      setSubmittingProof(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="no-print mb-6 flex items-center justify-between">
        <button type="button" onClick={() => navigate("/orders")} className="text-sm font-bold text-stone-500 hover:text-orange-600">← {t("orders.title")}</button>
        <button type="button" onClick={() => window.print()} className="flex items-center gap-2 rounded-full border border-stone-300 px-4 py-2 text-sm font-bold text-stone-700 dark:border-white/15 dark:text-zinc-200">
          <Printer size={16} weight="bold" /> {t("orders.print")}
        </button>
      </div>

      <div className="rounded-3xl border border-stone-200 bg-white p-6 dark:border-white/10 dark:bg-zinc-900">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-stone-200 pb-5 dark:border-white/10">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-orange-600">Order receipt</p>
            <h1 className="font-display mt-1 text-2xl font-extrabold text-stone-900 dark:text-white">{order.code}</h1>
            <p className="mt-1 text-sm text-stone-500 dark:text-zinc-400">{fmt(order.createdAt)} · {order.customerName} · {order.phone}</p>
            <p className="mt-1 text-xs font-semibold text-stone-400">{order.service === "delivery" ? `${order.zone} · ${order.address}` : order.address}</p>
          </div>
          <div className="text-right">
            <Price n={order.total} className="block text-2xl font-extrabold text-orange-600" />
            <span className="text-xs font-bold text-stone-500 dark:text-zinc-400">{t(`status.${order.status}`)}</span>
          </div>
        </div>

        <div className="no-print py-5"><StatusBar status={order.status} /></div>

        {/* Payment Verification Status Banners */}
        {order.payment !== "cash" && (
          <div className="mb-6 space-y-3">
            {order.proofStatus === "pending" && (
              <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-amber-900 dark:text-amber-200">
                <div className="flex items-center gap-2 font-bold">
                  <Clock size={18} weight="bold" className="text-amber-600 dark:text-amber-400" />
                  <span>Payment Proof Submitted · Awaiting Admin Verification</span>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-amber-800/80 dark:text-amber-300/80">
                  We have received your payment proof. An administrator will inspect and confirm the transaction before your order is accepted and sent to the kitchen.
                </p>
              </div>
            )}

            {order.proofStatus === "rejected" && (
              <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-4 text-red-900 dark:text-red-200">
                <div className="flex items-center gap-2 font-bold text-red-700 dark:text-red-300">
                  <XCircle size={18} weight="bold" />
                  <span>Payment Proof Not Approved</span>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-red-800/90 dark:text-red-300/90">
                  Staff Feedback: <span className="font-semibold underline">{order.staffNote || "Receipt was unclear or amount mismatched."}</span>
                </p>
                <p className="mt-1 text-xs font-medium text-red-700 dark:text-red-300">
                  Please upload a clearer screenshot or corrected payment receipt below so we can verify and accept your order.
                </p>
              </div>
            )}

            {order.proofStatus === "none" && (
              <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-amber-900 dark:text-amber-200">
                <div className="flex items-center gap-2 font-bold text-amber-800 dark:text-amber-200">
                  <WarningCircle size={18} weight="bold" className="text-amber-600 dark:text-amber-400" />
                  <span>Payment Proof Required</span>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-amber-800/80 dark:text-amber-300/80">
                  You selected {order.payment === "telebirr" ? "telebirr" : "CBE transfer"}. Please upload your receipt or transfer screenshot below so our team can verify and accept your order.
                </p>
              </div>
            )}

            {order.proofStatus === "approved" && (
              <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-emerald-900 dark:text-emerald-200">
                <div className="flex items-center gap-2 font-bold text-emerald-700 dark:text-emerald-300">
                  <Check size={18} weight="bold" />
                  <span>Payment Approved · Order Confirmed</span>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-emerald-800/80 dark:text-emerald-300/80">
                  Your payment has been verified by Gursha staff. Your order has been accepted and is moving forward in preparation!
                </p>
              </div>
            )}
          </div>
        )}

        <ul className="divide-y divide-stone-200 dark:divide-white/10">
          {order.items.map((c) => (
            <li key={c.uid} className="flex items-start justify-between gap-4 py-3 text-sm">
              <span className="text-stone-700 dark:text-zinc-200">
                <span className="font-bold tabular-nums">{c.qty}×</span> {c.name}
                <span className="block text-xs text-stone-400">{c.base} · {c.spice === 0 ? "no spice" : `spice ${c.spice}/3`}{c.extras.length ? ` · ${c.extras.join(", ")}` : ""}</span>
              </span>
              <Price n={(c.basePrice + c.extraPrice) * c.qty} className="shrink-0 font-bold text-stone-900 dark:text-white" />
            </li>
          ))}
        </ul>

        <dl className="mt-4 space-y-2 border-t border-stone-200 pt-4 text-sm dark:border-white/10">
          <div className="flex justify-between text-stone-600 dark:text-zinc-300"><dt>Subtotal</dt><dd className="tabular-nums">{money(order.subtotal)}</dd></div>
          {order.deliveryFee > 0 && <div className="flex justify-between text-stone-600 dark:text-zinc-300"><dt>Delivery</dt><dd className="tabular-nums">{money(order.deliveryFee)}</dd></div>}
          {order.serviceCharge > 0 && <div className="flex justify-between text-stone-600 dark:text-zinc-300"><dt>Service (5%)</dt><dd className="tabular-nums">{money(order.serviceCharge)}</dd></div>}
          <div className="flex justify-between border-t border-stone-200 pt-3 text-base font-extrabold text-stone-900 dark:border-white/10 dark:text-white"><dt>Total</dt><dd className="tabular-nums">{money(order.total)}</dd></div>
        </dl>

        <div className="mt-5 grid gap-3 border-t border-stone-200 pt-5 text-xs dark:border-white/10 sm:grid-cols-3">
          <div className="rounded-xl bg-stone-100 p-3 dark:bg-white/5">
            <p className="font-bold uppercase tracking-widest text-stone-400">Payment</p>
            <p className="mt-1 font-semibold text-stone-700 dark:text-zinc-200">{order.payment === "cash" ? "Cash" : order.payment === "telebirr" ? "telebirr" : "CBE transfer"}</p>
          </div>
          <div className="rounded-xl bg-stone-100 p-3 dark:bg-white/5">
            <p className="font-bold uppercase tracking-widest text-stone-400">ETA</p>
            <p className="mt-1 font-semibold text-stone-700 dark:text-zinc-200">{order.eta} minutes · {scheduleLabel(order.scheduledFor)}</p>
          </div>
          <div className="rounded-xl bg-stone-100 p-3 dark:bg-white/5">
            <p className="font-bold uppercase tracking-widest text-stone-400">Proof Status</p>
            <p className={`mt-1 font-bold ${order.proofStatus === "approved" ? "text-emerald-600" : order.proofStatus === "rejected" ? "text-red-600" : "text-amber-600"}`}>
              {order.proofStatus === "none" ? "Not submitted" : order.proofStatus}
            </p>
          </div>
        </div>

        {/* Existing screenshot display */}
        {order.proofImage && (
          <div className="mt-5 rounded-2xl border border-stone-200 bg-stone-50 p-4 dark:border-white/10 dark:bg-zinc-800/40">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[11px] font-bold uppercase tracking-widest text-stone-400">Submitted Payment Screenshot</p>
              <button
                type="button"
                onClick={() => setLightboxImage(order.proofImage!)}
                className="flex items-center gap-1 text-xs font-bold text-orange-600 hover:underline"
              >
                <Eye size={13} weight="bold" /> View full size
              </button>
            </div>
            <div
              onClick={() => setLightboxImage(order.proofImage!)}
              className="group relative inline-block cursor-pointer overflow-hidden rounded-xl border border-stone-200 bg-white dark:border-white/10 dark:bg-zinc-900"
            >
              <img src={order.proofImage} alt="Payment proof" className="h-44 object-contain transition group-hover:scale-102" />
              <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 transition group-hover:opacity-100">
                <span className="rounded-full bg-white/95 px-3 py-1 text-xs font-bold text-stone-900 shadow">
                  Click to enlarge
                </span>
              </div>
            </div>
            {order.proofNote && (
              <p className="mt-2 text-xs font-semibold text-stone-600 dark:text-zinc-300">
                <span className="text-stone-400">Reference:</span> {order.proofNote}
              </p>
            )}
          </div>
        )}

        {/* Staff feedback note */}
        {order.staffNote && (
          <p className="mt-4 flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs font-semibold text-amber-700 dark:text-amber-300">
            <NotePencil size={14} weight="bold" className="mt-0.5" /> Note from Gursha: {order.staffNote}
          </p>
        )}

        {/* Upload or Re-upload Section */}
        {order.payment !== "cash" && (
          <div className="mt-6 border-t border-stone-200 pt-5 dark:border-white/10">
            {(order.proofStatus === "rejected" || order.proofStatus === "none" || showReplaceForm) ? (
              <form onSubmit={handleUploadProof} className="space-y-4 rounded-2xl border border-stone-200 bg-stone-50 p-4 dark:border-white/10 dark:bg-zinc-800/50">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-stone-900 dark:text-white">
                    {order.proofStatus === "rejected"
                      ? "Upload Corrected Payment Proof"
                      : order.proofStatus === "none"
                      ? "Submit Payment Proof"
                      : "Replace Payment Screenshot"}
                  </h3>
                  {showReplaceForm && order.proofStatus === "pending" && (
                    <button
                      type="button"
                      onClick={() => setShowReplaceForm(false)}
                      className="text-xs font-bold text-stone-400 hover:text-stone-600 dark:hover:text-zinc-200"
                    >
                      Cancel
                    </button>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-stone-300 bg-white p-5 text-center transition hover:border-orange-500 dark:border-white/15 dark:bg-zinc-900">
                    <UploadSimple size={24} className="text-stone-400" />
                    <span className="mt-2 text-xs font-bold text-stone-700 dark:text-zinc-200">
                      Choose screenshot or take a photo
                    </span>
                    <span className="mt-0.5 text-[11px] text-stone-400">PNG, JPG, or WebP</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleProofFile}
                      className="hidden"
                    />
                  </label>

                  {newImage && (
                    <div className="relative inline-block">
                      <img src={newImage} alt="Preview" className="h-32 rounded-xl border border-stone-200 object-contain dark:border-white/10" />
                      <button
                        type="button"
                        onClick={() => setNewImage("")}
                        className="absolute -right-2 -top-2 rounded-full bg-red-600 p-1 text-white shadow"
                        title="Remove image"
                      >
                        <X size={12} weight="bold" />
                      </button>
                    </div>
                  )}
                </div>

                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wider text-stone-400">
                    Transaction reference / SMS code (optional)
                  </label>
                  <input
                    value={newNote}
                    onChange={(e) => setNewNote(e.target.value)}
                    placeholder="e.g. telebirr transaction code or CBE reference"
                    className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-xs outline-none focus:border-orange-500 dark:border-white/15 dark:bg-zinc-900 dark:text-zinc-100"
                  />
                </div>

                {proofError && (
                  <p className="text-xs font-bold text-red-600">{proofError}</p>
                )}

                <button
                  type="submit"
                  disabled={!newImage || submittingProof}
                  className="flex w-full items-center justify-center gap-2 rounded-full bg-orange-600 px-5 py-2.5 text-xs font-bold text-white shadow transition hover:bg-orange-500 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {submittingProof ? (
                    <>
                      <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      <span>Submitting proof for admin review...</span>
                    </>
                  ) : (
                    <>
                      <UploadSimple size={14} weight="bold" />
                      <span>Submit Payment Proof for Verification</span>
                    </>
                  )}
                </button>
              </form>
            ) : order.proofStatus === "pending" ? (
              <div className="flex items-center justify-between">
                <span className="text-xs text-stone-500 dark:text-zinc-400">
                  Uploaded the wrong receipt?
                </span>
                <button
                  type="button"
                  onClick={() => setShowReplaceForm(true)}
                  className="rounded-full border border-stone-300 px-3.5 py-1.5 text-xs font-bold text-stone-600 hover:border-orange-500 hover:text-orange-600 dark:border-white/15 dark:text-zinc-300"
                >
                  Replace receipt screenshot
                </button>
              </div>
            ) : null}
          </div>
        )}
      </div>

      {cancellable && (
        <button type="button" onClick={() => { setStatus(order.code, "cancelled"); }}
          className="no-print mt-4 w-full rounded-full border border-red-500/40 px-5 py-3 text-sm font-bold text-red-600 transition-colors hover:bg-red-500/10">
          Cancel this order
        </button>
      )}

      {/* Customer Fullscreen Lightbox Modal */}
      {lightboxImage && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-stone-950/80 backdrop-blur-md" onClick={() => setLightboxImage(null)} />
          <div className="relative max-h-[90vh] max-w-2xl overflow-hidden rounded-2xl bg-white p-3 shadow-2xl dark:bg-zinc-900">
            <div className="mb-2 flex items-center justify-between border-b border-stone-200 pb-2 dark:border-white/10">
              <span className="text-xs font-bold text-stone-700 dark:text-zinc-200">Payment Proof Screenshot</span>
              <button
                type="button"
                onClick={() => setLightboxImage(null)}
                className="rounded-full p-1 text-stone-500 hover:bg-stone-100 dark:hover:bg-white/10"
              >
                <X size={16} weight="bold" />
              </button>
            </div>
            <img src={lightboxImage} alt="Payment proof full preview" className="max-h-[75vh] w-full object-contain" />
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------- profile */
export function ProfilePage() {
  const {
    t, session, orders, logout, cms, refreshCms, adminAuthed,
    requestEmailOtp, verifyEmailOtp, linkCustomerPhone,
    requestOtp, verifyOtp,
  } = useGursha();
  const [method, setMethod] = useState<"email" | "phone">("email");
  const [email, setEmail] = useState(session?.email ?? "");
  const [name, setName] = useState(session?.name ?? "");
  const [phone, setPhone] = useState(session?.phone ?? "");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<"input" | "verify">("input");
  const [isSending, setIsSending] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [linkPhoneInput, setLinkPhoneInput] = useState("");
  const [isLinking, setIsLinking] = useState(false);

  // Fetch the latest saved cafe location and hours from database on mount
  useEffect(() => {
    refreshCms();
  }, [refreshCms]);

  // Sync state when session changes
  useEffect(() => {
    if (session?.name) setName(session.name);
    if (session?.email) setEmail(session.email);
    if (session?.phone) setPhone(session.phone);
    if (session?.verified) {
      setStep("input");
      setOtp("");
      setErrorMessage(null);
    }
  }, [session]);

  // Resend cooldown timer
  useEffect(() => {
    if (cooldown > 0) {
      const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [cooldown]);

  const handleRequestOtp = async () => {
    if (method === "email") {
      const { valid, normalized, error: valErr } = validateEmail(email);
      if (!valid) {
        setErrorMessage(valErr || "Please enter a valid email address.");
        return;
      }

      setErrorMessage(null);
      setIsSending(true);
      try {
        const res = await requestEmailOtp(normalized, name);
        if (res.success) {
          setStep("verify");
          setCooldown(60);
        } else {
          setErrorMessage(res.error || "Failed to dispatch verification email.");
        }
      } finally {
        setIsSending(false);
      }
    } else {
      const { valid, normalized, error: valErr } = validatePhoneNumber(phone);
      if (!valid) {
        setErrorMessage(valErr || "Please enter a valid phone number.");
        return;
      }

      setErrorMessage(null);
      setIsSending(true);
      try {
        const res = await requestOtp(normalized, name);
        if (res.success) {
          setStep("verify");
          setCooldown(60);
        } else {
          setErrorMessage(res.error || "Failed to dispatch verification code.");
        }
      } finally {
        setIsSending(false);
      }
    }
  };

  const handleVerifyOtp = async () => {
    const cleanOtp = otp.trim();
    if (!cleanOtp) {
      setErrorMessage("Please enter the 6-digit verification code.");
      return;
    }

    setErrorMessage(null);
    setIsVerifying(true);
    try {
      if (method === "email") {
        const res = await verifyEmailOtp(email, cleanOtp);
        if (res.success) {
          setStep("input");
          setOtp("");
        } else {
          setErrorMessage(res.error || "Invalid or expired code. Please try again.");
        }
      } else {
        const res = await verifyOtp(cleanOtp, phone);
        if (res.success) {
          setStep("input");
          setOtp("");
        } else {
          setErrorMessage(res.error || "Invalid or expired code. Please try again.");
        }
      }
    } finally {
      setIsVerifying(false);
    }
  };

  const handleResend = () => {
    if (cooldown > 0 || isSending) return;
    handleRequestOtp();
  };

  const handleChangeTarget = () => {
    setStep("input");
    setOtp("");
    setErrorMessage(null);
  };

  const handleLinkPhone = async () => {
    if (!linkPhoneInput.trim()) return;
    setIsLinking(true);
    try {
      const res = await linkCustomerPhone(linkPhoneInput.trim());
      if (res.success) {
        setLinkPhoneInput("");
      }
    } finally {
      setIsLinking(false);
    }
  };

  // Privacy protection: Only show orders placed under the customer's verified phone number
  const userOrders = session?.phone
    ? orders.filter((o) => normalizePhoneNumber(o.phone) === normalizePhoneNumber(session.phone))
    : [];

  const spent = userOrders.reduce((a, o) => a + (o.status === "cancelled" ? 0 : o.total), 0);
  const loyalty = Math.min(userOrders.length, 10);

  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
      <SectionHead
        eyebrow={t("nav.home")}
        title={t("profile.title")}
        sub="Sign in with Email OTP verification to securely manage your account and orders."
      />
      <div className="grid gap-5 md:grid-cols-2">
        <section className="rounded-3xl border border-stone-200 bg-white p-6 dark:border-white/10 dark:bg-zinc-900">
          {session?.verified ? (
            <>
              <div className="flex items-center gap-3">
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-orange-600 text-white">
                  <UserCircle size={26} weight="bold" />
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-display text-lg font-extrabold text-stone-900 dark:text-white">
                      {session.name}
                    </p>
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-extrabold text-emerald-700 dark:text-emerald-400">
                      <Check size={11} weight="bold" /> Verified
                    </span>
                  </div>
                  {session.email && (
                    <p className="flex items-center gap-1.5 text-xs font-semibold text-stone-600 dark:text-zinc-300">
                      <EnvelopeSimple size={13} weight="bold" className="text-orange-600" />
                      {session.email}
                    </p>
                  )}
                  {session.phone && (
                    <p className="flex items-center gap-1.5 text-xs text-stone-500 dark:text-zinc-400">
                      <Phone size={13} weight="bold" className="text-stone-400" />
                      {formatPhoneDisplay(session.phone)}
                    </p>
                  )}
                </div>
              </div>

              {/* Secure Phone Linking for Order History */}
              {!session.phone && (
                <div className="mt-4 rounded-2xl border border-dashed border-stone-200 bg-stone-50 p-4 dark:border-white/10 dark:bg-zinc-800/40">
                  <p className="text-xs font-bold text-stone-800 dark:text-zinc-200 flex items-center gap-1.5">
                    <Phone size={14} weight="bold" className="text-orange-600" /> Link Contact Phone for Orders
                  </p>
                  <p className="mt-1 text-[11px] text-stone-500 dark:text-zinc-400 leading-relaxed">
                    Link your Ethiopian phone number to associate and review past orders placed via delivery or online.
                  </p>
                  <div className="mt-2.5 flex gap-2">
                    <input
                      value={linkPhoneInput}
                      onChange={(e) => setLinkPhoneInput(e.target.value)}
                      placeholder="0911 234 567"
                      inputMode="tel"
                      className="flex-1 rounded-xl border border-stone-300 bg-white px-3 py-1.5 text-xs outline-none focus:border-orange-500 dark:border-white/15 dark:bg-zinc-900 dark:text-zinc-100"
                    />
                    <button
                      type="button"
                      onClick={handleLinkPhone}
                      disabled={isLinking || linkPhoneInput.trim().length < 8}
                      className="rounded-xl bg-orange-600 px-3.5 py-1.5 text-xs font-bold text-white transition hover:bg-orange-500 disabled:opacity-50"
                    >
                      {isLinking ? "Linking..." : "Link Phone"}
                    </button>
                  </div>
                </div>
              )}

              <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-xl bg-stone-100 p-3 dark:bg-white/5">
                  <p className="text-[11px] font-bold uppercase tracking-widest text-stone-400">Orders</p>
                  <p className="mt-1 font-display text-xl font-extrabold text-stone-900 dark:text-white">
                    {userOrders.length}
                  </p>
                </div>
                <div className="rounded-xl bg-stone-100 p-3 dark:bg-white/5">
                  <p className="text-[11px] font-bold uppercase tracking-widest text-stone-400">Total Spent</p>
                  <p className="mt-1 font-display text-xl font-extrabold text-stone-900 dark:text-white">
                    {money(spent)}
                  </p>
                </div>
              </div>
              <div className="mt-4">
                <div className="mb-1.5 flex justify-between text-xs font-bold text-stone-500 dark:text-zinc-400">
                  <span>Loyalty · free dessert at 10 orders</span>
                  <span className="tabular-nums">{loyalty}/10</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-stone-200 dark:bg-white/10">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${loyalty * 10}%` }}
                    transition={{ duration: 0.6, ease: "easeOut" }}
                    className="h-full rounded-full bg-orange-600"
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={logout}
                className="mt-5 w-full rounded-full border border-stone-300 px-4 py-2.5 text-sm font-bold text-stone-600 transition-colors hover:bg-stone-50 dark:border-white/15 dark:text-zinc-300 dark:hover:bg-white/5"
              >
                {t("profile.logout")}
              </button>
            </>
          ) : step === "input" ? (
            <>
              <div className="flex items-center justify-between">
                <h3 className="font-display text-base font-extrabold text-stone-900 dark:text-white">
                  {t("profile.login")}
                </h3>
                {/* Method switcher */}
                <div className="flex rounded-full bg-stone-100 p-0.5 dark:bg-zinc-800 text-xs">
                  <button
                    type="button"
                    onClick={() => { setMethod("email"); setErrorMessage(null); }}
                    className={`flex items-center gap-1 rounded-full px-3 py-1 font-bold transition ${
                      method === "email"
                        ? "bg-white text-orange-600 shadow-sm dark:bg-zinc-900 dark:text-orange-400"
                        : "text-stone-500 hover:text-stone-800 dark:text-zinc-400"
                    }`}
                  >
                    <EnvelopeSimple size={13} weight="bold" /> Email OTP
                  </button>
                  <button
                    type="button"
                    onClick={() => { setMethod("phone"); setErrorMessage(null); }}
                    className={`flex items-center gap-1 rounded-full px-3 py-1 font-bold transition ${
                      method === "phone"
                        ? "bg-white text-orange-600 shadow-sm dark:bg-zinc-900 dark:text-orange-400"
                        : "text-stone-500 hover:text-stone-800 dark:text-zinc-400"
                    }`}
                  >
                    <Phone size={13} weight="bold" /> SMS
                  </button>
                </div>
              </div>

              <p className="mt-1 text-xs text-stone-500 dark:text-zinc-400">
                {method === "email"
                  ? "Enter your email address to receive a 6-digit verification code."
                  : "Enter your phone number to receive a one-time verification SMS."}
              </p>

              {errorMessage && (
                <div className="mt-3 flex items-start gap-2 rounded-xl bg-red-500/10 p-3 text-xs text-red-600 dark:text-red-400">
                  <WarningCircle size={16} weight="bold" className="mt-0.5 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              <div className="mt-4 space-y-3">
                <label className="block">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-stone-400">
                    Your Name (Optional)
                  </span>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g., Abebe Kebede"
                    className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-orange-500 dark:border-white/15 dark:bg-white/5 dark:text-zinc-100"
                  />
                </label>

                {method === "email" ? (
                  <label className="block">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-stone-400">
                      Email Address
                    </span>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="e.g., abebe@gmail.com"
                      autoCapitalize="none"
                      autoCorrect="off"
                      className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-orange-500 dark:border-white/15 dark:bg-white/5 dark:text-zinc-100"
                    />
                    <span className="mt-1 block text-[11px] text-stone-400">
                      A 6-digit OTP code will be sent to your email inbox.
                    </span>
                  </label>
                ) : (
                  <label className="block">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-stone-400">
                      Phone Number
                    </span>
                    <input
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="0911 234 567 or +251 911 234 567"
                      inputMode="tel"
                      className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-orange-500 dark:border-white/15 dark:bg-white/5 dark:text-zinc-100"
                    />
                    <span className="mt-1 block text-[11px] text-stone-400">
                      Supports Ethiopian numbers (09xx / 07xx) and international E.164 formats.
                    </span>
                  </label>
                )}

                <button
                  type="button"
                  onClick={handleRequestOtp}
                  disabled={isSending || (method === "email" ? email.trim().length < 5 : phone.trim().length < 8)}
                  className="mt-2 flex w-full items-center justify-center gap-2 rounded-full bg-orange-600 px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-orange-500 disabled:opacity-50"
                >
                  {isSending ? (
                    <>
                      <ArrowCounterClockwise size={16} weight="bold" className="animate-spin" />
                      <span>Sending verification code...</span>
                    </>
                  ) : (
                    <span>Send Verification Code</span>
                  )}
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-display text-base font-extrabold text-stone-900 dark:text-white">
                    Enter Verification Code
                  </h3>
                  <p className="mt-0.5 text-xs text-stone-500 dark:text-zinc-400">
                    Sent via {method === "email" ? "Email" : "SMS"} to{" "}
                    <span className="font-bold text-stone-800 dark:text-zinc-200">
                      {method === "email" ? email : formatPhoneDisplay(phone)}
                    </span>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleChangeTarget}
                  className="text-xs font-bold text-orange-600 hover:underline"
                >
                  Edit {method === "email" ? "email" : "phone"}
                </button>
              </div>

              {errorMessage && (
                <div className="mt-3 flex items-start gap-2 rounded-xl bg-red-500/10 p-3 text-xs text-red-600 dark:text-red-400">
                  <WarningCircle size={16} weight="bold" className="mt-0.5 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              <div className="mt-4 space-y-4">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-stone-400">
                    6-Digit Verification Code (OTP)
                  </label>
                  <input
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="123456"
                    autoFocus
                    className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-center text-xl font-mono font-extrabold tracking-[0.3em] outline-none transition focus:border-orange-500 dark:border-white/15 dark:bg-white/5 dark:text-zinc-100"
                  />
                </div>

                <button
                  type="button"
                  onClick={handleVerifyOtp}
                  disabled={isVerifying || otp.trim().length < 6}
                  className="flex w-full items-center justify-center gap-2 rounded-full bg-stone-900 px-4 py-3 text-sm font-bold text-white transition hover:bg-stone-800 disabled:opacity-50 dark:bg-white dark:text-stone-900 dark:hover:bg-zinc-200"
                >
                  {isVerifying ? (
                    <>
                      <ArrowCounterClockwise size={16} weight="bold" className="animate-spin" />
                      <span>Verifying code...</span>
                    </>
                  ) : (
                    <span>Verify & Sign In</span>
                  )}
                </button>

                <div className="flex items-center justify-between text-xs text-stone-500 dark:text-zinc-400 pt-1">
                  <span>Didn't receive the {method === "email" ? "email" : "SMS"}?</span>
                  {cooldown > 0 ? (
                    <span className="font-semibold text-stone-400">
                      Resend in <span className="tabular-nums font-bold text-orange-600">{cooldown}s</span>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={handleResend}
                      disabled={isSending}
                      className="font-bold text-orange-600 hover:underline"
                    >
                      Resend code
                    </button>
                  )}
                </div>
              </div>
            </>
          )}
        </section>

        <section className="space-y-4">
          <div className="rounded-3xl border border-stone-200 bg-white p-6 dark:border-white/10 dark:bg-zinc-900">
            <h3 className="font-display text-base font-bold text-stone-900 dark:text-white">Recent orders</h3>
            {userOrders.length === 0 ? (
              <p className="mt-3 text-sm text-stone-500 dark:text-zinc-400">
                {session?.verified ? "No past orders under this phone number." : "Sign in above to see your order history."}
              </p>
            ) : (
              <ul className="mt-3 space-y-2.5">
                {userOrders.slice(0, 4).map((o) => (
                  <li key={o.code} className="flex items-center justify-between text-sm">
                    <span className="font-bold text-stone-800 dark:text-zinc-200">{o.code}</span>
                    <span className="text-stone-500 dark:text-zinc-400">{t(`status.${o.status}`)}</span>
                    <Price n={o.total} className="font-bold text-orange-600" />
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="rounded-3xl border border-stone-200 bg-white p-6 dark:border-white/10 dark:bg-zinc-900">
            <div className="flex items-center justify-between">
              <h3 className="font-display flex items-center gap-2 text-base font-bold text-stone-900 dark:text-white">
                <Clock size={18} weight="bold" className="text-orange-600" /> Café location & hours
              </h3>
              {adminAuthed && (
                <Link
                  to="/admin/profile"
                  className="inline-flex items-center gap-1 text-xs font-bold text-orange-600 hover:underline"
                >
                  <PencilSimple size={13} weight="bold" /> Edit in Admin Profile
                </Link>
              )}
            </div>
            {cms.address ? (
              <p className="mt-2 text-sm text-stone-500 dark:text-zinc-400">
                {cms.address}
              </p>
            ) : (
              <p className="mt-2 text-sm italic text-stone-400 dark:text-zinc-500">
                Location not configured.
              </p>
            )}
            <p className="mt-1 text-xs text-stone-400 dark:text-zinc-500">
              {cms.hours ? cms.hours : "Hours not configured"}
              {cms.phone ? ` · Hotline: ${cms.phone}` : ""}
            </p>
            {cms.directionsNote && (
              <p className="mt-1.5 text-xs italic text-stone-400 dark:text-zinc-500">
                💡 {cms.directionsNote}
              </p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}