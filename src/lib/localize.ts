import type { Lang, MenuItem } from "../types";
import { TRANSLATIONS } from "../data/translations";

/**
 * Returns the localized name of a menu item for the given language.
 * Falls back safely to English name if the translation is missing or empty.
 */
export function getLocalizedDishName(m: MenuItem | null | undefined, lang: Lang): string {
  if (!m) return "";
  if (lang === "am") {
    return (m.nameAm && m.nameAm.trim()) || m.name || "";
  }
  if (lang === "sid") {
    return (m.nameSid && m.nameSid.trim()) || m.name || "";
  }
  return m.name || "";
}

/**
 * Returns the localized description of a menu item for the given language.
 * Falls back safely to English description if the translation is missing or empty.
 */
export function getLocalizedDishDesc(m: MenuItem | null | undefined, lang: Lang): string {
  if (!m) return "";
  if (lang === "am") {
    return (m.descAm && m.descAm.trim()) || (m.desc && m.desc.trim()) || "";
  }
  if (lang === "sid") {
    return (m.descSid && m.descSid.trim()) || (m.desc && m.desc.trim()) || "";
  }
  return (m.desc && m.desc.trim()) || "";
}

/**
 * Analyzes a menu item and returns which language translations are missing.
 * Used in the admin menu editor and tables to highlight missing fields for admin review.
 */
export function getMissingDishTranslations(m: MenuItem): {
  missingCount: number;
  missingLabels: string[];
  isComplete: boolean;
  hasAmharic: boolean;
  hasSidama: boolean;
} {
  const missingLabels: string[] = [];
  const hasAmName = Boolean(m.nameAm && m.nameAm.trim() && m.nameAm.trim() !== m.name.trim());
  const hasAmDesc = Boolean(m.descAm && m.descAm.trim());
  const hasSidName = Boolean(m.nameSid && m.nameSid.trim() && m.nameSid.trim() !== m.name.trim());
  const hasSidDesc = Boolean(m.descSid && m.descSid.trim());

  if (!hasAmName) missingLabels.push("Amharic Name");
  if (!hasAmDesc) missingLabels.push("Amharic Description");
  if (!hasSidName) missingLabels.push("Sidama Name");
  if (!hasSidDesc) missingLabels.push("Sidama Description");

  return {
    missingCount: missingLabels.length,
    missingLabels,
    isComplete: missingLabels.length === 0,
    hasAmharic: Boolean(hasAmName || hasAmDesc),
    hasSidama: Boolean(hasSidName || hasSidDesc),
  };
}

/**
 * Compares dictionary keys between English and another language.
 * Identifies keys present in English but missing in target language.
 */
export function getMissingDictionaryKeys(lang: Lang): string[] {
  if (lang === "en") return [];
  const enKeys = Object.keys(TRANSLATIONS.en);
  const targetDict = TRANSLATIONS[lang] || {};
  return enKeys.filter((k) => !targetDict[k] || targetDict[k].trim() === "");
}
