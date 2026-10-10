import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  ArrowClockwise, ArrowRight, CaretDown, CaretUp, Check, CheckCircle, Clock,
  Copy, Desktop, DeviceMobile, Eye, FloppyDisk, ForkKnife, Globe,
  House, Image as ImageIcon, Info, Leaf, List, MapPin, Palette, PencilSimple, Plus,
  SealCheck, Sparkle, Star, Storefront, Trash,
  UploadSimple, WarningCircle, X,
} from "@phosphor-icons/react";
import { useGursha } from "../context/GurshaStore";
import { Price, Stars } from "./CustomerViews";
import { CATEGORIES, IMG, SEED_CMS } from "../data/mockData";
import type { CategoryId, Cms, MenuItem } from "../types";

const etb = (n: number) => `ETB ${n.toLocaleString()}`;
const CARD = "rounded-3xl border border-stone-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-zinc-900";
const INPUT = "w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-sm text-stone-900 outline-none transition focus:border-orange-500 focus:ring-1 focus:ring-orange-500 dark:border-white/15 dark:bg-white/5 dark:text-zinc-100";
const TEXTAREA = "w-full rounded-xl border border-stone-300 bg-white p-3 text-sm text-stone-900 outline-none transition focus:border-orange-500 focus:ring-1 focus:ring-orange-500 dark:border-white/15 dark:bg-white/5 dark:text-zinc-100";
const LABEL = "block text-[11px] font-bold uppercase tracking-[0.18em] text-stone-500 dark:text-zinc-400";
const HINT = "mt-1 text-xs text-stone-400 dark:text-zinc-500";

function Head({ title, sub }: { title: string; sub: string }) {
  return (
    <header className={`${CARD} p-6`}>
      <h1 className="font-display text-2xl font-extrabold text-stone-900 dark:text-white">{title}</h1>
      <p className="mt-1.5 text-sm text-stone-500 dark:text-zinc-400">{sub}</p>
    </header>
  );
}

/* ---------------------------------------------------------------- Dish Image Upload Helper */
async function processDishImageFile(file: File): Promise<string> {
  const validExtensions = /\.(jpe?g|png|webp)$/i;
  const validMimes = ["image/jpeg", "image/png", "image/webp", "image/jpg"];

  if (!validMimes.includes(file.type.toLowerCase()) && !validExtensions.test(file.name)) {
    throw new Error("Invalid file format. Please upload a JPG, JPEG, PNG, or WebP image.");
  }

  if (file.size > 10 * 1024 * 1024) {
    throw new Error("File is too large. Image size must be 10MB or less.");
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Unable to read image file from disk."));
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error("Unable to load and decode selected image."));
      img.onload = () => {
        const MAX_DIM = 1200;
        let { width, height } = img;
        if (width > MAX_DIM || height > MAX_DIM) {
          if (width > height) {
            height = Math.round((height * MAX_DIM) / width);
            width = MAX_DIM;
          } else {
            width = Math.round((width * MAX_DIM) / height);
            height = MAX_DIM;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          return resolve(e.target?.result as string);
        }
        ctx.drawImage(img, 0, 0, width, height);

        try {
          const webpData = canvas.toDataURL("image/webp", 0.85);
          if (webpData && webpData.startsWith("data:image/webp")) {
            return resolve(webpData);
          }
        } catch {
          // fallback to jpeg
        }
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  });
}

