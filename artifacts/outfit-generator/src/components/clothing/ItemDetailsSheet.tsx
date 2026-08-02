/**
 * ItemDetailsSheet — full-screen overlay showing a clothing item's details.
 * Styled to match the dark gold luxury theme of the wardrobe/generate pages.
 * Uses custom in-app pickers so no native iOS system UI interrupts the flow.
 *
 * Props:
 *   showAddToLookbook — when true (search results, Favorites), shows an
 *   "Add to Lookbook" picker instead of "Clean Up Photo".
 */
import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Heart, Trash2, Save, Check, Sparkles, ChevronDown } from "lucide-react";
import { CleanUpPhotoOverlay } from "./CleanUpPhotoOverlay";
import {
  type ClothingItem,
  type SavedOutfit,
  type ClothingItemUpdateCategory,
  useUpdateClothingItem,
  useDeleteClothingItem,
  useListOutfits,
  useAddItemToOutfit,
  useRemoveItemFromOutfit,
  getListClothingQueryKey,
  getListOutfitsQueryKey,
  getWardrobeStatsQueryKey,
} from "@/hooks/useLocalDB";
import { useQueryClient } from "@tanstack/react-query";
import { getImageUrl } from "@/lib/utils";

// ── Design tokens ─────────────────────────────────────────────────────────────
const T = {
  bg:           "#0e0b07",
  bgCard:       "#161008",
  bgInput:      "#1a1208",
  bgPicker:     "#1f1508",
  gold:         "#B8894E",
  goldLight:    "#E8D4B0",
  goldBorder:   "rgba(184,137,78,0.28)",
  goldBorderHi: "rgba(184,137,78,0.60)",
  textPrimary:  "#E8D4B0",
  textMuted:    "rgba(232,212,176,0.45)",
  textFaint:    "rgba(232,212,176,0.22)",
};

// ── Shared field primitives ───────────────────────────────────────────────────

const inputBase: React.CSSProperties = {
  width: "100%",
  background: T.bgInput,
  border: `1.5px solid ${T.goldBorder}`,
  borderRadius: 10,
  padding: "10px 12px",
  fontSize: 13,
  fontWeight: 500,
  color: T.textPrimary,
  fontFamily: "var(--font-sans)",
  outline: "none",
  WebkitAppearance: "none",
  MozAppearance: "none",
  appearance: "none" as const,
  colorScheme: "dark" as const,
  boxSizing: "border-box" as const,
};

const labelStyle: React.CSSProperties = {
  fontSize: 9,
  fontWeight: 800,
  letterSpacing: "0.16em",
  textTransform: "uppercase" as const,
  color: T.textMuted,
  fontFamily: "var(--font-display)",
  marginBottom: 5,
  display: "block",
};

// ── Text field ─────────────────────────────────────────────────────────────────

function Field({
  label, value, onChange, placeholder, type = "text",
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <label style={labelStyle}>{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? label}
        style={inputBase}
      />
    </div>
  );
}

// ── Custom in-app picker ───────────────────────────────────────────────────────

interface PickerOption { label: string; value: string; }

