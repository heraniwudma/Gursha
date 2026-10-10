import { supabase } from "./supabase";
import { normalizePhoneNumber, validatePhoneNumber } from "./phone";

export interface AuthResponse {
  success: boolean;
  error?: string;
  user?: any;
  session?: any;
}

// Initial authorized admin phones seed for bootstrap / emergency recovery
const INITIAL_ADMIN_PHONES = [
  "+251911778899",
  "+251922334455",
  "+251900467999",
];

// Initial authorized admin emails seed for bootstrap / development
const INITIAL_ADMIN_EMAILS = [
  "admin@gurshacafe.et",
  "management@gurshacafe.et",
  "admin@gursha.com",
  "owner@gurshacafe.et",
  "admin@example.com",
];

/**
 * Validates and normalizes email input
 */
export function validateEmail(rawEmail: string): { valid: boolean; normalized: string; error?: string } {
  if (!rawEmail || typeof rawEmail !== "string") {
    return { valid: false, normalized: "", error: "Please enter your email address." };
  }
  const clean = rawEmail.trim().toLowerCase();
  if (!clean) {
    return { valid: false, normalized: "", error: "Please enter your email address." };
  }
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!regex.test(clean)) {
    return { valid: false, normalized: clean, error: "Please enter a valid email address (e.g. name@example.com)." };
  }
  return { valid: true, normalized: clean };
}

/**
 * Fetch authorized administrator email addresses from Supabase `__admin_roles__`
 * or environment variables / initial seed.
 */
export async function getAuthorizedAdminEmails(): Promise<string[]> {
  const envAdmins = (import.meta.env.VITE_ADMIN_EMAILS || "")
    .split(",")
    .map((e: string) => e.trim().toLowerCase())
    .filter(Boolean);

  const adminSet = new Set<string>([...INITIAL_ADMIN_EMAILS, ...envAdmins]);

  try {
    const { data } = await supabase
      .from("customer_sessions")
      .select("name")
      .eq("phone", "__admin_roles__")
      .maybeSingle();

    if (data?.name) {
      try {
        const parsed = JSON.parse(data.name);
        if (Array.isArray(parsed.adminEmails)) {
          parsed.adminEmails.forEach((e: string) => {
            const clean = e.trim().toLowerCase();
            if (clean) adminSet.add(clean);
          });
        }
      } catch (e) {
        console.warn("Could not parse __admin_roles__ payload for emails:", e);
      }
    }
  } catch (err) {
    console.warn("Could not query __admin_roles__ from database:", err);
  }

  return Array.from(adminSet);
}

/**
 * Fetch authorized administrator phone numbers from Supabase `__admin_roles__`
 * or environment variables / initial seed.
 */
export async function getAuthorizedAdminPhones(): Promise<string[]> {
  const envAdmins = (import.meta.env.VITE_ADMIN_PHONE_NUMBERS || "")
    .split(",")
    .map((p: string) => normalizePhoneNumber(p.trim()))
    .filter(Boolean);

  const adminSet = new Set<string>([...INITIAL_ADMIN_PHONES, ...envAdmins]);

  try {
    const { data } = await supabase
      .from("customer_sessions")
      .select("name")
      .eq("phone", "__admin_roles__")
      .maybeSingle();

    if (data?.name) {
      try {
        const parsed = JSON.parse(data.name);
        if (Array.isArray(parsed.adminPhones)) {
          parsed.adminPhones.forEach((p: string) => {
            const norm = normalizePhoneNumber(p);
            if (norm) adminSet.add(norm);
          });
        }
      } catch (e) {
        console.warn("Could not parse __admin_roles__ payload:", e);
      }
    }
  } catch (err) {
    console.warn("Could not query __admin_roles__ from database:", err);
  }

  return Array.from(adminSet);
}

/**
 * Verify if a phone number or email address has the authorized administrator role.
 */
export async function checkIsAdmin(identifier: string): Promise<boolean> {
  if (!identifier) return false;
  if (identifier.includes("@")) {
    const cleanEmail = identifier.trim().toLowerCase();
    const authorized = await getAuthorizedAdminEmails();
    return authorized.includes(cleanEmail);
  }
  const normalized = normalizePhoneNumber(identifier);
  if (!normalized) return false;
  const authorized = await getAuthorizedAdminPhones();
  return authorized.includes(normalized);
}

/**
 * Specifically verify if an email address has the authorized administrator role.
 */
export async function checkIsAdminEmail(email: string): Promise<boolean> {
  const { valid, normalized } = validateEmail(email);
  if (!valid) return false;
  const authorized = await getAuthorizedAdminEmails();
  return authorized.includes(normalized);
}

/**
 * Send a real Email OTP verification code via Supabase Auth
 */
export async function sendEmailOtp(rawEmail: string): Promise<AuthResponse> {
  const { valid, normalized, error: valError } = validateEmail(rawEmail);
  if (!valid) {
    return { success: false, error: valError };
  }

  try {
    const { data, error } = await supabase.auth.signInWithOtp({
      email: normalized,
      options: {
        shouldCreateUser: true,
      },
    });

    if (error) {
      console.error("[Auth] Supabase signInWithOtp (email) error:", error);

      if (
        error.status === 429 ||
        error.message?.toLowerCase().includes("rate limit") ||
        (error as any).code === "over_email_send_rate_limit"
      ) {
        return {
          success: false,
          error: "Rate limit reached. Supabase limits email dispatches. Please wait 60 seconds before requesting another code.",
        };
      }

      if (
        error.message?.toLowerCase().includes("email provider") ||
        (error as any).code === "email_provider_disabled"
      ) {
        return {
          success: false,
          error:
            "Email authentication provider is disabled in your Supabase project. Enable Email provider in Supabase Dashboard → Authentication → Providers → Email.",
        };
      }

      return {
        success: false,
        error: error.message || "Failed to dispatch verification email. Please try again.",
      };
    }

    return { success: true, user: data?.user, session: data?.session };
  } catch (err: any) {
    console.error("[Auth] Unexpected sendEmailOtp exception:", err);
    return {
      success: false,
      error: err?.message || "Network error while connecting to authentication service.",
    };
  }
}

