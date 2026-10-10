import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight, Bicycle, Check, Clock, Copy, EnvelopeSimple, Fire,
  ForkKnife, Info, Leaf, MagnifyingGlass, MapPin, Minus, Package,
  Plus, QrCode, Question, SealCheck, ShieldCheck, ShoppingCart, Sparkle, Star,
  Storefront, Tag, Trash, X,
} from "@phosphor-icons/react";
import { useGursha } from "../context/GurshaStore";
import {
  BASE_OPTIONS, CATEGORIES, DRINK_ADDONS, DELIVERY_ZONES, EXTRA_OPTIONS, IMG, zoneFee,
} from "../data/mockData";
import type { BaseChoice, CartItem, MenuItem, ServiceType } from "../types";

export const money = (label: string, n: number) => `${label} ${n.toLocaleString()}`;

export function Price({ n, className = "" }: { n: number; className?: string }) {
  const { t } = useGursha();
  return <span className={`tabular-nums ${className}`}>{money(t("common.etb"), n)}</span>;
}

export function Stars({ value, size = 14 }: { value: number; size?: number }) {
  const rounded = Math.round(value);
  return (
    <span className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          size={size}
          weight={i <= rounded ? "fill" : "regular"}
          className={i <= rounded ? "text-orange-500" : "text-stone-300 dark:text-zinc-600"}
        />
      ))}
    </span>
  );
}

