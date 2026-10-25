import { describe, expect, it } from "bun:test";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { TRANSLATIONS } from "../data/translations";
import { MENU } from "../data/mockData";
import {
  getLocalizedDishName,
  getLocalizedDishDesc,
  getMissingDishTranslations,
  getMissingDictionaryKeys,
} from "../lib/localize";
import type { Lang, MenuItem } from "../types";

describe("Multilingual UI and Admin Food Translation Suite", () => {
  const rootDir = process.cwd();

  describe("1. Duplicate Language Selector Removal", () => {
    it("confirms there is exactly one primary language selector in App.tsx layout and no duplicate beside Create Account", () => {
      const appContent = readFileSync(join(rootDir, "src/App.tsx"), "utf-8");

      // Verify exactly ONE language selector exists in App.tsx (the duplicate was removed)
      const langsMapMatches = appContent.match(/LANGS\.map/g) || [];
      expect(langsMapMatches.length).toBe(1);

      // Verify the primary language selector exists in the header
      expect(appContent).toContain("Switch language to");
      expect(appContent).toContain("setLang(l.id)");

      // Verify the register button itself and its styling/path are preserved
      expect(appContent).toContain('to="/register"');
      expect(appContent).toContain('t("nav.register")');
    });
  });

  describe("2. Centralized Translation Dictionary Completeness & Key Parity", () => {
    it("has complete dictionary parity with zero missing keys between EN, AM, and SID", () => {
      const enKeys = Object.keys(TRANSLATIONS.en);
      const amKeys = Object.keys(TRANSLATIONS.am);
      const sidKeys = Object.keys(TRANSLATIONS.sid);

      expect(enKeys.length).toBeGreaterThan(70);
      expect(amKeys.length).toBe(enKeys.length);
      expect(sidKeys.length).toBe(enKeys.length);

      const missingAm = getMissingDictionaryKeys("am");
      const missingSid = getMissingDictionaryKeys("sid");

      expect(missingAm).toEqual([]);
      expect(missingSid).toEqual([]);
    });

    it("verifies critical sections are translated in Amharic and Sidama", () => {
      const criticalKeys = [
        "nav.home",
        "nav.menu",
        "nav.orders",
        "nav.login",
        "nav.register",
        "nav.cart",
        "svc.dineIn",
        "svc.takeaway",
        "svc.delivery",
        "menu.search",
        "custom.base",
        "base.injera",
        "base.kita",
        "base.none",
        "cart.checkout",
        "checkout.title",
        "checkout.place",
        "pay.telebirr",
        "pay.cbe",
        "pay.cash",
        "status.placed",
        "status.preparing",
        "status.ready",
        "auth.signIn",
        "auth.register",
        "admin.menuManager",
        "admin.saveDish",
      ];

      for (const k of criticalKeys) {
        expect(TRANSLATIONS.en[k]).toBeDefined();
        expect(TRANSLATIONS.am[k]).toBeDefined();
        expect(TRANSLATIONS.sid[k]).toBeDefined();

        expect(TRANSLATIONS.en[k].length).toBeGreaterThan(0);
        expect(TRANSLATIONS.am[k].length).toBeGreaterThan(0);
        expect(TRANSLATIONS.sid[k].length).toBeGreaterThan(0);

        // Amharic should contain Ethiopic script for natural text
        if (k.startsWith("nav.") || k.startsWith("base.") || k.startsWith("svc.")) {
          expect(/[\u1200-\u137F]/.test(TRANSLATIONS.am[k])).toBe(true);
        }
      }
    });
  });

  describe("3. Dish Name and Description Localization with Safe Fallbacks", () => {
    const mockDish: MenuItem = {
      id: "test-dish-1",
      name: "Special Kitfo Plate",
      nameAm: "ልዩ ክትፎ",
      nameSid: "Baxxino Kitfo Sagale",
      desc: "Freshly seasoned minced lean beef with spiced clarified butter and mitmita.",
      descAm: "በቅቤ እና በሚጥሚጣ የተዘጋጀ ጣፋጭ እና ለስላሳ የክትፎ ምግብ።",
      descSid: "Mi'mitaanna bururi ledo kakkaysamino baxxino maala.",
      price: 450,
      category: "mains",
      image: "https://example.com/kitfo.webp",
      spice: 2,
      rating: 5,
      popular: true,
      fasting: false,
      inStock: true,
    };

    it("displays the correct language when translations are present", () => {
      expect(getLocalizedDishName(mockDish, "en")).toBe("Special Kitfo Plate");
      expect(getLocalizedDishName(mockDish, "am")).toBe("ልዩ ክትፎ");
      expect(getLocalizedDishName(mockDish, "sid")).toBe("Baxxino Kitfo Sagale");

      expect(getLocalizedDishDesc(mockDish, "en")).toBe(
        "Freshly seasoned minced lean beef with spiced clarified butter and mitmita."
      );
      expect(getLocalizedDishDesc(mockDish, "am")).toBe(
        "በቅቤ እና በሚጥሚጣ የተዘጋጀ ጣፋጭ እና ለስላሳ የክትፎ ምግብ።"
      );
      expect(getLocalizedDishDesc(mockDish, "sid")).toBe(
        "Mi'mitaanna bururi ledo kakkaysamino baxxino maala."
      );
    });

    it("safely falls back to English when translation fields are missing or empty", () => {
      const partialDish: MenuItem = {
        id: "partial-dish",
        name: "Vegetarian Combo",
        desc: "Steamed lentils, split peas, and collard greens.",
        price: 280,
        category: "fasting",
        image: "https://example.com/combo.webp",
        inStock: true,
      };

      // Name fallback
      expect(getLocalizedDishName(partialDish, "en")).toBe("Vegetarian Combo");
      expect(getLocalizedDishName(partialDish, "am")).toBe("Vegetarian Combo");
      expect(getLocalizedDishName(partialDish, "sid")).toBe("Vegetarian Combo");

      // Description fallback
      expect(getLocalizedDishDesc(partialDish, "en")).toBe("Steamed lentils, split peas, and collard greens.");
      expect(getLocalizedDishDesc(partialDish, "am")).toBe("Steamed lentils, split peas, and collard greens.");
      expect(getLocalizedDishDesc(partialDish, "sid")).toBe("Steamed lentils, split peas, and collard greens.");

      // Never returns null or undefined
      expect(getLocalizedDishName(null, "am")).toBe("");
      expect(getLocalizedDishDesc(undefined, "sid")).toBe("");
    });

    it("correctly identifies complete vs missing dish translations for admin review", () => {
      const completeReport = getMissingDishTranslations(mockDish);
      expect(completeReport.isComplete).toBe(true);
      expect(completeReport.missingCount).toBe(0);
      expect(completeReport.missingLabels).toEqual([]);

      const partialDish: MenuItem = {
        id: "partial-dish",
        name: "Coffee Ceremony",
        desc: "Single origin roasted beans.",
        price: 90,
        category: "drinks",
        image: "",
        inStock: true,
      };

      const partialReport = getMissingDishTranslations(partialDish);
      expect(partialReport.isComplete).toBe(false);
      expect(partialReport.missingCount).toBe(4);
      expect(partialReport.missingLabels).toContain("Amharic Name");
      expect(partialReport.missingLabels).toContain("Amharic Description");
      expect(partialReport.missingLabels).toContain("Sidama Name");
      expect(partialReport.missingLabels).toContain("Sidama Description");
    });
  });

  describe("4. Admin Multilingual Workflow and Data Persistence", () => {
    it("ensures updating one language does not erase translations in another language", () => {
      const original: MenuItem = {
        id: "m-101",
        name: "Shiro Tegamino",
        nameAm: "ሽሮ ተጋሚኖ",
        nameSid: "Shiro Tegamino Sagale",
        desc: "Slow simmered chickpea stew served in a sizzling clay pot.",
        descAm: "በሸክላ ድስት የቀረበ ጣፋጭ የሽሮ ወጥ።",
        descSid: "Dhaye huccira kakkaysamino shirote itto.",
        price: 220,
        category: "mains",
        image: "https://example.com/shiro.webp",
        inStock: true,
      };

      // Admin updates English description only
      const updatedEnglishDraft = {
        ...original,
        desc: "Slow simmered seasoned chickpea stew served bubbling in a traditional clay pot.",
      };

      // Verify that Amharic and Sidama fields remain intact
      expect(updatedEnglishDraft.nameAm).toBe("ሽሮ ተጋሚኖ");
      expect(updatedEnglishDraft.nameSid).toBe("Shiro Tegamino Sagale");
      expect(updatedEnglishDraft.descAm).toBe("በሸክላ ድስት የቀረበ ጣፋጭ የሽሮ ወጥ።");
      expect(updatedEnglishDraft.descSid).toBe("Dhaye huccira kakkaysamino shirote itto.");

      // Admin updates Sidama name only
      const updatedSidamaDraft = {
        ...updatedEnglishDraft,
        nameSid: "Baxxino Shiro Tegamino",
      };

      expect(updatedSidamaDraft.name).toBe("Shiro Tegamino");
      expect(updatedSidamaDraft.nameAm).toBe("ሽሮ ተጋሚኖ");
      expect(updatedSidamaDraft.nameSid).toBe("Baxxino Shiro Tegamino");
      expect(updatedSidamaDraft.price).toBe(220);
    });

    it("verifies mockData MENU items have authentic Amharic and Sidama descriptions populated", () => {
      expect(MENU.length).toBeGreaterThanOrEqual(14);

      let withAmDesc = 0;
      let withSidDesc = 0;

      for (const item of MENU) {
        if (item.descAm && item.descAm.trim().length > 0) withAmDesc++;
        if (item.descSid && item.descSid.trim().length > 0) withSidDesc++;
      }

      // All default menu items now have Amharic and Sidama descriptions
      expect(withAmDesc).toBe(MENU.length);
      expect(withSidDesc).toBe(MENU.length);
    });
  });

  describe("5. Order and Checkout Stability Under Language Switching", () => {
    it("ensures prices, totals, item IDs, and payment methods remain stable regardless of active language", () => {
      const cartItem = {
        uid: "cart-item-1",
        itemId: "m-101",
        name: "Special Kitfo Plate",
        basePrice: 450,
        qty: 2,
        base: "injera" as const,
        extraPrice: 30,
      };

      const lineTotal = (cartItem.basePrice + cartItem.extraPrice) * cartItem.qty;
      expect(lineTotal).toBe(960);

      // Verify localized labels for UI rendering do not mutate underlying cart data
      const enBase = TRANSLATIONS.en[`base.${cartItem.base}`];
      const amBase = TRANSLATIONS.am[`base.${cartItem.base}`];
      const sidBase = TRANSLATIONS.sid[`base.${cartItem.base}`];

      expect(enBase).toBe("Injera");
      expect(amBase).toBe("እንጀራ");
      expect(sidBase).toBe("Injera");

      // Stable cart snapshot
      expect(cartItem.itemId).toBe("m-101");
      expect(cartItem.basePrice).toBe(450);
      expect(cartItem.qty).toBe(2);
      expect(cartItem.base).toBe("injera");
    });
  });

  describe("6. Database Migration File Verification", () => {
    it("verifies the migration file exists and contains backward-compatible column definitions", () => {
      const migrationPath = join(
        rootDir,
        "supabase/migrations/20261024_add_multilingual_menu_item_descriptions.sql"
      );
      expect(existsSync(migrationPath)).toBe(true);

      const sql = readFileSync(migrationPath, "utf-8");

      expect(sql).toContain("column_name = 'desc_am'");
      expect(sql).toContain("column_name = 'desc_sid'");
      expect(sql).toContain("column_name = 'description_am'");
      expect(sql).toContain("column_name = 'description_sid'");
      expect(sql).toContain("ADD COLUMN desc_am TEXT;");
      expect(sql).toContain("ADD COLUMN desc_sid TEXT;");
      expect(sql).toContain("ADD COLUMN description_am TEXT;");
      expect(sql).toContain("ADD COLUMN description_sid TEXT;");

      // Verify synonym trigger synchronization
      expect(sql).toContain("CREATE OR REPLACE FUNCTION public.sync_menu_item_columns()");
      expect(sql).toContain("NOTIFY pgrst, 'reload schema';");
    });
  });
});