function DishImageUploadControl({
  value,
  onChange,
  onClear,
}: {
  value: string;
  onChange: (dataUrl: string) => void;
  onClear: () => void;
}) {
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorMsg(null);
    setIsProcessing(true);
    try {
      const dataUrl = await processDishImageFile(file);
      onChange(dataUrl);
      toast.success("Dish image uploaded successfully");
    } catch (err: any) {
      const msg = err?.message || "Failed to upload image. Please try again.";
      setErrorMsg(msg);
      toast.error(msg);
    } finally {
      setIsProcessing(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleRemove = () => {
    setErrorMsg(null);
    onClear();
    if (fileInputRef.current) fileInputRef.current.value = "";
    toast.info("Dish image removed");
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className={LABEL}>Dish Picture / Image</label>
        <span className="text-[11px] text-stone-400 dark:text-zinc-500">JPG, JPEG, PNG, WebP · Max 10MB</span>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
        onChange={handleFileChange}
        className="hidden"
        id="dish-file-upload-input"
      />

      {value ? (
        <div className="relative overflow-hidden rounded-2xl border border-stone-200 bg-stone-50 p-3.5 dark:border-white/10 dark:bg-zinc-800/60">
          <div className="flex flex-col gap-3.5 sm:flex-row sm:items-center">
            <div className="relative h-24 w-32 shrink-0 overflow-hidden rounded-xl border border-stone-200 bg-stone-100 shadow-sm dark:border-white/10 dark:bg-zinc-800">
              <img src={value} alt="Dish preview" className="h-full w-full object-cover" />
            </div>
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                <CheckCircle size={15} weight="fill" /> Picture ready for dish
              </div>
              <p className="text-xs text-stone-500 dark:text-zinc-400">
                This image will appear on the customer menu and cart previews.
              </p>
              <div className="flex flex-wrap gap-2 pt-0.5">
                <button
                  type="button"
                  disabled={isProcessing}
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 rounded-full border border-stone-300 bg-white px-3.5 py-1.5 text-xs font-bold text-stone-700 shadow-sm transition hover:bg-stone-50 dark:border-white/15 dark:bg-white/10 dark:text-zinc-200"
                >
                  <UploadSimple size={14} weight="bold" /> Replace picture
                </button>
                <button
                  type="button"
                  onClick={handleRemove}
                  className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50/70 px-3.5 py-1.5 text-xs font-bold text-red-600 transition hover:bg-red-100/70 dark:border-red-900/40 dark:bg-red-950/40 dark:text-red-400"
                >
                  <Trash size={14} weight="bold" /> Remove picture
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border-2 border-dashed border-stone-300 bg-stone-50/70 p-5 text-center transition hover:border-orange-500/70 dark:border-white/15 dark:bg-white/[0.02]">
          <div className="mx-auto flex max-w-sm flex-col items-center justify-center">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-orange-100 text-orange-600 dark:bg-orange-950/50 dark:text-orange-400">
              <UploadSimple size={24} weight="bold" />
            </div>
            <p className="mt-2 text-sm font-bold text-stone-800 dark:text-zinc-100">
              Upload a picture from your computer
            </p>
            <p className="mt-1 text-xs text-stone-400 dark:text-zinc-500">
              Choose any photo from your computer (JPG, JPEG, PNG, or WebP).
            </p>
            <button
              type="button"
              disabled={isProcessing}
              onClick={() => fileInputRef.current?.click()}
              className="mt-3 inline-flex items-center gap-2 rounded-full bg-orange-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-orange-700"
            >
              <UploadSimple size={14} weight="bold" /> Select image file
            </button>
          </div>
        </div>
      )}

      {errorMsg && (
        <div className="flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 dark:border-red-900/50 dark:bg-red-950/50 dark:text-red-300">
          <WarningCircle size={15} weight="bold" className="shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Optional fallback for existing URLs */}
      <div className="pt-0.5">
        <button
          type="button"
          onClick={() => setShowUrlInput(!showUrlInput)}
          className="text-[11px] font-bold text-stone-500 underline decoration-dotted transition hover:text-stone-800 dark:text-zinc-400 dark:hover:text-zinc-200"
        >
          {showUrlInput ? "Hide optional image URL input" : "Or enter image URL instead (optional)"}
        </button>
        {showUrlInput && (
          <div className="mt-2">
            <input
              type="text"
              className={INPUT}
              placeholder="https://... image address (optional)"
              value={value.startsWith("data:") ? "" : value}
              onChange={(e) => onChange(e.target.value)}
            />
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- menu admin */
export function AdminMenu() {
  const { menu, t, saveMenuItem, deleteMenuItem, toggleStock } = useGursha();
  const [draft, setDraft] = useState<MenuItem>({
    id: "", name: "", nameAm: "", nameSid: "", desc: "", price: 0, category: "mains",
    image: "", spice: 1, rating: 5, popular: false, fasting: false, inStock: true,
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const grouped = useMemo(() => CATEGORIES.map((c) => ({
    c, items: menu.filter((i) => i.category === c.id),
  })).filter((g) => g.items.length > 0), [menu]);

  const startAdd = () => {
    setEditingId(null);
    setDraft({
      id: "", name: "", nameAm: "", nameSid: "", desc: "", price: 0, category: "mains",
      image: "", spice: 1, rating: 5, popular: false, fasting: false, inStock: true,
    });
    setShowForm(true);
  };

  const startEdit = (item: MenuItem) => {
    setEditingId(item.id);
    setDraft({ ...item });
    setShowForm(true);
  };

  const cancelForm = () => {
    setEditingId(null);
    setDraft({
      id: "", name: "", nameAm: "", nameSid: "", desc: "", price: 0, category: "mains",
      image: "", spice: 1, rating: 5, popular: false, fasting: false, inStock: true,
    });
    setShowForm(false);
  };

  const submit = () => {
    if (!draft.name.trim()) {
      toast.error("Please enter a dish name.");
      return;
    }
    if (draft.price <= 0) {
      toast.error("Please enter a valid price in ETB.");
      return;
    }

    saveMenuItem({
      ...draft,
      id: draft.id || `m-${Date.now()}`,
      nameAm: draft.nameAm || draft.name,
      nameSid: draft.nameSid || draft.name,
      image: draft.image || menu[0]?.image || "",
      desc: draft.desc || "Freshly prepared at Gursha.",
    });

    cancelForm();
  };

  return (
    <div className="space-y-5">
      <Head title="Menu manager" sub="Prices, availability and dietary flags update the customer menu the moment you change them." />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className={`${LABEL}`}>{menu.length} dishes · {menu.filter((i) => !i.inStock).length} out of stock</p>
        <button
          type="button"
          onClick={showForm ? cancelForm : startAdd}
          className="flex items-center gap-2 rounded-full bg-orange-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-orange-500"
        >
          {showForm ? <X size={16} weight="bold" /> : <Plus size={16} weight="bold" />} {showForm ? "Close form" : "Add dish"}
        </button>
      </div>

      {showForm && (
        <section className={`${CARD} space-y-4`}>
          <div className="flex items-center justify-between border-b border-stone-200 pb-3 dark:border-white/10">
            <div>
              <h2 className="font-display text-base font-extrabold text-stone-900 dark:text-white">
                {editingId ? `Edit Dish: ${draft.name || "Untitled"}` : "Add New Dish"}
              </h2>
              <p className="text-xs text-stone-500 dark:text-zinc-400">
                {editingId ? "Update details or replace the dish picture." : "Fill in dish information and upload a photo directly from your computer."}
              </p>
            </div>
            {editingId && (
              <span className="rounded-full bg-orange-100 px-2.5 py-1 text-xs font-bold text-orange-700 dark:bg-orange-950/60 dark:text-orange-300">
                Editing
              </span>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={LABEL}>Dish Name</label>
              <input
                className={`${INPUT} mt-1`}
                placeholder="e.g. Special Kitfo Plate"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </div>
            <div>
              <label className={LABEL}>Price (ETB)</label>
              <input
                className={`${INPUT} mt-1`}
                type="number"
                min={0}
                placeholder="Price (ETB)"
                value={draft.price || ""}
                onChange={(e) => setDraft({ ...draft, price: Number(e.target.value) })}
              />
            </div>
            <div>
              <label className={LABEL}>Category</label>
              <select
                className={`${INPUT} mt-1`}
                value={draft.category}
                onChange={(e) => setDraft({ ...draft, category: e.target.value as CategoryId })}
              >
                {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.en}</option>)}
              </select>
            </div>
            <div>
              <label className={LABEL}>Short Description</label>
              <input
                className={`${INPUT} mt-1`}
                placeholder="e.g. Freshly seasoned minced lean beef..."
                value={draft.desc}
                onChange={(e) => setDraft({ ...draft, desc: e.target.value })}
              />
            </div>
          </div>

          {/* Dedicated Image Upload Control */}
          <DishImageUploadControl
            value={draft.image}
            onChange={(img) => setDraft({ ...draft, image: img })}
            onClear={() => setDraft({ ...draft, image: "" })}
          />

          <div>
            <span className={LABEL}>Dietary & Menu Flags</span>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {[
                { k: "inStock" as const, label: "In stock" },
                { k: "fasting" as const, label: "Fasting" },
                { k: "popular" as const, label: "Popular" },
              ].map(({ k, label }) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setDraft({ ...draft, [k]: !draft[k] })}
                  className={`rounded-full px-4 py-2 text-xs font-bold transition ${
                    draft[k]
                      ? "bg-orange-600 text-white shadow-sm"
                      : "border border-stone-300 text-stone-600 hover:bg-stone-50 dark:border-white/15 dark:text-zinc-300 dark:hover:bg-white/5"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={cancelForm}
              className="rounded-full border border-stone-300 px-5 py-2.5 text-xs font-bold text-stone-600 transition hover:bg-stone-50 dark:border-white/15 dark:text-zinc-300 dark:hover:bg-white/5"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              className="rounded-full bg-stone-900 px-6 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-stone-800 dark:bg-white dark:text-stone-900 dark:hover:bg-zinc-200"
            >
              {editingId ? "Update dish" : "Save dish to menu"}
            </button>
          </div>
        </section>
      )}

      {grouped.map(({ c, items }) => (
        <section key={c.id} className="space-y-2">
          <h2 className={`font-display px-1 text-sm font-extrabold text-stone-900 dark:text-white`}>{c.en} <span className="text-stone-400">· {items.length}</span></h2>
          <div className="grid gap-3 xl:grid-cols-2">
            {items.map((item) => (
              <article key={item.id} className={`${CARD} flex gap-4 p-4`}>
                <img src={item.image} alt={item.name} className="h-20 w-20 shrink-0 rounded-2xl object-cover" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-stone-900 dark:text-white">{item.name}</p>
                      <p className="truncate text-xs text-stone-400">{item.desc}</p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        aria-label="Edit dish"
                        title="Edit dish and picture"
                        onClick={() => startEdit(item)}
                        className="grid h-8 w-8 place-items-center rounded-full border border-stone-300 text-stone-600 transition hover:bg-stone-100 hover:text-stone-900 dark:border-white/15 dark:text-zinc-300 dark:hover:bg-white/10 dark:hover:text-white"
                      >
                        <PencilSimple size={14} weight="bold" />
                      </button>
                      <button
                        type="button"
                        aria-label="Delete dish"
                        title="Delete dish"
                        onClick={() => deleteMenuItem(item.id)}
                        className="grid h-8 w-8 place-items-center rounded-full border border-stone-300 text-red-600 transition hover:bg-red-50 dark:border-white/15 dark:hover:bg-red-950/40"
                      >
                        <Trash size={14} weight="bold" />
                      </button>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <label className="flex items-center gap-1.5 rounded-xl border border-stone-300 px-2.5 py-1.5 dark:border-white/15">
                      <span className="text-xs font-bold text-stone-400">ETB</span>
                      <input type="number" min={0} defaultValue={item.price} onBlur={(e) => saveMenuItem({ ...item, price: Number(e.target.value) })}
                        className="w-16 bg-transparent text-sm font-bold tabular-nums outline-none dark:text-zinc-100" />
                      <PencilSimple size={13} className="text-stone-400" />
                    </label>
                    <button type="button" onClick={() => toggleStock(item.id)}
                      className={`rounded-full px-3 py-1.5 text-xs font-bold ${item.inStock ? "bg-emerald-500/12 text-emerald-600" : "bg-red-500/12 text-red-600"}`}>
                      {item.inStock ? "In stock" : "Sold out"}
                    </button>
                    <button type="button" onClick={() => saveMenuItem({ ...item, popular: !item.popular })}
                      className={`flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-bold ${item.popular ? "bg-orange-600/12 text-orange-700 dark:text-orange-300" : "border border-stone-300 text-stone-500 dark:border-white/15 dark:text-zinc-400"}`}>
                      <Star size={12} weight={item.popular ? "fill" : "regular"} /> Popular
                    </button>
                    <button type="button" onClick={() => saveMenuItem({ ...item, fasting: !item.fasting })}
                      className={`rounded-full px-3 py-1.5 text-xs font-bold ${item.fasting ? "bg-orange-600/12 text-orange-700 dark:text-orange-300" : "border border-stone-300 text-stone-500 dark:border-white/15 dark:text-zinc-400"}`}>
                      Fasting
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------- Curated Image Picker */
const GALLERY = [
  { label: "Lake Hawassa Terrace (Hero)", url: IMG.hero },
  { label: "Shared Platter Feast", url: IMG.feast },
  { label: "Signature Doro Wat", url: IMG.doro },
  { label: "Lake Hawassa Fried Fish", url: IMG.fish },
  { label: "Silky Shiro Tegabino", url: IMG.shiro },
  { label: "Special Kitfo Plate", url: IMG.kitfo },
  { label: "Fresh Avocado Spris", url: IMG.juice },
  { label: "Buna Ceremony (Clay Jebena)", url: IMG.buna },
  { label: "Chechebsa Plate", url: IMG.chechebsa },
];

function ImagePicker({
  value,
  onChange,
  label = "Image",
}: {
  value: string;
  onChange: (url: string) => void;
  label?: string;
}) {
  const [showGallery, setShowGallery] = useState(false);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      if (result) {
        onChange(result);
        toast.success("Image uploaded from local device");
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-2">
      <span className={LABEL}>{label}</span>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        {value ? (
          <img
            src={value}
            alt="Selected preview"
            className="h-20 w-32 shrink-0 rounded-2xl border border-stone-200 object-cover shadow-sm dark:border-white/10"
          />
        ) : (
          <div className="grid h-20 w-32 shrink-0 place-items-center rounded-2xl border border-dashed border-stone-300 text-stone-400 dark:border-white/15">
            <ImageIcon size={24} />
          </div>
        )}
        <div className="min-w-0 flex-1 space-y-2">
          <input
            type="text"
            className={INPUT}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="https://... image address"
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowGallery(!showGallery)}
              className="inline-flex items-center gap-1.5 rounded-full border border-stone-200 bg-stone-50 px-3 py-1.5 text-xs font-bold text-stone-700 transition hover:bg-stone-100 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300"
            >
              <ImageIcon size={14} weight="bold" /> Choose from café gallery
            </button>
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-stone-200 bg-stone-50 px-3 py-1.5 text-xs font-bold text-stone-700 transition hover:bg-stone-100 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300">
              <UploadSimple size={14} weight="bold" /> Upload image
              <input type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
            </label>
          </div>
        </div>
      </div>

      {showGallery && (
        <div className="mt-2 grid grid-cols-3 gap-2 rounded-2xl border border-stone-200 bg-stone-50 p-3 dark:border-white/10 dark:bg-zinc-800/60 sm:grid-cols-4 md:grid-cols-5">
          {GALLERY.map((g) => (
            <button
              key={g.label}
              type="button"
              onClick={() => {
                onChange(g.url);
                setShowGallery(false);
              }}
              className={`group overflow-hidden rounded-xl border text-left transition ${
                value === g.url ? "border-orange-600 ring-2 ring-orange-500/50" : "border-stone-200 dark:border-white/10"
              }`}
            >
              <img src={g.url} alt={g.label} className="h-16 w-full object-cover group-hover:scale-105 transition" />
              <p className="truncate p-1 text-[10px] font-bold text-stone-700 dark:text-zinc-300">{g.label}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- Storefront Live Preview Frame */
function StorefrontPreviewModal({
  form,
  onClose,
}: {
  form: Cms;
  onClose: () => void;
}) {
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const { menu } = useGursha();

  const previewFeatured = useMemo(() => {
    if (form.featuredIds && form.featuredIds.length > 0) {
      const picked = menu.filter((m) => form.featuredIds?.includes(m.id));
      if (picked.length > 0) return picked;
    }
    return menu.filter((m) => m.popular).slice(0, 4);
  }, [menu, form.featuredIds]);

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-stone-950/80 p-2 backdrop-blur-md sm:p-6" onClick={onClose}>
      <div
        className="mx-auto flex h-full w-full max-w-6xl flex-col overflow-hidden rounded-3xl border border-stone-200 bg-stone-50 shadow-2xl dark:border-white/10 dark:bg-zinc-950"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex shrink-0 items-center justify-between border-b border-stone-200 bg-white px-5 py-3 dark:border-white/10 dark:bg-zinc-900">
          <div className="flex items-center gap-3">
            <span className="grid h-8 w-8 place-items-center rounded-xl bg-orange-600 text-white font-extrabold text-sm">P</span>
            <div>
              <h2 className="font-display text-sm font-bold text-stone-900 dark:text-white">Storefront Live Preview</h2>
              <p className="text-[11px] text-stone-500 dark:text-zinc-400">Rendering preview using current editor draft</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-full border border-stone-200 p-0.5 dark:border-white/10">
              <button
                type="button"
                onClick={() => setDevice("desktop")}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition ${
                  device === "desktop" ? "bg-stone-900 text-white dark:bg-white dark:text-stone-900" : "text-stone-500 dark:text-zinc-400"
                }`}
              >
                <Desktop size={14} weight="bold" /> Desktop
              </button>
              <button
                type="button"
                onClick={() => setDevice("mobile")}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition ${
                  device === "mobile" ? "bg-stone-900 text-white dark:bg-white dark:text-stone-900" : "text-stone-500 dark:text-zinc-400"
                }`}
              >
                <DeviceMobile size={14} weight="bold" /> Mobile (375px)
              </button>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="grid h-8 w-8 place-items-center rounded-full border border-stone-200 text-stone-500 hover:text-stone-900 dark:border-white/10 dark:text-zinc-400"
            >
              <X size={16} weight="bold" />
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 bg-stone-200/50 dark:bg-zinc-900/50">
          <div
            className={`mx-auto overflow-hidden rounded-2xl border border-stone-300 bg-white shadow-xl transition-all duration-300 dark:border-white/10 dark:bg-zinc-950 ${
              device === "mobile" ? "max-w-[375px] min-h-[640px]" : "w-full"
            }`}
          >
            {/* Announcement */}
            {form.visibility?.announcement !== false && form.announcement && (
              <div className="bg-orange-600 px-3 py-1.5 text-center text-[10px] font-bold text-white">
                {form.announcement}
              </div>
            )}

            {/* Nav */}
            <div className="flex items-center justify-between border-b border-stone-200 px-4 py-3 dark:border-white/10">
              <div className="flex items-center gap-2">
                <span className="font-display text-lg font-extrabold text-orange-600">{form.brandName || "Gursha"}</span>
                <span className="text-[9px] font-bold uppercase tracking-widest text-stone-400">{form.brandTagline || "Café Hawassa"}</span>
              </div>
              <div className="flex gap-2 text-xs font-bold text-stone-600 dark:text-zinc-300">
                <span>Home</span>
                <span>Menu</span>
                <span>Orders</span>
              </div>
            </div>

            {/* Hero */}
            <div className="relative isolate overflow-hidden bg-stone-900 text-white">
              <img src={form.heroImage || IMG.hero} alt="Hero preview" className="absolute inset-0 h-full w-full object-cover opacity-45" />
              <div className="relative p-6 sm:p-10">
                <span className="inline-block rounded-full bg-white/20 px-2.5 py-0.5 text-[10px] font-bold tracking-widest uppercase">
                  {form.heroLocation || "Hawassa · Sidama"}
                </span>
                <h1 className="font-display mt-3 text-xl font-extrabold sm:text-3xl">{form.heroTitle}</h1>
                <p className="mt-2 text-xs leading-relaxed text-stone-200 sm:text-sm">{form.heroSubtitle}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <span className="rounded-full bg-orange-600 px-4 py-1.5 text-xs font-bold text-white">{form.heroCtaText || "Order"}</span>
                  <span className="rounded-full border border-white/40 px-3 py-1.5 text-xs font-bold text-white">{form.heroSecondaryCtaText || "Menu"}</span>
                  {form.visibility?.heroBadge !== false && (
                    <span className="rounded-full bg-white/10 px-3 py-1.5 text-[10px] font-bold text-emerald-400">
                      ● {form.heroOpenBadge || "Open Now"}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Promo banner */}
            {form.visibility?.promoBanner !== false && form.promoBanner?.enabled && (
              <div className="m-4 rounded-2xl bg-gradient-to-r from-orange-600 to-amber-600 p-4 text-white">
                <span className="rounded-full bg-white/20 px-2 py-0.5 text-[9px] font-bold uppercase">{form.promoBanner.badge}</span>
                <h3 className="font-display mt-1 text-base font-extrabold">{form.promoBanner.title}</h3>
                <p className="mt-1 text-xs text-white/90">{form.promoBanner.description}</p>
                {form.promoBanner.code && (
                  <span className="mt-2 inline-block rounded-lg bg-white px-2.5 py-1 text-[11px] font-extrabold text-orange-700">
                    CODE: {form.promoBanner.code}
                  </span>
                )}
              </div>
            )}

            {/* Featured */}
            {form.visibility?.featured !== false && (
              <div className="p-4 sm:p-6">
                <p className="text-[10px] font-bold uppercase tracking-wider text-orange-600">{form.featuredEyebrow}</p>
                <h2 className="font-display text-base font-extrabold text-stone-900 dark:text-white">{form.bannerTitle}</h2>
                <p className="text-xs text-stone-500 dark:text-zinc-400">{form.bannerSub}</p>
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {previewFeatured.map((f) => (
                    <div key={f.id} className="rounded-xl border border-stone-200 p-2 text-xs dark:border-white/10">
                      <img src={f.image} alt={f.name} className="h-20 w-full rounded-lg object-cover" />
                      <p className="mt-1 font-bold truncate text-stone-900 dark:text-white">{f.name}</p>
                      <p className="text-orange-600 font-extrabold">{etb(f.price)}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}


            {/* Visit info */}
            {form.visibility?.visit !== false && (
              <div className="border-t border-stone-200 bg-stone-50 p-4 text-xs dark:border-white/10 dark:bg-zinc-900">
                <p className="font-bold text-stone-900 dark:text-white">📍 {form.address}</p>
                <p className="text-stone-500 dark:text-zinc-400">🕒 {form.hours}</p>
                <p className="text-stone-500 dark:text-zinc-400">📞 {form.phone} · ✉️ {form.email}</p>
              </div>
            )}

            {/* Footer */}
            <div className="border-t border-stone-200 p-4 text-center text-[10px] text-stone-400 dark:border-white/10">
              {form.copyrightText}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- Comprehensive Admin CMS */
type CmsTab =
  | "home"
  | "header"
  | "contact"
  | "footer"
  | "appearance";

function isValidUrl(raw?: string): boolean {
  if (!raw || !raw.trim()) return true;
  const trimmed = raw.trim();
  try {
    const full = trimmed.startsWith("http://") || trimmed.startsWith("https://") ? trimmed : `https://${trimmed}`;
    const parsed = new URL(full);
    return parsed.hostname.includes(".");
  } catch {
    return false;
  }
}

function isValidEmail(raw?: string): boolean {
  if (!raw || !raw.trim()) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw.trim());
}

export function AdminCms() {
  const { cms, menu, saveCms, restoreDefaultCms, adminAuthed } = useGursha();
  const [form, setForm] = useState<Cms>(cms);
  const [activeTab, setActiveTab] = useState<CmsTab>("home");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setForm(cms);
  }, [cms]);

  const isDirty = useMemo(() => {
    return JSON.stringify(form) !== JSON.stringify(cms);
  }, [form, cms]);

  const handlePublish = async () => {
    if (!adminAuthed) {
      toast.error("Unauthorized: Please sign in as staff administrator to publish settings.");
      return;
    }

    // Validate social URLs
    if (form.socials) {
      for (const [platform, url] of Object.entries(form.socials)) {
        if (url && url.trim() && !isValidUrl(url)) {
          toast.error(`Invalid URL for ${platform}. Please enter a valid web link (e.g., https://${platform}.com/...)`);
          return;
        }
      }
    }

    // Validate email
    if (form.email && form.email.trim() && !isValidEmail(form.email)) {
      toast.error("Please enter a valid email address (e.g., hello@gurshacafe.et)");
      return;
    }

    setIsSaving(true);
    try {
      const saved = await saveCms(form);
      if (saved) {
        setForm(saved);
      }
    } catch {
      // toast is displayed in saveCms, form remains intact so user doesn't lose edits
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveDraft = () => {
    try {
      localStorage.setItem("gursha_cms_draft", JSON.stringify(form));
      toast.success("Editor draft saved locally");
    } catch {
      toast.error("Could not save draft");
    }
  };

  const handleRevert = () => {
    setForm(cms);
    toast.info("Changes reverted to published content");
  };

  const handleRestoreDefaults = async () => {
    if (!window.confirm("Are you sure you want to restore all storefront content to defaults? This will overwrite your current settings.")) {
      return;
    }
    if (restoreDefaultCms) {
      await restoreDefaultCms();
      setForm(SEED_CMS);
    } else {
      await saveCms(SEED_CMS);
      setForm(SEED_CMS);
    }
  };

  const updateVisibility = (key: keyof Cms["visibility"], value: boolean) => {
    setForm((prev) => ({
      ...prev,
      visibility: {
        ...prev.visibility,
        [key]: value,
      },
    }));
  };


  const updateAppearance = <K extends keyof Cms["appearance"]>(key: K, value: Cms["appearance"][K]) => {
    setForm((prev) => ({
      ...prev,
      appearance: {
        ...prev.appearance,
        [key]: value,
      },
    }));
  };

  const updateSocials = <K extends keyof Cms["socials"]>(key: K, value: Cms["socials"][K]) => {
    setForm((prev) => ({
      ...prev,
      socials: {
        ...prev.socials,
        [key]: value,
      },
    }));
  };

  const TABS: { id: CmsTab; label: string; Icon: any }[] = [
    { id: "home", label: "Homepage", Icon: House },
    { id: "header", label: "Header & Nav", Icon: Globe },
    { id: "contact", label: "Contact & Hours", Icon: MapPin },
    { id: "footer", label: "Footer & Social", Icon: List },
  ];

  return (
    <div className="space-y-6 pb-20">
      {/* 1. Header Toolbar */}
      <header className={`${CARD} flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between`}>
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="font-display text-2xl font-extrabold text-stone-900 dark:text-white">Storefront CMS</h1>
            {isDirty ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-bold text-amber-700 dark:text-amber-400">
                <WarningCircle size={13} weight="bold" /> Unsaved changes
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-bold text-emerald-700 dark:text-emerald-400">
                <CheckCircle size={13} weight="bold" /> Live published
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-stone-500 dark:text-zinc-400">
            {cms.lastPublishedAt
              ? `Last published on ${new Date(cms.lastPublishedAt).toLocaleDateString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}`
              : "Live production storefront content"}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setPreviewOpen(true)}
            className="flex items-center gap-1.5 rounded-full border border-stone-200 bg-white px-4 py-2.5 text-xs font-bold text-stone-700 shadow-sm transition hover:bg-stone-50 dark:border-white/10 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
          >
            <Eye size={15} weight="bold" /> Preview storefront
          </button>
          <button
            type="button"
            onClick={handleSaveDraft}
            className="flex items-center gap-1.5 rounded-full border border-stone-200 bg-white px-4 py-2.5 text-xs font-bold text-stone-700 shadow-sm transition hover:bg-stone-50 dark:border-white/10 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
          >
            <FloppyDisk size={15} weight="bold" /> Save draft
          </button>
          {isDirty && (
            <button
              type="button"
              onClick={handleRevert}
              className="rounded-full border border-stone-200 px-3.5 py-2.5 text-xs font-bold text-stone-600 hover:bg-stone-100 dark:border-white/10 dark:text-zinc-400 dark:hover:bg-white/5"
            >
              Revert
            </button>
          )}
          <button
            type="button"
            disabled={isSaving}
            onClick={handlePublish}
            className="flex items-center gap-2 rounded-full bg-orange-600 px-5 py-2.5 text-xs font-extrabold text-white shadow-md transition hover:bg-orange-500 disabled:opacity-50"
          >
            <UploadSimple size={15} weight="bold" /> {isSaving ? "Publishing..." : "Publish to live"}
          </button>
          <button
            type="button"
            onClick={handleRestoreDefaults}
            title="Restore factory seed defaults"
            className="rounded-full p-2.5 text-stone-400 hover:text-stone-700 dark:hover:text-zinc-200"
          >
            <ArrowClockwise size={15} weight="bold" />
          </button>
        </div>
      </header>

      {/* 2. Navigation Tabs */}
      <div className="gursha-scroll flex gap-1.5 overflow-x-auto pb-1">
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveTab(id)}
            className={`flex shrink-0 items-center gap-2 rounded-2xl px-4 py-2.5 text-xs font-bold transition ${
              activeTab === id
                ? "bg-orange-600 text-white shadow-sm"
                : "border border-stone-200 bg-white text-stone-600 hover:bg-stone-50 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-white/5"
            }`}
          >
            <Icon size={16} weight="bold" /> {label}
          </button>
        ))}
      </div>

      {/* 3. Tab Contents */}
      <div className="space-y-6">
        {/* TAB 1: HOMEPAGE */}
        {activeTab === "home" && (
          <div className="space-y-6">
            {/* Hero Section Card */}
            <section className={CARD}>
              <div className="flex items-center justify-between border-b border-stone-100 pb-3 dark:border-white/5">
                <h2 className="font-display text-base font-extrabold text-stone-900 dark:text-white">Hero section</h2>
                <label className="flex items-center gap-2 text-xs font-bold text-stone-600 dark:text-zinc-300">
                  <span>Show open badge</span>
                  <input
                    type="checkbox"
                    checked={form.visibility?.heroBadge !== false}
                    onChange={(e) => updateVisibility("heroBadge", e.target.checked)}
                    className="h-4 w-4 rounded accent-orange-600"
                  />
                </label>
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label className="sm:col-span-2">
                  <span className={LABEL}>Hero main title</span>
                  <input
                    className={`${INPUT} mt-1`}
                    value={form.heroTitle}
                    onChange={(e) => setForm({ ...form, heroTitle: e.target.value })}
                  />
                </label>
                <label className="sm:col-span-2">
                  <span className={LABEL}>Hero subtitle / description</span>
                  <textarea
                    rows={2}
                    className={`${TEXTAREA} mt-1`}
                    value={form.heroSubtitle}
                    onChange={(e) => setForm({ ...form, heroSubtitle: e.target.value })}
                  />
                </label>
                <label>
                  <span className={LABEL}>Location badge text</span>
                  <input
                    className={`${INPUT} mt-1`}
                    value={form.heroLocation}
                    onChange={(e) => setForm({ ...form, heroLocation: e.target.value })}
                  />
                </label>
                <label>
                  <span className={LABEL}>Hero open status text</span>
                  <input
                    className={`${INPUT} mt-1`}
                    value={form.heroOpenBadge}
                    onChange={(e) => setForm({ ...form, heroOpenBadge: e.target.value })}
                  />
                </label>
                <label>
                  <span className={LABEL}>Primary CTA button text</span>
                  <input
                    className={`${INPUT} mt-1`}
                    value={form.heroCtaText}
                    onChange={(e) => setForm({ ...form, heroCtaText: e.target.value })}
                  />
                </label>
                <label>
                  <span className={LABEL}>Primary CTA link / anchor</span>
                  <input
                    className={`${INPUT} mt-1`}
                    value={form.heroCtaLink}
                    onChange={(e) => setForm({ ...form, heroCtaLink: e.target.value })}
                  />
                </label>
                <label>
                  <span className={LABEL}>Secondary CTA button text</span>
                  <input
                    className={`${INPUT} mt-1`}
                    value={form.heroSecondaryCtaText}
                    onChange={(e) => setForm({ ...form, heroSecondaryCtaText: e.target.value })}
                  />
                </label>
                <label>
                  <span className={LABEL}>Secondary CTA destination</span>
                  <input
                    className={`${INPUT} mt-1`}
                    value={form.heroSecondaryCtaLink}
                    onChange={(e) => setForm({ ...form, heroSecondaryCtaLink: e.target.value })}
                  />
                </label>
                <div className="sm:col-span-2">
                  <ImagePicker
                    label="Hero background image"
                    value={form.heroImage}
                    onChange={(url) => setForm({ ...form, heroImage: url })}
                  />
                </div>
              </div>
            </section>

            {/* Featured Items Section */}
            <section className={CARD}>
              <div className="flex items-center justify-between border-b border-stone-100 pb-3 dark:border-white/5">
                <h2 className="font-display text-base font-extrabold text-stone-900 dark:text-white">Featured section</h2>
                <label className="flex items-center gap-2 text-xs font-bold text-stone-600 dark:text-zinc-300">
                  <span>Section visible</span>
                  <input
                    type="checkbox"
                    checked={form.visibility?.featured !== false}
                    onChange={(e) => updateVisibility("featured", e.target.checked)}
                    className="h-4 w-4 rounded accent-orange-600"
                  />
                </label>
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label>
                  <span className={LABEL}>Section eyebrow</span>
                  <input
                    className={`${INPUT} mt-1`}
                    value={form.featuredEyebrow}
                    onChange={(e) => setForm({ ...form, featuredEyebrow: e.target.value })}
                  />
                </label>
                <label>
                  <span className={LABEL}>Headline title</span>
                  <input
                    className={`${INPUT} mt-1`}
                    value={form.bannerTitle}
                    onChange={(e) => setForm({ ...form, bannerTitle: e.target.value })}
                  />
                </label>
                <label className="sm:col-span-2">
                  <span className={LABEL}>Subtitle description</span>
                  <input
                    className={`${INPUT} mt-1`}
                    value={form.bannerSub}
                    onChange={(e) => setForm({ ...form, bannerSub: e.target.value })}
                  />
                </label>
                <div className="sm:col-span-2 space-y-2">
                  <span className={LABEL}>Featured dishes selection</span>
                  <p className={HINT}>Select dishes from the menu to display on the storefront home page:</p>
                  <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {menu.map((dish) => {
                      const isSelected = form.featuredIds?.includes(dish.id);
                      return (
                        <button
                          key={dish.id}
                          type="button"
                          onClick={() => {
                            const current = form.featuredIds || [];
                            const next = isSelected ? current.filter((id) => id !== dish.id) : [...current, dish.id];
                            setForm({ ...form, featuredIds: next });
                          }}
                          className={`flex items-center gap-2 rounded-xl border p-2 text-left text-xs font-bold transition ${
                            isSelected
                              ? "border-orange-500 bg-orange-500/10 text-orange-700 dark:text-orange-300"
                              : "border-stone-200 text-stone-600 dark:border-white/10 dark:text-zinc-400"
                          }`}
                        >
                          <img src={dish.image} alt={dish.name} className="h-8 w-8 rounded-lg object-cover" />
                          <span className="truncate">{dish.name}</span>
                          {isSelected && <Check size={14} weight="bold" className="ml-auto text-orange-600" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </section>

            {/* Visit Us Headline Section */}
            <section className={CARD}>
              <div className="flex items-center justify-between border-b border-stone-100 pb-3 dark:border-white/5">
                <h2 className="font-display text-base font-extrabold text-stone-900 dark:text-white">Visit us section</h2>
                <label className="flex items-center gap-2 text-xs font-bold text-stone-600 dark:text-zinc-300">
                  <span>Section visible</span>
                  <input
                    type="checkbox"
                    checked={form.visibility?.visit !== false}
                    onChange={(e) => updateVisibility("visit", e.target.checked)}
                    className="h-4 w-4 rounded accent-orange-600"
                  />
                </label>
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label>
                  <span className={LABEL}>Eyebrow</span>
                  <input
                    className={`${INPUT} mt-1`}
                    value={form.visitEyebrow}
                    onChange={(e) => setForm({ ...form, visitEyebrow: e.target.value })}
                  />
                </label>
                <label>
                  <span className={LABEL}>Headline</span>
                  <input
                    className={`${INPUT} mt-1`}
                    value={form.visitTitle}
                    onChange={(e) => setForm({ ...form, visitTitle: e.target.value })}
                  />
                </label>
                <label className="sm:col-span-2">
                  <span className={LABEL}>Subtext</span>
                  <input
                    className={`${INPUT} mt-1`}
                    value={form.visitSub}
                    onChange={(e) => setForm({ ...form, visitSub: e.target.value })}
                  />
                </label>
              </div>
            </section>
          </div>
        )}

        {/* TAB 2: HEADER & NAVIGATION */}
        {activeTab === "header" && (
          <section className={`${CARD} space-y-5`}>
            <h2 className="font-display text-base font-extrabold text-stone-900 dark:text-white">Header & announcement bar</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <label>
                <span className={LABEL}>Brand name</span>
                <input
                  className={`${INPUT} mt-1`}
                  value={form.brandName}
                  onChange={(e) => setForm({ ...form, brandName: e.target.value })}
                />
              </label>
              <label>
                <span className={LABEL}>Brand tagline</span>
                <input
                  className={`${INPUT} mt-1`}
                  value={form.brandTagline}
                  onChange={(e) => setForm({ ...form, brandTagline: e.target.value })}
                />
              </label>
              <div className="sm:col-span-2 flex items-center justify-between border-t border-stone-100 pt-4 dark:border-white/5">
                <div>
                  <h3 className="text-sm font-bold text-stone-900 dark:text-white">Announcement bar</h3>
                  <p className={HINT}>Shown across the very top of all public storefront pages.</p>
                </div>
                <label className="flex items-center gap-2 text-xs font-bold text-stone-600 dark:text-zinc-300">
                  <span>Visible</span>
                  <input
                    type="checkbox"
                    checked={form.visibility?.announcement !== false}
                    onChange={(e) => updateVisibility("announcement", e.target.checked)}
                    className="h-4 w-4 rounded accent-orange-600"
                  />
                </label>
              </div>
              <label className="sm:col-span-2">
                <span className={LABEL}>Announcement bar message</span>
                <textarea
                  rows={2}
                  className={`${TEXTAREA} mt-1`}
                  value={form.announcement}
                  onChange={(e) => setForm({ ...form, announcement: e.target.value })}
                />
              </label>
              <label className="sm:col-span-2">
                <span className={LABEL}>Announcement click destination (optional)</span>
                <input
                  className={`${INPUT} mt-1`}
                  value={form.announcementLink || ""}
                  onChange={(e) => setForm({ ...form, announcementLink: e.target.value })}
                  placeholder="/menu"
                />
              </label>
            </div>
          </section>
        )}





        {/* TAB 5: CONTACT & HOURS */}
        {activeTab === "contact" && (
          <section className={`${CARD} space-y-4`}>
            <h2 className="font-display text-base font-extrabold text-stone-900 dark:text-white">Store contact & operating details</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <label>
                <span className={LABEL}>Opening hours</span>
                <input
                  className={`${INPUT} mt-1`}
                  value={form.hours}
                  onChange={(e) => setForm({ ...form, hours: e.target.value })}
                  placeholder="Mon–Sun · 7:00 AM – 10:30 PM"
                />
              </label>
              <label>
                <span className={LABEL}>Primary phone</span>
                <input
                  className={`${INPUT} mt-1`}
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="+251 46 220 1188"
                />
              </label>
              <label>
                <span className={LABEL}>Customer email</span>
                <input
                  className={`${INPUT} mt-1`}
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="hello@gurshacafe.et"
                />
              </label>
              <label>
                <span className={LABEL}>Physical address</span>
                <input
                  className={`${INPUT} mt-1`}
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  placeholder="Lake Shore Road, Hawassa, Sidama"
                />
              </label>
              <label className="sm:col-span-2">
                <span className={LABEL}>Directions note / landmark tip</span>
                <input
                  className={`${INPUT} mt-1`}
                  value={form.directionsNote || ""}
                  onChange={(e) => setForm({ ...form, directionsNote: e.target.value })}
                  placeholder="Located 200m south of Hawassa Haile Resort..."
                />
              </label>
            </div>

            {/* Action Bar for Contact & Hours */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-5 border-t border-stone-100 dark:border-white/5">
              <div className="text-xs text-stone-500 dark:text-zinc-400">
                {isDirty ? (
                  <span className="font-bold text-amber-600 dark:text-amber-400">You have unsaved changes in Contact & Hours</span>
                ) : (
                  <span>All contact details & hours are synced with the live database.</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {isDirty && (
                  <button
                    type="button"
                    onClick={handleRevert}
                    className="rounded-full border border-stone-200 px-4 py-2 text-xs font-bold text-stone-600 hover:bg-stone-100 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/5"
                  >
                    Revert
                  </button>
                )}
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={handlePublish}
                  className="flex items-center gap-2 rounded-full bg-orange-600 px-6 py-2.5 text-xs font-extrabold text-white shadow-md transition hover:bg-orange-500 disabled:opacity-50"
                >
                  <FloppyDisk size={15} weight="bold" />
                  {isSaving ? "Saving to database..." : "Save Contact & Hours Settings"}
                </button>
              </div>
            </div>
          </section>
        )}



        {/* TAB 8: FOOTER & SOCIAL */}
        {activeTab === "footer" && (
          <section className={`${CARD} space-y-6`}>
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between border-b border-stone-100 pb-4 dark:border-white/5">
              <div>
                <h2 className="font-display text-base font-extrabold text-stone-900 dark:text-white">Footer & social media settings</h2>
                <p className={HINT}>Configure footer brand description, social channels, and public business contact information.</p>
              </div>
              <div className="flex items-center gap-2 mt-2 sm:mt-0">
                {isDirty ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-bold text-amber-700 dark:text-amber-400">
                    <WarningCircle size={13} weight="bold" /> Unsaved changes
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-bold text-emerald-700 dark:text-emerald-400">
                    <CheckCircle size={13} weight="bold" /> Live synced
                  </span>
                )}
              </div>
            </div>

            {/* Description & Copyright */}
            <div className="space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-orange-600">Storefront Brand Information</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="sm:col-span-2">
                  <span className={LABEL}>Footer about / description text</span>
                  <textarea
                    rows={2}
                    className={`${TEXTAREA} mt-1`}
                    value={form.footerAbout}
                    onChange={(e) => setForm({ ...form, footerAbout: e.target.value })}
                    placeholder="Brief description displayed under the brand name in the customer footer..."
                  />
                  <p className={HINT}>Leave blank if you prefer to omit the description in the footer.</p>
                </label>
                <label className="sm:col-span-2">
                  <span className={LABEL}>Copyright notice</span>
                  <input
                    className={`${INPUT} mt-1`}
                    value={form.copyrightText}
                    onChange={(e) => setForm({ ...form, copyrightText: e.target.value })}
                    placeholder="© 2026 Gursha Café. All rights reserved."
                  />
                </label>
              </div>
            </div>

            {/* Social Media Links */}
            <div className="space-y-4 pt-4 border-t border-stone-100 dark:border-white/5">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-orange-600">Social Media Links</h3>
                <p className={HINT}>Platforms with valid URLs display interactive links in the footer. Empty fields are hidden.</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label>
                    <span className={LABEL}>Instagram URL</span>
                    <input
                      className={`${INPUT} mt-1 ${form.socials?.instagram && !isValidUrl(form.socials.instagram) ? "border-red-500 focus:border-red-500" : ""}`}
                      value={form.socials?.instagram || ""}
                      onChange={(e) => updateSocials("instagram", e.target.value)}
                      placeholder="https://instagram.com/gursha_hawassa"
                    />
                  </label>
                  {form.socials?.instagram && !isValidUrl(form.socials.instagram) && (
                    <p className="mt-1 text-xs text-red-500 font-semibold">⚠️ Please enter a valid web URL (e.g., https://instagram.com/username)</p>
                  )}
                </div>

                <div>
                  <label>
                    <span className={LABEL}>Telegram link</span>
                    <input
                      className={`${INPUT} mt-1 ${form.socials?.telegram && !isValidUrl(form.socials.telegram) ? "border-red-500 focus:border-red-500" : ""}`}
                      value={form.socials?.telegram || ""}
                      onChange={(e) => updateSocials("telegram", e.target.value)}
                      placeholder="https://t.me/gursha_cafe"
                    />
                  </label>
                  {form.socials?.telegram && !isValidUrl(form.socials.telegram) && (
                    <p className="mt-1 text-xs text-red-500 font-semibold">⚠️ Please enter a valid Telegram link (e.g., https://t.me/channel)</p>
                  )}
                </div>

                <div>
                  <label>
                    <span className={LABEL}>TikTok link</span>
                    <input
                      className={`${INPUT} mt-1 ${form.socials?.tiktok && !isValidUrl(form.socials.tiktok) ? "border-red-500 focus:border-red-500" : ""}`}
                      value={form.socials?.tiktok || ""}
                      onChange={(e) => updateSocials("tiktok", e.target.value)}
                      placeholder="https://tiktok.com/@gurshacafe"
                    />
                  </label>
                  {form.socials?.tiktok && !isValidUrl(form.socials.tiktok) && (
                    <p className="mt-1 text-xs text-red-500 font-semibold">⚠️ Please enter a valid TikTok link (e.g., https://tiktok.com/@account)</p>
                  )}
                </div>

                <div>
                  <label>
                    <span className={LABEL}>Facebook link</span>
                    <input
                      className={`${INPUT} mt-1 ${form.socials?.facebook && !isValidUrl(form.socials.facebook) ? "border-red-500 focus:border-red-500" : ""}`}
                      value={form.socials?.facebook || ""}
                      onChange={(e) => updateSocials("facebook", e.target.value)}
                      placeholder="https://facebook.com/gurshacafehawassa"
                    />
                  </label>
                  {form.socials?.facebook && !isValidUrl(form.socials.facebook) && (
                    <p className="mt-1 text-xs text-red-500 font-semibold">⚠️ Please enter a valid Facebook link (e.g., https://facebook.com/page)</p>
                  )}
                </div>
              </div>
            </div>

            {/* Business Contact & Location in Footer */}
            <div className="space-y-4 pt-4 border-t border-stone-100 dark:border-white/5">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-orange-600">Business Contact Details (Shown in Footer)</h3>
                <p className={HINT}>These contact details are displayed in the "Visit us" and "Call ahead" columns of the customer footer.</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label>
                  <span className={LABEL}>Primary Phone</span>
                  <input
                    className={`${INPUT} mt-1`}
                    value={form.phone || ""}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    placeholder="+251 46 220 1188"
                  />
                </label>

                <div>
                  <label>
                    <span className={LABEL}>Customer Email</span>
                    <input
                      className={`${INPUT} mt-1 ${form.email && !isValidEmail(form.email) ? "border-red-500 focus:border-red-500" : ""}`}
                      value={form.email || ""}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                      placeholder="hello@gurshacafe.et"
                    />
                  </label>
                  {form.email && !isValidEmail(form.email) && (
                    <p className="mt-1 text-xs text-red-500 font-semibold">⚠️ Please enter a valid email address</p>
                  )}
                </div>

                <label>
                  <span className={LABEL}>Physical Address</span>
                  <input
                    className={`${INPUT} mt-1`}
                    value={form.address || ""}
                    onChange={(e) => setForm({ ...form, address: e.target.value })}
                    placeholder="Lake Shore Road, Hawassa, Sidama, Ethiopia"
                  />
                </label>

                <label>
                  <span className={LABEL}>Operating Hours</span>
                  <input
                    className={`${INPUT} mt-1`}
                    value={form.hours || ""}
                    onChange={(e) => setForm({ ...form, hours: e.target.value })}
                    placeholder="Mon–Sun · 7:00 AM – 10:30 PM"
                  />
                </label>

                <label className="sm:col-span-2">
                  <span className={LABEL}>Directions / Landmark Note</span>
                  <input
                    className={`${INPUT} mt-1`}
                    value={form.directionsNote || ""}
                    onChange={(e) => setForm({ ...form, directionsNote: e.target.value })}
                    placeholder="Located 200m south of Hawassa Haile Resort..."
                  />
                </label>
              </div>
            </div>

            {/* Action Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-5 border-t border-stone-100 dark:border-white/5">
              <div className="text-xs text-stone-500 dark:text-zinc-400">
                {isDirty ? (
                  <span className="font-bold text-amber-600 dark:text-amber-400">You have unsaved changes in Footer & Social</span>
                ) : (
                  <span>All footer settings are synced with the live database.</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {isDirty && (
                  <button
                    type="button"
                    onClick={handleRevert}
                    className="rounded-full border border-stone-200 px-4 py-2 text-xs font-bold text-stone-600 hover:bg-stone-100 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/5"
                  >
                    Revert
                  </button>
                )}
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={handlePublish}
                  className="flex items-center gap-2 rounded-full bg-orange-600 px-6 py-2.5 text-xs font-extrabold text-white shadow-md transition hover:bg-orange-500 disabled:opacity-50"
                >
                  <FloppyDisk size={15} weight="bold" />
                  {isSaving ? "Saving to database..." : "Save Footer & Social Settings"}
                </button>
              </div>
            </div>
          </section>
        )}

        {/* TAB 9: BRANDING & APPEARANCE */}
        {activeTab === "appearance" && (
          <section className={`${CARD} space-y-6`}>
            <div>
              <h2 className="font-display text-base font-extrabold text-stone-900 dark:text-white">Brand appearance & visual style</h2>
              <p className={HINT}>Control colors and styling preserved within the design system.</p>
            </div>

            <div className="space-y-3">
              <span className={LABEL}>Primary brand theme color</span>
              <div className="flex flex-wrap items-center gap-3">
                {[
                  { name: "Hawassa Sunset", hex: "#ea580c" },
                  { name: "Lakeside Honey", hex: "#d97706" },
                  { name: "Rift Valley Green", hex: "#059669" },
                  { name: "Royal Berry", hex: "#be123c" },
                  { name: "Roasted Espresso", hex: "#78350f" },
                  { name: "Deep Charcoal", hex: "#27272a" },
                ].map((palette) => (
                  <button
                    key={palette.hex}
                    type="button"
                    onClick={() => updateAppearance("brandColor", palette.hex)}
                    className={`flex items-center gap-2 rounded-xl border p-2 text-xs font-bold transition ${
                      form.appearance?.brandColor === palette.hex
                        ? "border-stone-900 ring-2 ring-stone-900/30 dark:border-white"
                        : "border-stone-200 dark:border-white/10"
                    }`}
                  >
                    <span className="h-5 w-5 rounded-full shadow-inner" style={{ backgroundColor: palette.hex }} />
                    <span className="text-stone-700 dark:text-zinc-300">{palette.name}</span>
                  </button>
                ))}
              </div>
              <div className="mt-2 flex items-center gap-3">
                <input
                  type="color"
                  value={form.appearance?.brandColor || "#ea580c"}
                  onChange={(e) => updateAppearance("brandColor", e.target.value)}
                  className="h-10 w-16 cursor-pointer rounded-lg border border-stone-200 p-1 dark:border-white/10"
                />
                <input
                  type="text"
                  value={form.appearance?.brandColor || "#ea580c"}
                  onChange={(e) => updateAppearance("brandColor", e.target.value)}
                  className="w-32 rounded-xl border border-stone-300 px-3 py-2 text-xs font-mono font-bold dark:border-white/15 dark:bg-white/5"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 pt-4 border-t border-stone-100 dark:border-white/5">
              <label>
                <span className={LABEL}>Typography vibe</span>
                <select
                  className={`${INPUT} mt-1`}
                  value={form.appearance?.fontTheme || "modern"}
                  onChange={(e) => updateAppearance("fontTheme", e.target.value as any)}
                >
                  <option value="modern">Modern Geometric (Plus Jakarta / Inter)</option>
                  <option value="classic">Classic Ethiopian Elegance</option>
                  <option value="warm">Warm Lakeside Café</option>
                </select>
              </label>
              <label>
                <span className={LABEL}>Header backdrop style</span>
                <select
                  className={`${INPUT} mt-1`}
                  value={form.appearance?.headerStyle || "glass"}
                  onChange={(e) => updateAppearance("headerStyle", e.target.value as any)}
                >
                  <option value="glass">Translucent Glassmorphism</option>
                  <option value="solid">Solid Background</option>
                </select>
              </label>
            </div>
          </section>
        )}
      </div>

      {/* 4. Storefront Live Preview Modal */}
      {previewOpen && (
        <StorefrontPreviewModal
          form={form}
          onClose={() => setPreviewOpen(false)}
        />
      )}
    </div>
  );
}