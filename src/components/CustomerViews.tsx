import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight, Bicycle, Check, Clock, Copy, EnvelopeSimple, Fire,
  ForkKnife, Info, Leaf, MagnifyingGlass, MapPin, Minus, Package,
  Plus, QrCode, Question, SealCheck, ShieldCheck, ShoppingCart, Sparkle,
  Storefront, Tag, Trash, X,
} from "@phosphor-icons/react";
import { useGursha } from "../context/GurshaStore";
import {
  BASE_OPTIONS, CATEGORIES, DRINK_ADDONS, DELIVERY_ZONES, EXTRA_OPTIONS, IMG, zoneFee,
} from "../data/mockData";
import type { BaseChoice, CartItem, MenuItem, ServiceType } from "../types";
import { getLocalizedDishName, getLocalizedDishDesc } from "../lib/localize";

export const money = (label: string, n: number) => `${label} ${n.toLocaleString()}`;

export function Price({ n, className = "" }: { n: number; className?: string }) {
  const { t } = useGursha();
  return <span className={`tabular-nums ${className}`}>{money(t("common.etb"), n)}</span>;
}

export function Stars(_props: { value?: number; size?: number }) {
  return null;
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

/* ------------------------------------------------------------------ homepage */
export function HomePage() {
  const { t, lang, cms, menu } = useGursha();
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
              <button
                type="button"
                onClick={() => navigate(cms.heroCtaLink && !cms.heroCtaLink.startsWith("#") ? cms.heroCtaLink : "/menu")}
                className="rounded-full bg-orange-600 px-6 py-3 text-sm font-bold text-white shadow-lg transition-colors hover:bg-orange-500"
              >
                {cms.heroCtaText && cms.heroCtaText !== "Choose service" ? cms.heroCtaText : t("menu.title")}
              </button>
              <button
                type="button"
                onClick={() => navigate(cms.heroSecondaryCtaLink || "/menu")}
                className="rounded-full border border-white/30 px-6 py-3 text-sm font-bold text-white backdrop-blur transition-colors hover:bg-white/10"
              >
                {cms.heroSecondaryCtaText || t("hero.cta")}
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

      {/* 3. Promotional Campaign Banner (if enabled) */}
      {showPromo && cms.promoBanner && (
        <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="relative overflow-hidden rounded-3xl border border-orange-500/30 bg-gradient-to-r from-orange-600 via-amber-600 to-stone-900 p-7 text-white shadow-xl sm:p-10 lg:p-12">
            <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
              <div className="max-w-2xl">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-xs font-extrabold uppercase tracking-widest text-white backdrop-blur">
                  <Sparkle size={14} weight="fill" /> {cms.promoBanner.badge || t("home.specialOffer")}
                </span>
                <h2 className="font-display mt-3 text-2xl font-extrabold sm:text-3xl lg:text-4xl">
                  {cms.promoBanner.title}
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-white/90 sm:text-base">
                  {cms.promoBanner.description}
                </p>
                {cms.promoBanner.code && (
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-white/80">{t("home.useCode")}</span>
                    <button
                      type="button"
                      onClick={() => copyPromo(cms.promoBanner.code)}
                      className="inline-flex items-center gap-2 rounded-xl bg-white px-3.5 py-1.5 text-xs font-extrabold text-orange-700 shadow-sm transition hover:bg-orange-50"
                    >
                      <Tag size={14} weight="bold" />
                      <span className="font-mono tracking-wider">{cms.promoBanner.code}</span>
                      {copiedCode ? <Check size={14} weight="bold" className="text-emerald-600" /> : <Copy size={14} />}
                    </button>
                    {copiedCode && <span className="text-xs font-bold text-white">{t("home.copied")}</span>}
                  </div>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <button
                  type="button"
                  onClick={() => navigate(cms.promoBanner.ctaLink || "/menu")}
                  className="inline-flex items-center gap-2 rounded-full bg-white px-7 py-3.5 text-sm font-extrabold text-stone-950 shadow-lg transition-transform hover:scale-105"
                >
                  {cms.promoBanner.ctaText || t("hero.cta")} <ArrowRight size={16} weight="bold" />
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
                  alt={getLocalizedDishName(m, lang)}
                  loading="lazy"
                  className="h-40 w-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-display text-base font-bold leading-tight text-stone-900 dark:text-white">{getLocalizedDishName(m, lang)}</h3>
                    {m.fasting && <Leaf size={15} weight="bold" className="mt-0.5 shrink-0 text-emerald-600" />}
                  </div>
                  {getLocalizedDishDesc(m, lang) ? <p className="mt-1.5 line-clamp-2 text-xs text-stone-500 dark:text-zinc-400">{getLocalizedDishDesc(m, lang)}</p> : null}
                  <div className="mt-3 flex items-center justify-between">
                    <Price n={m.price} className="text-sm font-extrabold text-orange-600" />
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
              { Icon: Clock, label: t("home.hours"), value: cms.hours },
              { Icon: MapPin, label: t("home.visitTitle"), value: cms.address },
              { Icon: SealCheck, label: t("home.contact"), value: cms.phone },
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
type SortKey = "popular" | "price-asc" | "price-desc";

type BaseLabel = "Injera" | "Kita bread" | "No base";

function ItemModal({ item, onClose }: { item: MenuItem; onClose: () => void }) {
  const { t, lang, addToCart, extras: storeExtras } = useGursha();
  const [qty, setQty] = useState(1);
  const [base, setBase] = useState<BaseLabel>("Injera");
  const [extras, setExtras] = useState<string[]>([]);
  const [drink, setDrink] = useState<string | null>(null);
  const [note, setNote] = useState("");

  const activeExtras = useMemo(() => (storeExtras || []).filter((e) => e.enabled), [storeExtras]);

  const basePrice = BASE_OPTIONS.find((b) => b.label === base)?.price ?? 0;
  const extrasPrice = extras.reduce((a, label) => a + (activeExtras.find((e) => e.name === label)?.price ?? 0), 0);
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
          <img src={item.image} alt={getLocalizedDishName(item, lang)} className="h-48 w-full object-cover" />
          <button type="button" onClick={onClose} aria-label={t("common.close")} className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-white/90 text-stone-800 backdrop-blur">
            <X size={17} weight="bold" />
          </button>
        </div>
        <div className="space-y-5 p-5">
          <div>
            <h3 className="font-display text-xl font-extrabold text-stone-900 dark:text-white">{getLocalizedDishName(item, lang)}</h3>
            {getLocalizedDishDesc(item, lang) ? <p className="mt-1.5 text-sm text-stone-500 dark:text-zinc-400">{getLocalizedDishDesc(item, lang)}</p> : null}
            {item.fasting && (
              <div className="mt-3 flex flex-wrap items-center gap-3 text-xs font-bold text-stone-500 dark:text-zinc-400">
                <span className="flex items-center gap-1 text-emerald-600"><Leaf size={14} weight="bold" /> {t("custom.fasting")}</span>
              </div>
            )}
          </div>

          <div>
            <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-stone-400">{t("custom.base")}</p>
            <div className="flex flex-wrap gap-2">
              {[
                { label: "Injera" as const, name: t("base.injera"), price: 0 },
                { label: "Kita bread" as const, name: t("base.kita"), price: 25 },
                { label: "No base" as const, name: t("base.none"), price: 0 },
              ].map((b) => (
                <button key={b.label} type="button" onClick={() => setBase(b.label)}
                  className={`rounded-full border px-3.5 py-1.5 text-xs font-bold transition-colors ${base === b.label ? "border-orange-600 bg-orange-600 text-white" : "border-stone-300 text-stone-600 dark:border-white/15 dark:text-zinc-300"}`}>
                  {b.name}{b.price > 0 ? ` +${b.price}` : ""}
                </button>
              ))}
            </div>
          </div>

          {activeExtras.length > 0 && (
            <div>
              <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-stone-400">{t("custom.extras")}</p>
              <div className="flex flex-wrap gap-2">
                {activeExtras.map((e) => {
                  const on = extras.includes(e.name);
                  return (
                    <button key={e.id || e.name} type="button"
                      onClick={() => setExtras((s) => (on ? s.filter((x) => x !== e.name) : [...s, e.name]))}
                      className={`rounded-full border px-3.5 py-1.5 text-xs font-bold transition-colors ${on ? "border-orange-600 bg-orange-600 text-white" : "border-stone-300 text-stone-600 dark:border-white/15 dark:text-zinc-300"}`}>
                      {e.name}{e.price > 0 ? ` +${e.price}` : ""}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {DRINK_ADDONS.length > 0 && (
            <div>
              <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-stone-400">{t("custom.drink")}</p>
              <div className="flex flex-wrap gap-2">
                {DRINK_ADDONS.map((d) => (
                  <button key={d.label} type="button" onClick={() => setDrink(drink === d.label ? null : d.label)}
                    className={`rounded-full border px-3.5 py-1.5 text-xs font-bold transition-colors ${drink === d.label ? "border-orange-600 bg-orange-600 text-white" : "border-stone-300 text-stone-600 dark:border-white/15 dark:text-zinc-300"}`}>
                    {d.label} +{d.price}
                  </button>
                ))}
              </div>
            </div>
          )}

          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder={t("custom.notePlaceholder")}
            className="w-full rounded-xl border border-stone-300 bg-white p-3 text-sm text-stone-800 outline-none focus:border-orange-500 dark:border-white/15 dark:bg-white/5 dark:text-zinc-100" />

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 border-t border-stone-200 pt-4 dark:border-white/10">
            <div className="flex items-center justify-center gap-1 rounded-full border border-stone-300 p-1 dark:border-white/15">
              <button type="button" onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label={t("common.decrease")} className="grid h-8 w-8 place-items-center rounded-full hover:bg-stone-100 dark:hover:bg-white/10"><Minus size={14} weight="bold" /></button>
              <span className="w-7 text-center text-sm font-bold tabular-nums text-stone-900 dark:text-white">{qty}</span>
              <button type="button" onClick={() => setQty((q) => Math.min(20, q + 1))} aria-label={t("common.increase")} className="grid h-8 w-8 place-items-center rounded-full hover:bg-stone-100 dark:hover:bg-white/10"><Plus size={14} weight="bold" /></button>
            </div>
            <button
              type="button"
              onClick={() => {
                addToCart(item, { qty, base: paidBase, spice: item.spice ?? 0, extras: drink ? [...extras, drink] : extras, extraPrice: basePrice + extrasPrice + drinkPrice, note });
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
      (!term || `${m.name} ${m.nameAm || ""} ${m.nameSid || ""} ${m.desc || ""}`.toLowerCase().includes(term)));
    out = [...out].sort((a, b) => {
      if (sort === "price-asc") return a.price - b.price;
      if (sort === "price-desc") return b.price - a.price;
      return Number(b.popular) - Number(a.popular);
    });
    return out;
  }, [menu, cat, q, sort]);

  const SORTS: { id: SortKey; label: string }[] = [
    { id: "popular", label: t("sort.popular") },
    { id: "price-asc", label: t("sort.priceAsc") },
    { id: "price-desc", label: t("sort.priceDesc") },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      <SectionHead eyebrow={t("nav.menu")} title={t("menu.title")} sub={t("menu.sub")} />

      <div className="mb-7 flex flex-col gap-3 lg:flex-row lg:items-center">
        <label className="flex flex-1 items-center gap-2.5 rounded-full border border-stone-300 bg-white px-4 py-2.5 focus-within:border-orange-500 dark:border-white/15 dark:bg-white/5">
          <MagnifyingGlass size={17} className="text-stone-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("menu.search")}
            className="w-full bg-transparent text-sm text-stone-800 outline-none placeholder:text-stone-400 dark:text-zinc-100" />
          {q && <button type="button" onClick={() => setQ("")} aria-label={t("menu.clearSearch")}><X size={15} weight="bold" className="text-stone-400" /></button>}
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
                <img src={m.image} alt={getLocalizedDishName(m, lang)} loading="lazy" className="h-44 w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                {m.popular && (
                  <span className="absolute left-3 top-3 flex items-center gap-1 rounded-full bg-orange-600 px-2.5 py-1 text-[11px] font-bold text-white">
                    <Sparkle size={11} weight="fill" /> {t("menu.popular")}
                  </span>
                )}
                {!m.inStock && (
                  <span className="absolute inset-0 grid place-items-center bg-stone-900/55 text-sm font-bold text-white">{t("menu.outOfStock")}</span>
                )}
              </div>
              <div className="flex flex-1 flex-col p-4">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-display text-base font-bold leading-tight text-stone-900 dark:text-white">{getLocalizedDishName(m, lang)}</h3>
                  <Price n={m.price} className="shrink-0 text-sm font-extrabold text-orange-600" />
                </div>
                {getLocalizedDishDesc(m, lang) ? <p className="mt-2 line-clamp-2 flex-1 text-xs leading-relaxed text-stone-500 dark:text-zinc-400">{getLocalizedDishDesc(m, lang)}</p> : null}
                {m.fasting && (
                  <div className="mt-3 flex items-center gap-3 text-[11px] font-bold text-stone-400">
                    <span className="flex items-center gap-1 text-emerald-600"><Leaf size={13} weight="bold" /> {t("menu.fasting")}</span>
                  </div>
                )}
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
  const { lang, menu, t, setQty, removeFromCart } = useGursha();
  const menuItem = menu.find((m) => m.id === c.itemId);
  const displayName = menuItem ? getLocalizedDishName(menuItem, lang) : c.name;
  const baseLabel = c.base === "Bread" ? t("base.kita") : c.base === "None" ? t("base.none") : t("base.injera");

  return (
    <div className="flex gap-3 rounded-2xl border border-stone-200 p-3 dark:border-white/10">
      <div className="flex-1">
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm font-bold text-stone-900 dark:text-white">{displayName}</p>
          <Price n={(c.basePrice + c.extraPrice) * c.qty} className="text-sm font-extrabold text-orange-600" />
        </div>
        <p className="mt-1 text-xs text-stone-500 dark:text-zinc-400">
          {baseLabel}
          {c.extras.length > 0 ? ` · ${c.extras.join(", ")}` : ""}
        </p>
        {c.note && <p className="mt-1 text-xs italic text-stone-400">“{c.note}”</p>}
        <div className="mt-2.5 flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-full border border-stone-300 p-0.5 dark:border-white/15">
            <button type="button" onClick={() => setQty(c.uid, c.qty - 1)} aria-label={t("common.decrease")} className="grid h-7 w-7 place-items-center rounded-full hover:bg-stone-100 dark:hover:bg-white/10"><Minus size={12} weight="bold" /></button>
            <span className="w-6 text-center text-xs font-bold tabular-nums text-stone-900 dark:text-white">{c.qty}</span>
            <button type="button" onClick={() => setQty(c.uid, c.qty + 1)} aria-label={t("common.increase")} className="grid h-7 w-7 place-items-center rounded-full hover:bg-stone-100 dark:hover:bg-white/10"><Plus size={12} weight="bold" /></button>
          </div>
          <button type="button" onClick={() => removeFromCart(c.uid)} className="flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold text-stone-400 transition-colors hover:text-red-600">
            <Trash size={13} weight="bold" /> {t("cart.remove")}
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
        <dt>{t("cart.subtotal")}</dt>
        <dd className="tabular-nums"><Price n={cartSubtotal} /></dd>
      </div>
      <div className="flex justify-between border-t border-stone-200 pt-3 text-base font-extrabold text-stone-900 dark:border-white/10 dark:text-white">
        <dt>{t("checkout.total")}</dt>
        <dd className="tabular-nums text-orange-600"><Price n={cartSubtotal} /></dd>
      </div>
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
      <SectionHead eyebrow={t("nav.menu")} title={t("cart.title")} sub={t("cart.adjust")} />
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
              {t("cart.openQuick")}
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
  const { cms, t } = useGursha();
  const [activeTab, setActiveTab] = useState<"delivery" | "returns" | "privacy" | "terms">(tab);

  const titles: Record<typeof activeTab, string> = {
    delivery: t("footer.deliveryPolicy"),
    returns: t("footer.returnsPolicy"),
    privacy: t("footer.privacy"),
    terms: t("footer.terms"),
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
        className="w-full max-w-xl max-h-[90vh] flex flex-col overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-2xl dark:border-white/10 dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex shrink-0 items-center justify-between border-b border-stone-200 px-4 sm:px-6 py-4 dark:border-white/10">
          <div className="flex items-center gap-2">
            <ShieldCheck size={20} weight="bold" className="text-orange-600" />
            <h2 className="font-display text-base sm:text-lg font-extrabold text-stone-900 dark:text-white">
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

        <div className="flex shrink-0 border-b border-stone-200 px-4 sm:px-6 pt-2 overflow-x-auto gursha-scroll no-scrollbar whitespace-nowrap dark:border-white/10">
          {(["delivery", "returns", "privacy", "terms"] as const).map((tTab) => (
            <button
              key={tTab}
              type="button"
              onClick={() => setActiveTab(tTab)}
              className={`border-b-2 px-3 py-2 text-xs font-bold capitalize transition shrink-0 ${
                activeTab === tTab
                  ? "border-orange-600 text-orange-600"
                  : "border-transparent text-stone-400 hover:text-stone-700 dark:hover:text-zinc-200"
              }`}
            >
              {titles[tTab]}
            </button>
          ))}
        </div>

        <div className="p-4 sm:p-6 overflow-y-auto gursha-scroll">
          <p className="text-sm leading-relaxed text-stone-600 dark:text-zinc-300">
            {content[activeTab]}
          </p>
          <div className="mt-6 flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full bg-stone-900 px-5 py-2 text-xs font-bold text-white dark:bg-white dark:text-stone-900"
            >
              {t("common.close")}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}