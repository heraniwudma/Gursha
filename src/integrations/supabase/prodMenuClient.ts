import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";
import type { CategoryId, MenuItem } from "@/types";

const prodUrl =
  import.meta.env.VITE_PROD_SUPABASE_URL ||
  "https://hiisvmovrlxgfsgtercn.supabase.co";

const prodAnonKey =
  import.meta.env.VITE_PROD_SUPABASE_ANON_KEY ||
  import.meta.env.VITE_PROD_SUPABASE_PUBLISHABLE_KEY ||
  "sb_publishable_SpYWMsdzwwcdv9MygBtjmw_aU-cvqXd";

/**
 * Isolated Production Menu Read-Only Client.
 *
 * Requirements & Security Boundary:
 * 1. Dedicated exclusively to reading customer-facing menu data from Production (hiisvmovrlxgfsgtercn).
 * 2. Uses exclusively the public anon/publishable key - NEVER service-role.
 * 3. persistSession: false - Strictly avoids persisting or reading any auth tokens.
 * 4. Staging auth tokens or admin privileges are never forwarded to this client.
 * 5. All admin dashboard mutations, orders, customer auth, and payments remain strictly on Staging (supabase client).
 */
export const prodMenuClient = createClient<Database>(prodUrl, prodAnonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});

/**
 * Maps raw database row from public.menu_items to the application's MenuItem model.
 */
export function mapDbRowToMenuItem(row: any): MenuItem {
  return {
    id: String(row.id),
    name: String(row.name || ""),
    nameAm: String(row.name_am || row.name || ""),
    nameSid: String(row.name_sid || row.name || ""),
    desc: String(row.desc || row.description || ""),
    descAm: String(row.desc_am || row.description_am || ""),
    descSid: String(row.desc_sid || row.description_sid || ""),
    price: Number(row.price) || 0,
    category: (row.category_id || row.category || "mains") as CategoryId,
    image: String(row.image || ""),
    spice: typeof row.spice === "number" ? row.spice : 0,
    rating: typeof row.rating === "number" ? row.rating : 5,
    popular: Boolean(row.popular),
    fasting: Boolean(row.fasting),
    inStock: row.in_stock !== false,
  };
}

/**
 * Fetches authoritative menu items from production Supabase.
 */
export async function fetchProductionMenuItems(): Promise<MenuItem[]> {
  try {
    const { data, error } = await prodMenuClient
      .from("menu_items")
      .select(
        "id, name, name_am, name_sid, desc, desc_am, desc_sid, description, description_am, description_sid, price, category_id, image, spice, rating, popular, fasting, in_stock, created_at"
      )
      .order("created_at", { ascending: true });

    if (!error && data && Array.isArray(data)) {
      return data.map(mapDbRowToMenuItem);
    }
  } catch {
    // Fallback if desc_am / desc_sid columns do not yet exist on production
  }

  const { data, error } = await prodMenuClient
    .from("menu_items")
    .select(
      "id, name, name_am, name_sid, desc, price, category_id, image, spice, rating, popular, fasting, in_stock, created_at"
    )
    .order("created_at", { ascending: true });

  if (error) {
    throw error;
  }

  if (!data || !Array.isArray(data)) {
    return [];
  }

  return data.map(mapDbRowToMenuItem);
}
