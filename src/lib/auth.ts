import { supabase } from "./supabase";
import { normalizePhoneNumber, validatePhoneNumber } from "./phone";

export interface AuthResponse {
  success: boolean;
  error?: string;
  user?: any;
  session?: any;
  needsEmailVerification?: boolean;
  unverified?: boolean;
}

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
 * Validates password strength
 */
export function validatePassword(password: string): { valid: boolean; error?: string } {
  if (!password || typeof password !== "string") {
    return { valid: false, error: "Please enter a password." };
  }
  if (password.length < 6) {
    return { valid: false, error: "Password must be at least 6 characters long." };
  }
  return { valid: true };
}

/**
 * Check if the currently authenticated Supabase session belongs to an authorized admin.
 * Exclusively enforced by database-backed authorization:
 * 1. Postgres security-definer function `public.is_admin()`
 * 2. Database table `public.admin_users`
 * 3. Authenticated JWT app_metadata role claim
 */
export async function verifyCurrentUserIsAdmin(userOrUserId?: any): Promise<boolean> {
  try {
    let targetUid: string | null = null;
    let currentUser: any = null;

    if (typeof userOrUserId === "string") {
      targetUid = userOrUserId;
    } else if (userOrUserId?.id) {
      targetUid = userOrUserId.id;
      currentUser = userOrUserId;
    } else {
      const { data: { session } } = await supabase.auth.getSession();
      targetUid = session?.user?.id || null;
      currentUser = session?.user || null;
    }

    if (!targetUid) return false;

    // 1. Check custom claim / app_metadata
    if (currentUser?.app_metadata?.role === "admin") {
      return true;
    }

    // 2. Query Postgres database function (security definer `is_admin()`)
    try {
      const { data: isDbAdmin, error: rpcErr } = await (supabase.rpc as any)("is_admin");
      if (!rpcErr && typeof isDbAdmin === "boolean" && isDbAdmin) {
        return true;
      }
    } catch {
      // RPC error
    }

    // 3. Query public.admin_users table in database (scoped by RLS to own row or admin)
    try {
      const { data: adminRow, error: adminErr } = await supabase
        .from("admin_users")
        .select("user_id")
        .eq("user_id", targetUid)
        .maybeSingle();

      if (!adminErr && adminRow?.user_id) {
        return true;
      }
    } catch {
      // table check failed
    }

    return false;
  } catch (err) {
    console.warn("[Auth] verifyCurrentUserIsAdmin check failed:", err);
    return false;
  }
}

/**
 * Verify if an email address is registered as an authorized administrator in the database.
 * Uses secure database RPC for pre-auth verification and session checks when authenticated.
 */
export async function checkIsAdminEmail(email: string): Promise<boolean> {
  const { valid, normalized } = validateEmail(email);
  if (!valid) return false;

  // 1. Try secure database function check_is_admin_email (SECURITY DEFINER for pre-auth verification)
  try {
    const { data, error } = await supabase.rpc("check_is_admin_email", {
      p_email: normalized,
    });
    if (!error && typeof data === "boolean") {
      return data;
    }
  } catch {}

  // 2. If user already has an active session matching this email, verify via user ID
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user && session.user.email?.toLowerCase() === normalized) {
      return await verifyCurrentUserIsAdmin(session.user);
    }
  } catch {}

  return false;
}

/**
 * Verify if an identifier (email or phone) is an authorized administrator.
 * Only verified credentials backed by the database are permitted.
 */
export async function checkIsAdmin(identifier: string): Promise<boolean> {
  if (!identifier) return false;
  if (identifier.includes("@")) {
    return checkIsAdminEmail(identifier);
  }
  // For phone numbers, verify against current authenticated session if available
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      return await verifyCurrentUserIsAdmin(session.user);
    }
  } catch {}
  return false;
}

/* ==============================================================================
   CUSTOMER AUTHENTICATION: SIGN UP, EMAIL VERIFICATION, SIGN IN & PASSWORD RESET
   ============================================================================== */

export const GENERIC_EMAIL_ERROR = "Something went wrong. Please try again later.";

/**
 * Detect known rate-limit, SMTP, or upstream provider errors without exposing raw internals to user
 */
