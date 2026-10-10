import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "https://hiisvmovrlxgfsgtercn.supabase.co";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhpaXN2bW92cmx4Z2ZzZ3RlcmNuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEyNDE0NjgsImV4cCI6MjEwNjgxNzQ2OH0.uaEgMKWEM0Htgookq36_lr7beEU9_9dOYZ_PSJhSajE";

if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY) {
  console.warn("Notice: Using fallback Supabase credentials. Ensure .env contains VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);
