import { useEffect, useState } from "react";
import { BrowserRouter, Link, Navigate, NavLink, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { Toaster } from "sonner";
import {
  Clock, EnvelopeSimple, FacebookLogo, ForkKnife, Globe, House, InstagramLogo, MapPin, Moon, Phone,
  Receipt, ShoppingCart, Sun, TelegramLogo, TiktokLogo, UserCircle,
} from "@phosphor-icons/react";
import { GurshaProvider, useGursha } from "./context/GurshaStore";
import { CartDrawer, CartPage, HomePage, MenuPage, PolicyModal } from "./components/CustomerViews";
import { CheckoutPage, OrderDetailPage, OrdersPage, ProfilePage } from "./components/CustomerPortal";
import { CustomerLogin, CustomerRegister, CustomerResetPassword } from "./components/CustomerAuth";
import { AdminDashboard, AdminOrders, AdminPayments, AdminProfile, AdminShell } from "./components/AdminViews";
import { AdminCms, AdminExtras, AdminMenu } from "./components/AdminManage";

const NAV = [
  { to: "/", label: "Home", Icon: House },
  { to: "/menu", label: "Menu", Icon: ForkKnife },
  { to: "/orders", label: "My orders", Icon: Receipt },
  { to: "/profile", label: "Profile", Icon: UserCircle },
];

const LANGS = [
  { id: "en", label: "EN" },
  { id: "am", label: "አማ" },
  { id: "sid", label: "ሲዳ" },
] as const;

function ScrollTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo({ top: 0, behavior: "smooth" }); }, [pathname]);
  return null;
}

function formatSocialUrl(url?: string): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      new URL(trimmed);
      return trimmed;
    } catch {
      return null;
    }
  }
  if (/^[a-zA-Z0-9-]+\.[a-zA-Z]{2,}/.test(trimmed)) {
    try {
      const full = `https://${trimmed}`;
      new URL(full);
      return full;
    } catch {
      return null;
    }
  }
  return null;
}