export function isEmailDeliveryOrRateLimitError(error: any): boolean {
  if (!error) return false;
  const status = error.status || error.statusCode;
  const code = (error.code || "").toString().toLowerCase();
  const msg = (error.message || "").toLowerCase();

  if (status === 429 || status >= 500) return true;
  if (
    code === "over_email_send_rate_limit" ||
    code === "over_request_rate_limit" ||
    code === "email_provider_disabled" ||
    code === "smtp_error"
  ) {
    return true;
  }
  if (
    msg.includes("rate limit") ||
    msg.includes("too many requests") ||
    msg.includes("over_email_send_rate_limit") ||
    msg.includes("smtp") ||
    msg.includes("email provider") ||
    msg.includes("error sending confirmation email") ||
    msg.includes("error sending") ||
    msg.includes("brevo") ||
    msg.includes("mailgun") ||
    msg.includes("resend") ||
    msg.includes("gateway")
  ) {
    return true;
  }
  return false;
}

/**
 * Register a new customer with Email and Password.
 * Supports email verification via Supabase and Brevo SMTP.
 */
export async function signUpCustomer(
  rawEmail: string,
  rawPassword: string,
  fullName: string,
  phone?: string
): Promise<AuthResponse> {
  const { valid: emailValid, normalized: email, error: emailError } = validateEmail(rawEmail);
  if (!emailValid) {
    return { success: false, error: emailError };
  }

  const { valid: pwValid, error: pwError } = validatePassword(rawPassword);
  if (!pwValid) {
    return { success: false, error: pwError };
  }

  const cleanName = (fullName || "").trim() || "Customer";
  const cleanPhone = phone ? normalizePhoneNumber(phone) : "";

  try {
    const redirectUrl = typeof window !== "undefined" ? `${window.location.origin}/login` : undefined;

    const { data, error } = await supabase.auth.signUp({
      email,
      password: rawPassword,
      options: {
        data: {
          full_name: cleanName,
          phone: cleanPhone,
        },
        emailRedirectTo: redirectUrl,
      },
    });

    if (error) {
      console.error("[Auth] Customer registration error:", {
        status: error.status,
        code: (error as any).code,
        message: error.message,
      });

      if (error.message?.toLowerCase().includes("user already registered")) {
        return {
          success: false,
          error: "An account with this email address already exists. Please sign in instead.",
        };
      }

      if (isEmailDeliveryOrRateLimitError(error)) {
        return {
          success: false,
          error: GENERIC_EMAIL_ERROR,
        };
      }

      return {
        success: false,
        error: GENERIC_EMAIL_ERROR,
      };
    }

    // Check if email verification is required (email_confirmed_at is null)
    const needsEmailVerification = !data?.user?.email_confirmed_at;

    return {
      success: true,
      user: data?.user,
      session: data?.session,
      needsEmailVerification,
    };
  } catch (err: any) {
    console.error("[Auth] Unexpected signUpCustomer error:", err);
    return {
      success: false,
      error: GENERIC_EMAIL_ERROR,
    };
  }
}

/**
 * Resend verification email to a customer
 */
export async function resendVerificationEmail(rawEmail: string): Promise<AuthResponse> {
  const { valid, normalized, error: emailError } = validateEmail(rawEmail);
  if (!valid) {
    return { success: false, error: emailError };
  }

  try {
    const redirectUrl = typeof window !== "undefined" ? `${window.location.origin}/login` : undefined;
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: normalized,
      options: {
        emailRedirectTo: redirectUrl,
      },
    });

    if (error) {
      console.error("[Auth] Resend verification error:", {
        status: error.status,
        code: (error as any).code,
        message: error.message,
      });

      return {
        success: false,
        error: GENERIC_EMAIL_ERROR,
      };
    }

    return { success: true };
  } catch (err: any) {
    console.error("[Auth] Unexpected resendVerification error:", err);
    return {
      success: false,
      error: GENERIC_EMAIL_ERROR,
    };
  }
}

/**
 * Sign in registered customer using Email and Password
 */
