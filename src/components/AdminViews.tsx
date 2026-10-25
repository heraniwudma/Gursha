import { useEffect, useMemo, useState } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { toast } from "sonner";
import {
  ArrowCounterClockwise, Bank, Bicycle, CalendarCheck, Check, CheckCircle, Clock,
  EnvelopeSimple, Eye, EyeSlash, FileText, FloppyDisk, ForkKnife, Gauge, Lock, MagnifyingGlass, MapPin,
  NotePencil, PencilSimple, Phone, Plus, Printer, Receipt, ShieldCheck, SignOut,
  Sparkle, Star, Storefront, Trash, UploadSimple, UserCircle, WarningCircle, X, XCircle,
} from "@phosphor-icons/react";
import { useGursha } from "../context/GurshaStore";
import { Price } from "./CustomerViews";
import { DEFAULT_DELIVERY_SETTINGS, STATUS_ORDER, zoneFee } from "../data/mockData";
import { getNextOrderStatus, getOrderFlow, isValidStatusTransition } from "../lib/orders";
import type { DeliveryDestination, DeliverySettings, Order, OrderStatus, PaymentMethod, ServiceType } from "../types";

import { normalizePhoneNumber, validatePhoneNumber, formatPhoneDisplay } from "../lib/phone";
import { validateEmail } from "../lib/auth";
import { ProofImagePreview } from "./ProofImagePreview";
import { resolveProofImageUrl } from "../lib/storage";

const etb = (n: number) => `ETB ${n.toLocaleString()}`;
const fmt = (ts: number) => new Date(ts).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
const clock = (ts: number) => new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const SERVICE_LABEL: Record<ServiceType, string> = { "dine-in": "Dine-in", takeaway: "Takeaway", delivery: "Delivery" };
const PAY_LABEL: Record<PaymentMethod, string> = { cash: "Cash", telebirr: "telebirr", cbe: "CBE" };

const NAV = [
  { to: "/admin", label: "Dashboard", Icon: Gauge, end: true },
  { to: "/admin/orders", label: "Orders", Icon: Receipt, end: false },
  { to: "/admin/payments", label: "Payments", Icon: ShieldCheck, end: false },
  { to: "/admin/menu", label: "Menu", Icon: ForkKnife, end: false },
  { to: "/admin/extras", label: "Extras", Icon: Sparkle, end: false },
  { to: "/admin/cms", label: "Content", Icon: FileText, end: false },
  { to: "/admin/profile", label: "Profile", Icon: UserCircle, end: false },
];

