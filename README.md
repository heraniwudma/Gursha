# Gursha Cafe — Hawassa

Traditional Ethiopian cuisine, lake fish, and specialty buna in Hawassa. Built with React 19, Vite, TypeScript, Tailwind CSS, and Supabase.

---

## 🚀 Features

- **Customer Experience**: Digital menu, ordering flows, customizable base options (Injera, Kita), custom spice levels, and order tracking.
- **Multilingual Support**: English, Amharic (አማርኛ), and Sidama (ሲዳሙ).
- **Theme Selection**: Light and Dark mode options.
- **Admin Dashboard**: Live order management, status transitions, payment verification, menu catalog editor, and CMS settings.
- **Backend & Auth**: Supabase database, storage, customer session management, and OTP verification flows.
- **Cloudflare Pages Ready**: Client-side SPA routing preconfigured (`public/_redirects`).

---

## 🛠️ Getting Started

### 1. Prerequisites
- [Bun](https://bun.sh/) (v1.2+) or Node.js (v20+)

### 2. Install Dependencies
```bash
bun install
# or
npm install
```

### 3. Environment Variables
Create a `.env` file in the project root:
```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_ADMIN_EMAILS=admin@guresha.com
VITE_ADMIN_PHONE_NUMBERS=+251911000000
```

### 4. Development Server
```bash
bun run dev
# or
npm run dev
```
Open `http://localhost:3000` in your browser.

### 5. Type-check & Production Build
```bash
bun run typecheck
bun run build
```
Production assets are generated in the `dist/` directory.

---

## 🌐 Cloudflare Pages Deployment (`guresha.com`)

1. Connect your GitHub repository (`gursha-cafe`) to **Cloudflare Pages**.
2. **Build Settings**:
   - **Framework preset**: `Vite`
   - **Build command**: `bun run build` (or `npm run build`)
   - **Build output directory**: `dist`
   - **Root directory**: `/`
3. **Environment Variables**:
   Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the Cloudflare Pages settings.
4. **Custom Domain**:
   In your Cloudflare Pages project, navigate to **Custom domains** and add `guresha.com`.
