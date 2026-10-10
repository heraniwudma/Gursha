/**
 * Phone number normalization and validation for Gursha Cafe
 * Primary market: Ethiopia (+251), with full international E.164 support.
 */

export function normalizePhoneNumber(raw: string): string {
  if (!raw) return "";
  // Strip whitespace, hyphens, parentheses, and dots
  const cleaned = raw.trim().replace(/[\s\-().]/g, "");

  // If already starts with '+', validate and return
  if (cleaned.startsWith("+")) {
    return cleaned;
  }

  // Domestic Ethiopian number starting with 09 or 07 (e.g. 0911223344 or 0711223344)
  if (/^0[79]\d{8}$/.test(cleaned)) {
    return `+251${cleaned.slice(1)}`;
  }

  // 9-digit Ethiopian number starting with 9 or 7 (e.g. 911223344)
  if (/^[79]\d{8}$/.test(cleaned)) {
    return `+251${cleaned}`;
  }

  // Number starting with country code without plus (e.g. 251911223344)
  if (/^251[79]\d{8}$/.test(cleaned)) {
    return `+${cleaned}`;
  }

  // General fallback: if all digits, prepend '+'
  if (/^\d{8,15}$/.test(cleaned)) {
    return `+${cleaned}`;
  }

  return cleaned;
}

export function validatePhoneNumber(raw: string): { valid: boolean; normalized: string; error?: string } {
  const trimmed = (raw || "").trim();
  if (!trimmed) {
    return { valid: false, normalized: "", error: "Phone number is required." };
  }

  const normalized = normalizePhoneNumber(trimmed);

  // E.164 pattern: '+' followed by 8 to 15 digits
  const e164Regex = /^\+[1-9]\d{7,14}$/;
  if (!e164Regex.test(normalized)) {
    return {
      valid: false,
      normalized,
      error: "Please enter a valid phone number (e.g., 0911 234 567 or +251 911 234 567).",
    };
  }

  return { valid: true, normalized };
}

export function formatPhoneDisplay(raw: string): string {
  const norm = normalizePhoneNumber(raw);
  if (norm.startsWith("+251") && norm.length === 13) {
    // Format: +251 91 123 4567
    return `${norm.slice(0, 4)} ${norm.slice(4, 6)} ${norm.slice(6, 9)} ${norm.slice(9)}`;
  }
  return norm || raw;
}