function SiteLayout() {
  const { lang, setLang, theme, setTheme, cartCount, setCartOpen, cms, session, logout, t } = useGursha();
  const [policyModal, setPolicyModal] = useState<"delivery" | "returns" | "privacy" | "terms" | null>(null);

  const brandParts = (cms.brandTagline || "Café Hawassa").split(" ");

  const instagramUrl = formatSocialUrl(cms.socials?.instagram);
  const telegramUrl = formatSocialUrl(cms.socials?.telegram);
  const tiktokUrl = formatSocialUrl(cms.socials?.tiktok);
  const facebookUrl = formatSocialUrl(cms.socials?.facebook);
  const hasSocials = Boolean(instagramUrl || telegramUrl || tiktokUrl || facebookUrl);

  return (
    <div className="flex min-h-screen flex-col bg-stone-50 text-stone-900 dark:bg-zinc-950 dark:text-zinc-100">
      {/* 1. Announcement Bar */}
      {cms.visibility?.announcement !== false && cms.announcement && (
        <div className="bg-orange-600 px-4 py-2 text-center text-[11px] font-bold tracking-wide text-white transition-colors sm:text-xs">
          {cms.announcementLink ? (
            <Link to={cms.announcementLink} className="underline decoration-white/50 underline-offset-2 hover:text-orange-100">
              {cms.announcement}
            </Link>
          ) : (
            <span>{cms.announcement}</span>
          )}
        </div>
      )}

      {/* 2. Header */}
      <header className="sticky top-0 z-50 border-b border-stone-200 bg-white/85 backdrop-blur-md dark:border-white/10 dark:bg-zinc-950/85">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3.5">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="font-display text-2xl font-extrabold leading-none tracking-tight text-orange-600">
              {cms.brandName || "Gursha"}
            </span>
            <span className="hidden text-[10px] font-bold uppercase leading-tight tracking-[0.18em] text-stone-400 sm:block">
              {brandParts[0]}<br />{brandParts.slice(1).join(" ")}
            </span>
          </Link>

          <nav className="ml-auto hidden items-center gap-1 lg:flex">
            <NavLink to="/" end
              className={({ isActive }) => `flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-bold transition-colors ${
                isActive ? "bg-orange-600/10 text-orange-700 dark:text-orange-300" : "text-stone-500 hover:text-stone-900 dark:text-zinc-400 dark:hover:text-white"}`}>
              <House size={16} weight="bold" /> {t("nav.home")}
            </NavLink>
            <NavLink to="/menu"
              className={({ isActive }) => `flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-bold transition-colors ${
                isActive ? "bg-orange-600/10 text-orange-700 dark:text-orange-300" : "text-stone-500 hover:text-stone-900 dark:text-zinc-400 dark:hover:text-white"}`}>
              <ForkKnife size={16} weight="bold" /> {t("nav.menu")}
            </NavLink>
            <NavLink to="/orders"
              className={({ isActive }) => `flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-bold transition-colors ${
                isActive ? "bg-orange-600/10 text-orange-700 dark:text-orange-300" : "text-stone-500 hover:text-stone-900 dark:text-zinc-400 dark:hover:text-white"}`}>
              <Receipt size={16} weight="bold" /> {t("nav.orders")}
            </NavLink>

            {session?.verified ? (
              <>
                <NavLink to="/profile"
                  className={({ isActive }) => `flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-bold transition-colors ${
                    isActive ? "bg-orange-600/10 text-orange-700 dark:text-orange-300" : "text-stone-500 hover:text-stone-900 dark:text-zinc-400 dark:hover:text-white"}`}>
                  <UserCircle size={16} weight="bold" /> {session.name ? session.name.split(" ")[0] : t("nav.account")}
                </NavLink>
                <button
                  type="button"
                  onClick={logout}
                  className="rounded-full px-3 py-1.5 text-xs font-bold text-stone-500 transition-colors hover:text-red-600 dark:text-zinc-400 dark:hover:text-red-400"
                >
                  {t("nav.logout")}
                </button>
              </>
            ) : (
              <>
                <NavLink to="/login"
                  className={({ isActive }) => `flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-bold transition-colors ${
                    isActive ? "bg-orange-600/10 text-orange-700 dark:text-orange-300" : "text-stone-500 hover:text-stone-900 dark:text-zinc-400 dark:hover:text-white"}`}>
                  <UserCircle size={16} weight="bold" /> {t("nav.login")}
                </NavLink>
                <Link to="/register"
                  className="rounded-full bg-orange-600/15 px-3.5 py-2 text-sm font-bold text-orange-700 transition-colors hover:bg-orange-600 hover:text-white dark:bg-orange-500/20 dark:text-orange-300 dark:hover:bg-orange-600 dark:hover:text-white">
                  {t("nav.register")}
                </Link>
              </>
            )}
          </nav>

          <div className="ml-auto flex items-center gap-2 lg:ml-0">
            <div className="flex items-center rounded-full border border-stone-200 p-0.5 dark:border-white/10">
              <Globe size={13} className="ml-1.5 hidden text-stone-400 sm:block" />
              {LANGS.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => setLang(l.id)}
                  aria-pressed={lang === l.id}
                  aria-label={`Switch language to ${l.label}`}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-bold transition-colors ${
                    lang === l.id
                      ? "bg-stone-900 text-white dark:bg-white dark:text-stone-900"
                      : "text-stone-500 hover:text-stone-900 dark:text-zinc-400 dark:hover:text-white"
                  }`}
                >
                  {l.label}
                </button>
              ))}
            </div>
            <button type="button" aria-label="Toggle theme" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="grid h-10 w-10 place-items-center rounded-full border border-stone-200 text-stone-600 dark:border-white/10 dark:text-zinc-300">
              {theme === "dark" ? <Sun size={17} weight="bold" /> : <Moon size={17} weight="bold" />}
            </button>
            <button type="button" onClick={() => setCartOpen(true)} aria-label="Open cart"
              className="relative grid h-10 w-10 place-items-center rounded-full bg-orange-600 text-white shadow-sm transition hover:scale-105 active:scale-95">
              <ShoppingCart size={18} weight="bold" />
              {cartCount > 0 && (
                <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-white px-1 text-[10px] font-extrabold text-orange-600 ring-2 ring-orange-600">{cartCount}</span>
              )}
            </button>
          </div>
        </div>

        <div className="gursha-scroll flex items-center gap-1.5 overflow-x-auto border-t border-stone-200 px-4 py-2 dark:border-white/10 lg:hidden">
          <NavLink to="/" end
            className={({ isActive }) => `flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-bold ${isActive ? "bg-orange-600 text-white" : "border border-stone-200 text-stone-500 dark:border-white/10 dark:text-zinc-400"}`}>
            <House size={14} weight="bold" /> {t("nav.home")}
          </NavLink>
          <NavLink to="/menu"
            className={({ isActive }) => `flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-bold ${isActive ? "bg-orange-600 text-white" : "border border-stone-200 text-stone-500 dark:border-white/10 dark:text-zinc-400"}`}>
            <ForkKnife size={14} weight="bold" /> {t("nav.menu")}
          </NavLink>
          <NavLink to="/orders"
            className={({ isActive }) => `flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-bold ${isActive ? "bg-orange-600 text-white" : "border border-stone-200 text-stone-500 dark:border-white/10 dark:text-zinc-400"}`}>
            <Receipt size={14} weight="bold" /> {t("nav.orders")}
          </NavLink>
          {session?.verified ? (
            <>
              <NavLink to="/profile"
                className={({ isActive }) => `flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-bold ${isActive ? "bg-orange-600 text-white" : "border border-stone-200 text-stone-500 dark:border-white/10 dark:text-zinc-400"}`}>
                <UserCircle size={14} weight="bold" /> {t("nav.account")}
              </NavLink>
              <button
                type="button"
                onClick={logout}
                className="shrink-0 rounded-full border border-stone-200 px-3 py-2 text-xs font-bold text-red-600 dark:border-white/10 dark:text-red-400"
              >
                {t("nav.logout")}
              </button>
            </>
          ) : (
            <>
              <NavLink to="/login"
                className={({ isActive }) => `flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-bold ${isActive ? "bg-orange-600 text-white" : "border border-stone-200 text-stone-500 dark:border-white/10 dark:text-zinc-400"}`}>
                <UserCircle size={14} weight="bold" /> {t("nav.login")}
              </NavLink>
              <NavLink to="/register"
                className={({ isActive }) => `flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-bold ${isActive ? "bg-orange-600 text-white" : "border border-stone-200 text-stone-500 dark:border-white/10 dark:text-zinc-400"}`}>
                {t("nav.register")}
              </NavLink>
            </>
          )}

          <div className="ml-auto flex shrink-0 items-center gap-1 pl-2">
            <Globe size={13} className="text-orange-600" />
            {LANGS.map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => setLang(l.id)}
                aria-pressed={lang === l.id}
                aria-label={`Switch language to ${l.label}`}
                className={`rounded-full px-2.5 py-1 text-[11px] font-bold transition-colors ${
                  lang === l.id
                    ? "bg-orange-600 text-white shadow-xs"
                    : "border border-stone-200 text-stone-600 hover:text-stone-900 dark:border-white/10 dark:text-zinc-400 dark:hover:text-white"
                }`}
              >
                {l.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="flex-1"><Outlet /></main>

      {/* 3. Footer */}
      <footer className="mt-16 border-t border-stone-200 bg-white dark:border-white/10 dark:bg-zinc-950">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <span className="font-display text-2xl font-extrabold text-orange-600">
              {cms.brandName || "Gursha"}
            </span>
            {cms.footerAbout?.trim() && (
              <p className="mt-3 max-w-xs text-sm leading-relaxed text-stone-500 dark:text-zinc-400">
                {cms.footerAbout.trim()}
              </p>
            )}
            {hasSocials && (
              <div className="mt-4 flex items-center gap-2">
                {instagramUrl && (
                  <a
                    href={instagramUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Instagram"
                    className="grid h-8 w-8 place-items-center rounded-full border border-stone-200 text-stone-500 transition-colors hover:text-orange-600 dark:border-white/10 dark:text-zinc-400"
                  >
                    <InstagramLogo size={16} weight="bold" />
                  </a>
                )}
                {telegramUrl && (
                  <a
                    href={telegramUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Telegram"
                    className="grid h-8 w-8 place-items-center rounded-full border border-stone-200 text-stone-500 transition-colors hover:text-orange-600 dark:border-white/10 dark:text-zinc-400"
                  >
                    <TelegramLogo size={16} weight="bold" />
                  </a>
                )}
                {tiktokUrl && (
                  <a
                    href={tiktokUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="TikTok"
                    className="grid h-8 w-8 place-items-center rounded-full border border-stone-200 text-stone-500 transition-colors hover:text-orange-600 dark:border-white/10 dark:text-zinc-400"
                  >
                    <TiktokLogo size={16} weight="bold" />
                  </a>
                )}
                {facebookUrl && (
                  <a
                    href={facebookUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Facebook"
                    className="grid h-8 w-8 place-items-center rounded-full border border-stone-200 text-stone-500 transition-colors hover:text-orange-600 dark:border-white/10 dark:text-zinc-400"
                  >
                    <FacebookLogo size={16} weight="bold" />
                  </a>
                )}
              </div>
            )}
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-stone-400">Visit us</p>
            <ul className="mt-3 space-y-2 text-sm text-stone-500 dark:text-zinc-400">
              {cms.address?.trim() && (
                <li className="flex items-start gap-2">
                  <MapPin size={15} weight="bold" className="mt-0.5 text-orange-600 shrink-0" />
                  <span>{cms.address.trim()}</span>
                </li>
              )}
              {cms.hours?.trim() && (
                <li className="flex items-start gap-2">
                  <Clock size={15} weight="bold" className="mt-0.5 text-orange-600 shrink-0" />
                  <span>{cms.hours.trim()}</span>
                </li>
              )}
              {cms.phone?.trim() && (
                <li className="flex items-start gap-2">
                  <Phone size={15} weight="bold" className="mt-0.5 text-orange-600 shrink-0" />
                  <a href={`tel:${cms.phone.trim()}`} className="transition-colors hover:text-orange-600">
                    {cms.phone.trim()}
                  </a>
                </li>
              )}
              {cms.email?.trim() && (
                <li className="flex items-start gap-2">
                  <EnvelopeSimple size={15} weight="bold" className="mt-0.5 text-orange-600 shrink-0" />
                  <a href={`mailto:${cms.email.trim()}`} className="transition-colors hover:text-orange-600">
                    {cms.email.trim()}
                  </a>
                </li>
              )}
            </ul>
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-stone-400">Explore & Policies</p>
            <ul className="mt-3 space-y-2 text-sm">
              {NAV.slice(1, 4).map(({ to, label }) => (
                <li key={to}><Link to={to} className="text-stone-500 hover:text-orange-600 dark:text-zinc-400">{label}</Link></li>
              ))}
              <li>
                <button type="button" onClick={() => setPolicyModal("privacy")} className="text-left text-stone-500 hover:text-orange-600 dark:text-zinc-400">
                  Privacy policy
                </button>
              </li>
            </ul>
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-stone-400">Call ahead</p>
            {cms.phone?.trim() && (
              <p className="font-display mt-3 text-lg font-extrabold text-stone-900 dark:text-white">
                <a href={`tel:${cms.phone.trim().replace(/\s+/g, "")}`} className="transition-colors hover:text-orange-600">
                  {cms.phone.trim()}
                </a>
              </p>
            )}
            {cms.directionsNote?.trim() && (
              <p className="mt-2 text-xs text-stone-400">{cms.directionsNote.trim()}</p>
            )}
          </div>
        </div>
        <p className="border-t border-stone-200 py-5 text-center text-xs text-stone-400 dark:border-white/10">
          {cms.copyrightText?.trim() || `© ${new Date().getFullYear()} Gursha Café. All rights reserved.`}
        </p>
      </footer>

      <CartDrawer />
      {policyModal && <PolicyModal tab={policyModal} onClose={() => setPolicyModal(null)} />}
    </div>
  );
}

function NotFound() {
  return (
    <div className="mx-auto grid max-w-xl place-items-center px-4 py-24 text-center">
      <span className="font-display text-6xl font-extrabold text-orange-600">404</span>
      <h1 className="font-display mt-4 text-2xl font-extrabold">This table isn't set</h1>
      <p className="mt-2 text-sm text-stone-500 dark:text-zinc-400">The page you were looking for has moved or never existed.</p>
      <Link to="/" className="mt-6 rounded-full bg-orange-600 px-6 py-3 text-sm font-bold text-white">Back to the café</Link>
    </div>
  );
}

export default function App() {
  return (
    <GurshaProvider>
      <BrowserRouter>
        <ScrollTop />
        <Routes>
          <Route element={<SiteLayout />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/menu" element={<MenuPage />} />
            <Route path="/cart" element={<CartPage />} />
            <Route path="/checkout" element={<CheckoutPage />} />
            <Route path="/orders" element={<OrdersPage />} />
            <Route path="/orders/:code" element={<OrderDetailPage />} />
            <Route path="/track" element={<OrdersPage />} />
            <Route path="/track/:code" element={<OrderDetailPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/login" element={<CustomerLogin />} />
            <Route path="/register" element={<CustomerRegister />} />
            <Route path="/reset-password" element={<CustomerResetPassword />} />
            <Route path="/forgot-password" element={<CustomerResetPassword />} />
            <Route path="*" element={<NotFound />} />
          </Route>
          <Route path="/admin" element={<AdminShell />}>
            <Route index element={<AdminDashboard />} />
            <Route path="orders" element={<AdminOrders />} />
            <Route path="payments" element={<AdminPayments />} />
            <Route path="menu" element={<AdminMenu />} />
            <Route path="extras" element={<AdminExtras />} />
            <Route path="cms" element={<AdminCms />} />
            <Route path="profile" element={<AdminProfile />} />
            <Route path="promotions" element={<Navigate to="/admin" replace />} />
            <Route path="promos" element={<Navigate to="/admin" replace />} />
          </Route>
        </Routes>
        <Toaster richColors position="top-center" />
      </BrowserRouter>
    </GurshaProvider>
  );
}