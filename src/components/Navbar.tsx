import { useState } from "react";
import { NavLink } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  CaretDown, Coffee, ForkKnife, Globe, House, List, Moon,
  Receipt, ShoppingCart, Sun, X,
} from "@phosphor-icons/react";
import { useGursha } from "../context/GurshaStore";
import type { Lang } from "../types";

const LINKS = [
  { to: "/", key: "nav.home", Icon: House },
  { to: "/menu", key: "nav.menu", Icon: ForkKnife },
  { to: "/orders", key: "nav.orders", Icon: Receipt },
];

const LANG_OPTIONS: { id: Lang; short: string; label: string; native: string }[] = [
  { id: "en", short: "EN", label: "English", native: "English" },
  { id: "am", short: "አማ", label: "Amharic", native: "አማርኛ" },
  { id: "sid", short: "SID", label: "Sidama", native: "Sidaamu Afoo" },
];

export default function Navbar() {
  const { t, lang, setLang, theme, setTheme, cartCount, setCartOpen, cms } = useGursha();
  const [mobile, setMobile] = useState(false);
  const [langOpen, setLangOpen] = useState(false);

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `relative flex items-center gap-2 rounded-full px-3.5 py-2 text-sm font-semibold transition-colors ${
      isActive
        ? "bg-orange-600/10 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300"
        : "text-stone-600 hover:bg-stone-200/70 hover:text-stone-900 dark:text-zinc-300 dark:hover:bg-white/10 dark:hover:text-white"
    }`;

  return (
    <header className="sticky top-0 z-50 border-b border-stone-200/80 bg-stone-50/85 backdrop-blur-xl dark:border-white/10 dark:bg-zinc-950/85">
      <div className="overflow-hidden border-b border-orange-700/20 bg-orange-600 py-1.5 text-white">
        <div className="gursha-marquee flex w-max gap-14 whitespace-nowrap px-4 text-xs font-semibold tracking-wide">
          <span>{cms.announcement}</span>
          <span aria-hidden>{cms.announcement}</span>
        </div>
      </div>

      <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6 lg:px-8">
        <NavLink to="/" className="flex shrink-0 items-center gap-2.5" onClick={() => setMobile(false)}>
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-orange-600 text-white shadow-sm">
            <Coffee size={19} weight="fill" />
          </span>
          <span className="leading-none">
            <span className="font-display block text-xl font-extrabold text-stone-900 dark:text-white">Gursha</span>
            <span className="block text-[10px] font-bold uppercase tracking-[0.24em] text-orange-600">Hawassa</span>
          </span>
        </NavLink>

        <nav className="ml-4 hidden items-center gap-1 lg:flex">
          {LINKS.map(({ to, key, Icon }) => (
            <NavLink key={to} to={to} className={linkClass} end={to === "/"}>
              <Icon size={16} weight="bold" />
              {t(key)}
            </NavLink>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1.5">
          {/* Desktop language selector */}
          <div className="hidden items-center gap-0.5 rounded-full border border-stone-300 bg-white p-0.5 dark:border-white/15 dark:bg-white/5 md:flex">
            <Globe size={14} weight="bold" className="ml-1.5 text-stone-400" />
            {LANG_OPTIONS.map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => setLang(l.id)}
                aria-pressed={lang === l.id}
                className={`rounded-full px-2 py-1 text-[11px] font-bold transition-colors ${
                  lang === l.id ? "bg-orange-600 text-white shadow-xs" : "text-stone-500 hover:text-stone-900 dark:text-zinc-400 dark:hover:text-white"
                }`}
              >
                {l.short}
              </button>
            ))}
          </div>

          {/* Mobile visible language selector directly in header */}
          <div className="relative md:hidden">
            <button
              type="button"
              onClick={() => setLangOpen((v) => !v)}
              aria-label="Change language"
              className="flex h-9 items-center gap-1.5 rounded-full border border-stone-300 bg-white px-2.5 text-xs font-bold text-stone-700 shadow-xs transition-colors hover:border-orange-400 dark:border-white/15 dark:bg-white/5 dark:text-zinc-200"
            >
              <Globe size={15} weight="bold" className="text-orange-600" />
              <span className="text-[11px] font-extrabold uppercase">{LANG_OPTIONS.find((l) => l.id === lang)?.short || lang}</span>
              <CaretDown size={11} weight="bold" className="text-stone-400" />
            </button>
            <AnimatePresence>
              {langOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -6, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.95 }}
                  transition={{ duration: 0.15 }}
                  className="absolute right-0 mt-2 w-44 overflow-hidden rounded-2xl border border-stone-200 bg-white p-1.5 shadow-xl dark:border-white/10 dark:bg-zinc-900 z-50"
                >
                  {LANG_OPTIONS.map((l) => (
                    <button
                      key={l.id}
                      type="button"
                      onClick={() => {
                        setLang(l.id);
                        setLangOpen(false);
                      }}
                      className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-xs transition-colors ${
                        lang === l.id
                          ? "bg-orange-600 text-white font-bold"
                          : "text-stone-700 hover:bg-stone-100 dark:text-zinc-200 dark:hover:bg-white/5 font-medium"
                      }`}
                    >
                      <span>{l.native}</span>
                      <span className="text-[10px] uppercase opacity-75 font-bold">({l.short})</span>
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <button
            type="button"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            aria-label="Toggle colour theme"
            className="grid h-9 w-9 place-items-center rounded-full border border-stone-300 bg-white text-stone-600 transition-colors hover:border-orange-400 hover:text-orange-600 dark:border-white/15 dark:bg-white/5 dark:text-zinc-300"
          >
            {theme === "dark" ? <Sun size={17} weight="bold" /> : <Moon size={17} weight="bold" />}
          </button>

          <button
            type="button"
            onClick={() => setCartOpen(true)}
            aria-label="Open cart"
            className="relative grid h-9 w-9 place-items-center rounded-full bg-orange-600 text-white shadow-sm transition-transform hover:scale-105 active:scale-95"
          >
            <ShoppingCart size={17} weight="bold" />
            {cartCount > 0 && (
              <motion.span
                key={cartCount}
                initial={{ scale: 0.4 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 500, damping: 20 }}
                className="absolute -right-1.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-stone-900 px-1 text-[11px] font-bold text-white ring-2 ring-stone-50 dark:bg-white dark:text-stone-900 dark:ring-zinc-950"
              >
                {cartCount}
              </motion.span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setMobile((v) => !v)}
            aria-label="Toggle navigation"
            className="grid h-9 w-9 place-items-center rounded-full border border-stone-300 bg-white text-stone-700 dark:border-white/15 dark:bg-white/5 dark:text-zinc-200 lg:hidden"
          >
            {mobile ? <X size={18} weight="bold" /> : <List size={18} weight="bold" />}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {mobile && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="overflow-hidden border-t border-stone-200 bg-stone-50 dark:border-white/10 dark:bg-zinc-950 lg:hidden"
          >
            <div className="space-y-3 px-4 py-4">
              <div className="grid grid-cols-2 gap-2">
                {LINKS.map(({ to, key, Icon }) => (
                  <NavLink
                    key={to}
                    to={to}
                    end={to === "/"}
                    onClick={() => setMobile(false)}
                    className={({ isActive }) =>
                      `flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-semibold ${
                        isActive
                          ? "border-orange-500/40 bg-orange-600/10 text-orange-700 dark:text-orange-300"
                          : "border-stone-200 text-stone-700 dark:border-white/10 dark:text-zinc-200"
                      }`
                    }
                  >
                    <Icon size={16} weight="bold" />
                    {t(key)}
                  </NavLink>
                ))}
              </div>
              <div className="rounded-xl border border-stone-200 p-3 dark:border-white/10">
                <div className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-stone-400">
                  <Globe size={14} weight="bold" className="text-orange-600" />
                  <span>Language / ቋንቋ / Afii</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {LANG_OPTIONS.map((l) => (
                    <button
                      key={l.id}
                      type="button"
                      onClick={() => setLang(l.id)}
                      className={`flex flex-col items-center justify-center rounded-xl p-2 text-center transition-colors ${
                        lang === l.id
                          ? "bg-orange-600 text-white shadow-sm"
                          : "border border-stone-200 bg-white text-stone-700 hover:bg-stone-100 dark:border-white/10 dark:bg-zinc-800 dark:text-zinc-200"
                      }`}
                    >
                      <span className="text-xs font-extrabold">{l.short}</span>
                      <span className="mt-0.5 text-[10px] opacity-90">{l.native}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}