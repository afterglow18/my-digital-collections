/**
 * ItemDetailsSheet — full-screen overlay showing a clothing item's details.
 * Styled to match the dark gold luxury theme of the wardrobe/generate pages.
 */
import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, Heart, Trash2, Save, ChevronDown, Sparkles,
} from "lucide-react";
import { CleanUpPhotoOverlay } from "./CleanUpPhotoOverlay";
import {
  type ClothingItem,
  type ClothingItemUpdateCategory,
  useUpdateClothingItem,
  useDeleteClothingItem,
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
  gold:         "#B8894E",
  goldLight:    "#E8D4B0",
  goldFaint:    "rgba(184,137,78,0.18)",
  goldBorder:   "rgba(184,137,78,0.30)",
  goldBorderHi: "rgba(184,137,78,0.65)",
  textPrimary:  "#E8D4B0",
  textMuted:    "rgba(232,212,176,0.45)",
  textFaint:    "rgba(232,212,176,0.25)",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const SEASON_OPTIONS    = ["", "Spring", "Summer", "Fall", "Winter", "All Season"];
const OCCASION_OPTIONS  = ["", "Casual", "Work", "Formal", "Sport", "Special Event"];
const CATEGORY_OPTIONS  = ["outfits", "beauty", "toiletries", "essentials"];

const fieldStyle: React.CSSProperties = {
  width: "100%",
  background: T.bgInput,
  border: `1.5px solid ${T.goldBorder}`,
  borderRadius: 10,
  padding: "9px 12px",
  fontSize: 13,
  fontWeight: 500,
  color: T.textPrimary,
  fontFamily: "var(--font-sans)",
  outline: "none",
  appearance: "none" as const,
};

const labelStyle: React.CSSProperties = {
  fontSize: 9,
  fontWeight: 700,
  letterSpacing: "0.16em",
  textTransform: "uppercase" as const,
  color: T.textMuted,
  fontFamily: "var(--font-display)",
  marginBottom: 4,
  display: "block",
};

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
        style={{
          ...fieldStyle,
          colorScheme: "dark",
        }}
      />
    </div>
  );
}