export async function signInCustomer(rawEmail: string, rawPassword: string): Promise<AuthResponse> {
  const { valid: emailValid, normalized: email, error: emailError } = validateEmail(rawEmail);
  if (!emailValid) {
    return { success: false, error: emailError };
  }

  if (!rawPassword) {
    return { success: false, error: "Please enter your password." };
  }

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password: rawPassword,
    });

    if (error) {
      console.error("[Auth] Customer sign in error:", {
        status: error.status,
        code: (error as any).code,
        message: error.message,
      });

      if (
        error.message?.toLowerCase().includes("email not confirmed") ||
        error.message?.toLowerCase().includes("email address is not verified") ||
        (error as any).code === "email_not_confirmed"
      ) {
        return {
          success: false,
          unverified: true,
          error: "Your email address has not been verified yet. Please check your inbox or click below to resend the verification email.",
        };
      }

      if (
        error.message?.toLowerCase().includes("invalid login credentials") ||
        error.message?.toLowerCase().includes("invalid credentials")
      ) {
        return {
          success: false,
          error: "Incorrect email address or password. Please try again.",
        };
      }

      if (isEmailDeliveryOrRateLimitError(error)) {
        return {
          success: false,
          error: GENERIC_EMAIL_ERROR,
        };
      }

      return {
        success: false,
        error: "Unable to sign in. Please verify your email and password.",
      };
    }

    // Check if user email is verified
    if (data?.user && !data.user.email_confirmed_at) {
      // Prevent unverified sessions from persisting
      await supabase.auth.signOut();
      return {
        success: false,
        unverified: true,
        error: "Your email address has not been verified yet. Please check your inbox or click below to resend the verification email.",
      };
    }

    return {
      success: true,
      user: data?.user,
      session: data?.session,
    };
  } catch (err: any) {
    console.error("[Auth] Unexpected signInCustomer error:", err);
    return {
      success: false,
      error: "Something went wrong. Please try again later.",
    };
  }
}

/**
 * Send password reset email with 6-digit recovery OTP to customer
 */
export async function requestPasswordReset(rawEmail: string): Promise<AuthResponse> {
  const { valid, normalized: email, error: emailError } = validateEmail(rawEmail);
  if (!valid) {
    return { success: false, error: emailError };
  }

  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email);

    if (error) {
      console.error("[Auth] Password reset request error:", {
        status: error.status,
        code: (error as any).code,
        message: error.message,
      });

      return {
        success: false,
        error: GENERIC_EMAIL_ERROR,
      };
    }

    return { success: true };
  } catch (err: any) {
    console.error("[Auth] Unexpected requestPasswordReset error:", err);
    return {
      success: false,
      error: GENERIC_EMAIL_ERROR,
    };
  }
}

/**
 * Verify customer recovery OTP using Supabase Auth recovery type
 */
export async function verifyPasswordResetOtp(rawEmail: string, rawCode: string): Promise<AuthResponse> {
  const { valid, normalized: email, error: emailError } = validateEmail(rawEmail);
  if (!valid) {
    return { success: false, error: emailError };
  }

  const cleanCode = rawCode.trim().replace(/\D/g, "");
  if (!cleanCode || cleanCode.length < 6) {
    return { success: false, error: "Please enter a valid 6-digit recovery code." };
  }

  try {
    const { data, error } = await supabase.auth.verifyOtp({
      email,
      token: cleanCode,
      type: "recovery",
    });

    if (error) {
      console.error("[Auth] Password reset OTP verification error:", {
        status: error.status,
        code: (error as any).code,
        message: error.message,
      });

      if (isEmailDeliveryOrRateLimitError(error)) {
        return {
          success: false,
          error: GENERIC_EMAIL_ERROR,
        };
      }

      return {
        success: false,
        error: "Invalid or expired verification code. Please check your code or request a new one.",
      };
    }

    return {
      success: true,
      user: data?.user,
      session: data?.session,
    };
  } catch (err: any) {
    console.error("[Auth] Unexpected verifyPasswordResetOtp error:", err);
    return {
      success: false,
      error: GENERIC_EMAIL_ERROR,
    };
  }
}

/**
 * Update authenticated user's password (used in password reset flow)
 */
export async function updateUserPassword(newPassword: string): Promise<AuthResponse> {
  const { valid, error: pwError } = validatePassword(newPassword);
  if (!valid) {
    return { success: false, error: pwError };
  }

  try {
    const { data, error } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (error) {
      console.error("[Auth] Update password error:", {
        status: error.status,
        code: (error as any).code,
        message: error.message,
      });

      if (isEmailDeliveryOrRateLimitError(error)) {
        return {
          success: false,
          error: GENERIC_EMAIL_ERROR,
        };
      }

      return {
        success: false,
        error: "Unable to update password. Your recovery session may have expired. Please request a new code.",
      };
    }

    return {
      success: true,
      user: data?.user,
    };
  } catch (err: any) {
    console.error("[Auth] Unexpected updateUserPassword error:", err);
    return {
      success: false,
      error: "Something went wrong. Please try again later.",
    };
  }
}