function PickerField({
  label, value, onChange, options,
}: {
  label: string; value: string; onChange: (v: string) => void;
  options: (string | PickerOption)[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const normalised: PickerOption[] = options.map((o) =>
    typeof o === "string" ? { label: o, value: o } : o
  );

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
    };
  }, [open]);

  const selected = normalised.find((o) => o.value === value);
  const display  = selected ? selected.label : `— ${label} —`;

  return (
    <div ref={ref} style={{ display: "flex", flexDirection: "column", position: "relative" }}>
      <label style={labelStyle}>{label}</label>

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          ...inputBase,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          cursor: "pointer", textAlign: "left",
          border: `1.5px solid ${open ? T.goldBorderHi : T.goldBorder}`,
          color: value ? T.textPrimary : T.textMuted,
        }}
      >
        <span>{display}</span>
        <ChevronDown
          style={{
            width: 14, height: 14, flexShrink: 0, marginLeft: 6,
            color: T.textMuted,
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.2s",
          }}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scaleY: 0.92 }}
            animate={{ opacity: 1, y: 0, scaleY: 1 }}
            exit={{ opacity: 0, y: -4, scaleY: 0.92 }}
            transition={{ duration: 0.15 }}
            style={{
              position: "absolute",
              top: "calc(100% + 4px)",
              left: 0, right: 0,
              zIndex: 200,
              background: T.bgPicker,
              border: `1.5px solid ${T.goldBorderHi}`,
              borderRadius: 12,
              overflow: "hidden",
              transformOrigin: "top center",
              boxShadow: "0 8px 32px rgba(0,0,0,0.7)",
            }}
          >
            {normalised.map((opt) => {
              const isSel = opt.value === value || (!value && !opt.value);
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => { onChange(opt.value); setOpen(false); }}
                  style={{
                    width: "100%",
                    padding: "11px 14px",
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    background: isSel ? "rgba(184,137,78,0.12)" : "transparent",
                    border: "none",
                    borderBottom: `1px solid rgba(184,137,78,0.10)`,
                    cursor: "pointer",
                    fontSize: 13, fontWeight: isSel ? 700 : 500,
                    color: isSel ? T.goldLight : T.textMuted,
                    fontFamily: "var(--font-sans)",
                    textAlign: "left",
                  }}
                >
                  <span>{opt.label || `— ${label} —`}</span>
                  {isSel && <Check style={{ width: 13, height: 13, color: T.gold, flexShrink: 0 }} />}
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Lookbook picker sheet ─────────────────────────────────────────────────────
// Shown when showAddToLookbook=true and the user taps "Add to Lookbook".

function LookbookPickerSheet({
  item,
  onClose,
}: {
  item: ClothingItem;
  onClose: () => void;
}) {
  const { data: outfits = [] } = useListOutfits();
  const addItem    = useAddItemToOutfit();
  const removeItem = useRemoveItemFromOutfit();
  const qc         = useQueryClient();
  const [busyId, setBusyId] = useState<number | null>(null);

  const toggle = async (outfit: SavedOutfit) => {
    const alreadyIn = outfit.items.some((i) => i.id === item.id);
    setBusyId(outfit.id);
    try {
      if (alreadyIn) {
        await removeItem.mutateAsync({ id: outfit.id, itemId: item.id });
      } else {
        await addItem.mutateAsync({ id: outfit.id, data: { itemId: item.id } });
      }
      qc.invalidateQueries({ queryKey: getListOutfitsQueryKey() });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: "100%" }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: "100%" }}
      transition={{ type: "spring", damping: 28, stiffness: 240 }}
      style={{
        position: "fixed", inset: 0, zIndex: 70,
        display: "flex", flexDirection: "column",
        maxWidth: 448, margin: "0 auto",
        background: T.bg,
      }}
    >
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "16px",
        paddingTop: "max(0.75rem, env(safe-area-inset-top))",
        borderBottom: `1px solid ${T.goldBorder}`,
        flexShrink: 0,
      }}>
        <h2 style={{
          fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 15,
          letterSpacing: "0.08em", textTransform: "uppercase",
          color: T.textPrimary, margin: 0,
        }}>
          Add to Lookbook
        </h2>
        <button
          onClick={onClose}
          style={{
            width: 32, height: 32, borderRadius: "50%",
            border: `1.5px solid ${T.goldBorder}`, background: T.bgCard,
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer",
          }}
        >
          <X style={{ width: 14, height: 14, color: T.textMuted }} />
        </button>
      </div>

      {/* Outfit list */}
      <div style={{ flex: 1, overflowY: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
        {outfits.length === 0 && (
          <p style={{ textAlign: "center", color: T.textMuted, fontSize: 13, marginTop: 40, padding: "0 16px" }}>
            No lookbook groups yet. Create one from your Collection.
          </p>
        )}
        {outfits.map((outfit) => {
          const alreadyIn = outfit.items.some((i) => i.id === item.id);
          const busy      = busyId === outfit.id;
          const thumbs    = outfit.items.slice(0, 3);

          return (
            <button
              key={outfit.id}
              onClick={() => toggle(outfit)}
              disabled={busy}
              style={{
                display: "flex", alignItems: "center", gap: 12,
                width: "100%", padding: 12, borderRadius: 12,
                background: alreadyIn ? "rgba(184,137,78,0.12)" : T.bgCard,
                border: `1.5px solid ${alreadyIn ? T.goldBorderHi : T.goldBorder}`,
                cursor: busy ? "default" : "pointer",
                opacity: busy ? 0.5 : 1,
                textAlign: "left",
              }}
            >
              {/* 3 thumbnails */}
              <div style={{ display: "flex", gap: 3, flexShrink: 0 }}>
                {Array.from({ length: 3 }).map((_, idx) => {
                  const thumb = thumbs[idx];
                  return (
                    <div
                      key={idx}
                      style={{
                        width: 36, height: 36, borderRadius: 6,
                        background: "#1a1208", overflow: "hidden",
                        border: `1px solid ${T.goldBorder}`,
                        flexShrink: 0,
                      }}
                    >
                      {thumb?.imageObjectPath && (
                        <img
                          src={getImageUrl(thumb.imageObjectPath)!}
                          alt=""
                          style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        />
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Name */}
              <span style={{
                flex: 1, fontSize: 13, fontWeight: 600,
                color: T.textPrimary, fontFamily: "var(--font-sans)",
              }}>
                {outfit.name}
              </span>

              {/* Checkmark if already in outfit */}
              {alreadyIn && (
                <Check style={{ width: 15, height: 15, color: T.gold, flexShrink: 0 }} />
              )}
            </button>
          );
        })}
      </div>
    </motion.div>
  );
}

// ── Types ──────────────────────────────────────────────────────────────────────

const SEASON_OPTIONS   = ["", "Spring", "Summer", "Fall", "Winter", "All Season"];
const OCCASION_OPTIONS = ["", "Casual", "Work", "Formal", "Sport", "Special Event"];
const CATEGORY_OPTIONS: { label: string; value: string }[] = [
  { label: "Row 1", value: "outfits" },
  { label: "Row 2", value: "beauty" },
  { label: "Row 3", value: "toiletries" },
  { label: "Row 4", value: "essentials" },
];

interface ItemDetailsSheetProps {
  item:               ClothingItem | null;
  onClose:            () => void;
  onDeleted?:         () => void;
  showAddToLookbook?: boolean;
}

interface FormState {
  name: string; brand: string; color: string; size: string;
  season: string; occasion: string; purchasePrice: string;
  purchaseDate: string; notes: string; isFavorite: boolean; category: string;
}

function toForm(item: ClothingItem): FormState {
  return {
    name:          item.name          ?? "",
    brand:         item.brand         ?? "",
    color:         item.color         ?? "",
    size:          item.size          ?? "",
    season:        item.season        ?? "",
    occasion:      item.occasion      ?? "",
    purchasePrice: item.purchasePrice ?? "",
    purchaseDate:  item.purchaseDate  ?? "",
    notes:         item.notes         ?? "",
    isFavorite:    item.isFavorite    ?? false,
    category:      item.category      ?? "",
  };
}

function isDirty(form: FormState, item: ClothingItem): boolean {
  return (
    form.name          !== (item.name          ?? "") ||
    form.brand         !== (item.brand         ?? "") ||
    form.color         !== (item.color         ?? "") ||
    form.size          !== (item.size          ?? "") ||
    form.season        !== (item.season        ?? "") ||
    form.occasion      !== (item.occasion      ?? "") ||
    form.purchasePrice !== (item.purchasePrice ?? "") ||
    form.purchaseDate  !== (item.purchaseDate  ?? "") ||
    form.notes         !== (item.notes         ?? "") ||
    form.isFavorite    !== (item.isFavorite    ?? false) ||
    form.category      !== (item.category      ?? "")
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function ItemDetailsSheet({
  item,
  onClose,
  onDeleted,
  showAddToLookbook = false,
}: ItemDetailsSheetProps) {
  const [form,                setForm]                = useState<FormState | null>(null);
  const [showDeleteConfirm,   setShowDeleteConfirm]   = useState(false);
  const [showCleanUp,         setShowCleanUp]         = useState(false);
  const [showLookbookPicker,  setShowLookbookPicker]  = useState(false);
  const [displayImageUrl,     setDisplayImageUrl]     = useState<string | null>(
    item?.imageObjectPath ?? null
  );

  const updateItem  = useUpdateClothingItem();
  const deleteItem  = useDeleteClothingItem();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (item) {
      setForm(toForm(item));
      setDisplayImageUrl(item.imageObjectPath ?? null);
    }
    setShowDeleteConfirm(false);
    setShowCleanUp(false);
    setShowLookbookPicker(false);
  }, [item?.id]);

  if (!item || !form) return null;

  const dirty = isDirty(form, item);
  const patch = (key: keyof FormState) => (value: string | boolean) =>
    setForm((prev) => prev ? { ...prev, [key]: value } : prev);

  const handleSave = () => {
    updateItem.mutate(
      {
        id: item.id,
        data: {
          name:          form.name.trim() || item.name,
          brand:         form.brand.trim(),
          color:         form.color.trim(),
          size:          form.size.trim(),
          season:        form.season,
          occasion:      form.occasion,
          purchasePrice: form.purchasePrice.trim(),
          purchaseDate:  form.purchaseDate.trim(),
          notes:         form.notes.trim(),
          isFavorite:    form.isFavorite,
          category:      (form.category || item.category) as ClothingItemUpdateCategory,
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListClothingQueryKey() });
          queryClient.invalidateQueries({ queryKey: getListOutfitsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getWardrobeStatsQueryKey() });
          onClose();
        },
      }
    );
  };

  const handleDelete = () => {
    deleteItem.mutate(
      { id: item.id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListClothingQueryKey() });
          queryClient.invalidateQueries({ queryKey: getListOutfitsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getWardrobeStatsQueryKey() });
          onDeleted?.();
          onClose();
        },
      }
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: "100%" }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: "100%" }}
      transition={{ type: "spring", damping: 28, stiffness: 240 }}
      style={{
        position: "fixed", inset: 0, zIndex: 65,
        display: "flex", flexDirection: "column",
        maxWidth: 448, margin: "0 auto",
        background: T.bg,
        overflowY: "auto",
      }}
    >
      {/* ── Header ── */}
      <div style={{
        position: "sticky", top: 0, zIndex: 50, flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        paddingLeft: 16, paddingRight: 16,
        paddingTop: "max(0.75rem, env(safe-area-inset-top))",
        paddingBottom: "0.75rem",
        background: T.bg,
        borderBottom: `1px solid ${T.goldBorder}`,
      }}>
        <h2 style={{
          fontFamily: "var(--font-display)",
          fontWeight: 800,
          fontSize: 16,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: T.textPrimary,
          margin: 0,
        }}>
          Item Details
        </h2>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {/* Favourite */}
          <button
            onClick={() => {
              const next = !form.isFavorite;
              patch("isFavorite")(next);
              updateItem.mutate(
                { id: item.id, data: { isFavorite: next } },
                {
                  onSuccess: () => {
                    queryClient.invalidateQueries({ queryKey: getListClothingQueryKey() });
                    queryClient.invalidateQueries({ queryKey: getListOutfitsQueryKey() });
                    queryClient.invalidateQueries({ queryKey: getWardrobeStatsQueryKey() });
                  },
                }
              );
            }}
            style={{
              width: 36, height: 36, borderRadius: "50%",
              border: `1.5px solid ${form.isFavorite ? "rgba(231,76,60,0.5)" : T.goldBorder}`,
              background: form.isFavorite ? "rgba(192,57,43,0.18)" : T.bgCard,
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer",
            }}
          >
            <Heart style={{ width: 15, height: 15 }}
              fill={form.isFavorite ? "#e74c3c" : "none"}
              stroke={form.isFavorite ? "#e74c3c" : T.textMuted} />
          </button>
          {/* Close */}
          <button
            onClick={onClose}
            style={{
              width: 36, height: 36, borderRadius: "50%",
              border: `1.5px solid ${T.goldBorder}`,
              background: T.bgCard,
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer",
            }}
          >
            <X style={{ width: 15, height: 15, color: T.textMuted }} />
          </button>
        </div>
      </div>

      {/* ── Photo ── */}
      {displayImageUrl && (
        <div style={{ flexShrink: 0, borderBottom: `1px solid ${T.goldBorder}` }}>
          <div style={{
            width: "100%", height: 208,
            background:
              "repeating-conic-gradient(rgba(184,137,78,0.07) 0% 25%, transparent 0% 50%)",
            backgroundSize: "16px 16px",
          }}>
            <img
              src={getImageUrl(displayImageUrl)!}
              alt={item.name}
              style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
            />
          </div>

          {/* Context-aware action button below photo */}
          {showAddToLookbook ? (
            <button
              onClick={() => setShowLookbookPicker(true)}
              style={{
                width: "100%", display: "flex", alignItems: "center",
                justifyContent: "center", gap: 6, padding: "10px 16px",
                background: T.bgCard,
                border: "none", borderTop: `1px solid ${T.goldBorder}`,
                cursor: "pointer",
                fontSize: 10, fontWeight: 700,
                letterSpacing: "0.14em", textTransform: "uppercase" as const,
                color: T.gold, fontFamily: "var(--font-display)",
              }}
            >
              🪙
              Add to Lookbook
            </button>
          ) : (
            !item.bgRemoved && !displayImageUrl.startsWith("data:image/png") && (
              <button
                onClick={() => setShowCleanUp(true)}
                style={{
                  width: "100%", display: "flex", alignItems: "center",
                  justifyContent: "center", gap: 6, padding: "10px 16px",
                  background: T.bgCard,
                  border: "none", borderTop: `1px solid ${T.goldBorder}`,
                  cursor: "pointer",
                  fontSize: 10, fontWeight: 700,
                  letterSpacing: "0.14em", textTransform: "uppercase" as const,
                  color: T.textMuted, fontFamily: "var(--font-display)",
                }}
              >
                <Sparkles style={{ width: 13, height: 13 }} />
                Clean Up Photo
              </button>
            )
          )}
        </div>
      )}

      {/* ── Form ── */}
      <div style={{
        flex: 1, padding: "20px 16px",
        display: "flex", flexDirection: "column", gap: 16,
      }}>
        <Field
          label="Item Name" value={form.name}
          onChange={patch("name") as (v: string) => void}
          placeholder="e.g. White Linen Shirt"
        />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Brand" value={form.brand}
            onChange={patch("brand") as (v: string) => void} placeholder="Nike, Zara…" />
          <Field label="Color" value={form.color}
            onChange={patch("color") as (v: string) => void} placeholder="Navy Blue" />
        </div>

        <Field label="Size / Volume" value={form.size}
          onChange={patch("size") as (v: string) => void}
          placeholder="30ml, 50ml, Full Size…" />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <PickerField label="Season"   value={form.season}
            onChange={patch("season") as (v: string) => void}   options={SEASON_OPTIONS} />
          <PickerField label="Occasion" value={form.occasion}
            onChange={patch("occasion") as (v: string) => void} options={OCCASION_OPTIONS} />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Purchase Price" value={form.purchasePrice}
            onChange={patch("purchasePrice") as (v: string) => void} placeholder="$49.99" />
          {/* Plain text so iOS doesn't open a native date wheel */}
          <Field label="Date"  value={form.purchaseDate}
            onChange={patch("purchaseDate") as (v: string) => void} placeholder="DD/MM/YY" />
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <label style={labelStyle}>Notes</label>
          <textarea
            value={form.notes}
            onChange={(e) => patch("notes")(e.target.value)}
            placeholder="Anything worth remembering…"
            rows={3}
            style={{ ...inputBase, resize: "none", fontFamily: "var(--font-sans)" }}
          />
        </div>

        <PickerField label="Category" value={form.category}
          onChange={patch("category") as (v: string) => void} options={CATEGORY_OPTIONS} />
      </div>

      {/* ── Footer ── */}
      <div style={{
        position: "sticky", bottom: 0, flexShrink: 0,
        padding: "12px 16px",
        paddingBottom: "max(12px, env(safe-area-inset-bottom))",
        background: T.bg,
        borderTop: `1px solid ${T.goldBorder}`,
        display: "flex", flexDirection: "column", gap: 8,
      }}>
        <AnimatePresence>
          {dirty && (
            <motion.button
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              onClick={handleSave}
              disabled={updateItem.isPending}
              style={{
                width: "100%", padding: "13px 16px", borderRadius: 12,
                background: "linear-gradient(to bottom, #E8D4B0, #B8894E)",
                border: `1.5px solid ${T.gold}`,
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                fontSize: 12, fontWeight: 800,
                letterSpacing: "0.10em", textTransform: "uppercase" as const,
                color: "#3A2210", fontFamily: "var(--font-display)",
                cursor: "pointer", opacity: updateItem.isPending ? 0.6 : 1,
              }}
            >
              <Save style={{ width: 14, height: 14 }} />
              {updateItem.isPending ? "Saving…" : "Save Changes"}
            </motion.button>
          )}
        </AnimatePresence>

        {!showDeleteConfirm ? (
          <button
            onClick={() => setShowDeleteConfirm(true)}
            style={{
              width: "100%", padding: "12px 16px", borderRadius: 12,
              background: "transparent",
              border: `1.5px solid rgba(184,137,78,0.15)`,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              fontSize: 11, fontWeight: 700,
              letterSpacing: "0.10em", textTransform: "uppercase" as const,
              color: T.textFaint, fontFamily: "var(--font-display)",
              cursor: "pointer",
            }}
          >
            <Trash2 style={{ width: 13, height: 13 }} />
            Delete from Collection Forever
          </button>
        ) : (
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => setShowDeleteConfirm(false)}
              style={{
                flex: 1, padding: "12px 16px", borderRadius: 12,
                background: T.bgCard, border: `1.5px solid ${T.goldBorder}`,
                fontSize: 11, fontWeight: 700,
                letterSpacing: "0.10em", textTransform: "uppercase" as const,
                color: T.textMuted, fontFamily: "var(--font-display)",
                cursor: "pointer",
              }}
            >Cancel</button>
            <button
              onClick={handleDelete}
              disabled={deleteItem.isPending}
              style={{
                flex: 1, padding: "12px 16px", borderRadius: 12,
                background: "rgba(192,57,43,0.15)",
                border: "1.5px solid rgba(192,57,43,0.50)",
                fontSize: 11, fontWeight: 700,
                letterSpacing: "0.10em", textTransform: "uppercase" as const,
                color: "#e74c3c", fontFamily: "var(--font-display)",
                cursor: "pointer", opacity: deleteItem.isPending ? 0.5 : 1,
              }}
            >
              {deleteItem.isPending ? "Deleting…" : "Yes, Delete"}
            </button>
          </div>
        )}
      </div>

      {/* ── Lookbook picker overlay ── */}
      <AnimatePresence>
        {showLookbookPicker && (
          <LookbookPickerSheet
            key="lookbook-picker"
            item={item}
            onClose={() => setShowLookbookPicker(false)}
          />
        )}
      </AnimatePresence>

      {/* ── Clean Up overlay ── */}
      <AnimatePresence>
        {showCleanUp && displayImageUrl && (
          <CleanUpPhotoOverlay
            imageUrl={displayImageUrl}
            itemId={item.id}
            onClose={() => setShowCleanUp(false)}
            onSaved={(newUrl) => setDisplayImageUrl(newUrl)}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}