export function SectionHead({ eyebrow, title, sub, right }: { eyebrow: string; title: string; sub?: string; right?: React.ReactNode }) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4 border-b border-stone-200 pb-5 dark:border-white/10">
      <div className="max-w-2xl">
        <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.22em] text-orange-600">
          <Sparkle size={12} weight="fill" />
          {eyebrow}
        </p>
        <h2 className="font-display text-2xl font-extrabold text-stone-900 dark:text-white sm:text-3xl">{title}</h2>
        {sub && <p className="mt-2 text-sm text-stone-600 dark:text-zinc-400">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

const dishName = (m: MenuItem, lang: string) => (lang === "am" ? m.nameAm : lang === "sid" ? m.nameSid : m.name);

/* ------------------------------------------------------------- service selector */
const SERVICE_META: Record<ServiceType, { Icon: typeof Storefront; desc: string; hint: string }> = {
  "dine-in": { Icon: QrCode, desc: "Scan the QR code on your table, order in place and we serve it hot.", hint: "5% service charge · table tracking included" },
  takeaway: { Icon: Package, desc: "Order ahead and collect from the counter on Lake Shore Road.", hint: "Ready in about 20 minutes" },
  delivery: { Icon: Bicycle, desc: "We ride to your address anywhere inside Hawassa city.", hint: "Fee scales with distance · 30–120 ETB" },
};

export function ServiceSelector() {
  const { t, lang, service, setService, deliverySettings } = useGursha();
  const [flash, setFlash] = useState(false);
  const meta = SERVICE_META[service];
  const labels: Record<ServiceType, string> = { "dine-in": t("svc.dineIn"), takeaway: t("svc.takeaway"), delivery: t("svc.delivery") };

  const enabledDestinations = (deliverySettings?.destinations || []).filter((d) => d.enabled);
  const deliveryAvailable = (deliverySettings?.enabled ?? true) && enabledDestinations.length > 0;

  return (
    <div id="service" className="overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-sm dark:border-white/10 dark:bg-zinc-900">
      <div className="grid grid-cols-3 divide-x divide-stone-200 dark:divide-white/10">
        {(Object.keys(SERVICE_META) as ServiceType[]).map((s) => {
          const Icon = SERVICE_META[s].Icon;
          const active = service === s;
          const isDeliveryOff = s === "delivery" && !deliveryAvailable;
          return (
            <button
              key={s}
              type="button"
              disabled={isDeliveryOff}
              onClick={() => {
                if (isDeliveryOff) return;
                setService(s);
                setFlash(true);
                window.setTimeout(() => setFlash(false), 900);
              }}
              className={`flex flex-col items-center gap-2 px-3 py-4 text-sm font-bold transition-colors sm:flex-row sm:justify-center sm:gap-2.5 ${
                active
                  ? "bg-orange-600 text-white"
                  : isDeliveryOff
                  ? "cursor-not-allowed bg-stone-50 text-stone-400 opacity-60 dark:bg-white/5 dark:text-zinc-600"
                  : "text-stone-600 hover:bg-stone-100 dark:text-zinc-300 dark:hover:bg-white/5"
              }`}
            >
              <Icon size={20} weight="bold" />
              <span>{labels[s]}{isDeliveryOff ? " (Off)" : ""}</span>
            </button>
          );
        })}
      </div>
      <AnimatePresence mode="wait">
        <motion.div
          key={service}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.18 }}
          className="flex flex-wrap items-center justify-between gap-4 px-5 py-5"
        >
          <div className="max-w-xl">
            <p className="font-display text-lg font-bold text-stone-900 dark:text-white">
              {flash ? `${labels[service]} selected` : meta.desc}
            </p>
            <p className="mt-1 text-sm text-stone-500 dark:text-zinc-400">
              {service === "delivery" && !deliveryAvailable
                ? "Delivery is currently unavailable. Please choose Dine-in or Takeaway."
                : meta.hint}
            </p>
          </div>
          <a
            href="#featured"
            className="flex items-center gap-2 rounded-full bg-stone-900 px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-orange-600 dark:bg-white dark:text-stone-900 dark:hover:bg-orange-500 dark:hover:text-white"
          >
            <ForkKnife size={16} weight="bold" />
            {t("hero.menu")}
          </a>
        </motion.div>
      </AnimatePresence>
      {service === "delivery" && (
        <div className="border-t border-stone-200 bg-stone-50 px-5 py-3 text-xs font-semibold text-stone-600 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300">
          {deliveryAvailable ? (
            <span>
              Available Destinations: {enabledDestinations.map((z) => `${z.name} (${money("ETB", zoneFee(z.distanceKm))})`).join(" · ")}
            </span>
          ) : (
            <span className="text-amber-700 dark:text-amber-400">
              Delivery is currently disabled by administrator. Dine-In and Takeaway orders remain active.
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ homepage */
export function HomePage() {
  const { t, cms, menu } = useGursha();
  const navigate = useNavigate();
  const [copiedCode, setCopiedCode] = useState(false);

  const featured = useMemo(() => {
    if (cms.featuredIds && cms.featuredIds.length > 0) {
      const picked = menu.filter((m) => cms.featuredIds?.includes(m.id));
      if (picked.length > 0) return picked;
    }
    return menu.filter((m) => m.popular).slice(0, 4);
  }, [menu, cms.featuredIds]);

  const copyPromo = (code: string) => {
    navigator.clipboard?.writeText(code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const showHero = true;
  const showFeatured = cms.visibility?.featured !== false;
  const isLakesideSpecial = Boolean(
    cms.promoBanner?.badge?.toLowerCase().includes("lakeside special") ||
    cms.promoBanner?.code === "GURSHA10" ||
    cms.promoBanner?.title?.toLowerCase().includes("lakeside special")
  );
  const showPromo = cms.visibility?.promoBanner !== false && cms.promoBanner?.enabled && !isLakesideSpecial;
  const showVisit = cms.visibility?.visit !== false;

  return (
    <div className="space-y-20 pb-24">
      {/* 1. Hero Section */}
      {showHero && (
        <section className="relative isolate overflow-hidden">
          <img
            src={cms.heroImage || IMG.hero}
            alt="Gursha café terrace overlooking Lake Hawassa"
            className="absolute inset-0 h-full w-full object-cover transition-all duration-700"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-stone-950/92 via-stone-950/75 to-stone-900/35" />
          <div className="relative mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-28 lg:px-8">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.2em] text-white backdrop-blur">
              <MapPin size={12} weight="bold" />
              {cms.heroLocation || "Hawassa · Sidama Region"}
            </span>
            <h1 className="font-display mt-6 max-w-3xl text-4xl font-extrabold leading-[1.05] text-white sm:text-6xl">
              {cms.heroTitle || t("hero.title")}
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-stone-200 sm:text-lg">
              {cms.heroSubtitle || t("hero.sub")}
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <a
                href={cms.heroCtaLink || "#service"}
                className="rounded-full bg-orange-600 px-6 py-3 text-sm font-bold text-white shadow-lg transition-colors hover:bg-orange-500"
              >
                {cms.heroCtaText || t("hero.cta")}
              </a>
              <button
                type="button"
                onClick={() => navigate(cms.heroSecondaryCtaLink || "/menu")}
                className="rounded-full border border-white/30 px-6 py-3 text-sm font-bold text-white backdrop-blur transition-colors hover:bg-white/10"
              >
                {cms.heroSecondaryCtaText || t("menu.title")}
              </button>
              {cms.visibility?.heroBadge !== false && (
                <span className="flex items-center gap-2 rounded-full bg-white/10 px-4 py-2.5 text-xs font-bold text-white backdrop-blur">
                  <span className="gursha-pulse h-2 w-2 rounded-full bg-emerald-400" />
                  {cms.heroOpenBadge || t("home.openNow")} · {cms.hours?.split("·")[0]?.trim() || "Open"}
                </span>
              )}
            </div>
          </div>
        </section>
      )}

      {/* 2. Service Selector */}
      <section className="mx-auto -mt-32 max-w-7xl px-4 sm:px-6 lg:px-8">
        <ServiceSelector />
      </section>

      {/* 3. Promotional Campaign Banner (if enabled) */}
      {showPromo && cms.promoBanner && (
        <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="relative overflow-hidden rounded-3xl border border-orange-500/30 bg-gradient-to-r from-orange-600 via-amber-600 to-stone-900 p-7 text-white shadow-xl sm:p-10 lg:p-12">
            <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
              <div className="max-w-2xl">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-xs font-extrabold uppercase tracking-widest text-white backdrop-blur">
                  <Sparkle size={14} weight="fill" /> {cms.promoBanner.badge || "Special Offer"}
                </span>
                <h2 className="font-display mt-3 text-2xl font-extrabold sm:text-3xl lg:text-4xl">
                  {cms.promoBanner.title}
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-white/90 sm:text-base">
                  {cms.promoBanner.description}
                </p>
                {cms.promoBanner.code && (
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-white/80">Use code:</span>
                    <button
                      type="button"
                      onClick={() => copyPromo(cms.promoBanner.code)}
                      className="inline-flex items-center gap-2 rounded-xl bg-white px-3.5 py-1.5 text-xs font-extrabold text-orange-700 shadow-sm transition hover:bg-orange-50"
                    >
                      <Tag size={14} weight="bold" />
                      <span className="font-mono tracking-wider">{cms.promoBanner.code}</span>
                      {copiedCode ? <Check size={14} weight="bold" className="text-emerald-600" /> : <Copy size={14} />}
                    </button>
                    {copiedCode && <span className="text-xs font-bold text-white">Copied!</span>}
                  </div>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <button
                  type="button"
                  onClick={() => navigate(cms.promoBanner.ctaLink || "/menu")}
                  className="inline-flex items-center gap-2 rounded-full bg-white px-7 py-3.5 text-sm font-extrabold text-stone-950 shadow-lg transition-transform hover:scale-105"
                >
                  {cms.promoBanner.ctaText || "Order now"} <ArrowRight size={16} weight="bold" />
                </button>
              </div>
            </div>
            {cms.promoBanner.imageUrl && (
              <img
                src={cms.promoBanner.imageUrl}
                alt={cms.promoBanner.title}
                className="pointer-events-none absolute -right-10 -bottom-10 h-72 w-72 rounded-full object-cover opacity-20 blur-sm lg:opacity-30"
              />
            )}
          </div>
        </section>
      )}

      {/* 4. Featured Section */}
      {showFeatured && (
        <section id="featured" className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <SectionHead
            eyebrow={cms.featuredEyebrow || t("home.featured")}
            title={cms.bannerTitle}
            sub={cms.bannerSub}
            right={
              <button
                type="button"
                onClick={() => navigate("/menu")}
                className="rounded-full border border-stone-300 px-4 py-2 text-sm font-bold text-stone-700 transition-colors hover:border-orange-500 hover:text-orange-600 dark:border-white/15 dark:text-zinc-200"
              >
                {t("menu.title")} →
              </button>
            }
          />
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {featured.map((m, i) => (
              <motion.button
                key={m.id}
                type="button"
                onClick={() => navigate("/menu")}
                initial={{ opacity: 0, y: 18 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ duration: 0.4, delay: i * 0.06, ease: "easeOut" }}
                className="group overflow-hidden rounded-2xl border border-stone-200 bg-white text-left shadow-sm transition-shadow hover:shadow-md dark:border-white/10 dark:bg-zinc-900"
              >
                <img
                  src={m.image}
                  alt={m.name}
                  loading="lazy"
                  className="h-40 w-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-display text-base font-bold leading-tight text-stone-900 dark:text-white">{m.name}</h3>
                    {m.fasting && <Leaf size={15} weight="bold" className="mt-0.5 shrink-0 text-emerald-600" />}
                  </div>
                  <p className="mt-1.5 line-clamp-2 text-xs text-stone-500 dark:text-zinc-400">{m.desc}</p>
                  <div className="mt-3 flex items-center justify-between">
                    <Price n={m.price} className="text-sm font-extrabold text-orange-600" />
                    <Stars value={m.rating} size={12} />
                  </div>
                </div>
              </motion.button>
            ))}
          </div>
        </section>
      )}


      {/* 7. Visit Us & Contact Section */}
      {showVisit && (
        <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <SectionHead
            eyebrow={cms.visitEyebrow || t("home.visitTitle")}
            title={cms.visitTitle || cms.address}
            sub={cms.visitSub || cms.hours}
          />
          <div className="gursha-grid grid gap-5 rounded-3xl border border-stone-200 bg-white p-6 dark:border-white/10 dark:bg-zinc-900 sm:grid-cols-3">
            {[
              { Icon: Clock, label: "Opening hours", value: cms.hours },
              { Icon: MapPin, label: "Find us", value: cms.address },
              { Icon: SealCheck, label: "Reservations & Contact", value: cms.phone },
            ].map(({ Icon, label, value }) => (
              <div key={label} className="rounded-2xl bg-white/85 p-5 backdrop-blur dark:bg-zinc-900/85">
                <Icon size={22} weight="bold" className="text-orange-600" />
                <p className="mt-3 text-[11px] font-bold uppercase tracking-[0.18em] text-stone-400">{label}</p>
                <p className="mt-1 text-sm font-semibold text-stone-800 dark:text-zinc-200">{value}</p>
              </div>
            ))}
          </div>
          {cms.directionsNote && (
            <p className="mt-4 text-center text-xs text-stone-500 dark:text-zinc-400">
              💡 {cms.directionsNote}
            </p>
          )}
        </section>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------- menu */
type SortKey = "popular" | "price-asc" | "price-desc" | "rating";

type BaseLabel = "Injera" | "Kita bread" | "No base";

function ItemModal({ item, onClose }: { item: MenuItem; onClose: () => void }) {
  const { t, lang, addToCart } = useGursha();
  const [qty, setQty] = useState(1);
  const [base, setBase] = useState<BaseLabel>("Injera");
  const [spice, setSpice] = useState(item.spice);
  const [extras, setExtras] = useState<string[]>([]);
  const [drink, setDrink] = useState<string | null>(null);
  const [note, setNote] = useState("");

  const basePrice = BASE_OPTIONS.find((b) => b.label === base)?.price ?? 0;
  const extrasPrice = extras.reduce((a, label) => a + (EXTRA_OPTIONS.find((e) => e.label === label)?.price ?? 0), 0);
  const drinkPrice = drink ? DRINK_ADDONS.find((d) => d.label === drink)?.price ?? 0 : 0;
  const unit = item.price + basePrice + extrasPrice + drinkPrice;
  const paidBase: BaseChoice = base === "Kita bread" ? "Bread" : base === "No base" ? "None" : "Injera";

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-stone-950/60 p-0 backdrop-blur-sm sm:items-center sm:p-6" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 40 }}
        transition={{ duration: 0.22, ease: "easeOut" }}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white dark:bg-zinc-900 sm:rounded-3xl"
      >
        <div className="relative">
          <img src={item.image} alt={item.name} className="h-48 w-full object-cover" />
          <button type="button" onClick={onClose} aria-label="Close" className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-white/90 text-stone-800 backdrop-blur">
            <X size={17} weight="bold" />
          </button>
        </div>
        <div className="space-y-5 p-5">
          <div>
            <h3 className="font-display text-xl font-extrabold text-stone-900 dark:text-white">{dishName(item, lang)}</h3>
            <p className="mt-1.5 text-sm text-stone-500 dark:text-zinc-400">{item.desc}</p>
            <div className="mt-3 flex flex-wrap items-center gap-3 text-xs font-bold text-stone-500 dark:text-zinc-400">
              <span className="flex items-center gap-1">
                <Fire size={14} weight="fill" className="text-orange-500" /> Spice {spice}/3
              </span>
              {item.fasting && <span className="flex items-center gap-1 text-emerald-600"><Leaf size={14} weight="bold" /> Fasting friendly</span>}
              <Stars value={item.rating} size={13} />
            </div>
          </div>

          <div>
            <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-stone-400">Base</p>
            <div className="flex flex-wrap gap-2">
              {BASE_OPTIONS.map((b) => (
                <button key={b.label} type="button" onClick={() => setBase(b.label as BaseLabel)}
                  className={`rounded-full border px-3.5 py-1.5 text-xs font-bold transition-colors ${base === b.label ? "border-orange-600 bg-orange-600 text-white" : "border-stone-300 text-stone-600 dark:border-white/15 dark:text-zinc-300"}`}>
                  {b.label}{b.price > 0 ? ` +${b.price}` : ""}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-stone-400">Spice level</p>
            <div className="flex gap-2">
              {[0, 1, 2, 3].map((s) => (
                <button key={s} type="button" onClick={() => setSpice(s)}
                  className={`flex-1 rounded-xl border py-2 text-xs font-bold transition-colors ${spice === s ? "border-orange-600 bg-orange-600/10 text-orange-700 dark:text-orange-300" : "border-stone-300 text-stone-500 dark:border-white/15 dark:text-zinc-400"}`}>
                  {s === 0 ? "None" : "🌶".repeat(s)}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-stone-400">Extras</p>
            <div className="flex flex-wrap gap-2">
              {EXTRA_OPTIONS.map((e) => {
                const on = extras.includes(e.label);
                return (
                  <button key={e.label} type="button"
                    onClick={() => setExtras((s) => (on ? s.filter((x) => x !== e.label) : [...s, e.label]))}
                    className={`rounded-full border px-3.5 py-1.5 text-xs font-bold transition-colors ${on ? "border-orange-600 bg-orange-600 text-white" : "border-stone-300 text-stone-600 dark:border-white/15 dark:text-zinc-300"}`}>
                    {e.label}{e.price > 0 ? ` +${e.price}` : ""}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-stone-400">Add a drink</p>
            <div className="flex flex-wrap gap-2">
              {DRINK_ADDONS.map((d) => (
                <button key={d.label} type="button" onClick={() => setDrink(drink === d.label ? null : d.label)}
                  className={`rounded-full border px-3.5 py-1.5 text-xs font-bold transition-colors ${drink === d.label ? "border-orange-600 bg-orange-600 text-white" : "border-stone-300 text-stone-600 dark:border-white/15 dark:text-zinc-300"}`}>
                  {d.label} +{d.price}
                </button>
              ))}
            </div>
          </div>

          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder={lang === "en" ? "Kitchen note (optional)" : "Kitchen note (optional)"}
            className="w-full rounded-xl border border-stone-300 bg-white p-3 text-sm text-stone-800 outline-none focus:border-orange-500 dark:border-white/15 dark:bg-white/5 dark:text-zinc-100" />

          <div className="flex items-center gap-3 border-t border-stone-200 pt-4 dark:border-white/10">
            <div className="flex items-center gap-1 rounded-full border border-stone-300 p-1 dark:border-white/15">
              <button type="button" onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label="Decrease" className="grid h-8 w-8 place-items-center rounded-full hover:bg-stone-100 dark:hover:bg-white/10"><Minus size={14} weight="bold" /></button>
              <span className="w-7 text-center text-sm font-bold tabular-nums text-stone-900 dark:text-white">{qty}</span>
              <button type="button" onClick={() => setQty((q) => Math.min(20, q + 1))} aria-label="Increase" className="grid h-8 w-8 place-items-center rounded-full hover:bg-stone-100 dark:hover:bg-white/10"><Plus size={14} weight="bold" /></button>
            </div>
            <button
              type="button"
              onClick={() => {
                addToCart(item, { qty, base: paidBase, spice, extras: drink ? [...extras, drink] : extras, extraPrice: basePrice + extrasPrice + drinkPrice, note });
                onClose();
              }}
              className="flex flex-1 items-center justify-center gap-2 rounded-full bg-orange-600 px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-orange-500"
            >
              <ShoppingCart size={16} weight="bold" />
              {t("menu.add")} · <Price n={unit * qty} />
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

export function MenuPage() {
  const { t, lang, menu } = useGursha();
  const [cat, setCat] = useState<string>("all");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortKey>("popular");
  const [open, setOpen] = useState<MenuItem | null>(null);

  const cats = useMemo(() => CATEGORIES.filter((c) => menu.some((m) => m.category === c.id)), [menu]);

  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    let out = menu.filter((m) => (cat === "all" || m.category === cat) &&
      (!term || `${m.name} ${m.nameAm} ${m.nameSid} ${m.desc}`.toLowerCase().includes(term)));
    out = [...out].sort((a, b) => {
      if (sort === "price-asc") return a.price - b.price;
      if (sort === "price-desc") return b.price - a.price;
      if (sort === "rating") return b.rating - a.rating;
      return Number(b.popular) - Number(a.popular);
    });
    return out;
  }, [menu, cat, q, sort]);

  const SORTS: { id: SortKey; label: string }[] = [
    { id: "popular", label: "Most popular" },
    { id: "price-asc", label: "Price low → high" },
    { id: "price-desc", label: "Price high → low" },
    { id: "rating", label: "Top rated" },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      <SectionHead eyebrow={t("nav.menu")} title={t("menu.title")} sub={t("menu.sub")} />

      <div className="mb-7 flex flex-col gap-3 lg:flex-row lg:items-center">
        <label className="flex flex-1 items-center gap-2.5 rounded-full border border-stone-300 bg-white px-4 py-2.5 focus-within:border-orange-500 dark:border-white/15 dark:bg-white/5">
          <MagnifyingGlass size={17} className="text-stone-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("menu.search")}
            className="w-full bg-transparent text-sm text-stone-800 outline-none placeholder:text-stone-400 dark:text-zinc-100" />
          {q && <button type="button" onClick={() => setQ("")} aria-label="Clear search"><X size={15} weight="bold" className="text-stone-400" /></button>}
        </label>
        <div className="flex gap-2 overflow-x-auto pb-1 lg:pb-0">
          <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}
            className="rounded-full border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 outline-none focus:border-orange-500 dark:border-white/15 dark:bg-zinc-900 dark:text-zinc-200">
            {SORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </div>
      </div>

      <div className="gursha-scroll mb-8 flex gap-2 overflow-x-auto pb-2">
        <button type="button" onClick={() => setCat("all")}
          className={`shrink-0 rounded-full px-4 py-2 text-sm font-bold transition-colors ${cat === "all" ? "bg-stone-900 text-white dark:bg-white dark:text-stone-900" : "border border-stone-300 text-stone-600 dark:border-white/15 dark:text-zinc-300"}`}>
          {t("menu.all")} <span className="tabular-nums opacity-60">{menu.length}</span>
        </button>
        {cats.map((c) => {
          const count = menu.filter((m) => m.category === c.id).length;
          return (
            <button key={c.id} type="button" onClick={() => setCat(c.id)}
              className={`shrink-0 rounded-full px-4 py-2 text-sm font-bold transition-colors ${cat === c.id ? "bg-stone-900 text-white dark:bg-white dark:text-stone-900" : "border border-stone-300 text-stone-600 dark:border-white/15 dark:text-zinc-300"}`}>
              {lang === "am" ? c.am : lang === "sid" ? c.sid : c.en} <span className="tabular-nums opacity-60">{count}</span>
            </button>
          );
        })}
      </div>

      {list.length === 0 ? (
        <div className="grid place-items-center rounded-3xl border border-dashed border-stone-300 py-20 text-center dark:border-white/15">
          <MagnifyingGlass size={30} className="text-stone-300" />
          <p className="mt-3 text-sm font-semibold text-stone-500 dark:text-zinc-400">{t("menu.empty")}</p>
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((m, i) => (
            <motion.article
              key={m.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: Math.min(i * 0.03, 0.3), ease: "easeOut" }}
              className={`group flex flex-col overflow-hidden rounded-2xl border bg-white shadow-sm dark:bg-zinc-900 ${
                m.inStock ? "border-stone-200 dark:border-white/10" : "border-dashed border-stone-300 opacity-70 dark:border-white/15"
              }`}
            >
              <div className="relative">
                <img src={m.image} alt={m.name} loading="lazy" className="h-44 w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                {m.popular && (
                  <span className="absolute left-3 top-3 flex items-center gap-1 rounded-full bg-orange-600 px-2.5 py-1 text-[11px] font-bold text-white">
                    <Sparkle size={11} weight="fill" /> Popular
                  </span>
                )}
                {!m.inStock && (
                  <span className="absolute inset-0 grid place-items-center bg-stone-900/55 text-sm font-bold text-white">{t("menu.outOfStock")}</span>
                )}
              </div>
              <div className="flex flex-1 flex-col p-4">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-display text-base font-bold leading-tight text-stone-900 dark:text-white">{dishName(m, lang)}</h3>
                  <Price n={m.price} className="shrink-0 text-sm font-extrabold text-orange-600" />
                </div>
                <p className="mt-2 line-clamp-2 flex-1 text-xs leading-relaxed text-stone-500 dark:text-zinc-400">{m.desc}</p>
                <div className="mt-3 flex items-center gap-3 text-[11px] font-bold text-stone-400">
                  <span className="flex items-center gap-0.5">
                    {Array.from({ length: m.spice }).map((_, k) => <Fire key={k} size={13} weight="fill" className="text-orange-500" />)}
                    {m.spice === 0 && "Mild"}
                  </span>
                  {m.fasting && <span className="flex items-center gap-1 text-emerald-600"><Leaf size={13} weight="bold" /> Fasting</span>}
                  <Stars value={m.rating} size={12} />
                </div>
                <button
                  type="button"
                  disabled={!m.inStock}
                  onClick={() => setOpen(m)}
                  className="mt-4 flex items-center justify-center gap-2 rounded-full bg-stone-900 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-orange-600 disabled:cursor-not-allowed disabled:bg-stone-300 dark:bg-white dark:text-stone-900 dark:hover:bg-orange-500 dark:hover:text-white dark:disabled:bg-zinc-700 dark:disabled:text-zinc-400"
                >
                  <ShoppingCart size={15} weight="bold" />
                  {t("menu.customize")}
                </button>
              </div>
            </motion.article>
          ))}
        </div>
      )}

      <AnimatePresence>{open && <ItemModal item={open} onClose={() => setOpen(null)} />}</AnimatePresence>
    </div>
  );
}

/* ---------------------------------------------------------------------- cart */
function CartLine({ c }: { c: CartItem }) {
  const { setQty, removeFromCart } = useGursha();
  return (
    <div className="flex gap-3 rounded-2xl border border-stone-200 p-3 dark:border-white/10">
      <div className="flex-1">
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm font-bold text-stone-900 dark:text-white">{c.name}</p>
          <Price n={(c.basePrice + c.extraPrice) * c.qty} className="text-sm font-extrabold text-orange-600" />
        </div>
        <p className="mt-1 text-xs text-stone-500 dark:text-zinc-400">
          {c.base} · {c.spice === 0 ? "No spice" : "Spice " + c.spice + "/3"}
          {c.extras.length > 0 ? ` · ${c.extras.join(", ")}` : ""}
        </p>
        {c.note && <p className="mt-1 text-xs italic text-stone-400">“{c.note}”</p>}
        <div className="mt-2.5 flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-full border border-stone-300 p-0.5 dark:border-white/15">
            <button type="button" onClick={() => setQty(c.uid, c.qty - 1)} aria-label="Decrease quantity" className="grid h-7 w-7 place-items-center rounded-full hover:bg-stone-100 dark:hover:bg-white/10"><Minus size={12} weight="bold" /></button>
            <span className="w-6 text-center text-xs font-bold tabular-nums text-stone-900 dark:text-white">{c.qty}</span>
            <button type="button" onClick={() => setQty(c.uid, c.qty + 1)} aria-label="Increase quantity" className="grid h-7 w-7 place-items-center rounded-full hover:bg-stone-100 dark:hover:bg-white/10"><Plus size={12} weight="bold" /></button>
          </div>
          <button type="button" onClick={() => removeFromCart(c.uid)} className="flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold text-stone-400 transition-colors hover:text-red-600">
            <Trash size={13} weight="bold" /> Remove
          </button>
        </div>
      </div>
    </div>
  );
}

function CartTotals() {
  const { t, cartSubtotal } = useGursha();
  return (
    <dl className="space-y-2.5 text-sm">
      <div className="flex justify-between text-stone-600 dark:text-zinc-300">
        <dt>Subtotal</dt>
        <dd className="tabular-nums"><Price n={cartSubtotal} /></dd>
      </div>
      <div className="flex justify-between border-t border-stone-200 pt-3 text-base font-extrabold text-stone-900 dark:border-white/10 dark:text-white">
        <dt>{t("checkout.total")}</dt>
        <dd className="tabular-nums text-orange-600"><Price n={cartSubtotal} /></dd>
      </div>
      <p className="text-xs text-stone-400">Delivery and service charges are calculated at checkout.</p>
    </dl>
  );
}

export function CartDrawer() {
  const { t, cartOpen, setCartOpen, cart, cartCount } = useGursha();
  const navigate = useNavigate();
  return (
    <AnimatePresence>
      {cartOpen && (
        <div className="fixed inset-0 z-[80] flex justify-end">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setCartOpen(false)} className="absolute inset-0 bg-stone-950/55 backdrop-blur-sm" />
          <motion.aside
            initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 34 }}
            className="relative flex h-full w-full max-w-md flex-col bg-stone-50 dark:bg-zinc-950"
          >
            <header className="flex items-center justify-between border-b border-stone-200 px-5 py-4 dark:border-white/10">
              <div>
                <h2 className="font-display text-lg font-extrabold text-stone-900 dark:text-white">{t("cart.title")}</h2>
                <p className="text-xs text-stone-500 dark:text-zinc-400">{cartCount} item{cartCount === 1 ? "" : "s"}</p>
              </div>
              <button type="button" onClick={() => setCartOpen(false)} aria-label="Close cart" className="grid h-9 w-9 place-items-center rounded-full border border-stone-300 text-stone-600 dark:border-white/15 dark:text-zinc-300">
                <X size={17} weight="bold" />
              </button>
            </header>

            <div className="flex-1 space-y-3 overflow-y-auto p-5">
              {cart.length === 0 ? (
                <div className="grid h-full place-items-center text-center">
                  <div>
                    <ShoppingCart size={32} className="mx-auto text-stone-300" />
                    <p className="mt-3 text-sm font-semibold text-stone-500 dark:text-zinc-400">{t("cart.empty")}</p>
                    <button type="button" onClick={() => { setCartOpen(false); navigate("/menu"); }}
                      className="mt-4 rounded-full bg-orange-600 px-5 py-2.5 text-sm font-bold text-white">{t("menu.title")}</button>
                  </div>
                </div>
              ) : (
                cart.map((c) => <CartLine key={c.uid} c={c} />)
              )}
            </div>

            {cart.length > 0 && (
              <footer className="space-y-4 border-t border-stone-200 bg-white p-5 dark:border-white/10 dark:bg-zinc-900">
                <CartTotals />
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => setCartOpen(false)}
                    className="rounded-full border border-stone-300 px-4 py-3 text-sm font-bold text-stone-700 dark:border-white/15 dark:text-zinc-200">
                    {t("cart.continue")}
                  </button>
                  <button type="button" onClick={() => { setCartOpen(false); navigate("/checkout"); }}
                    className="rounded-full bg-orange-600 px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-orange-500">
                    {t("cart.checkout")}
                  </button>
                </div>
              </footer>
            )}
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  );
}

export function CartPage() {
  const { t, cart, setCartOpen } = useGursha();
  const navigate = useNavigate();
  return (
    <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
      <SectionHead eyebrow={t("nav.menu")} title={t("cart.title")} sub="Adjust quantities before you check out." />
      {cart.length === 0 ? (
        <div className="grid place-items-center rounded-3xl border border-dashed border-stone-300 py-20 text-center dark:border-white/15">
          <ShoppingCart size={34} className="text-stone-300" />
          <p className="mt-3 text-sm font-semibold text-stone-500 dark:text-zinc-400">{t("cart.empty")}</p>
          <button type="button" onClick={() => navigate("/menu")} className="mt-4 rounded-full bg-orange-600 px-5 py-2.5 text-sm font-bold text-white">{t("menu.title")}</button>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
          <div className="space-y-3">
            {cart.map((c) => <CartLine key={c.uid} c={c} />)}
            <button type="button" onClick={() => setCartOpen(true)} className="text-sm font-bold text-orange-600">
              Open quick cart →
            </button>
          </div>
          <aside className="space-y-4 self-start rounded-3xl border border-stone-200 bg-white p-5 dark:border-white/10 dark:bg-zinc-900">
            <CartTotals />
            <button type="button" onClick={() => navigate("/checkout")}
              className="w-full rounded-full bg-orange-600 px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-orange-500">
              {t("cart.checkout")}
            </button>
          </aside>
        </div>
      )}
    </div>
  );
}

export function PolicyModal({
  tab,
  onClose,
}: {
  tab: "delivery" | "returns" | "privacy" | "terms";
  onClose: () => void;
}) {
  const { cms } = useGursha();
  const [activeTab, setActiveTab] = useState<"delivery" | "returns" | "privacy" | "terms">(tab);

  const titles: Record<typeof activeTab, string> = {
    delivery: "Delivery Information",
    returns: "Returns & Cancellation",
    privacy: "Privacy Policy",
    terms: "Terms & Conditions",
  };

  const content: Record<typeof activeTab, string> = {
    delivery:
      cms.policies?.delivery ||
      "Deliveries are dispatched within 25–40 minutes across Hawassa. Distance-based fees apply from 50 to 120 ETB depending on your zone.",
    returns:
      cms.policies?.returns ||
      "Because our food is prepared fresh to order, cancellations can only be made within 5 minutes of placing an order.",
    privacy:
      cms.policies?.privacy ||
      "Your phone number and delivery location are used exclusively to process and deliver your order.",
    terms:
      cms.policies?.terms ||
      "Orders are fulfilled subject to kitchen availability. Digital payments require uploading a valid transaction screenshot.",
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-stone-950/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-xl overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-2xl dark:border-white/10 dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-stone-200 px-6 py-4 dark:border-white/10">
          <div className="flex items-center gap-2">
            <ShieldCheck size={20} weight="bold" className="text-orange-600" />
            <h2 className="font-display text-lg font-extrabold text-stone-900 dark:text-white">
              {titles[activeTab]}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-full border border-stone-200 text-stone-500 hover:text-stone-900 dark:border-white/10 dark:text-zinc-400"
          >
            <X size={16} weight="bold" />
          </button>
        </header>

        <div className="flex border-b border-stone-200 px-6 pt-2 dark:border-white/10">
          {(["delivery", "returns", "privacy", "terms"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setActiveTab(t)}
              className={`border-b-2 px-3 py-2 text-xs font-bold capitalize transition ${
                activeTab === t
                  ? "border-orange-600 text-orange-600"
                  : "border-transparent text-stone-400 hover:text-stone-700 dark:hover:text-zinc-200"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="p-6">
          <p className="text-sm leading-relaxed text-stone-600 dark:text-zinc-300">
            {content[activeTab]}
          </p>
          <div className="mt-6 flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full bg-stone-900 px-5 py-2 text-xs font-bold text-white dark:bg-white dark:text-stone-900"
            >
              Close
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}