/* ==============================================================================
   ADMIN AUTHENTICATION: SECURE EMAIL & PASSWORD SIGN-IN
   ============================================================================== */

/**
 * Sign in administrator using Email and Password with strict server-side authorization check.
 * If credentials are valid but user is NOT an authorized administrator, session is destroyed
 * immediately and access is strictly denied.
 */
export async function signInAdmin(rawEmail: string, rawPassword: string): Promise<AuthResponse> {
  const { valid: emailValid, normalized: email, error: emailError } = validateEmail(rawEmail);
  if (!emailValid) {
    return { success: false, error: emailError };
  }

  if (!rawPassword) {
    return { success: false, error: "Please enter your administrator password." };
  }

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password: rawPassword,
    });

    if (error) {
      console.warn("[Auth] Admin signInWithPassword failed:", error.message);
      const msg = error.message?.toLowerCase() || "";

      // 1. Invalid email or password (GoTrue 400)
      if (
        msg.includes("invalid login credentials") ||
        msg.includes("invalid credentials") ||
        msg.includes("invalid grant")
      ) {
        return {
          success: false,
          error: "Incorrect email or password. Please verify your administrator credentials.",
        };
      }

      // 2. Email not confirmed
      if (
        msg.includes("email not confirmed") ||
        msg.includes("email address is not verified") ||
        (error as any).code === "email_not_confirmed"
      ) {
        return {
          success: false,
          error: "Your administrator email address has not been confirmed. Please check your inbox for verification.",
        };
      }

      // 3. Rate limiting / too many attempts
      if (
        error.status === 429 ||
        msg.includes("rate limit") ||
        msg.includes("too many requests")
      ) {
        return {
          success: false,
          error: "Too many sign-in attempts. Please wait a few moments and try again.",
        };
      }

      // 4. Network or connectivity errors
      if (
        msg.includes("fetch") ||
        msg.includes("network") ||
        msg.includes("timeout") ||
        msg.includes("failed to fetch")
      ) {
        return {
          success: false,
          error: "Network error connecting to authentication service. Please check your connection.",
        };
      }

      return {
        success: false,
        error: error.message || "Failed to authenticate administrator.",
      };
    }

    if (!data?.user) {
      return {
        success: false,
        error: "Authentication succeeded but no user profile was returned.",
      };
    }

    // STRICT ROLE CHECK: Verify that the authenticated user is an authorized admin in public.admin_users
    let isAdmin = false;
    try {
      isAdmin = await verifyCurrentUserIsAdmin(data.user);
    } catch (checkErr: any) {
      console.error("[Auth] Database error during admin authorization check:", checkErr);
      await supabase.auth.signOut();
      return {
        success: false,
        error: "Database error while verifying administrator authorization. Please try again.",
      };
    }

    if (!isAdmin) {
      // Immediately sign out to prevent unauthorized session persistence
      await supabase.auth.signOut();
      return {
        success: false,
        error: "Access Denied: Account authenticated successfully, but this account is not registered as an authorized administrator in public.admin_users.",
      };
    }

    return {
      success: true,
      user: data.user,
      session: data.session,
    };
  } catch (err: any) {
    console.error("[Auth] Unexpected signInAdmin exception:", err);
    return {
      success: false,
      error: err?.message || "Network error while verifying administrator credentials.",
    };
  }
}

/**
 * Changes administrator password securely:
 * 1. Checks active authenticated session
 * 2. Checks database administrator authorization (verifyCurrentUserIsAdmin)
 * 3. Validates required fields, password length, confirmation match, and non-identical new password
 * 4. Re-authenticates the current user using existing email and entered current password
 * 5. Updates user password via supabase.auth.updateUser
 * 6. Preserves admin privileges and active session without logging credentials
 */