function SelectField({
  label, value, onChange, options,
}: {
  label: string; value: string; onChange: (v: string) => void; options: string[];
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <label style={labelStyle}>{label}</label>
      <div style={{ position: "relative" }}>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{ ...fieldStyle, paddingRight: 30, cursor: "pointer", colorScheme: "dark" }}
        >
          {options.map((o) => (
            <option key={o} value={o} style={{ background: T.bgInput, color: T.textPrimary }}>
              {o || `— ${label} —`}
            </option>
          ))}
        </select>
        <ChevronDown
          style={{
            position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
            width: 14, height: 14, pointerEvents: "none", color: T.textMuted,
          }}
        />
      </div>
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

interface ItemDetailsSheetProps {
  item: ClothingItem | null;
  onClose: () => void;
  onDeleted?: () => void;
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

export function ItemDetailsSheet({ item, onClose, onDeleted }: ItemDetailsSheetProps) {
  const [form, setForm]                             = useState<FormState | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm]   = useState(false);
  const [showCleanUp,       setShowCleanUp]         = useState(false);
  const [displayImageUrl, setDisplayImageUrl]       = useState<string | null>(
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
        position: "sticky", top: 0, zIndex: 10, flexShrink: 0,
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
          {/* Favourite toggle */}
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
              border: `1.5px solid ${form.isFavorite ? "#c0392b" : T.goldBorder}`,
              background: form.isFavorite ? "rgba(192,57,43,0.18)" : T.bgCard,
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer",
            }}
          >
            <Heart
              style={{ width: 15, height: 15 }}
              fill={form.isFavorite ? "#e74c3c" : "none"}
              stroke={form.isFavorite ? "#e74c3c" : T.textMuted}
            />
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
          <div
            style={{
              width: "100%", height: 208,
              background: "repeating-conic-gradient(rgba(184,137,78,0.07) 0% 25%, transparent 0% 50%)",
              backgroundSize: "16px 16px",
            }}
          >
            <img
              src={getImageUrl(displayImageUrl)!}
              alt={item.name}
              style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
            />
          </div>
          {!displayImageUrl.startsWith("data:image/png") && (
            <button
              onClick={() => setShowCleanUp(true)}
              style={{
                width: "100%", display: "flex", alignItems: "center", justifyContent: "center",
                gap: 6, padding: "10px 16px",
                background: T.bgCard,
                borderTop: `1px solid ${T.goldBorder}`,
                borderBottom: "none", borderLeft: "none", borderRight: "none",
                cursor: "pointer",
                fontSize: 10, fontWeight: 700,
                letterSpacing: "0.14em", textTransform: "uppercase" as const,
                color: T.textMuted,
                fontFamily: "var(--font-display)",
              }}
            >
              <Sparkles style={{ width: 13, height: 13 }} />
              Clean Up Photo
            </button>
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
          <Field label="Brand" value={form.brand} onChange={patch("brand") as (v: string) => void} placeholder="Nike, Zara…" />
          <Field label="Color" value={form.color} onChange={patch("color") as (v: string) => void} placeholder="Navy Blue" />
        </div>
        <Field label="Size / Volume" value={form.size} onChange={patch("size") as (v: string) => void} placeholder="30ml, 50ml, Full Size…" />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <SelectField label="Season"   value={form.season}   onChange={patch("season") as (v: string) => void}   options={SEASON_OPTIONS} />
          <SelectField label="Occasion" value={form.occasion} onChange={patch("occasion") as (v: string) => void} options={OCCASION_OPTIONS} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Purchase Price" value={form.purchasePrice} onChange={patch("purchasePrice") as (v: string) => void} placeholder="$49.99" />
          <Field label="Purchase Date"  value={form.purchaseDate}  onChange={patch("purchaseDate") as (v: string) => void}  type="date" />
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <label style={labelStyle}>Notes</label>
          <textarea
            value={form.notes}
            onChange={(e) => patch("notes")(e.target.value)}
            placeholder="Anything worth remembering…"
            rows={3}
            style={{
              ...fieldStyle,
              resize: "none",
              fontFamily: "var(--font-sans)",
            }}
          />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <SelectField
            label="Category" value={form.category}
            onChange={patch("category") as (v: string) => void}
            options={CATEGORY_OPTIONS}
          />
          <div style={{ display: "flex", flexDirection: "column", opacity: 0.45, pointerEvents: "none" }}>
            <label style={labelStyle}>Times Worn</label>
            <div style={{
              ...fieldStyle,
              color: T.textMuted,
            }}>
              {item.timesWorn ?? 0}
            </div>
          </div>
        </div>
      </div>

      {/* ── Footer actions ── */}
      <div style={{
        position: "sticky", bottom: 0, flexShrink: 0,
        padding: "12px 16px",
        paddingBottom: "max(12px, env(safe-area-inset-bottom))",
        background: T.bg,
        borderTop: `1px solid ${T.goldBorder}`,
        display: "flex", flexDirection: "column", gap: 8,
      }}>
        {/* Save (only when dirty) */}
        <AnimatePresence>
          {dirty && (
            <motion.button
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              onClick={handleSave}
              disabled={updateItem.isPending}
              style={{
                width: "100%", padding: "13px 16px",
                borderRadius: 12,
                background: "linear-gradient(to bottom, #E8D4B0, #B8894E)",
                border: `1.5px solid ${T.gold}`,
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                fontSize: 12, fontWeight: 800,
                letterSpacing: "0.10em", textTransform: "uppercase" as const,
                color: "#3A2210",
                fontFamily: "var(--font-display)",
                cursor: "pointer",
                opacity: updateItem.isPending ? 0.6 : 1,
              }}
            >
              <Save style={{ width: 14, height: 14 }} />
              {updateItem.isPending ? "Saving…" : "Save Changes"}
            </motion.button>
          )}
        </AnimatePresence>

        {/* Delete */}
        {!showDeleteConfirm ? (
          <button
            onClick={() => setShowDeleteConfirm(true)}
            style={{
              width: "100%", padding: "12px 16px",
              borderRadius: 12,
              background: "transparent",
              border: `1.5px solid rgba(184,137,78,0.18)`,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              fontSize: 11, fontWeight: 700,
              letterSpacing: "0.10em", textTransform: "uppercase" as const,
              color: T.textFaint,
              fontFamily: "var(--font-display)",
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
                background: T.bgCard,
                border: `1.5px solid ${T.goldBorder}`,
                fontSize: 11, fontWeight: 700,
                letterSpacing: "0.10em", textTransform: "uppercase" as const,
                color: T.textMuted,
                fontFamily: "var(--font-display)",
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleDelete}
              disabled={deleteItem.isPending}
              style={{
                flex: 1, padding: "12px 16px", borderRadius: 12,
                background: "rgba(192,57,43,0.15)",
                border: "1.5px solid rgba(192,57,43,0.55)",
                fontSize: 11, fontWeight: 700,
                letterSpacing: "0.10em", textTransform: "uppercase" as const,
                color: "#e74c3c",
                fontFamily: "var(--font-display)",
                cursor: "pointer",
                opacity: deleteItem.isPending ? 0.5 : 1,
              }}
            >
              {deleteItem.isPending ? "Deleting…" : "Yes, Delete"}
            </button>
          </div>
        )}
      </div>

      {/* ── Clean Up Photo overlay ── */}
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
