import React, { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { motion } from "framer-motion";
import {
  ArrowCounterClockwise, ArrowLeft, CheckCircle, EnvelopeSimple, Eye, EyeSlash,
  Lock, Phone, ShieldCheck, UserCircle, WarningCircle, Sparkle, Key,
} from "@phosphor-icons/react";
import { useGursha } from "../context/GurshaStore";
import { validateEmail } from "../lib/auth";
import { supabase } from "@/integrations/supabase/client";

/* ------------------------------------------------------------------ LOGIN */
export function CustomerLogin() {
  const { session, signInCustomer, resendVerification } = useGursha();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isUnverified, setIsUnverified] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resendStatus, setResendStatus] = useState<string | null>(null);

  // If already logged in, redirect to profile or return url
  useEffect(() => {
    if (session?.verified) {
      const returnUrl = searchParams.get("returnUrl") || "/profile";
      navigate(returnUrl, { replace: true });
    }
  }, [session, navigate, searchParams]);

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setIsUnverified(false);
    setResendStatus(null);

    const { valid, normalized, error: emailErr } = validateEmail(email);
    if (!valid) {
      setErrorMessage(emailErr || "Please enter a valid email address.");
      return;
    }

    if (!password) {
      setErrorMessage("Please enter your password.");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await signInCustomer(normalized, password);
      if (!res.success) {
        if (res.unverified || res.needsEmailVerification) {
          setIsUnverified(true);
          setErrorMessage("Your email address has not been verified yet. Please check your inbox or click below to resend the verification email.");
        } else {
          setErrorMessage(res.error || "Unable to sign in. Please verify your email and password.");
        }
      } else {
        const returnUrl = searchParams.get("returnUrl") || "/profile";
        navigate(returnUrl, { replace: true });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0 || !email) return;
    setResendStatus("Sending...");
    try {
      const res = await resendVerification(email.trim().toLowerCase());
      if (res.success) {
        setResendCooldown(60);
        setResendStatus("Verification email sent! Check your inbox.");
      } else {
        setResendStatus(res.error || "Something went wrong. Please try again later.");
      }
    } catch {
      setResendStatus("Something went wrong. Please try again later.");
    }
  };

  return (
    <div className="mx-auto flex min-h-[75vh] max-w-md flex-col justify-center px-4 py-12 sm:px-6">
      <div className="rounded-3xl border border-stone-200 bg-white p-7 shadow-sm dark:border-white/10 dark:bg-zinc-900 sm:p-9">
        <div className="text-center">
          <Link to="/" className="inline-block">
            <span className="font-display text-2xl font-extrabold text-orange-600">Gursha</span>
          </Link>
          <h1 className="font-display mt-2 text-2xl font-extrabold text-stone-900 dark:text-white">
            Customer Sign In
          </h1>
          <p className="mt-1 text-xs text-stone-500 dark:text-zinc-400">
            Sign in to view your orders, repeat meals, and manage your account.
          </p>
        </div>

        {errorMessage && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            className={`mt-5 flex items-start gap-2.5 rounded-2xl p-3.5 text-xs ${
              isUnverified
                ? "bg-amber-500/10 text-amber-800 dark:text-amber-300 border border-amber-500/20"
                : "bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20"
            }`}
          >
            <WarningCircle size={18} weight="bold" className="mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="leading-relaxed">{errorMessage}</p>
              {isUnverified && (
                <div className="mt-2.5">
                  <button
                    type="button"
                    onClick={handleResend}
                    disabled={resendCooldown > 0}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-[11px] font-bold text-white transition hover:bg-amber-500 disabled:opacity-50"
                  >
                    <EnvelopeSimple size={13} weight="bold" />
                    {resendCooldown > 0 ? `Resend email in ${resendCooldown}s` : "Resend verification email"}
                  </button>
                  {resendStatus && (
                    <p className="mt-1 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
                      {resendStatus}
                    </p>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-stone-400">
              Email Address
            </label>
            <div className="relative mt-1">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="abebe@example.com"
                required
                autoComplete="email"
                className="w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 pl-10 text-sm outline-none transition focus:border-orange-500 dark:border-white/15 dark:bg-white/5 dark:text-zinc-100"
              />
              <EnvelopeSimple
                size={17}
                weight="bold"
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-stone-400">
                Password
              </label>
              <Link
                to="/reset-password"
                className="text-xs font-semibold text-orange-600 transition hover:underline"
              >
                Forgot password?
              </Link>
            </div>
            <div className="relative mt-1">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="current-password"
                className="w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 pl-10 pr-10 text-sm outline-none transition focus:border-orange-500 dark:border-white/15 dark:bg-white/5 dark:text-zinc-100"
              />
              <Lock
                size={17}
                weight="bold"
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400"
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700 dark:hover:text-stone-200"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeSlash size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-orange-600 py-3.5 text-sm font-bold text-white shadow-sm transition hover:bg-orange-500 disabled:opacity-50"
          >
            {isSubmitting ? (
              <>
                <ArrowCounterClockwise size={16} weight="bold" className="animate-spin" />
                <span>Signing in...</span>
              </>
            ) : (
              <span>Sign In</span>
            )}
          </button>
        </form>

        <div className="mt-6 border-t border-stone-200 pt-5 text-center text-xs dark:border-white/10">
          <p className="text-stone-500 dark:text-zinc-400">
            Don't have an account yet?{" "}
            <Link to="/register" className="font-bold text-orange-600 hover:underline">
              Create an account
            </Link>
          </p>
          <div className="mt-3">
            <Link
              to="/menu"
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-stone-400 transition hover:text-stone-600 dark:hover:text-zinc-300"
            >
              <ArrowLeft size={12} weight="bold" /> Or order as a guest without signing in
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ REGISTER */
export function CustomerRegister() {
  const { session, signUpCustomer, resendVerification } = useGursha();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Success state: verification sent
  const [registeredEmail, setRegisteredEmail] = useState<string | null>(null);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(60);
  const [resendMsg, setResendMsg] = useState<string | null>(null);

  useEffect(() => {
    if (session?.verified) {
      navigate("/profile", { replace: true });
    }
  }, [session, navigate]);

  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const { valid, normalized, error: emailErr } = validateEmail(email);
    if (!valid) {
      setErrorMessage(emailErr || "Please enter a valid email address.");
      return;
    }

    if (password.length < 6) {
      setErrorMessage("Password must be at least 6 characters long.");
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage("Passwords do not match. Please re-enter.");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await signUpCustomer(normalized, password, fullName.trim(), phone.trim());
      if (!res.success) {
        setErrorMessage(res.error || "Unable to create account. Please check your details.");
      } else if (res.needsEmailVerification) {
        setRegisteredEmail(normalized);
        setNeedsConfirmation(true);
        setResendCooldown(60);
      } else {
        toast.success("Account created successfully! Welcome to Gursha Cafe.");
        const returnUrl = searchParams.get("returnUrl") || "/profile";
        navigate(returnUrl, { replace: true });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0 || !registeredEmail) return;
    setResendMsg("Sending...");
    try {
      const res = await resendVerification(registeredEmail);
      if (res.success) {
        setResendCooldown(60);
        setResendMsg("Verification email resent! Please check your inbox and spam folder.");
      } else {
        setResendMsg(res.error || "Something went wrong. Please try again later.");
      }
    } catch {
      setResendMsg("Something went wrong. Please try again later.");
    }
  };

  if (registeredEmail) {
    return (
      <div className="mx-auto flex min-h-[75vh] max-w-md flex-col justify-center px-4 py-12 sm:px-6">
        <div className="rounded-3xl border border-stone-200 bg-white p-7 text-center shadow-sm dark:border-white/10 dark:bg-zinc-900 sm:p-9">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-orange-100 text-orange-600 dark:bg-orange-500/20 dark:text-orange-400">
            <EnvelopeSimple size={32} weight="bold" />
          </div>
          <h2 className="font-display mt-4 text-2xl font-extrabold text-stone-900 dark:text-white">
            Verify Your Email
          </h2>
          <p className="mt-2 text-xs leading-relaxed text-stone-500 dark:text-zinc-400">
            We sent a verification link to <strong className="text-stone-800 dark:text-zinc-200">{registeredEmail}</strong>.
            Please open your email and click the confirmation link to complete your registration.
          </p>

          <div className="mt-6 rounded-2xl bg-stone-50 p-4 text-xs text-stone-600 dark:bg-white/5 dark:text-zinc-300">
            <p className="font-bold flex items-center justify-center gap-1.5 text-stone-800 dark:text-zinc-100">
              <Sparkle size={14} weight="bold" className="text-orange-600" /> Account Creation is Optional
            </p>
            <p className="mt-1 text-[11px] text-stone-400">
              You can always continue ordering your favorite dishes without waiting for email verification.
            </p>
          </div>

          <div className="mt-6 space-y-3">
            <button
              type="button"
              onClick={handleResend}
              disabled={resendCooldown > 0}
              className="w-full rounded-full border border-stone-300 py-3 text-xs font-bold text-stone-700 transition hover:bg-stone-50 disabled:opacity-50 dark:border-white/15 dark:text-zinc-200 dark:hover:bg-white/5"
            >
              {resendCooldown > 0
                ? `Resend verification in ${resendCooldown}s`
                : "Resend verification email"}
            </button>
            {resendMsg && (
              <p className="text-xs font-semibold text-orange-600">{resendMsg}</p>
            )}

            <Link
              to="/login"
              className="block w-full rounded-full bg-orange-600 py-3 text-xs font-bold text-white shadow-sm transition hover:bg-orange-500"
            >
              Go to Sign In
            </Link>

            <Link
              to="/menu"
              className="inline-block text-xs font-semibold text-stone-400 hover:text-stone-600 dark:hover:text-zinc-200"
            >
              Continue to Menu as Guest
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-[75vh] max-w-md flex-col justify-center px-4 py-12 sm:px-6">
      <div className="rounded-3xl border border-stone-200 bg-white p-7 shadow-sm dark:border-white/10 dark:bg-zinc-900 sm:p-9">
        <div className="text-center">
          <Link to="/" className="inline-block">
            <span className="font-display text-2xl font-extrabold text-orange-600">Gursha</span>
          </Link>
          <h1 className="font-display mt-2 text-2xl font-extrabold text-stone-900 dark:text-white">
            Create an Account
          </h1>
          <p className="mt-1 text-xs text-stone-500 dark:text-zinc-400">
            Sign up to track orders, save meal preferences, and earn loyalty perks.
          </p>
        </div>

        {errorMessage && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-5 flex items-start gap-2.5 rounded-2xl border border-red-500/20 bg-red-500/10 p-3.5 text-xs text-red-600 dark:text-red-400"
          >
            <WarningCircle size={18} weight="bold" className="mt-0.5 shrink-0" />
            <span className="leading-relaxed">{errorMessage}</span>
          </motion.div>
        )}

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-stone-400">
              Full Name (Optional)
            </label>
            <div className="relative mt-1">
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Abebe Kebede"
                autoComplete="name"
                className="w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 pl-10 text-sm outline-none transition focus:border-orange-500 dark:border-white/15 dark:bg-white/5 dark:text-zinc-100"
              />
              <UserCircle
                size={17}
                weight="bold"
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-stone-400">
              Email Address
            </label>
            <div className="relative mt-1">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="abebe@example.com"
                required
                autoComplete="email"
                className="w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 pl-10 text-sm outline-none transition focus:border-orange-500 dark:border-white/15 dark:bg-white/5 dark:text-zinc-100"
              />
              <EnvelopeSimple
                size={17}
                weight="bold"
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400"
              />
            </div>
            <span className="mt-1 block text-[11px] text-stone-400">
              A verification email will be sent to activate your account.
            </span>
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-stone-400">
              Phone Number (Optional)
            </label>
            <div className="relative mt-1">
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="0911 234 567"
                autoComplete="tel"
                className="w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 pl-10 text-sm outline-none transition focus:border-orange-500 dark:border-white/15 dark:bg-white/5 dark:text-zinc-100"
              />
              <Phone
                size={17}
                weight="bold"
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400"
              />
            </div>
            <span className="mt-1 block text-[11px] text-stone-400">
              Helps connect past guest delivery orders with your account.
            </span>
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-stone-400">
              Password
            </label>
            <div className="relative mt-1">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 6 characters"
                required
                minLength={6}
                autoComplete="new-password"
                className="w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 pl-10 pr-10 text-sm outline-none transition focus:border-orange-500 dark:border-white/15 dark:bg-white/5 dark:text-zinc-100"
              />
              <Lock
                size={17}
                weight="bold"
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400"
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700 dark:hover:text-stone-200"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeSlash size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-stone-400">
              Confirm Password
            </label>
            <div className="relative mt-1">
              <input
                type={showPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter your password"
                required
                minLength={6}
                autoComplete="new-password"
                className="w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 pl-10 text-sm outline-none transition focus:border-orange-500 dark:border-white/15 dark:bg-white/5 dark:text-zinc-100"
              />
              <Lock
                size={17}
                weight="bold"
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-orange-600 py-3.5 text-sm font-bold text-white shadow-sm transition hover:bg-orange-500 disabled:opacity-50"
          >
            {isSubmitting ? (
              <>
                <ArrowCounterClockwise size={16} weight="bold" className="animate-spin" />
                <span>Creating Account...</span>
              </>
            ) : (
              <span>Create Account</span>
            )}
          </button>
        </form>

        <div className="mt-6 border-t border-stone-200 pt-5 text-center text-xs dark:border-white/10">
          <p className="text-stone-500 dark:text-zinc-400">
            Already have an account?{" "}
            <Link to="/login" className="font-bold text-orange-600 hover:underline">
              Sign In
            </Link>
          </p>
          <div className="mt-3">
            <Link
              to="/menu"
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-stone-400 transition hover:text-stone-600 dark:hover:text-zinc-300"
            >
              <ArrowLeft size={12} weight="bold" /> Or order as a guest without an account
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ RESET PASSWORD */
export function CustomerResetPassword() {
  const { requestPasswordReset, verifyPasswordResetOtp, updatePassword } = useGursha();
  const navigate = useNavigate();

  // 3-step state machine: "email" -> "otp" -> "password"
  const [step, setStep] = useState<"email" | "otp" | "password">("email");
  const [email, setEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  // Fallback: If user lands with a legacy recovery hash / event
  useEffect(() => {
    const hash = window.location.hash;
    if (hash.includes("type=recovery") || hash.includes("access_token")) {
      setStep("password");
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setStep("password");
      }
    });

    return () => {
      subscription?.unsubscribe();
    };
  }, []);

  // Cooldown countdown timer for resend
  useEffect(() => {
    if (cooldown > 0) {
      const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [cooldown]);

  // Step 1: Request 6-digit email OTP
  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setStatusMessage(null);

    const { valid, normalized, error: emailErr } = validateEmail(email);
    if (!valid) {
      setErrorMessage(emailErr || "Please enter a valid email address.");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await requestPasswordReset(normalized);
      if (res.success) {
        setEmail(normalized);
        setStep("otp");
        setCooldown(60);
        setStatusMessage("If an account exists for this email address, a 6-digit recovery code has been sent. Please check your inbox and enter the code below.");
      } else {
        setErrorMessage(res.error || "Something went wrong. Please try again later.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Step 2: Resend email OTP with cooldown and rate-limit handling
  const handleResendOtp = async () => {
    if (cooldown > 0 || isSubmitting) return;

    setErrorMessage(null);
    setStatusMessage(null);
    setIsSubmitting(true);

    try {
      const res = await requestPasswordReset(email);
      if (res.success) {
        setCooldown(60);
        setStatusMessage("A new 6-digit recovery code has been sent to your email.");
      } else {
        setErrorMessage(res.error || "Something went wrong. Please try again later.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Step 2: Verify email recovery OTP
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setStatusMessage(null);

    const cleanCode = otpCode.trim().replace(/\D/g, "");
    if (!cleanCode || cleanCode.length < 6) {
      setErrorMessage("Please enter a valid 6-digit verification code.");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await verifyPasswordResetOtp(email, cleanCode);
      if (res.success) {
        setStep("password");
        setErrorMessage(null);
        setStatusMessage("Recovery code verified! Please set your new password below.");
      } else {
        setErrorMessage(res.error || "Invalid or expired verification code. Please check your code or request a new one.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Step 3: Set and update new password
  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setStatusMessage(null);

    if (newPassword.length < 6) {
      setErrorMessage("New password must be at least 6 characters long.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMessage("Passwords do not match.");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await updatePassword(newPassword);
      if (res.success) {
        setStatusMessage("Password updated successfully! Redirecting to sign in...");
        try {
          await supabase.auth.signOut();
        } catch {}
        setTimeout(() => {
          navigate("/login");
        }, 2000);
      } else {
        setErrorMessage(res.error || "Unable to update password. Your recovery session may have expired. Please request a new code.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-[75vh] max-w-md flex-col justify-center px-4 py-12 sm:px-6">
      <div className="rounded-3xl border border-stone-200 bg-white p-7 shadow-sm dark:border-white/10 dark:bg-zinc-900 sm:p-9">
        <div className="text-center">
          <Link to="/" className="inline-block">
            <span className="font-display text-2xl font-extrabold text-orange-600">Gursha</span>
          </Link>
          <h1 className="font-display mt-2 text-2xl font-extrabold text-stone-900 dark:text-white">
            {step === "email" && "Forgot Password"}
            {step === "otp" && "Enter Recovery Code"}
            {step === "password" && "Set New Password"}
          </h1>
          <p className="mt-1 text-xs text-stone-500 dark:text-zinc-400">
            {step === "email" && "Enter your registered email address to receive a 6-digit recovery code."}
            {step === "otp" && `Enter the 6-digit recovery code sent to ${email}`}
            {step === "password" && "Choose a secure new password for your Gursha Cafe account."}
          </p>
        </div>

        {errorMessage && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-5 flex items-start gap-2.5 rounded-2xl border border-red-500/20 bg-red-500/10 p-3.5 text-xs text-red-600 dark:text-red-400"
          >
            <WarningCircle size={18} weight="bold" className="mt-0.5 shrink-0" />
            <span className="leading-relaxed">{errorMessage}</span>
          </motion.div>
        )}

        {statusMessage && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-5 flex items-start gap-2.5 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-3.5 text-xs text-emerald-700 dark:text-emerald-400"
          >
            <CheckCircle size={18} weight="bold" className="mt-0.5 shrink-0" />
            <span className="leading-relaxed">{statusMessage}</span>
          </motion.div>
        )}

        {/* STEP 1: ENTER EMAIL TO REQUEST RECOVERY OTP */}
        {step === "email" && (
          <form onSubmit={handleRequestOtp} className="mt-6 space-y-4">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-stone-400">
                Email Address
              </label>
              <div className="relative mt-1">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="abebe@example.com"
                  required
                  autoFocus
                  autoComplete="email"
                  className="w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 pl-10 text-sm outline-none transition focus:border-orange-500 dark:border-white/15 dark:bg-white/5 dark:text-zinc-100"
                />
                <EnvelopeSimple
                  size={17}
                  weight="bold"
                  className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-orange-600 py-3.5 text-sm font-bold text-white shadow-sm transition hover:bg-orange-500 disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <ArrowCounterClockwise size={16} weight="bold" className="animate-spin" />
                  <span>Sending Recovery Code...</span>
                </>
              ) : (
                <span>Send Recovery Code</span>
              )}
            </button>
          </form>
        )}

        {/* STEP 2: DEDICATED OTP-ENTRY SCREEN */}
        {step === "otp" && (
          <form onSubmit={handleVerifyOtp} className="mt-6 space-y-4">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-stone-400">
                6-Digit Recovery Code
              </label>
              <div className="relative mt-1">
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={otpCode}
                  onChange={(e) => {
                    const clean = e.target.value.replace(/\D/g, "").slice(0, 6);
                    setOtpCode(clean);
                  }}
                  placeholder="••••••"
                  required
                  autoFocus
                  className="w-full rounded-2xl border border-stone-300 bg-white px-4 py-3.5 pl-10 text-center font-mono text-2xl font-bold tracking-[0.4em] outline-none transition focus:border-orange-500 dark:border-white/15 dark:bg-white/5 dark:text-zinc-100"
                />
                <Key
                  size={17}
                  weight="bold"
                  className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400"
                />
              </div>
              <p className="mt-1.5 text-center text-[11px] text-stone-400 dark:text-zinc-500">
                Enter the numeric code sent to your email inbox or spam folder.
              </p>
            </div>

            <button
              type="submit"
              disabled={isSubmitting || otpCode.trim().length < 6}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-orange-600 py-3.5 text-sm font-bold text-white shadow-sm transition hover:bg-orange-500 disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <ArrowCounterClockwise size={16} weight="bold" className="animate-spin" />
                  <span>Verifying Code...</span>
                </>
              ) : (
                <span>Verify Recovery Code</span>
              )}
            </button>

            <div className="mt-4 flex flex-col items-center gap-2 text-center text-xs">
              {cooldown > 0 ? (
                <span className="text-stone-400 dark:text-zinc-500">
                  Resend code in <strong className="font-semibold text-stone-600 dark:text-zinc-300">{cooldown}s</strong>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={handleResendOtp}
                  disabled={isSubmitting}
                  className="font-bold text-orange-600 hover:underline disabled:opacity-50"
                >
                  Didn't receive code? Resend Code
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  setStep("email");
                  setOtpCode("");
                  setErrorMessage(null);
                  setStatusMessage(null);
                }}
                className="mt-1 text-xs text-stone-400 hover:text-stone-600 dark:text-zinc-500 dark:hover:text-zinc-300"
              >
                Use a different email address
              </button>
            </div>
          </form>
        )}

        {/* STEP 3: SET NEW PASSWORD (ONLY AFTER SUCCESSFUL OTP VERIFICATION) */}
        {step === "password" && (
          <form onSubmit={handleUpdatePassword} className="mt-6 space-y-4">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-stone-400">
                New Password
              </label>
              <div className="relative mt-1">
                <input
                  type={showNewPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  required
                  minLength={6}
                  autoComplete="new-password"
                  className="w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 pl-10 pr-10 text-sm outline-none transition focus:border-orange-500 dark:border-white/15 dark:bg-white/5 dark:text-zinc-100"
                />
                <Lock
                  size={17}
                  weight="bold"
                  className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword((s) => !s)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700 dark:hover:text-stone-200"
                  aria-label={showNewPassword ? "Hide password" : "Show password"}
                >
                  {showNewPassword ? <EyeSlash size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-stone-400">
                Confirm New Password
              </label>
              <div className="relative mt-1">
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter new password"
                  required
                  minLength={6}
                  autoComplete="new-password"
                  className="w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 pl-10 pr-10 text-sm outline-none transition focus:border-orange-500 dark:border-white/15 dark:bg-white/5 dark:text-zinc-100"
                />
                <Lock
                  size={17}
                  weight="bold"
                  className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((s) => !s)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700 dark:hover:text-stone-200"
                  aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                >
                  {showConfirmPassword ? <EyeSlash size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-orange-600 py-3.5 text-sm font-bold text-white shadow-sm transition hover:bg-orange-500 disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <ArrowCounterClockwise size={16} weight="bold" className="animate-spin" />
                  <span>Updating Password...</span>
                </>
              ) : (
                <span>Update Password</span>
              )}
            </button>
          </form>
        )}

        <div className="mt-6 border-t border-stone-200 pt-5 text-center text-xs dark:border-white/10">
          <Link to="/login" className="font-bold text-orange-600 hover:underline">
            Back to Sign In
          </Link>
        </div>
      </div>
    </div>
  );
}
