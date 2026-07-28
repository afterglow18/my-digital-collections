/**
 * WardrobePage — briefcase-bg.png (1024×1536 PNG)
 *
 * Layout: 4 shelf sections inside a Hollywood-mirror frame.
 * Items sit ON TOP of each shelf surface (bottom-anchored within each section).
 * Baked-in pink "ADD X" pills show through the background when shelves are empty;
 * a React-rendered transparent tap zone handles the click.
 * When items are present, the carousel fills the section and covers the pill.
 *
 * Sections (y-fractions of image height):
 *   Section 1 (TOPS):        0.19 → 0.39
 *   Section 2 (BOTTOMS):     0.39 → 0.55
 *   Section 3 (SHOES):       0.55 → 0.71
 *   Section 4 (ACCESSORIES): 0.71 → 0.85
 *
 * No rod-overlay technique needed — shelf surfaces are already below items.
 * Save outfit: floating pill button at the top of the mirror.
 */

import React, {
  useEffect, useRef, useState,
  useCallback, RefObject,
} from "react";
import { useLocation } from "wouter";
import {
  useListClothing, getListClothingQueryKey,
  useListOutfits, getListOutfitsQueryKey,
  useSaveOutfit,
  type ClothingItem,
} from "@/hooks/useLocalDB";
import { X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { ClosetRow, ClosetRowHandle } from "@/components/ClosetRow";
import { QuickAddSheet } from "@/components/clothing/QuickAddSheet";
import { ItemDetailsSheet } from "@/components/clothing/ItemDetailsSheet";
import { UpgradeSheet, UpgradeReason } from "@/components/paywall/UpgradeSheet";
import { useQueryClient } from "@tanstack/react-query";
import { useEntitlements } from "@/hooks/useEntitlements";
import { FREE_ITEM_LIMIT } from "@/lib/entitlements";
import { useCollectionNames } from "@/hooks/useCollectionNames";

// ── Types ─────────────────────────────────────────────────────────────────────
type RowKey   = "outfits" | "beauty" | "toiletries" | "essentials";
type Category = "outfits" | "beauty" | "toiletries" | "essentials";

const ROWS: { key: RowKey }[] = [
  { key: "outfits"    },
  { key: "beauty"     },
  { key: "toiletries" },
  { key: "essentials" },
];

// ── Image constants ───────────────────────────────────────────────────────────
const IMG_W = 1024;
const IMG_H = 1536;
const NAV_H = 90;

// ── Landmark fractions (calibrated for collection-bg.png 1024×1536) ──────────
// Dark luxury display case — 3 gold shelf bars creating 4 sections,
// spotlights at top, action buttons baked at bottom.
const LM = {
  doorL: 0.050,  // inner left wall
  doorR: 0.950,  // inner right wall

  rows: [
    { sectionTop: 0.080, shelfY: 0.215, btnCY: 0.148 },  // Collection 1 (top, spotlights)
    { sectionTop: 0.230, shelfY: 0.422, btnCY: 0.326 },  // Collection 2
    { sectionTop: 0.438, shelfY: 0.632, btnCY: 0.535 },  // Collection 3
    { sectionTop: 0.648, shelfY: 0.880, btnCY: 0.762 },  // Collection 4
  ],

  saveAreaY: 0.886,
} as const;

// ── useImageRect ─────────────────────────────────────────────────────────────
interface ImgRect {
  top: number; left: number; width: number; height: number;
  containerH: number; containerW: number;
}

function useImageRect(containerRef: RefObject<HTMLDivElement>): ImgRect {
  const [rect, setRect] = useState<ImgRect>({ top: 0, left: 0, width: 0, height: 0, containerH: 0, containerW: 0 });
  useEffect(() => {
    const compute = () => {
      const c = containerRef.current;
      if (!c) return;
      const cW = c.clientWidth, cH = c.clientHeight;
      const iR = IMG_W / IMG_H;
      // Fill: stretch image to exactly match container — full bed visible
      setRect({ top: 0, left: 0, width: cW, height: cH, containerH: cH, containerW: cW });
    };
    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, [containerRef]);
  return rect;
}

// ── Pixel helpers ─────────────────────────────────────────────────────────────
const pH = (ir: ImgRect, f: number) => ir.height * f;
const pW = (ir: ImgRect, f: number) => ir.width  * f;
const pX = (ir: ImgRect, f: number) => ir.left   + ir.width  * f;
const pY = (ir: ImgRect, f: number) => ir.top    + ir.height * f;

// ── Page ──────────────────────────────────────────────────────────────────────
export default function WardrobePage() {
  const containerRef = useRef<HTMLDivElement>(null!);
  const ir = useImageRect(containerRef);

  const rowRefs: Record<RowKey, RefObject<ClosetRowHandle | null>> = {
    outfits:    useRef<ClosetRowHandle | null>(null),
    beauty:     useRef<ClosetRowHandle | null>(null),
    toiletries: useRef<ClosetRowHandle | null>(null),
    essentials: useRef<ClosetRowHandle | null>(null),
  };

  const [centred,       setCentred]       = useState<Partial<Record<RowKey, ClothingItem>>>({});
  const [addCategory,   setAddCategory]   = useState<Category | null>(null);
  const [detailsItem,   setDetailsItem]   = useState<ClothingItem | null>(null);
  const [upgradeReason, setUpgradeReason] = useState<UpgradeReason | null>(null);
  const [isSaveOpen,    setIsSaveOpen]    = useState(false);
  const [saveName,      setSaveName]      = useState("");
  const [saveSuccess,   setSaveSuccess]   = useState(false);
  const { names: collectionNames } = useCollectionNames();

  const saveOutfit = useSaveOutfit();

  const { data: outfitsItems  = [] } = useListClothing({ category: "outfits"    }, { query: { queryKey: getListClothingQueryKey({ category: "outfits"    }) } });
  const { data: beautyItems   = [] } = useListClothing({ category: "beauty"     }, { query: { queryKey: getListClothingQueryKey({ category: "beauty"     }) } });
  const { data: toiletriesItems = [] } = useListClothing({ category: "toiletries" }, { query: { queryKey: getListClothingQueryKey({ category: "toiletries" }) } });
  const { data: essentialsItems = [] } = useListClothing({ category: "essentials" }, { query: { queryKey: getListClothingQueryKey({ category: "essentials" }) } });
  const { data: savedOutfitsList = [] } = useListOutfits();

  const rowData: Record<RowKey, ClothingItem[]> = { outfits: outfitsItems, beauty: beautyItems, toiletries: toiletriesItems, essentials: essentialsItems };
  const totalItems = outfitsItems.length + beautyItems.length + toiletriesItems.length + essentialsItems.length;


  const queryClient = useQueryClient();
  const { tier, canAddItem } = useEntitlements();

  useEffect(() => {
    setCentred(prev => {
      const next = { ...prev };
      let changed = false;
      (["outfits", "beauty", "toiletries", "essentials"] as RowKey[]).forEach(key => {
        if (rowData[key].length === 0 && next[key] !== undefined) {
          delete next[key]; changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [outfitsItems.length, beautyItems.length, toiletriesItems.length, essentialsItems.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const setCentredHandlers: Record<RowKey, (item: ClothingItem | null) => void> = {
    outfits:    useCallback((item: ClothingItem | null) => setCentred(p => ({ ...p, outfits:    item ?? undefined })), []),
    beauty:     useCallback((item: ClothingItem | null) => setCentred(p => ({ ...p, beauty:     item ?? undefined })), []),
    toiletries: useCallback((item: ClothingItem | null) => setCentred(p => ({ ...p, toiletries: item ?? undefined })), []),
    essentials: useCallback((item: ClothingItem | null) => setCentred(p => ({ ...p, essentials: item ?? undefined })), []),
  };

  const handleAddClick = useCallback((cat: Category) => {
    if (canAddItem(totalItems)) setAddCategory(cat); else setUpgradeReason("items");
  }, [canAddItem, totalItems]);

  const addHandlers: Record<RowKey, () => void> = {
    outfits:    useCallback(() => handleAddClick("outfits"),    [handleAddClick]),
    beauty:     useCallback(() => handleAddClick("beauty"),     [handleAddClick]),
    toiletries: useCallback(() => handleAddClick("toiletries"), [handleAddClick]),
    essentials: useCallback(() => handleAddClick("essentials"), [handleAddClick]),
  };

  const handleItemTap = useCallback((item: ClothingItem) => setDetailsItem(item), []);

  const handleSave = () => {
    if (!saveName.trim()) return;
    const itemIds = Object.values(centred)
      .filter((i): i is ClothingItem => i != null)
      .map(i => i.id);
    saveOutfit.mutate(
      { data: { name: saveName.trim(), itemIds } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListOutfitsQueryKey() });
          setSaveSuccess(true);
          setTimeout(() => { setIsSaveOpen(false); setSaveSuccess(false); setSaveName(""); }, 1400);
        },
      },
    );
  };

  const [, navigate] = useLocation();
  const isFree    = tier === "free";
  const itemsLeft = isFree ? Math.max(0, FREE_ITEM_LIMIT - totalItems) : null;
  const ready     = ir.width > 0;

  // ── Section layout helpers ────────────────────────────────────────────────
  const CAROUSEL_OFFSET = 0.032;
  const sectionHeights = ready
    ? LM.rows.map(lm => pH(ir, lm.shelfY - (lm.sectionTop + CAROUSEL_OFFSET)))
    : LM.rows.map(() => 0);

  return (
    <div
      ref={containerRef}
      style={{
        position: "relative",
        width: "100%",
        height: `calc(100dvh - ${NAV_H}px)`,
        overflow: "hidden",
        background: "#111",
      }}
    >
      {/* ── Background image — object-fit:cover avoids WebKit negative-left clipping bug ── */}
      <img
        src="/collection-bg.png"
        alt="My Digital Collections"
        style={{
          position: "absolute",
          top: 0, left: 0,
          width: "100%", height: "100%",
          objectFit: "fill",
          objectPosition: "center",
          display: "block",
          pointerEvents: "none",
          userSelect: "none",
          zIndex: 0,
        }}
      />

      {ready && (
        <>
          {/* ── Page title ── */}
          <div style={{
            position: "absolute",
            top: pY(ir, 0.062),
            left: 8,
            right: 8,
            zIndex: 25,
            textAlign: "center",
            pointerEvents: "none",
            overflow: "hidden",
          }}>
            <div style={{
              fontFamily: "var(--font-display, serif)",
              fontWeight: 900,
              fontSize: Math.max(8, Math.min(pW(ir, 0.030), ir.containerW * 0.040)),
              letterSpacing: "0.08em",
              whiteSpace: "nowrap",
              textTransform: "uppercase",
              color: "#E8D4B0",
              lineHeight: 1.1,
            }}>
              MY DIGITAL COLLECTIONS
            </div>
          </div>

          {/* ── Item-count badge (free tier) ── */}
          {itemsLeft !== null && (
            <button
              onClick={() => setUpgradeReason("items")}
              data-testid="badge-item-count"
              aria-label={`${totalItems} of ${FREE_ITEM_LIMIT} items used — tap to upgrade`}
              style={{
                position: "absolute",
                top: pY(ir, 0.080), left: "50%", transform: "translateX(-50%)",
                zIndex: 25,
                padding: 0, background: "none", border: "none",
                color: totalItems >= FREE_ITEM_LIMIT ? "#ff6b6b" : "rgba(232,212,176,0.55)",
                fontWeight: 600, fontSize: 10,
                letterSpacing: "0.10em", textTransform: "uppercase",
                whiteSpace: "nowrap", cursor: "pointer",
              }}
            >
              {totalItems}/{FREE_ITEM_LIMIT} ITEMS
            </button>
          )}

          {/* ── 4 shelf rows ── */}
          {ROWS.map(({ key }, rowIdx) => {
            const lm      = LM.rows[rowIdx];
            const items   = rowData[key];

            const carouselTopFrac = lm.sectionTop + CAROUSEL_OFFSET;
            const secTop  = pY(ir, carouselTopFrac);
            const secH    = pH(ir, lm.shelfY - carouselTopFrac);
            const carLeft = pX(ir, LM.doorL);
            const carW    = pW(ir, LM.doorR - LM.doorL);

            // ADD button: centered in the section at btnCY
            const btnCY   = pY(ir, lm.btnCY);
            const btnH    = Math.max(32, pH(ir, 0.045));

            const labelOffset = rowIdx === 1 ? 0.056 : rowIdx === 2 ? 0.048 : 0.032;
            const labelY    = pY(ir, lm.sectionTop + labelOffset);
            const labelText = collectionNames[key];
            const fontSize  = Math.max(9, pH(ir, 0.013));

            return (
              <React.Fragment key={key}>

                {/* ── Collection label — tap to add ── */}
                <button
                  onClick={addHandlers[key]}
                  aria-label={`Add to ${labelText}`}
                  style={{
                    position: "absolute",
                    top: labelY,
                    left: carLeft,
                    width: carW,
                    transform: "translateY(-50%)",
                    zIndex: 23,
                    background: "none", border: "none",
                    cursor: "pointer", padding: 0,
                    textAlign: "center",
                  }}
                >
                  <span style={{
                    fontSize,
                    fontWeight: 800,
                    letterSpacing: "0.12em",
                    color: "#E8D4B0",
                    fontFamily: "var(--font-display)",
                    textTransform: "uppercase",
                  }}>
                    + {labelText}
                  </span>
                </button>

                {/* ── Item carousel — fills the section between buttons ── */}
                {items.length > 0 && (
                  <div
                    data-testid={`row-${key}`}
                    style={{
                      position: "absolute",
                      top:    secTop,
                      left:   carLeft,
                      width:  carW,
                      height: secH,
                      zIndex: 10,
                      overflow: "hidden",
                    }}
                  >
                    <ClosetRow
                      ref={rowRefs[key]}
                      items={items}
                      onCenteredItem={setCentredHandlers[key]}
                      onItemTap={handleItemTap}
                      maxPhotoH={Math.max(0, sectionHeights[rowIdx] - 8)}
                    />
                  </div>
                )}

                {/* ── ADD button ──────────────────────────────────────────
                    Always a transparent tap zone sitting exactly over the
                    baked-in pink pill in the background image (at btnCY).
                    The carousel lives BELOW the pill (sectionTop > btnCY),
                    so this zone is never obscured by items.               */}
                {/* tap zone over shelf area for adding items */}
                <button
                  onClick={addHandlers[key]}
                  aria-label={`Add to ${labelText}`}
                  data-testid={`add-btn-${key}`}
                  style={{
                    position: "absolute",
                    top:    btnCY - btnH / 2,
                    left:   carLeft,
                    width:  carW,
                    height: btnH,
                    zIndex: 22,
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                  }}
                />

              </React.Fragment>
            );
          })}


          {/* ── Bottom action bar: 3 transparent tap zones over baked-in buttons ── */}
          {/* Trophy (left) → Saved looks */}
          <button
            onClick={() => navigate("/saved")}
            aria-label="View saved looks"
            style={{
              position: "absolute",
              top:    pY(ir, LM.saveAreaY),
              left:   pX(ir, LM.doorL),
              width:  pW(ir, 0.30),
              height: pH(ir, 0.082),
              zIndex: 25,
              background: "transparent",
              border: "none",
              cursor: "pointer",
            }}
          />
          {/* SAVE (centre) → open save-group modal */}
          <button
            onClick={() => { setSaveName(""); setIsSaveOpen(true); }}
            aria-label="Save current case"
            style={{
              position: "absolute",
              top:    pY(ir, LM.saveAreaY),
              left:   pX(ir, 0.350),
              width:  pW(ir, 0.300),
              height: pH(ir, 0.082),
              zIndex: 25,
              background: "transparent",
              border: "none",
              cursor: "pointer",
            }}
          />
          {/* Heart (right) → Favorites */}
          <button
            onClick={() => navigate("/favorites")}
            aria-label="View favourites"
            style={{
              position: "absolute",
              top:    pY(ir, LM.saveAreaY),
              left:   pX(ir, 0.650),
              width:  pW(ir, LM.doorR - 0.650),
              height: pH(ir, 0.082),
              zIndex: 25,
              background: "transparent",
              border: "none",
              cursor: "pointer",
            }}
          />
        </>
      )}

      {/* ── Save modal ── */}
      <AnimatePresence>
        {isSaveOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: "absolute", inset: 0, zIndex: 60,
              background: "rgba(0,0,0,0.45)",
              display: "flex", alignItems: "center", justifyContent: "center",
              padding: "0 24px",
            }}
          >
            <motion.div
              initial={{ scale: 0.92, y: 12 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.92, y: 12 }}
              style={{
                background: "#fff", borderRadius: 20,
                border: "2.5px solid #000",
                boxShadow: "4px 4px 0 #000",
                padding: "24px 20px 20px",
                width: "100%", maxWidth: 340,
              }}
            >
              {saveSuccess ? (
                <div style={{ textAlign: "center", padding: "12px 0" }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>💕</div>
                  <p style={{ fontWeight: 800, fontSize: 16, fontFamily: "var(--font-display)" }}>Group saved!</p>
                </div>
              ) : (
                <>
                  <p style={{ fontWeight: 800, fontSize: 15, fontFamily: "var(--font-display)", marginBottom: 12 }}>
                    Name this collection
                  </p>
                  <input
                    autoFocus
                    value={saveName}
                    onChange={e => setSaveName(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && saveName.trim() && handleSave()}
                    placeholder="e.g. Sunday Glow ✨"
                    style={{
                      width: "100%", height: 42, borderRadius: 10,
                      border: "2px solid #000", padding: "0 12px",
                      fontSize: 14, fontFamily: "var(--font-display)",
                      boxSizing: "border-box", marginBottom: 12, outline: "none",
                    }}
                  />
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      onClick={() => setIsSaveOpen(false)}
                      style={{
                        flex: 1, height: 40, borderRadius: 20,
                        border: "2px solid #000", background: "#fff",
                        fontWeight: 700, fontSize: 13, cursor: "pointer",
                        fontFamily: "var(--font-display)",
                      }}
                    >Cancel</button>
                    <button
                      onClick={handleSave}
                      disabled={!saveName.trim() || saveOutfit.isPending}
                      style={{
                        flex: 1, height: 40, borderRadius: 20,
                        border: "2px solid #B8894E",
                        background: "linear-gradient(to bottom, #E8D4B0, #B8894E)",
                        color: "#3A2210", fontWeight: 800, fontSize: 13,
                        cursor: saveName.trim() ? "pointer" : "default",
                        opacity: saveName.trim() ? 1 : 0.45,
                        fontFamily: "var(--font-display)",
                      }}
                    >
                      {saveOutfit.isPending ? "…" : "Save ♡"}
                    </button>
                  </div>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Modals ── */}
      <AnimatePresence>
        {upgradeReason && (
          <UpgradeSheet reason={upgradeReason} onClose={() => setUpgradeReason(null)} />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {addCategory && (
          <QuickAddSheet
            key={addCategory}
            open={!!addCategory}
            onOpenChange={open => !open && setAddCategory(null)}
            category={addCategory}
            existingCount={rowData[addCategory as RowKey]?.length ?? 0}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {detailsItem && (
          <ItemDetailsSheet
            key={detailsItem.id}
            item={detailsItem}
            onClose={() => setDetailsItem(null)}
          />
        )}
      </AnimatePresence>

    </div>
  );
}