function AdminLogin() {
  const { signInAdmin, t } = useGursha();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const { valid, normalized, error: emailErr } = validateEmail(email);
    if (!valid) {
      setErrorMessage(emailErr || "Please enter a valid administrator email address.");
      return;
    }

    if (!password) {
      setErrorMessage("Please enter your administrator password.");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await signInAdmin(normalized, password);
      if (!res.success) {
        setErrorMessage(res.error || "Failed to authenticate administrator. Please check your credentials.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mx-auto grid min-h-[75vh] max-w-md place-items-center px-4 py-14">
      <div className="w-full rounded-3xl border border-stone-200 bg-white p-8 shadow-sm dark:border-white/10 dark:bg-zinc-900">
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-orange-600 text-white shadow-md shadow-orange-600/20">
          <Lock size={24} weight="bold" />
        </span>
        <h1 className="font-display mt-5 text-2xl font-extrabold text-stone-900 dark:text-white">{t("admin.dashboard")}</h1>
        <p className="mt-1.5 text-xs leading-relaxed text-stone-500 dark:text-zinc-400">
          Restricted access. Authorized Gursha Cafe administrators only.
        </p>

        {errorMessage && (
          <div className="mt-4 flex items-start gap-2.5 rounded-2xl border border-red-500/20 bg-red-500/10 p-3.5 text-xs text-red-600 dark:text-red-400">
            <WarningCircle size={16} weight="bold" className="mt-0.5 shrink-0" />
            <span className="leading-relaxed">{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handlePasswordLogin} className="mt-5 space-y-4">
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-stone-400">
              {t("auth.email")}
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@gurshacafe.et"
              autoComplete="email"
              className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-orange-500 dark:border-white/15 dark:bg-white/5 dark:text-zinc-100"
            />
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-stone-400">
                {t("auth.password")}
              </label>
              <Link
                to="/forgot-password"
                className="text-[11px] font-semibold text-orange-600 hover:text-orange-500 hover:underline"
              >
                Forgot password?
              </Link>
            </div>
            <div className="relative mt-1">
              <input
                type={showPassword ? "text" : "password"}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                autoComplete="current-password"
                className="w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 pr-10 text-sm outline-none transition focus:border-orange-500 dark:border-white/15 dark:bg-white/5 dark:text-zinc-100"
              />
              <button
                type="button"
                aria-label={showPassword ? "Hide password" : "Show password"}
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700 dark:hover:text-zinc-200"
              >
                {showPassword ? <EyeSlash size={18} weight="bold" /> : <Eye size={18} weight="bold" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting || !email || !password}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-orange-600 px-4 py-3 text-sm font-bold text-white shadow-md transition hover:bg-orange-500 disabled:opacity-50"
          >
            {isSubmitting ? (
              <>
                <ArrowCounterClockwise size={16} weight="bold" className="animate-spin" />
                <span>Verifying credentials...</span>
              </>
            ) : (
              <span>{t("admin.signIn")}</span>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}


export function AdminShell() {
  const { t, adminAuthed, authLoading, adminLogout, orders } = useGursha();
  const navigate = useNavigate();
  const pendingProofs = orders.filter((o) => o.proofStatus === "pending").length;
  const liveOrders = orders.filter((o) => !["completed", "cancelled"].includes(o.status)).length;

  if (authLoading) {
    return (
      <div className="mx-auto grid min-h-[60vh] place-items-center px-4 py-16">
        <div className="flex flex-col items-center gap-3 text-stone-500 dark:text-zinc-400">
          <ArrowCounterClockwise size={32} weight="bold" className="animate-spin text-orange-600" />
          <p className="text-sm font-medium">Verifying administrator session...</p>
        </div>
      </div>
    );
  }

  if (!adminAuthed) return <AdminLogin />;

  const badge = (label: string) => (label === "Orders" ? liveOrders : label === "Payments" ? pendingProofs : 0);

  return (
    <div className="min-h-screen bg-stone-100 dark:bg-zinc-950">
      <div className="mx-auto flex max-w-[1400px] flex-col gap-6 px-4 py-6 lg:flex-row lg:px-6">
        <aside className="lg:w-60 lg:shrink-0">
          <div className="rounded-3xl border border-stone-200 bg-white p-4 dark:border-white/10 dark:bg-zinc-900">
            <Link to="/" className="flex items-center gap-2.5 px-1 pb-4">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-orange-600 font-display text-lg font-extrabold text-white">G</span>
              <span className="font-display text-base font-extrabold text-stone-900 dark:text-white">Gursha Admin</span>
            </Link>
            <nav className="gursha-scroll -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 lg:flex-col lg:overflow-visible">
              {NAV.map(({ to, label, Icon, end }) => {
                const navKey =
                  label === "Dashboard"
                    ? "admin.dashboard"
                    : label === "Orders"
                    ? "admin.orders"
                    : label === "Payments"
                    ? "admin.payments"
                    : label === "Menu"
                    ? "admin.menu"
                    : label === "Extras"
                    ? "admin.extras"
                    : label === "Content"
                    ? "admin.cms"
                    : label === "Profile"
                    ? "admin.profile"
                    : "";
                const displayLabel = navKey ? t(navKey) : label;
                return (
                  <NavLink key={to} to={to} end={end}
                    className={({ isActive }) => `flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-bold transition-colors ${
                      isActive ? "bg-orange-600 text-white" : "text-stone-600 hover:bg-stone-100 dark:text-zinc-300 dark:hover:bg-white/5"}`}>
                    <Icon size={17} weight="bold" />
                    {displayLabel}
                    {badge(label) > 0 && (
                      <span className="ml-auto rounded-full bg-white px-1.5 py-0.5 text-[10px] font-extrabold tabular-nums text-orange-600">{badge(label)}</span>
                    )}
                  </NavLink>
                );
              })}
            </nav>
            <div className="mt-4 space-y-1 border-t border-stone-200 pt-4 dark:border-white/10">
              <button type="button" onClick={() => navigate("/")} className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-bold text-stone-500 hover:bg-stone-100 dark:text-zinc-400 dark:hover:bg-white/5">
                <Storefront size={17} weight="bold" /> {t("admin.viewStorefront")}
              </button>
              <button type="button" onClick={adminLogout} className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-bold text-red-600 hover:bg-red-500/10">
                <SignOut size={17} weight="bold" /> {t("admin.signOut")}
              </button>
            </div>
          </div>
        </aside>
        <main className="min-w-0 flex-1 pb-16">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- dashboard */
export function AdminDashboard() {
  const { t, orders, menu } = useGursha();
  const navigate = useNavigate();
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  // Top Sellers: best-selling items calculated from actual non-cancelled sales
  const topSellers = useMemo(() => {
    const menuImageMap = new Map<string, string>();
    menu.forEach((m) => {
      if (m.image) menuImageMap.set(m.id, m.image);
    });

    const itemMap = new Map<
      string,
      {
        itemId: string;
        name: string;
        image: string;
        qty: number;
        revenue: number;
      }
    >();

    orders.forEach((o) => {
      // Exclude cancelled orders and rejected payment proofs from sales
      if (o.status === "cancelled" || o.proofStatus === "rejected") return;

      o.items.forEach((i) => {
        const row = itemMap.get(i.itemId) ?? {
          itemId: i.itemId,
          name: i.name,
          image: menuImageMap.get(i.itemId) || "",
          qty: 0,
          revenue: 0,
        };
        row.qty += i.qty;
        row.revenue += (i.basePrice + i.extraPrice) * i.qty;
        if (!row.image && menuImageMap.has(i.itemId)) {
          row.image = menuImageMap.get(i.itemId)!;
        }
        itemMap.set(i.itemId, row);
      });
    });

    return [...itemMap.values()]
      .filter((row) => row.qty > 0)
      .sort((a, b) => b.qty - a.qty || b.revenue - a.revenue)
      .slice(0, 8);
  }, [orders, menu]);

  // Latest Orders: most recent orders ordered by creation timestamp descending
  const latestOrders = useMemo(() => {
    return [...orders].sort((a, b) => b.createdAt - a.createdAt).slice(0, 8);
  }, [orders]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4 rounded-3xl border border-stone-200 bg-white p-6 dark:border-white/10 dark:bg-zinc-900">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-orange-600">{t("admin.title")}</p>
          <h1 className="font-display mt-1 text-2xl font-extrabold text-stone-900 dark:text-white">Good service starts here</h1>
          <p className="mt-1.5 text-sm text-stone-500 dark:text-zinc-400">
            Overview of top sellers and latest customer orders
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => navigate("/admin/payments")} className="rounded-full bg-orange-600 px-5 py-2.5 text-sm font-bold text-white">Payment verification</button>
          <button type="button" onClick={() => navigate("/admin/orders")} className="rounded-full border border-stone-300 px-5 py-2.5 text-sm font-bold text-stone-700 dark:border-white/15 dark:text-zinc-200">Order board</button>
        </div>
      </header>

      <div className="grid gap-6 xl:grid-cols-[400px_1fr]">
        {/* Section A: Top Sellers */}
        <section className="rounded-3xl border border-stone-200 bg-white p-5 dark:border-white/10 dark:bg-zinc-900">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-base font-bold text-stone-900 dark:text-white">Top sellers</h2>
            <span className="text-xs font-semibold text-stone-400">{topSellers.length} products</span>
          </div>

          {topSellers.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-stone-200 py-12 text-center dark:border-white/10">
              <ForkKnife size={32} className="text-stone-300 dark:text-zinc-600" />
              <p className="mt-3 text-sm font-bold text-stone-700 dark:text-zinc-300">No qualifying sales yet</p>
              <p className="mt-1 text-xs text-stone-400 dark:text-zinc-500">
                Best-selling dishes will rank here once orders are confirmed.
              </p>
            </div>
          ) : (
            <ul className="space-y-3">
              {topSellers.map((row, i) => (
                <li
                  key={row.itemId || row.name}
                  className="flex items-center gap-3 rounded-2xl border border-stone-100 bg-stone-50/50 p-2.5 transition hover:bg-stone-50 dark:border-white/5 dark:bg-white/[0.02] dark:hover:bg-white/5"
                >
                  <span
                    className={`font-display grid h-8 w-8 shrink-0 place-items-center rounded-xl text-xs font-black ${
                      i === 0
                        ? "bg-amber-500/20 text-amber-700 dark:bg-amber-500/25 dark:text-amber-400"
                        : i === 1
                        ? "bg-stone-200 text-stone-700 dark:bg-white/10 dark:text-zinc-300"
                        : i === 2
                        ? "bg-amber-800/15 text-amber-900 dark:bg-amber-800/25 dark:text-amber-300"
                        : "bg-stone-100 text-stone-500 dark:bg-white/5 dark:text-zinc-400"
                    }`}
                  >
                    #{i + 1}
                  </span>
                  {row.image ? (
                    <img
                      src={row.image}
                      alt={row.name}
                      className="h-11 w-11 shrink-0 rounded-xl border border-stone-200 object-cover dark:border-white/10"
                    />
                  ) : (
                    <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-orange-500/10 text-orange-600 dark:bg-white/5">
                      <ForkKnife size={18} weight="bold" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-stone-900 dark:text-white">
                      {row.name}
                    </span>
                    <span className="text-xs text-stone-400">
                      <strong className="font-bold text-stone-700 dark:text-zinc-300">{row.qty}</strong> sold
                    </span>
                  </div>
                  <span className="text-sm font-extrabold tabular-nums text-orange-600">
                    {etb(row.revenue)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Section B: Latest Orders */}
        <section className="rounded-3xl border border-stone-200 bg-white p-5 dark:border-white/10 dark:bg-zinc-900">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-base font-bold text-stone-900 dark:text-white">Latest orders</h2>
            <Link to="/admin/orders" className="text-sm font-bold text-orange-600 hover:underline">Open board →</Link>
          </div>

          {latestOrders.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-stone-200 py-12 text-center dark:border-white/10">
              <Receipt size={32} className="text-stone-300 dark:text-zinc-600" />
              <p className="mt-3 text-sm font-bold text-stone-700 dark:text-zinc-300">No orders yet</p>
              <p className="mt-1 text-xs text-stone-400 dark:text-zinc-500">
                Customer orders will appear here in descending chronological order.
              </p>
            </div>
          ) : (
            <div className="gursha-scroll overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead>
                  <tr className="text-[11px] uppercase tracking-widest text-stone-400">
                    <th className="pb-3 font-bold">Code</th>
                    <th className="pb-3 font-bold">Customer</th>
                    <th className="pb-3 font-bold">Service</th>
                    <th className="pb-3 font-bold">Status</th>
                    <th className="pb-3 text-right font-bold">Total</th>
                    <th className="pb-3 text-right font-bold pr-2">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-200 dark:divide-white/10">
                  {latestOrders.map((o) => (
                    <tr
                      key={o.code}
                      onClick={() => setSelectedOrder(o)}
                      className="group cursor-pointer transition hover:bg-stone-50 dark:hover:bg-white/5"
                    >
                      <td className="py-3 font-bold text-stone-900 dark:text-white">
                        {o.code}
                        <span className="block text-xs font-normal text-stone-400">{fmt(o.createdAt)}</span>
                      </td>
                      <td className="py-3 text-stone-600 dark:text-zinc-300">
                        {o.customerName}
                        <span className="block text-xs text-stone-400">{o.phone}</span>
                      </td>
                      <td className="py-3 text-stone-600 dark:text-zinc-300">
                        {SERVICE_LABEL[o.service]}{o.zone ? ` · ${o.zone}` : ""}
                      </td>
                      <td className="py-3">
                        <StatusChip status={o.status} />
                      </td>
                      <td className="py-3 text-right font-extrabold tabular-nums text-orange-600">
                        {etb(o.total)}
                      </td>
                      <td className="py-3 text-right pr-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedOrder(o);
                          }}
                          className="rounded-lg border border-stone-200 px-2.5 py-1 text-xs font-bold text-stone-600 opacity-90 transition hover:border-orange-500 hover:text-orange-600 dark:border-white/10 dark:text-zinc-300"
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {selectedOrder && (
        <OrderDrawer order={selectedOrder} onClose={() => setSelectedOrder(null)} />
      )}
    </div>
  );
}

function StatusChip({ status }: { status: OrderStatus }) {
  const { t } = useGursha();
  const tone =
    status === "cancelled" ? "bg-red-500/12 text-red-600" :
    status === "completed" ? "bg-emerald-500/12 text-emerald-600" :
    status === "payment_pending" ? "bg-amber-500/15 text-amber-700 dark:text-amber-300" :
    "bg-orange-600/12 text-orange-700 dark:text-orange-300";
  return <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${tone}`}>{t(`status.${status}`)}</span>;
}

/* -------------------------------------------------------------------- Lightbox Modal */
export function ImageLightboxModal({ src, alt, onClose }: { src: string; alt?: string; onClose: () => void }) {
  const [resolvedSrc, setResolvedSrc] = useState(src);

  useEffect(() => {
    let active = true;
    if (src.startsWith("payment-proofs/")) {
      resolveProofImageUrl(src).then((url) => {
        if (active && url) setResolvedSrc(url);
      });
    } else {
      setResolvedSrc(src);
    }
    return () => {
      active = false;
    };
  }, [src]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/85 p-4 backdrop-blur-md" onClick={onClose}>
      <div className="relative max-h-[92vh] max-w-[92vw] overflow-hidden rounded-2xl bg-zinc-900 p-2 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-2 flex items-center justify-between px-2 pt-1 text-white">
          <span className="text-xs font-bold text-zinc-300">{alt || "Payment screenshot"}</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close image preview"
            className="grid h-8 w-8 place-items-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
          >
            <X size={16} weight="bold" />
          </button>
        </div>
        <img
          src={resolvedSrc}
          alt={alt || "Full size view"}
          className="max-h-[80vh] max-w-full rounded-xl object-contain"
        />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------- orders */
function OrderDrawer({ order, onClose }: { order: Order; onClose: () => void }) {
  const { t, advance, setStatus, approveProof, rejectProof } = useGursha();
  const [reason, setReason] = useState("");
  const [showFullProof, setShowFullProof] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const next = getNextOrderStatus(order);
  const isPaymentVerified = order.payment === "cash" || order.proofStatus === "approved";

  return (
    <div className="fixed inset-0 z-[90] flex justify-end">
      <div className="absolute inset-0 bg-stone-950/50 backdrop-blur-sm" onClick={onClose} />
      <motion.aside initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ type: "spring", stiffness: 320, damping: 34 }}
        className="relative flex h-full w-full max-w-lg flex-col overflow-y-auto bg-white p-6 dark:bg-zinc-900">
        <div className="flex items-start justify-between gap-4 border-b border-stone-200 pb-4 dark:border-white/10">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-orange-600">{SERVICE_LABEL[order.service]}</p>
            <h2 className="font-display mt-1 text-xl font-extrabold text-stone-900 dark:text-white">{order.code}</h2>
            <p className="text-sm text-stone-500 dark:text-zinc-400">{order.customerName} · {order.phone}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="grid h-9 w-9 place-items-center rounded-full border border-stone-300 dark:border-white/15"><X size={17} weight="bold" /></button>
        </div>

        <dl className="grid grid-cols-2 gap-3 py-4 text-sm">
          <div className="rounded-xl bg-stone-100 p-3 dark:bg-white/5"><dt className="text-[11px] font-bold uppercase tracking-widest text-stone-400">Placed</dt><dd className="mt-1 font-semibold text-stone-700 dark:text-zinc-200">{fmt(order.createdAt)}</dd></div>
          <div className="rounded-xl bg-stone-100 p-3 dark:bg-white/5"><dt className="text-[11px] font-bold uppercase tracking-widest text-stone-400">Ready for</dt><dd className="mt-1 font-semibold text-stone-700 dark:text-zinc-200">{order.scheduledFor ? clock(order.scheduledFor) : "ASAP"}</dd></div>
          <div className="rounded-xl bg-stone-100 p-3 dark:bg-white/5"><dt className="text-[11px] font-bold uppercase tracking-widest text-stone-400">Payment</dt><dd className="mt-1 font-semibold text-stone-700 dark:text-zinc-200">{PAY_LABEL[order.payment]} · <span className={order.proofStatus === "approved" ? "text-emerald-600 font-bold" : order.proofStatus === "rejected" ? "text-red-600 font-bold" : "text-amber-600 font-bold"}>{order.proofStatus}</span></dd></div>
          <div className="rounded-xl bg-stone-100 p-3 dark:bg-white/5"><dt className="text-[11px] font-bold uppercase tracking-widest text-stone-400">Where</dt><dd className="mt-1 font-semibold text-stone-700 dark:text-zinc-200">{order.address || "—"}</dd></div>
        </dl>

        <ul className="divide-y divide-stone-200 border-y border-stone-200 dark:divide-white/10 dark:border-white/10">
          {order.items.map((c) => (
            <li key={c.uid} className="flex items-start justify-between gap-4 py-3 text-sm">
              <span className="text-stone-700 dark:text-zinc-200">
                <span className="font-bold tabular-nums">{c.qty}×</span> {c.name}
                <span className="block text-xs text-stone-400">{c.base}{c.extras.length ? ` · ${c.extras.join(", ")}` : ""}</span>
                {c.note && <span className="block text-xs italic text-stone-400">“{c.note}”</span>}
              </span>
              <Price n={(c.basePrice + c.extraPrice) * c.qty} className="shrink-0 font-bold text-stone-900 dark:text-white" />
            </li>
          ))}
        </ul>

        <div className="flex justify-between py-4 text-base font-extrabold text-stone-900 dark:text-white">
          <span>Total</span><span className="tabular-nums text-orange-600">{etb(order.total)}</span>
        </div>

        {order.proofImage && (
          <div className="mb-4 rounded-2xl border border-stone-200 bg-stone-50 p-3 dark:border-white/10 dark:bg-zinc-800/50">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[11px] font-bold uppercase tracking-widest text-stone-400">Payment screenshot</p>
              <button
                type="button"
                onClick={() => setShowFullProof(true)}
                className="flex items-center gap-1 text-xs font-bold text-orange-600 hover:underline"
              >
                <Eye size={13} weight="bold" /> View full size
              </button>
            </div>
            <div
              onClick={() => setShowFullProof(true)}
              className="group relative cursor-pointer overflow-hidden rounded-xl border border-stone-200 dark:border-white/10"
            >
              <ProofImagePreview src={order.proofImage} alt={`Payment proof for ${order.code}`} className="max-h-52 w-full object-contain transition group-hover:scale-102" />
              <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 transition group-hover:opacity-100">
                <span className="rounded-full bg-white/90 px-3 py-1 text-xs font-bold text-stone-900 shadow">Click to inspect</span>
              </div>
            </div>
            {order.proofNote && <p className="mt-2 text-xs font-semibold text-stone-600 dark:text-zinc-300">Transaction Reference: {order.proofNote}</p>}
          </div>
        )}

        <div className="mt-auto space-y-4 border-t border-stone-200 pt-5 dark:border-white/10">
          {/* Payment Verification Guard & Decision Box */}
          {!isPaymentVerified && (
            <div className="space-y-3 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4">
              <div className="flex items-center gap-2 text-xs font-bold text-amber-800 dark:text-amber-200">
                <ShieldCheck size={16} weight="bold" />
                <span>Payment Verification Required</span>
              </div>
              <p className="text-xs leading-relaxed text-amber-800/80 dark:text-amber-300/80">
                Critical safety check: This order cannot be accepted or advanced until payment proof is verified by staff.
              </p>

              {order.proofStatus === "pending" && (
                <div className="space-y-2 pt-1">
                  <input
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Reason if rejecting proof (e.g. Amount mismatch)"
                    className="w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2 text-xs outline-none focus:border-orange-500 dark:border-white/15 dark:bg-zinc-800 dark:text-zinc-100"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      disabled={isSubmitting}
                      onClick={async () => {
                        setIsSubmitting(true);
                        try {
                          await rejectProof(order.code, reason || "Payment screenshot unclear");
                        } finally {
                          setIsSubmitting(false);
                        }
                      }}
                      className="rounded-full border border-red-500/40 px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-500/10 disabled:opacity-50"
                    >
                      Reject payment
                    </button>
                    <button
                      type="button"
                      disabled={isSubmitting}
                      onClick={async () => {
                        setIsSubmitting(true);
                        try {
                          await approveProof(order.code);
                        } finally {
                          setIsSubmitting(false);
                        }
                      }}
                      className="rounded-full bg-emerald-600 px-3 py-2 text-xs font-bold text-white shadow hover:bg-emerald-500 disabled:opacity-50"
                    >
                      Approve payment
                    </button>
                  </div>
                </div>
              )}

              {order.proofStatus === "rejected" && (
                <p className="text-xs font-semibold text-red-600 dark:text-red-400">
                  Proof rejected: “{order.staffNote}”. Awaiting corrected submission from customer.
                </p>
              )}

              {order.proofStatus === "none" && (
                <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">
                  Customer has not attached a payment screenshot yet.
                </p>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            {next && order.status !== "cancelled" && isPaymentVerified && (
              <button
                type="button"
                disabled={isSubmitting}
                onClick={async () => {
                  setIsSubmitting(true);
                  try {
                    await advance(order.code);
                  } finally {
                    setIsSubmitting(false);
                  }
                }}
                className="col-span-2 rounded-full bg-orange-600 px-4 py-3 text-sm font-bold text-white hover:bg-orange-500 disabled:opacity-50 shadow-sm"
              >
                {next === "accepted"
                  ? "Accept order"
                  : next === "preparing"
                  ? "Start preparing"
                  : next === "ready"
                  ? "Mark ready"
                  : next === "dispatched"
                  ? "Out for delivery"
                  : next === "completed"
                  ? "Complete order"
                  : `Advance → ${t(`status.${next}`)}`}
              </button>
            )}
            {order.status !== "cancelled" && order.status !== "completed" && (
              <button
                type="button"
                disabled={isSubmitting}
                onClick={async () => {
                  setIsSubmitting(true);
                  try {
                    await setStatus(order.code, "cancelled");
                    onClose();
                  } finally {
                    setIsSubmitting(false);
                  }
                }}
                className="col-span-2 rounded-full border border-stone-300 px-4 py-2.5 text-sm font-bold text-stone-600 hover:bg-stone-100 dark:border-white/15 dark:text-zinc-300 dark:hover:bg-white/5 disabled:opacity-50"
              >
                Cancel order
              </button>
            )}
          </div>
          {order.staffNote && isPaymentVerified && (
            <p className="rounded-xl bg-emerald-500/10 p-3 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
              {order.staffNote}
            </p>
          )}
        </div>

        {showFullProof && order.proofImage && (
          <ImageLightboxModal
            src={order.proofImage}
            alt={`Payment screenshot for order ${order.code}`}
            onClose={() => setShowFullProof(false)}
          />
        )}
      </motion.aside>
    </div>
  );
}

/* ---------------------------------------------------------------- delivery */
export function AdminDeliveryManager() {
  const { deliverySettings, saveDeliverySettings } = useGursha();
  const [enabled, setEnabled] = useState(deliverySettings?.enabled ?? true);
  const [destinations, setDestinations] = useState<DeliveryDestination[]>(
    deliverySettings?.destinations || DEFAULT_DELIVERY_SETTINGS.destinations
  );
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editKm, setEditKm] = useState<number>(2);

  const [newName, setNewName] = useState("");
  const [newKm, setNewKm] = useState<number>(3);
  const [showAddForm, setShowAddForm] = useState(false);

  useEffect(() => {
    if (deliverySettings) {
      setEnabled(deliverySettings.enabled);
      setDestinations(deliverySettings.destinations || DEFAULT_DELIVERY_SETTINGS.destinations);
    }
  }, [deliverySettings]);

  const hasChanges = useMemo(() => {
    if (!deliverySettings) return false;
    if (enabled !== deliverySettings.enabled) return true;
    if (destinations.length !== (deliverySettings.destinations || []).length) return true;
    return JSON.stringify(destinations) !== JSON.stringify(deliverySettings.destinations);
  }, [enabled, destinations, deliverySettings]);

  const handleToggleDestination = (id: string) => {
    setDestinations((prev) =>
      prev.map((d) => (d.id === id ? { ...d, enabled: !d.enabled } : d))
    );
  };

  const startEdit = (d: DeliveryDestination) => {
    setEditingId(d.id);
    setEditName(d.name);
    setEditKm(d.distanceKm);
  };

  const saveEdit = (id: string) => {
    if (!editName.trim()) {
      toast.error("Destination name cannot be empty");
      return;
    }
    setDestinations((prev) =>
      prev.map((d) =>
        d.id === id ? { ...d, name: editName.trim(), distanceKm: Math.max(0.5, Number(editKm) || 1) } : d
      )
    );
    setEditingId(null);
    toast.success("Destination updated. Click 'Save Changes' to persist.");
  };

  const handleRemove = (id: string, name: string) => {
    if (destinations.length <= 1) {
      toast.error("At least one destination should remain in configuration.");
      return;
    }
    setDestinations((prev) => prev.filter((d) => d.id !== id));
    toast.info(`Removed "${name}" from available destinations list.`);
  };

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) {
      toast.error("Enter a destination name");
      return;
    }
    const clean = newName.trim();
    const id = clean.toLowerCase().replace(/[^a-z0-9]+/g, "-") || `dest-${Date.now()}`;
    if (destinations.some((d) => d.name.toLowerCase() === clean.toLowerCase() || d.id === id)) {
      toast.error("A destination with this name already exists");
      return;
    }

    const newDest: DeliveryDestination = {
      id,
      name: clean,
      distanceKm: Math.max(0.5, Number(newKm) || 1),
      enabled: true,
    };

    setDestinations((prev) => [...prev, newDest]);
    setNewName("");
    setNewKm(3);
    setShowAddForm(false);
    toast.success(`Added "${clean}". Click 'Save Changes' to persist to database.`);
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      await saveDeliverySettings({
        enabled,
        destinations,
      });
    } catch (err: any) {
      console.error("Save delivery settings error:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleResetDefaults = () => {
    setEnabled(true);
    setDestinations(DEFAULT_DELIVERY_SETTINGS.destinations);
    toast.info("Reset to default configuration (Main Campus & Techno Campus). Click 'Save Changes' to persist.");
  };

  const enabledCount = destinations.filter((d) => d.enabled).length;

  return (
    <div className="space-y-6">
      {/* 1. Master Delivery Controls */}
      <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-zinc-900">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <span className="grid h-10 w-10 place-items-center rounded-2xl bg-orange-600/10 text-orange-600 dark:bg-orange-500/15 dark:text-orange-300">
                <Bicycle size={22} weight="bold" />
              </span>
              <div>
                <h2 className="font-display text-lg font-bold text-stone-900 dark:text-white">Delivery Service Status</h2>
                <p className="text-xs text-stone-500 dark:text-zinc-400">Master switch controlling delivery orders across the storefront</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-extrabold ${
                enabled
                  ? "bg-emerald-500/15 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300"
                  : "bg-red-500/15 text-red-700 dark:bg-red-500/20 dark:text-red-300"
              }`}
            >
              <span className={`h-2 w-2 rounded-full ${enabled ? "bg-emerald-600" : "bg-red-600"}`} />
              {enabled ? "DELIVERY ACTIVE" : "DELIVERY DISABLED"}
            </span>

            <button
              type="button"
              onClick={() => setEnabled((v) => !v)}
              className={`rounded-full px-5 py-2.5 text-xs font-bold transition ${
                enabled
                  ? "border border-red-500/30 bg-red-500/10 text-red-700 hover:bg-red-500/20 dark:text-red-300"
                  : "bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm"
              }`}
            >
              {enabled ? "Turn Off Delivery" : "Turn On Delivery"}
            </button>
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-stone-200/80 bg-stone-50 p-4 text-xs leading-relaxed text-stone-600 dark:border-white/5 dark:bg-white/[0.02] dark:text-zinc-300">
          {enabled ? (
            <p>
              <strong>Status:</strong> Delivery is currently <span className="text-emerald-600 font-bold">Enabled</span>. Customers can choose Delivery at checkout and pick from currently enabled destinations ({enabledCount} active). Dine-in and Takeaway remain active.
            </p>
          ) : (
            <p>
              <strong>Status:</strong> Delivery is currently <span className="text-red-600 font-bold">Disabled</span>. Customers cannot place new delivery orders, and the Delivery option is hidden or disabled in checkout with a helpful message. Dine-in and Takeaway continue working normally, and all existing delivery orders remain intact in your order history.
            </p>
          )}
        </div>
      </section>

      {/* 2. Destination Management */}
      <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-zinc-900">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-bold text-stone-900 dark:text-white">Delivery Destinations</h2>
            <p className="mt-0.5 text-xs text-stone-500 dark:text-zinc-400">
              Manage allowed drop-off campuses and locations. Orders require selecting an enabled destination.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowAddForm((v) => !v)}
            className="flex items-center gap-1.5 rounded-full bg-orange-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-orange-500 shadow-sm"
          >
            {showAddForm ? <X size={15} weight="bold" /> : <Plus size={15} weight="bold" />}
            {showAddForm ? "Cancel" : "Add Destination"}
          </button>
        </div>

        {/* Add Destination Form */}
        {showAddForm && (
          <form onSubmit={handleAdd} className="mb-5 rounded-2xl border border-orange-500/30 bg-orange-500/5 p-4 space-y-3 dark:border-orange-500/20">
            <p className="text-xs font-bold uppercase tracking-wider text-orange-700 dark:text-orange-300">New Delivery Destination</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block mb-1 text-[11px] font-bold uppercase tracking-wider text-stone-500 dark:text-zinc-400">Destination Name</label>
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Agriculture Campus"
                  className="w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2 text-sm text-stone-900 outline-none focus:border-orange-500 dark:border-white/15 dark:bg-zinc-950 dark:text-zinc-100"
                />
              </div>
              <div>
                <label className="block mb-1 text-[11px] font-bold uppercase tracking-wider text-stone-500 dark:text-zinc-400">Distance (km)</label>
                <input
                  type="number"
                  step="0.5"
                  min="0.5"
                  max="50"
                  value={newKm}
                  onChange={(e) => setNewKm(Number(e.target.value))}
                  className="w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2 text-sm text-stone-900 outline-none focus:border-orange-500 dark:border-white/15 dark:bg-zinc-950 dark:text-zinc-100"
                />
              </div>
            </div>
            <div className="flex items-center justify-between pt-1">
              <span className="text-xs text-stone-500 dark:text-zinc-400">
                Calculated rider fee: <strong>{etb(zoneFee(Number(newKm) || 1))}</strong>
              </span>
              <button
                type="submit"
                className="rounded-full bg-orange-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-orange-500"
              >
                Add Destination
              </button>
            </div>
          </form>
        )}

        {/* Destinations Table / Cards */}
        <div className="divide-y divide-stone-200 rounded-2xl border border-stone-200 overflow-hidden dark:divide-white/10 dark:border-white/10">
          {destinations.map((d) => {
            const isEditing = editingId === d.id;
            return (
              <div key={d.id} className="p-4 transition hover:bg-stone-50/70 dark:hover:bg-white/[0.02]">
                {isEditing ? (
                  <div className="space-y-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        placeholder="Destination name"
                        className="rounded-xl border border-stone-300 bg-white px-3.5 py-2 text-sm outline-none focus:border-orange-500 dark:border-white/15 dark:bg-zinc-950 dark:text-zinc-100"
                      />
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          step="0.5"
                          min="0.5"
                          value={editKm}
                          onChange={(e) => setEditKm(Number(e.target.value))}
                          placeholder="Distance (km)"
                          className="w-28 rounded-xl border border-stone-300 bg-white px-3.5 py-2 text-sm outline-none focus:border-orange-500 dark:border-white/15 dark:bg-zinc-950 dark:text-zinc-100"
                        />
                        <span className="text-xs text-stone-400">km · Fee: {etb(zoneFee(editKm))}</span>
                      </div>
                    </div>
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="rounded-full border border-stone-300 px-3.5 py-1.5 text-xs font-bold text-stone-600 hover:bg-stone-100 dark:border-white/15 dark:text-zinc-300"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => saveEdit(d.id)}
                        className="rounded-full bg-orange-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-orange-500"
                      >
                        Apply Edit
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-3">
                      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl text-xs font-bold ${
                        d.enabled
                          ? "bg-emerald-500/15 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300"
                          : "bg-stone-200 text-stone-500 dark:bg-white/10 dark:text-zinc-400"
                      }`}>
                        <MapPin size={18} weight="bold" />
                      </span>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-display text-sm font-extrabold text-stone-900 dark:text-white">{d.name}</p>
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            d.enabled
                              ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                              : "bg-stone-200 text-stone-500 dark:bg-white/10 dark:text-zinc-400"
                          }`}>
                            {d.enabled ? "Active" : "Disabled"}
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs text-stone-400 dark:text-zinc-500">
                          {d.distanceKm} km from café · Standard rider fee: {etb(zoneFee(d.distanceKm))}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-auto">
                      <button
                        type="button"
                        onClick={() => handleToggleDestination(d.id)}
                        className={`rounded-full px-3.5 py-1.5 text-xs font-bold transition ${
                          d.enabled
                            ? "border border-amber-500/40 bg-amber-500/10 text-amber-700 hover:bg-amber-500/20 dark:text-amber-300"
                            : "bg-emerald-600 text-white hover:bg-emerald-500"
                        }`}
                      >
                        {d.enabled ? "Disable" : "Enable"}
                      </button>

                      <button
                        type="button"
                        onClick={() => startEdit(d)}
                        className="rounded-full border border-stone-300 p-2 text-stone-600 transition hover:border-orange-500 hover:text-orange-600 dark:border-white/15 dark:text-zinc-300"
                        title="Edit destination"
                      >
                        <PencilSimple size={14} weight="bold" />
                      </button>

                      <button
                        type="button"
                        onClick={() => handleRemove(d.id, d.name)}
                        className="rounded-full border border-stone-300 p-2 text-stone-400 transition hover:border-red-500 hover:text-red-600 dark:border-white/15"
                        title="Remove destination"
                      >
                        <Trash size={14} weight="bold" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* 3. Action / Persistence Footer */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-zinc-900">
        <div className="flex items-center gap-2 text-xs">
          {hasChanges ? (
            <span className="flex items-center gap-1.5 font-bold text-amber-600 dark:text-amber-400">
              <WarningCircle size={16} weight="bold" />
              You have unsaved changes. Click save to persist to database.
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-stone-500 dark:text-zinc-400">
              <Check size={16} weight="bold" className="text-emerald-600" />
              Settings saved persistently in database.
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleResetDefaults}
            className="flex items-center gap-1.5 rounded-full border border-stone-300 px-4 py-2 text-xs font-bold text-stone-600 hover:bg-stone-100 dark:border-white/15 dark:text-zinc-300 dark:hover:bg-white/5"
          >
            <ArrowCounterClockwise size={14} weight="bold" />
            Reset to Defaults
          </button>

          <button
            type="button"
            disabled={saving || !hasChanges}
            onClick={handleSave}
            className="flex items-center gap-2 rounded-full bg-orange-600 px-6 py-2.5 text-xs font-bold text-white transition hover:bg-orange-500 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
          >
            {saving ? (
              <>
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                <span>Saving to database...</span>
              </>
            ) : (
              <>
                <FloppyDisk size={16} weight="bold" />
                <span>Save Changes</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export function AdminOrders() {
  const { orders, advance, setStatus, deliverySettings } = useGursha();
  const [viewMode, setViewMode] = useState<"orders" | "delivery">("orders");
  const [status, setFilter] = useState<"all" | OrderStatus>("all");
  const [service, setService] = useState<"all" | ServiceType>("all");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  const filtered = orders.filter((o) => {
    const term = q.trim().toLowerCase();
    return (status === "all" || o.status === status) &&
      (service === "all" || o.service === service) &&
      (!term || `${o.code} ${o.customerName} ${o.phone} ${o.items.map((i) => i.name).join(" ")}`.toLowerCase().includes(term));
  });
  const active = orders.find((o) => o.code === open) ?? null;

  return (
    <div className="space-y-5">
      <header className="rounded-3xl border border-stone-200 bg-white p-6 dark:border-white/10 dark:bg-zinc-900">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="font-display text-2xl font-extrabold text-stone-900 dark:text-white">Order board</h1>
            <p className="mt-1 text-sm text-stone-500 dark:text-zinc-400">
              Kitchen workflow, order tickets, and delivery service configuration.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setViewMode("orders")}
              className={`rounded-full px-4 py-2 text-xs font-bold transition ${
                viewMode === "orders"
                  ? "bg-orange-600 text-white shadow-sm"
                  : "border border-stone-300 text-stone-700 hover:bg-stone-50 dark:border-white/15 dark:text-zinc-200 dark:hover:bg-white/5"
              }`}
            >
              Orders ({orders.length})
            </button>
            <button
              type="button"
              onClick={() => setViewMode("delivery")}
              className={`flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold transition ${
                viewMode === "delivery"
                  ? "bg-orange-600 text-white shadow-sm"
                  : "border border-stone-300 text-stone-700 hover:bg-stone-50 dark:border-white/15 dark:text-zinc-200 dark:hover:bg-white/5"
              }`}
            >
              <Bicycle size={15} weight="bold" />
              <span>Delivery Settings</span>
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-black ${
                deliverySettings?.enabled
                  ? "bg-emerald-500/20 text-emerald-800 dark:text-emerald-200"
                  : "bg-red-500/20 text-red-800 dark:text-red-200"
              }`}>
                {deliverySettings?.enabled ? "ON" : "OFF"}
              </span>
            </button>
          </div>
        </div>

        {viewMode === "orders" && (
          <>
            <div className="mt-5 flex flex-col gap-3 lg:flex-row">
              <label className="flex flex-1 items-center gap-2.5 rounded-full border border-stone-300 px-4 py-2.5 dark:border-white/15">
                <MagnifyingGlass size={17} className="text-stone-400" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search code, guest, phone or dish"
                  className="w-full bg-transparent text-sm outline-none placeholder:text-stone-400 dark:text-zinc-100" />
              </label>
              <select value={service} onChange={(e) => setService(e.target.value as "all" | ServiceType)}
                className="rounded-full border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 outline-none dark:border-white/15 dark:bg-zinc-950 dark:text-zinc-200">
                <option value="all">All services</option>
                <option value="dine-in">Dine-in</option>
                <option value="takeaway">Takeaway</option>
                <option value="delivery">Delivery</option>
              </select>
            </div>
            <div className="gursha-scroll mt-4 flex gap-2 overflow-x-auto pb-1">
              <button type="button" onClick={() => setFilter("all")}
                className={`shrink-0 rounded-full px-4 py-2 text-xs font-bold ${status === "all" ? "bg-stone-900 text-white dark:bg-white dark:text-stone-900" : "border border-stone-300 text-stone-600 dark:border-white/15 dark:text-zinc-300"}`}>
                All <span className="tabular-nums opacity-60">{orders.length}</span>
              </button>
              {STATUS_ORDER.map((s) => {
                const count = orders.filter((o) => o.status === s).length;
                return (
                  <button key={s} type="button" onClick={() => setFilter(s as OrderStatus)}
                    className={`shrink-0 rounded-full px-4 py-2 text-xs font-bold capitalize ${status === s ? "bg-orange-600 text-white" : "border border-stone-300 text-stone-600 dark:border-white/15 dark:text-zinc-300"}`}>
                    {s.replace("_", " ")} <span className="tabular-nums opacity-60">{count}</span>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </header>

      {viewMode === "delivery" ? (
        <AdminDeliveryManager />
      ) : (
        <>
          {filtered.length === 0 ? (
            <div className="grid place-items-center rounded-3xl border border-dashed border-stone-300 py-20 text-center dark:border-white/15">
              <Receipt size={30} className="text-stone-300" />
              <p className="mt-3 text-sm font-semibold text-stone-500 dark:text-zinc-400">No orders match these filters.</p>
            </div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
              {filtered.map((o) => (
                <article key={o.code} className="flex flex-col rounded-2xl border border-stone-200 bg-white p-4 dark:border-white/10 dark:bg-zinc-900">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <button type="button" onClick={() => setOpen(o.code)} className="font-display text-base font-extrabold text-stone-900 hover:text-orange-600 dark:text-white">{o.code}</button>
                      <p className="text-xs text-stone-400">{fmt(o.createdAt)} · {SERVICE_LABEL[o.service]}</p>
                    </div>
                    <StatusChip status={o.status} />
                  </div>
                  <p className="mt-3 text-sm font-semibold text-stone-700 dark:text-zinc-200">{o.customerName}</p>
                  <p className="text-xs text-stone-400">{o.phone}{o.zone ? ` · ${o.zone}` : ""}</p>
                  <ul className="mt-3 space-y-1 text-xs text-stone-500 dark:text-zinc-400">
                    {o.items.slice(0, 3).map((i) => <li key={i.uid} className="tabular-nums">{i.qty}× {i.name}</li>)}
                    {o.items.length > 3 && <li>+{o.items.length - 3} more</li>}
                  </ul>
                  <div className="mt-4 flex items-center justify-between border-t border-stone-200 pt-3 dark:border-white/10">
                    <span className="font-extrabold tabular-nums text-orange-600">{etb(o.total)}</span>
                    <span className="text-xs font-bold text-stone-400">{PAY_LABEL[o.payment]} · {o.proofStatus}</span>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button type="button" onClick={() => setOpen(o.code)} className="flex-1 rounded-full border border-stone-300 px-3 py-2 text-xs font-bold text-stone-600 dark:border-white/15 dark:text-zinc-300">Details</button>
                    {o.status !== "completed" && o.status !== "cancelled" ? (
                      o.payment !== "cash" && o.proofStatus !== "approved" ? (
                        <button
                          type="button"
                          onClick={() => setOpen(o.code)}
                          className="flex flex-1 items-center justify-center gap-1 rounded-full bg-amber-500 px-3 py-2 text-xs font-bold text-stone-900 shadow-sm hover:bg-amber-400"
                        >
                          <ShieldCheck size={13} weight="bold" /> Verify payment
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => advance(o.code)}
                          className="flex flex-1 items-center justify-center gap-1 rounded-full bg-orange-600 px-3 py-2 text-xs font-bold text-white hover:bg-orange-500"
                        >
                          <Check size={13} weight="bold" /> {o.status === "placed" || o.status === "payment_pending" ? "Accept order" : "Advance"}
                        </button>
                      )
                    ) : (
                      <span className="flex-1 text-center py-2 text-xs font-bold text-stone-400 uppercase tracking-wider">
                        {o.status === "completed" ? "Completed" : "Cancelled"}
                      </span>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </>
      )}

      {active && <OrderDrawer order={active} onClose={() => setOpen(null)} />}
    </div>
  );
}

/* ------------------------------------------------------------------ payments */
export function AdminPayments() {
  const { orders, approveProof, rejectProof, setStatus } = useGursha();
  const [reason, setReason] = useState<Record<string, string>>({});
  const [filterTab, setFilterTab] = useState<"pending" | "approved" | "rejected" | "all">("pending");
  const [lightbox, setLightbox] = useState<{ src: string; alt: string } | null>(null);
  const [busyCodes, setBusyCodes] = useState<Record<string, boolean>>({});

  const electronicOrders = orders.filter((o) => o.payment !== "cash");
  const pendingList = electronicOrders.filter((o) => o.proofStatus === "pending");
  const approvedList = electronicOrders.filter((o) => o.proofStatus === "approved");
  const rejectedList = electronicOrders.filter((o) => o.proofStatus === "rejected");

  const displayList =
    filterTab === "pending"
      ? pendingList
      : filterTab === "approved"
      ? approvedList
      : filterTab === "rejected"
      ? rejectedList
      : electronicOrders;

  const REJECT_PRESETS = [
    "Amount mismatch",
    "Unclear / blurry receipt",
    "Wrong recipient account",
    "Duplicate screenshot",
  ];

  return (
    <div className="space-y-5">
      <header className="rounded-3xl border border-stone-200 bg-white p-6 dark:border-white/10 dark:bg-zinc-900">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-extrabold text-stone-900 dark:text-white">Payment verification</h1>
            <p className="mt-1 text-sm text-stone-500 dark:text-zinc-400">
              Match customer screenshot and transaction reference against the order total before approving.
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-2xl bg-amber-500/10 px-3.5 py-2 text-xs font-bold text-amber-700 dark:text-amber-300">
            <ShieldCheck size={16} weight="bold" />
            <span>Orders remain blocked from kitchen until approved</span>
          </div>
        </div>

        {/* Status Filter Tabs */}
        <div className="mt-6 flex flex-wrap gap-2 border-t border-stone-200 pt-4 dark:border-white/10">
          <button
            type="button"
            onClick={() => setFilterTab("pending")}
            className={`flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold transition ${
              filterTab === "pending"
                ? "bg-amber-500 text-stone-950 shadow-sm"
                : "border border-stone-300 text-stone-600 hover:bg-stone-100 dark:border-white/15 dark:text-zinc-300 dark:hover:bg-white/5"
            }`}
          >
            <Clock size={14} weight="bold" />
            Needs Verification
            <span className="rounded-full bg-stone-900/20 px-2 py-0.5 text-[10px] font-extrabold tabular-nums">
              {pendingList.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setFilterTab("rejected")}
            className={`flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold transition ${
              filterTab === "rejected"
                ? "bg-red-600 text-white shadow-sm"
                : "border border-stone-300 text-stone-600 hover:bg-stone-100 dark:border-white/15 dark:text-zinc-300 dark:hover:bg-white/5"
            }`}
          >
            <XCircle size={14} weight="bold" />
            Rejected
            <span className="rounded-full bg-stone-900/20 px-2 py-0.5 text-[10px] font-extrabold tabular-nums">
              {rejectedList.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setFilterTab("approved")}
            className={`flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold transition ${
              filterTab === "approved"
                ? "bg-emerald-600 text-white shadow-sm"
                : "border border-stone-300 text-stone-600 hover:bg-stone-100 dark:border-white/15 dark:text-zinc-300 dark:hover:bg-white/5"
            }`}
          >
            <Check size={14} weight="bold" />
            Approved
            <span className="rounded-full bg-stone-900/20 px-2 py-0.5 text-[10px] font-extrabold tabular-nums">
              {approvedList.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setFilterTab("all")}
            className={`flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold transition ${
              filterTab === "all"
                ? "bg-stone-900 text-white dark:bg-white dark:text-stone-900"
                : "border border-stone-300 text-stone-600 hover:bg-stone-100 dark:border-white/15 dark:text-zinc-300 dark:hover:bg-white/5"
            }`}
          >
            All Electronic Orders
            <span className="opacity-60 tabular-nums">({electronicOrders.length})</span>
          </button>
        </div>
      </header>

      {displayList.length === 0 ? (
        <div className="grid place-items-center rounded-3xl border border-dashed border-stone-300 py-20 text-center dark:border-white/15">
          <ShieldCheck size={32} className="text-emerald-500" />
          <p className="mt-3 text-sm font-semibold text-stone-600 dark:text-zinc-300">
            {filterTab === "pending"
              ? "All payments verified. No submissions currently awaiting review."
              : `No orders in the ${filterTab} category.`}
          </p>
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          {displayList.map((o) => (
            <article
              key={o.code}
              className={`flex flex-col rounded-2xl border bg-white p-5 shadow-sm dark:bg-zinc-900 ${
                o.proofStatus === "pending"
                  ? "border-amber-500/50"
                  : o.proofStatus === "rejected"
                  ? "border-red-500/40"
                  : "border-stone-200 dark:border-white/10"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-display text-lg font-extrabold text-stone-900 dark:text-white">
                      {o.code}
                    </span>
                    <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-bold uppercase text-stone-600 dark:bg-white/10 dark:text-zinc-300">
                      {SERVICE_LABEL[o.service]}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-stone-400">
                    {fmt(o.createdAt)} · {o.customerName} ({o.phone})
                  </p>
                </div>

                <span
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${
                    o.proofStatus === "approved"
                      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                      : o.proofStatus === "rejected"
                      ? "bg-red-500/15 text-red-700 dark:text-red-300"
                      : "bg-amber-500/20 text-amber-800 dark:text-amber-200"
                  }`}
                >
                  {o.proofStatus === "approved" && <Check size={13} weight="bold" />}
                  {o.proofStatus === "rejected" && <XCircle size={13} weight="bold" />}
                  {o.proofStatus === "pending" && <Clock size={13} weight="bold" />}
                  {o.proofStatus === "none" ? "Missing proof" : o.proofStatus}
                </span>
              </div>

              {/* Financial comparison banner */}
              <div className="mt-4 grid grid-cols-2 gap-3 rounded-xl border border-stone-200 bg-stone-50 p-3 text-xs dark:border-white/10 dark:bg-zinc-800/40">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400">Expected Total</span>
                  <p className="mt-0.5 text-base font-extrabold tabular-nums text-orange-600">{etb(o.total)}</p>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400">Payment Gateway</span>
                  <p className="mt-0.5 text-sm font-bold text-stone-800 dark:text-zinc-200">{PAY_LABEL[o.payment]}</p>
                </div>
              </div>

              {/* Receipt screenshot inspection */}
              {o.proofImage ? (
                <div className="mt-4">
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-stone-400">
                      Customer Payment Proof
                    </span>
                    <button
                      type="button"
                      onClick={() => setLightbox({ src: o.proofImage!, alt: `Payment proof for ${o.code}` })}
                      className="flex items-center gap-1 text-xs font-bold text-orange-600 hover:underline"
                    >
                      <Eye size={13} weight="bold" /> View full size
                    </button>
                  </div>
                  <div
                    onClick={() => setLightbox({ src: o.proofImage!, alt: `Payment proof for ${o.code}` })}
                    className="group relative cursor-pointer overflow-hidden rounded-xl border border-stone-200 bg-stone-100 dark:border-white/10 dark:bg-zinc-800"
                  >
                    <ProofImagePreview
                      src={o.proofImage}
                      alt={`Proof for ${o.code}`}
                      className="max-h-56 w-full object-contain transition duration-200 group-hover:scale-102"
                    />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/35 opacity-0 transition group-hover:opacity-100">
                      <span className="flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-1.5 text-xs font-bold text-stone-900 shadow">
                        <Eye size={14} weight="bold" /> Click to open lightbox
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mt-4 flex items-center gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs font-semibold text-amber-800 dark:text-amber-200">
                  <WarningCircle size={18} weight="bold" className="shrink-0 text-amber-600" />
                  <span>Customer selected electronic payment but did not attach a screenshot. Cannot approve without proof.</span>
                </div>
              )}

              {o.proofNote && (
                <p className="mt-2 text-xs font-medium text-stone-600 dark:text-zinc-300">
                  <span className="font-bold text-stone-500">Transaction Reference:</span> {o.proofNote}
                </p>
              )}

              {o.staffNote && (
                <p className="mt-2 text-xs italic text-stone-500 dark:text-zinc-400">
                  <span className="font-bold">Staff Audit Note:</span> {o.staffNote}
                </p>
              )}

              {/* Action and verification controls */}
              <div className="mt-auto pt-4">
                {o.proofStatus === "pending" ? (
                  <div className="space-y-2.5 rounded-xl border border-stone-200 bg-stone-50/70 p-3 dark:border-white/10 dark:bg-zinc-800/30">
                    <div className="flex flex-wrap gap-1.5">
                      <span className="w-full text-[10px] font-bold uppercase tracking-wider text-stone-400">
                        Quick rejection reasons:
                      </span>
                      {REJECT_PRESETS.map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setReason((r) => ({ ...r, [o.code]: preset }))}
                          className="rounded-full border border-stone-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-stone-600 transition hover:border-orange-500 hover:text-orange-600 dark:border-white/15 dark:bg-zinc-800 dark:text-zinc-300"
                        >
                          {preset}
                        </button>
                      ))}
                    </div>

                    <input
                      value={reason[o.code] ?? ""}
                      onChange={(e) => setReason((r) => ({ ...r, [o.code]: e.target.value }))}
                      placeholder="Reason if rejecting (e.g. Incomplete transfer amount)"
                      className="w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2 text-xs outline-none focus:border-orange-500 dark:border-white/15 dark:bg-zinc-900 dark:text-zinc-100"
                    />

                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <button
                        type="button"
                        disabled={busyCodes[o.code]}
                        onClick={async () => {
                          setBusyCodes((b) => ({ ...b, [o.code]: true }));
                          try {
                            await rejectProof(o.code, reason[o.code] || "Payment screenshot unclear");
                          } finally {
                            setBusyCodes((b) => ({ ...b, [o.code]: false }));
                          }
                        }}
                        className="rounded-full border border-red-500/40 px-4 py-2.5 text-xs font-bold text-red-600 transition hover:bg-red-500/10 disabled:opacity-50"
                      >
                        Reject payment
                      </button>
                      <button
                        type="button"
                        disabled={!o.proofImage || busyCodes[o.code]}
                        onClick={async () => {
                          setBusyCodes((b) => ({ ...b, [o.code]: true }));
                          try {
                            await approveProof(o.code);
                          } finally {
                            setBusyCodes((b) => ({ ...b, [o.code]: false }));
                          }
                        }}
                        className="flex items-center justify-center gap-1.5 rounded-full bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
                        title={!o.proofImage ? "Cannot approve without an uploaded receipt" : "Approve customer payment proof"}
                      >
                        <Check size={14} weight="bold" /> Approve payment
                      </button>
                    </div>
                  </div>
                ) : o.proofStatus === "approved" && (o.status === "placed" || o.status === "payment_pending") ? (
                  <div className="space-y-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1.5 font-bold text-emerald-800 dark:text-emerald-300">
                        <CheckCircle size={15} weight="bold" /> Payment approved · Ready for kitchen
                      </span>
                      <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-extrabold uppercase text-emerald-700 dark:text-emerald-200">
                        {o.status}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <button
                        type="button"
                        disabled={busyCodes[o.code]}
                        onClick={async () => {
                          setBusyCodes((b) => ({ ...b, [o.code]: true }));
                          try {
                            await setStatus(o.code, "accepted");
                          } finally {
                            setBusyCodes((b) => ({ ...b, [o.code]: false }));
                          }
                        }}
                        className="flex items-center justify-center gap-1.5 rounded-full bg-orange-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-orange-500 disabled:opacity-50"
                      >
                        <Check size={14} weight="bold" /> Accept order
                      </button>
                      <button
                        type="button"
                        disabled={busyCodes[o.code]}
                        onClick={async () => {
                          setBusyCodes((b) => ({ ...b, [o.code]: true }));
                          try {
                            await setStatus(o.code, "cancelled");
                          } finally {
                            setBusyCodes((b) => ({ ...b, [o.code]: false }));
                          }
                        }}
                        className="rounded-full border border-stone-300 px-4 py-2 text-xs font-bold text-stone-600 hover:bg-stone-100 dark:border-white/15 dark:text-zinc-300 dark:hover:bg-white/5 disabled:opacity-50"
                      >
                        Cancel order
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between border-t border-stone-200 pt-3 text-xs dark:border-white/10">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-stone-500 dark:text-zinc-400">
                        Status: <strong className="text-stone-800 dark:text-zinc-200 capitalize">{o.status === "dispatched" ? "Out for delivery" : o.status}</strong>
                      </span>
                      {o.proofStatus === "approved" && (
                        <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                          <Check size={12} weight="bold" /> Paid
                        </span>
                      )}
                    </div>
                    {o.status !== "cancelled" && o.status !== "completed" && (
                      <button
                        type="button"
                        disabled={busyCodes[o.code]}
                        onClick={async () => {
                          setBusyCodes((b) => ({ ...b, [o.code]: true }));
                          try {
                            await setStatus(o.code, "cancelled");
                          } finally {
                            setBusyCodes((b) => ({ ...b, [o.code]: false }));
                          }
                        }}
                        className="text-xs font-bold text-red-600 hover:underline disabled:opacity-50"
                      >
                        Cancel order
                      </button>
                    )}
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      {/* Fullscreen Lightbox Modal */}
      {/* Fullscreen Lightbox Modal */}
      {lightbox && (
        <ImageLightboxModal
          src={lightbox.src}
          alt={lightbox.alt}
          onClose={() => setLightbox(null)}
        />
      )}
    </div>
  );
}

/* ----------------------------------------------------------------- admin profile */
export function AdminProfile() {
  const { cms, saveCms, refreshCms, session, adminAuthed, changeAdminPassword } = useGursha();
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastFetchedAt, setLastFetchedAt] = useState<Date | null>(new Date());

  // Password change state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSubmittingPassword, setIsSubmittingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);

  const [form, setForm] = useState({
    address: cms.address || "",
    hours: cms.hours || "",
    phone: cms.phone || "",
    email: cms.email || "",
    directionsNote: cms.directionsNote || "",
  });

  const [errors, setErrors] = useState<{
    address?: string;
    hours?: string;
    email?: string;
  }>({});

  // 1. Fetch latest real data whenever Admin opens or refreshes the Profile section
  useEffect(() => {
    let mounted = true;
    setIsRefreshing(true);
    refreshCms()
      .then(() => {
        if (mounted) {
          setLastFetchedAt(new Date());
        }
      })
      .catch((err) => {
        console.error("Error refreshing profile CMS data:", err);
      })
      .finally(() => {
        if (mounted) {
          setIsRefreshing(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, [refreshCms]);

  // Keep form in sync with cms when not editing
  useEffect(() => {
    if (!isEditing) {
      setForm({
        address: cms.address || "",
        hours: cms.hours || "",
        phone: cms.phone || "",
        email: cms.email || "",
        directionsNote: cms.directionsNote || "",
      });
      setErrors({});
    }
  }, [cms, isEditing]);

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refreshCms();
      setLastFetchedAt(new Date());
      toast.success("Profile and café settings refreshed from database");
    } catch {
      toast.error("Failed to refresh data from database");
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleStartEdit = () => {
    setForm({
      address: cms.address || "",
      hours: cms.hours || "",
      phone: cms.phone || "",
      email: cms.email || "",
      directionsNote: cms.directionsNote || "",
    });
    setErrors({});
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setForm({
      address: cms.address || "",
      hours: cms.hours || "",
      phone: cms.phone || "",
      email: cms.email || "",
      directionsNote: cms.directionsNote || "",
    });
    setErrors({});
    setIsEditing(false);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminAuthed) {
      toast.error("Unauthorized: Only verified administrators can update café profile.");
      return;
    }

    const nextErrors: typeof errors = {};
    const cleanAddress = form.address.trim();
    const cleanHours = form.hours.trim();
    const cleanPhone = form.phone.trim();
    const cleanEmail = form.email.trim();
    const cleanDirections = form.directionsNote.trim();

    if (!cleanAddress) {
      nextErrors.address = "Café physical location is required.";
    }
    if (!cleanHours) {
      nextErrors.hours = "Operating hours are required.";
    }
    if (cleanEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      nextErrors.email = "Please enter a valid email address.";
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      toast.error("Please fill in required fields correctly before saving.");
      return;
    }

    // Check if there are any changes to avoid unnecessary database writes
    if (
      cleanAddress === (cms.address || "").trim() &&
      cleanHours === (cms.hours || "").trim() &&
      cleanPhone === (cms.phone || "").trim() &&
      cleanEmail === (cms.email || "").trim() &&
      cleanDirections === (cms.directionsNote || "").trim()
    ) {
      setIsEditing(false);
      toast.info("No changes were made.");
      return;
    }

    setErrors({});
    setIsSaving(true);
    try {
      const updatedCms = {
        ...cms,
        address: cleanAddress,
        hours: cleanHours,
        phone: cleanPhone,
        email: cleanEmail,
        directionsNote: cleanDirections,
      };

      await saveCms(updatedCms);
      setLastFetchedAt(new Date());
      setIsEditing(false);
      toast.success("Café location and operating hours saved to database successfully!");
    } catch (err: any) {
      console.error("Save failed:", err);
      toast.error(err?.message || "Failed to save changes to database. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(null);

    if (!adminAuthed) {
      setPasswordError("Unauthorized: You must be signed in as an administrator to change password.");
      return;
    }

    if (!currentPassword) {
      setPasswordError("Please enter your current administrator password.");
      return;
    }

    if (!newPassword) {
      setPasswordError("Please enter a new password.");
      return;
    }

    if (newPassword.length < 6) {
      setPasswordError("New password must be at least 6 characters long.");
      return;
    }

    if (newPassword === currentPassword) {
      setPasswordError("New password must be different from your current password.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError("New password and confirmation do not match.");
      return;
    }

    setIsSubmittingPassword(true);
    try {
      const res = await changeAdminPassword(currentPassword, newPassword, confirmPassword);
      if (!res.success) {
        setPasswordError(res.error || "Failed to update password. Please check your current password.");
        return;
      }
      setPasswordSuccess("Your administrator password has been changed successfully.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      setPasswordError(err?.message || "An unexpected error occurred while updating your password.");
    } finally {
      setIsSubmittingPassword(false);
    }
  };

  return (
    <div className="space-y-6 pb-20">
      {/* 1. Header Toolbar */}
      <header className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-zinc-900 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="font-display text-2xl font-extrabold text-stone-900 dark:text-white">Admin Profile</h1>
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-bold text-emerald-700 dark:text-emerald-400">
              <CheckCircle size={13} weight="bold" /> Verified Admin
            </span>
          </div>
          <p className="mt-1 text-xs text-stone-500 dark:text-zinc-400">
            Manage your administrative session and maintain verified café location and operating hours.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={isRefreshing}
            onClick={handleManualRefresh}
            className="flex items-center gap-2 rounded-full border border-stone-200 bg-white px-4 py-2 text-xs font-bold text-stone-700 shadow-sm transition hover:bg-stone-50 dark:border-white/10 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700 disabled:opacity-50"
            title="Refresh latest data from database"
          >
            <ArrowCounterClockwise size={14} weight="bold" className={isRefreshing ? "animate-spin text-orange-600" : ""} />
            {isRefreshing ? "Fetching data..." : "Refresh Database"}
          </button>
        </div>
      </header>

      {/* 2. Admin Session Account Info */}
      <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-zinc-900">
        <h2 className="font-display text-base font-extrabold text-stone-900 dark:text-white flex items-center gap-2">
          <UserCircle size={20} weight="bold" className="text-orange-600" /> Administrator Account
        </h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl bg-stone-50 p-4 dark:bg-zinc-800/50">
            <p className="text-[11px] font-bold uppercase tracking-wider text-stone-400 dark:text-zinc-500">
              {session?.email ? "Admin Email" : "Admin Account"}
            </p>
            <p className="mt-1 text-sm font-bold text-stone-900 dark:text-white truncate">
              {session?.email || (session?.phone ? formatPhoneDisplay(session.phone) : "admin@gurshacafe.et (Authorized)")}
            </p>
          </div>
          <div className="rounded-2xl bg-stone-50 p-4 dark:bg-zinc-800/50">
            <p className="text-[11px] font-bold uppercase tracking-wider text-stone-400 dark:text-zinc-500">Access Level</p>
            <p className="mt-1 text-sm font-bold text-emerald-600 dark:text-emerald-400">
              Superadmin · Full Permissions
            </p>
          </div>
          <div className="rounded-2xl bg-stone-50 p-4 dark:bg-zinc-800/50">
            <p className="text-[11px] font-bold uppercase tracking-wider text-stone-400 dark:text-zinc-500">Last Data Sync</p>
            <p className="mt-1 text-sm font-bold text-stone-800 dark:text-zinc-200">
              {lastFetchedAt ? clock(lastFetchedAt.getTime()) : "Just now"}
            </p>
          </div>
        </div>
      </section>

      {/* 3. Change Password Section */}
      <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-zinc-900">
        <div className="border-b border-stone-100 pb-4 dark:border-white/5">
          <h2 className="font-display text-base font-extrabold text-stone-900 dark:text-white flex items-center gap-2">
            <Lock size={20} weight="bold" className="text-orange-600" /> Change Password
          </h2>
          <p className="mt-0.5 text-xs text-stone-500 dark:text-zinc-400">
            Verify your current administrator password to update your credentials securely. Passwords are never logged or stored locally.
          </p>
        </div>

        {passwordError && (
          <div className="mt-4 flex items-start gap-2.5 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-xs font-semibold text-red-700 dark:text-red-300">
            <XCircle size={16} weight="bold" className="mt-0.5 shrink-0" />
            <span>{passwordError}</span>
          </div>
        )}

        {passwordSuccess && (
          <div className="mt-4 flex items-start gap-2.5 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
            <CheckCircle size={16} weight="bold" className="mt-0.5 shrink-0" />
            <span>{passwordSuccess}</span>
          </div>
        )}

        <form onSubmit={handleChangePassword} className="mt-5 space-y-4 max-w-xl">
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-stone-500 dark:text-zinc-400">
              Current Password *
            </label>
            <div className="relative mt-1">
              <input
                type={showCurrentPassword ? "text" : "password"}
                required
                value={currentPassword}
                onChange={(e) => {
                  setCurrentPassword(e.target.value);
                  setPasswordError(null);
                }}
                placeholder="Enter current administrator password"
                autoComplete="current-password"
                className="w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 pr-10 text-sm outline-none transition focus:border-orange-500 focus:ring-1 focus:ring-orange-500 dark:border-white/15 dark:bg-zinc-800 dark:text-zinc-100"
              />
              <button
                type="button"
                aria-label={showCurrentPassword ? "Hide password" : "Show password"}
                onClick={() => setShowCurrentPassword((v) => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700 dark:hover:text-zinc-200"
              >
                {showCurrentPassword ? <EyeSlash size={17} weight="bold" /> : <Eye size={17} weight="bold" />}
              </button>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-stone-500 dark:text-zinc-400">
                New Password *
              </label>
              <div className="relative mt-1">
                <input
                  type={showNewPassword ? "text" : "password"}
                  required
                  value={newPassword}
                  onChange={(e) => {
                    setNewPassword(e.target.value);
                    setPasswordError(null);
                  }}
                  placeholder="At least 6 characters"
                  autoComplete="new-password"
                  className="w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 pr-10 text-sm outline-none transition focus:border-orange-500 focus:ring-1 focus:ring-orange-500 dark:border-white/15 dark:bg-zinc-800 dark:text-zinc-100"
                />
                <button
                  type="button"
                  aria-label={showNewPassword ? "Hide password" : "Show password"}
                  onClick={() => setShowNewPassword((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700 dark:hover:text-zinc-200"
                >
                  {showNewPassword ? <EyeSlash size={17} weight="bold" /> : <Eye size={17} weight="bold" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-stone-500 dark:text-zinc-400">
                Confirm New Password *
              </label>
              <div className="relative mt-1">
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  required
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    setPasswordError(null);
                  }}
                  placeholder="Re-enter new password"
                  autoComplete="new-password"
                  className="w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 pr-10 text-sm outline-none transition focus:border-orange-500 focus:ring-1 focus:ring-orange-500 dark:border-white/15 dark:bg-zinc-800 dark:text-zinc-100"
                />
                <button
                  type="button"
                  aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                  onClick={() => setShowConfirmPassword((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700 dark:hover:text-zinc-200"
                >
                  {showConfirmPassword ? <EyeSlash size={17} weight="bold" /> : <Eye size={17} weight="bold" />}
                </button>
              </div>
            </div>
          </div>

          <p className="text-[11px] text-stone-400 dark:text-zinc-500">
            Password must be at least 6 characters and different from your current password.
          </p>

          <div className="pt-2">
            <button
              type="submit"
              disabled={isSubmittingPassword || !currentPassword || !newPassword || !confirmPassword}
              className="flex items-center gap-2 rounded-full bg-orange-600 px-6 py-2.5 text-xs font-extrabold text-white shadow-md transition hover:bg-orange-500 disabled:opacity-50"
            >
              {isSubmittingPassword ? (
                <>
                  <ArrowCounterClockwise size={14} weight="bold" className="animate-spin" />
                  <span>Updating password...</span>
                </>
              ) : (
                <>
                  <Lock size={14} weight="bold" />
                  <span>Update Password</span>
                </>
              )}
            </button>
          </div>
        </form>
      </section>

      {/* 4. Café Location & Operating Hours Section */}
      <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-zinc-900">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-stone-100 pb-4 dark:border-white/5">
          <div>
            <h2 className="font-display text-lg font-extrabold text-stone-900 dark:text-white flex items-center gap-2">
              <Clock size={20} weight="bold" className="text-orange-600" /> Café Location & Operating Hours
            </h2>
            <p className="mt-0.5 text-xs text-stone-500 dark:text-zinc-400">
              This information is saved to the persistent database and automatically synchronizes with the customer storefront (Homepage, Footer, and Profile).
            </p>
          </div>

          {!isEditing && (
            <button
              type="button"
              onClick={handleStartEdit}
              className="flex items-center gap-1.5 self-start rounded-full bg-orange-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-orange-500 sm:self-auto"
            >
              <PencilSimple size={14} weight="bold" /> Edit Location & Hours
            </button>
          )}
        </div>

        {!isEditing ? (
          /* READ VIEW */
          <div className="mt-6 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-stone-200/80 bg-stone-50/60 p-4 dark:border-white/5 dark:bg-zinc-800/40">
                <div className="flex items-center gap-2 text-stone-500 dark:text-zinc-400">
                  <MapPin size={18} weight="bold" className="text-orange-600" />
                  <span className="text-[11px] font-bold uppercase tracking-wider">Physical Location / Address</span>
                </div>
                <p className="mt-2 text-sm font-semibold text-stone-900 dark:text-white">
                  {cms.address ? (
                    cms.address
                  ) : (
                    <span className="text-amber-600 dark:text-amber-400 font-normal italic">
                      ⚠️ No location configured yet
                    </span>
                  )}
                </p>
              </div>

              <div className="rounded-2xl border border-stone-200/80 bg-stone-50/60 p-4 dark:border-white/5 dark:bg-zinc-800/40">
                <div className="flex items-center gap-2 text-stone-500 dark:text-zinc-400">
                  <Clock size={18} weight="bold" className="text-orange-600" />
                  <span className="text-[11px] font-bold uppercase tracking-wider">Operating Hours</span>
                </div>
                <p className="mt-2 text-sm font-semibold text-stone-900 dark:text-white">
                  {cms.hours ? (
                    cms.hours
                  ) : (
                    <span className="text-amber-600 dark:text-amber-400 font-normal italic">
                      ⚠️ No operating schedule configured yet
                    </span>
                  )}
                </p>
              </div>

              <div className="rounded-2xl border border-stone-200/80 bg-stone-50/60 p-4 dark:border-white/5 dark:bg-zinc-800/40">
                <div className="flex items-center gap-2 text-stone-500 dark:text-zinc-400">
                  <Phone size={18} weight="bold" className="text-orange-600" />
                  <span className="text-[11px] font-bold uppercase tracking-wider">Café Hotline / Phone</span>
                </div>
                <p className="mt-2 text-sm font-semibold text-stone-900 dark:text-white">
                  {cms.phone ? (
                    cms.phone
                  ) : (
                    <span className="text-stone-400 dark:text-zinc-500 font-normal italic">
                      Not configured
                    </span>
                  )}
                </p>
              </div>

              <div className="rounded-2xl border border-stone-200/80 bg-stone-50/60 p-4 dark:border-white/5 dark:bg-zinc-800/40">
                <div className="flex items-center gap-2 text-stone-500 dark:text-zinc-400">
                  <EnvelopeSimple size={18} weight="bold" className="text-orange-600" />
                  <span className="text-[11px] font-bold uppercase tracking-wider">Customer Support Email</span>
                </div>
                <p className="mt-2 text-sm font-semibold text-stone-900 dark:text-white">
                  {cms.email ? (
                    cms.email
                  ) : (
                    <span className="text-stone-400 dark:text-zinc-500 font-normal italic">
                      Not configured
                    </span>
                  )}
                </p>
              </div>
            </div>

            {cms.directionsNote && (
              <div className="rounded-2xl border border-stone-200/80 bg-stone-50/60 p-4 dark:border-white/5 dark:bg-zinc-800/40">
                <span className="text-[11px] font-bold uppercase tracking-wider text-stone-500 dark:text-zinc-400">
                  Directions & Landmark Note
                </span>
                <p className="mt-1 text-sm font-medium text-stone-700 dark:text-zinc-300">
                  💡 {cms.directionsNote}
                </p>
              </div>
            )}
          </div>
        ) : (
          /* EDIT FORM */
          <form onSubmit={handleSave} className="mt-6 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-stone-500 dark:text-zinc-400">
                    Physical Address / Location *
                  </span>
                  <input
                    value={form.address}
                    onChange={(e) => setForm({ ...form, address: e.target.value })}
                    placeholder="e.g., Lake Shore Road, Hawassa, Sidama"
                    className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-orange-500 focus:ring-1 focus:ring-orange-500 dark:border-white/15 dark:bg-zinc-900 dark:text-zinc-100"
                  />
                </label>
                {errors.address && (
                  <p className="mt-1 text-xs font-semibold text-red-500">{errors.address}</p>
                )}
              </div>

              <div>
                <label className="block">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-stone-500 dark:text-zinc-400">
                    Operating Hours *
                  </span>
                  <input
                    value={form.hours}
                    onChange={(e) => setForm({ ...form, hours: e.target.value })}
                    placeholder="e.g., Mon–Sun · 7:00 AM – 10:30 PM"
                    className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-orange-500 focus:ring-1 focus:ring-orange-500 dark:border-white/15 dark:bg-zinc-900 dark:text-zinc-100"
                  />
                </label>
                {errors.hours && (
                  <p className="mt-1 text-xs font-semibold text-red-500">{errors.hours}</p>
                )}
              </div>

              <div>
                <label className="block">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-stone-500 dark:text-zinc-400">
                    Primary Hotline / Phone
                  </span>
                  <input
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    placeholder="e.g., +251 46 220 1188"
                    className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-orange-500 focus:ring-1 focus:ring-orange-500 dark:border-white/15 dark:bg-zinc-900 dark:text-zinc-100"
                  />
                </label>
              </div>

              <div>
                <label className="block">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-stone-500 dark:text-zinc-400">
                    Customer Email
                  </span>
                  <input
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    placeholder="e.g., hello@gurshacafe.et"
                    className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-orange-500 focus:ring-1 focus:ring-orange-500 dark:border-white/15 dark:bg-zinc-900 dark:text-zinc-100"
                  />
                </label>
                {errors.email && (
                  <p className="mt-1 text-xs font-semibold text-red-500">{errors.email}</p>
                )}
              </div>

              <div className="sm:col-span-2">
                <label className="block">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-stone-500 dark:text-zinc-400">
                    Directions Note / Landmark Tip
                  </span>
                  <input
                    value={form.directionsNote}
                    onChange={(e) => setForm({ ...form, directionsNote: e.target.value })}
                    placeholder="e.g., Located 200m south of Hawassa Haile Resort..."
                    className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-orange-500 focus:ring-1 focus:ring-orange-500 dark:border-white/15 dark:bg-zinc-900 dark:text-zinc-100"
                  />
                </label>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-stone-100 dark:border-white/5">
              <button
                type="button"
                onClick={handleCancelEdit}
                disabled={isSaving}
                className="rounded-full border border-stone-300 px-5 py-2.5 text-xs font-bold text-stone-700 hover:bg-stone-50 dark:border-white/15 dark:text-zinc-300 dark:hover:bg-white/5"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="flex items-center gap-2 rounded-full bg-orange-600 px-6 py-2.5 text-xs font-extrabold text-white shadow-md transition hover:bg-orange-500 disabled:opacity-50"
              >
                <FloppyDisk size={15} weight="bold" />
                {isSaving ? "Saving to database..." : "Save Changes"}
              </button>
            </div>
          </form>
        )}
      </section>

      {/* 4. Live Storefront Synchronization Notice */}
      <section className="rounded-3xl border border-stone-200/80 bg-stone-50/50 p-5 dark:border-white/5 dark:bg-zinc-900/50">
        <h3 className="font-display text-sm font-bold text-stone-900 dark:text-white flex items-center gap-2">
          <Storefront size={17} weight="bold" className="text-orange-600" /> Automatic Storefront Synchronization
        </h3>
        <p className="mt-1 text-xs text-stone-500 dark:text-zinc-400">
          Saved updates in this section immediately synchronize with:
        </p>
        <div className="mt-3 grid gap-2.5 sm:grid-cols-3 text-xs">
          <div className="rounded-xl border border-stone-200 bg-white p-3 dark:border-white/10 dark:bg-zinc-800">
            <span className="font-bold text-stone-800 dark:text-zinc-200">1. Homepage Visit Us</span>
            <p className="mt-0.5 text-stone-500 dark:text-zinc-400">Address & operating hours badge cards</p>
          </div>
          <div className="rounded-xl border border-stone-200 bg-white p-3 dark:border-white/10 dark:bg-zinc-800">
            <span className="font-bold text-stone-800 dark:text-zinc-200">2. Customer Profile</span>
            <p className="mt-0.5 text-stone-500 dark:text-zinc-400">Café location & hours information card</p>
          </div>
          <div className="rounded-xl border border-stone-200 bg-white p-3 dark:border-white/10 dark:bg-zinc-800">
            <span className="font-bold text-stone-800 dark:text-zinc-200">3. Storefront Footer</span>
            <p className="mt-0.5 text-stone-500 dark:text-zinc-400">Visit Us address, hours, phone & email</p>
          </div>
        </div>
      </section>
    </div>
  );
}

/* Shared bits used by the management screens */
export const ADMIN_ICONS = { Bank, CalendarCheck, NotePencil, UploadSimple };
export const adminFmt = { fmt, clock, etb, SERVICE_LABEL, PAY_LABEL, StatusChip };