export async function changeAdminPassword(
  currentPassword: string,
  newPassword: string,
  confirmPassword: string
): Promise<AuthResponse> {
  if (!currentPassword) {
    return { success: false, error: "Please enter your current password." };
  }

  const { valid: pwValid, error: pwError } = validatePassword(newPassword);
  if (!pwValid) {
    return { success: false, error: pwError };
  }

  if (newPassword !== confirmPassword) {
    return { success: false, error: "New password and confirmation do not match." };
  }

  if (newPassword === currentPassword) {
    return { success: false, error: "New password must be different from your current password." };
  }

  try {
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
    const email = user?.email;

    if (!user || !email) {
      return {
        success: false,
        error: "Authentication required. Please sign in as an administrator first.",
      };
    }

    const isAdmin = await verifyCurrentUserIsAdmin(user);
    if (!isAdmin) {
      return {
        success: false,
        error: "Access denied: This account is not authorized as an administrator.",
      };
    }

    // Re-authenticate current administrator with current password
    const { error: reauthError } = await supabase.auth.signInWithPassword({
      email,
      password: currentPassword,
    });

    if (reauthError) {
      console.warn("[Auth] Admin re-authentication failed for password change:", reauthError.message);
      return {
        success: false,
        error: "Current password is incorrect. Please verify and try again.",
      };
    }

    // Apply new password to the authenticated user
    const { data: updateData, error: updateError } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (updateError) {
      console.error("[Auth] Admin updateUser password failed:", updateError.message);
      return {
        success: false,
        error: "Unable to update password. Please try again later.",
      };
    }

    return {
      success: true,
      user: updateData?.user,
    };
  } catch (err: any) {
    console.error("[Auth] Unexpected changeAdminPassword exception:", err);
    return {
      success: false,
      error: "An unexpected error occurred while changing your password.",
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

/* ==============================================================================
   BACKWARD-COMPATIBLE OTP METHODS (for existing phone / email OTP flows)
   ============================================================================== */

export async function sendEmailOtp(rawEmail: string): Promise<AuthResponse> {
  const { valid, normalized, error: valError } = validateEmail(rawEmail);
  if (!valid) return { success: false, error: valError };

  try {
    const { data, error } = await supabase.auth.signInWithOtp({
      email: normalized,
      options: { shouldCreateUser: true },
    });
    if (error) {
      if (error.status === 429 || error.message?.toLowerCase().includes("rate limit")) {
        return { success: false, error: "Rate limit reached. Please wait 60 seconds before requesting another code." };
      }
      return { success: false, error: error.message || "Failed to dispatch verification email." };
    }
    return { success: true, user: data?.user, session: data?.session };
  } catch (err: any) {
    return { success: false, error: err?.message || "Network error." };
  }
}

export async function verifyEmailOtp(rawEmail: string, code: string): Promise<AuthResponse> {
  const { valid, normalized, error: valError } = validateEmail(rawEmail);
  if (!valid) return { success: false, error: valError };
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
      return { success: false, error: "Invalid or expired verification code." };
    }
    return { success: true, user: data?.user, session: data?.session };
  } catch (err: any) {
    return { success: false, error: err?.message || "Network error." };
  }
}

export async function sendPhoneOtp(rawPhone: string): Promise<AuthResponse> {
  const { valid, normalized, error: valError } = validatePhoneNumber(rawPhone);
  if (!valid) return { success: false, error: valError };

  try {
    const { data, error } = await supabase.auth.signInWithOtp({ phone: normalized });
    if (error) {
      if (error.code === "phone_provider_disabled" || error.message?.toLowerCase().includes("phone provider")) {
        return {
          success: false,
          error: "SMS delivery is not configured on the authentication provider. Please use email sign-in or guest checkout.",
        };
      }
      return { success: false, error: error.message || "Failed to dispatch verification SMS." };
    }
    return { success: true, user: data?.user, session: data?.session };
  } catch (err: any) {
    return { success: false, error: err?.message || "Network error." };
  }
}

export async function verifyPhoneOtp(rawPhone: string, code: string): Promise<AuthResponse> {
  const { valid, normalized, error: valError } = validatePhoneNumber(rawPhone);
  if (!valid) return { success: false, error: valError };
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
      return { success: false, error: "Invalid or expired verification code." };
    }
    return { success: true, user: data?.user, session: data?.session };
  } catch (err: any) {
    return { success: false, error: err?.message || "Network error." };
  }
}