/**
 * Verify an Email OTP code via Supabase Auth
 */
export async function verifyEmailOtp(rawEmail: string, code: string): Promise<AuthResponse> {
  const { valid, normalized, error: valError } = validateEmail(rawEmail);
  if (!valid) {
    return { success: false, error: valError };
  }

  const cleanCode = (code || "").trim();
  if (!cleanCode || cleanCode.length < 6) {
    return { success: false, error: "Please enter the 6-digit verification code." };
  }

  try {
    const { data, error } = await supabase.auth.verifyOtp({
      email: normalized,
      token: cleanCode,
      type: "email",
    });

    if (error) {
      console.error("[Auth] Supabase verifyOtp (email) error:", error);
      if (
        error.message?.toLowerCase().includes("expired") ||
        error.message?.toLowerCase().includes("invalid") ||
        error.message?.toLowerCase().includes("token") ||
        error.status === 400
      ) {
        return {
          success: false,
          error: "Invalid or expired verification code. Please check your email or request a fresh code.",
        };
      }
      return {
        success: false,
        error: error.message || "Verification failed. Please try again.",
      };
    }

    if (!data?.session && !data?.user) {
      return {
        success: false,
        error: "Verification succeeded but session could not be established. Please try again.",
      };
    }

    return { success: true, user: data.user, session: data.session };
  } catch (err: any) {
    console.error("[Auth] Unexpected verifyEmailOtp exception:", err);
    return {
      success: false,
      error: err?.message || "Network error while verifying OTP.",
    };
  }
}

/**
 * Send a real SMS OTP via Supabase Auth
 */
export async function sendPhoneOtp(rawPhone: string): Promise<AuthResponse> {
  const { valid, normalized, error: valError } = validatePhoneNumber(rawPhone);
  if (!valid) {
    return { success: false, error: valError };
  }

  try {
    const { data, error } = await supabase.auth.signInWithOtp({
      phone: normalized,
    });

    if (error) {
      console.error("[Auth] Supabase signInWithOtp error:", error);

      // Cleanly identify provider configuration issues
      if (
        error.code === "phone_provider_disabled" ||
        error.message?.toLowerCase().includes("unsupported phone provider") ||
        error.message?.toLowerCase().includes("phone provider")
      ) {
        return {
          success: false,
          error:
            "SMS delivery is not enabled on the authentication provider. Please enable the Phone provider (e.g., Twilio or MessageBird) in the Supabase Dashboard under Authentication → Providers → Phone.",
        };
      }

      if (error.status === 429 || error.message?.toLowerCase().includes("rate limit")) {
        return {
          success: false,
          error: "Rate limit reached. Please wait a few moments before requesting another SMS code.",
        };
      }

      return {
        success: false,
        error: error.message || "Failed to dispatch verification SMS. Please try again.",
      };
    }

    return { success: true, user: data?.user, session: data?.session };
  } catch (err: any) {
    console.error("[Auth] Unexpected sendPhoneOtp exception:", err);
    return {
      success: false,
      error: err?.message || "Network error while connecting to authentication service.",
    };
  }
}

/**
 * Verify a received SMS OTP via Supabase Auth
 */
export async function verifyPhoneOtp(rawPhone: string, code: string): Promise<AuthResponse> {
  const { valid, normalized, error: valError } = validatePhoneNumber(rawPhone);
  if (!valid) {
    return { success: false, error: valError };
  }

  const cleanCode = (code || "").trim();
  if (!cleanCode || cleanCode.length < 4) {
    return { success: false, error: "Please enter a valid verification code." };
  }

  try {
    const { data, error } = await supabase.auth.verifyOtp({
      phone: normalized,
      token: cleanCode,
      type: "sms",
    });

    if (error) {
      console.error("[Auth] Supabase verifyOtp error:", error);
      if (
        error.message?.toLowerCase().includes("expired") ||
        error.message?.toLowerCase().includes("invalid") ||
        error.status === 400
      ) {
        return {
          success: false,
          error: "Invalid or expired verification code. Please check the code or request a new one.",
        };
      }
      return {
        success: false,
        error: error.message || "Verification failed. Please try again.",
      };
    }

    if (!data?.session && !data?.user) {
      return {
        success: false,
        error: "Verification succeeded but session could not be established. Please try again.",
      };
    }

    return { success: true, user: data.user, session: data.session };
  } catch (err: any) {
    console.error("[Auth] Unexpected verifyPhoneOtp exception:", err);
    return {
      success: false,
      error: err?.message || "Network error while verifying OTP.",
    };
  }
}

/**
 * Sign out of current Supabase Auth session
 */
export async function signOutAuth(): Promise<void> {
  try {
    await supabase.auth.signOut();
  } catch (err) {
    console.warn("[Auth] signOut error:", err);
  }
}
