/**
 * WardrobePage — closet-bg.png (1023×1844 PNG, new image)
 *
 * Sizing: object-fit CONTAIN inside calc(100dvh − 90px).
 *   Image ratio 0.6657 > iPhone container ratio (≈0.52) → fills width, side letterbox at bottom.
 *   Container background #F0C030 (door yellow) blends with yellow doors.
 *
 * Layout (z-index):
 *   0   background <img>
 *   10  ClosetRow carousels — positioned from below the rod, behind hangers
 *   12  Transparent "+ ADD" tap zones
 *   14  Transparent SAVE OUTFIT / shuffle / mannequin tap zones
 *   20  Hanger overlays — crop of the background image re-rendered on top of clothing cards
 *   30+ Modals
 *
 * Hanger overlay technique:
 *   Each row renders a second div that uses closet-bg.png as background-image,
 *   aligned with background-size/position to exactly match the main image layer.
 *   This ensures the gold hangers always appear ABOVE the clothing photos even
 *   when the ClosetRow extends into the hanger area.
 */

import React, {
  useEffect, useRef, useState,
  useCallback, RefObject,
} from "react";
import {
  useListClothing, getListClothingQueryKey,
  useSaveOutfit, useListOutfits, getListOutfitsQueryKey,
  ClothingItem,
} from "@workspace/api-client-react";
import { X, Shuffle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { ClosetRow, ClosetRowHandle } from "@/components/ClosetRow";
import { QuickAddSheet } from "@/components/clothing/QuickAddSheet";
import { ItemDetailsSheet } from "@/components/clothing/ItemDetailsSheet";
import { MannequinView } from "@/components/MannequinView";
import { UpgradeSheet, UpgradeReason } from "@/components/paywall/UpgradeSheet";
import { PremiumSheet } from "@/components/paywall/PremiumSheet";
import { useQueryClient } from "@tanstack/react-query";
import { useEntitlements } from "@/hooks/useEntitlements";
import { FREE_ITEM_LIMIT } from "@/lib/entitlements";

// ── Types ─────────────────────────────────────────────────────────────────────
type RowKey   = "tops" | "bottoms" | "shoes";
type Category = "tops" | "bottoms" | "shoes" | "accessories" | "outerwear" | "dresses";

const ROWS: { key: RowKey; addLabel: string; btnLabel: string }[] = [
  { key: "tops",    addLabel: "Add Top",    btnLabel: "+ ADD TOPS"    },
  { key: "bottoms", addLabel: "Add Bottom", btnLabel: "+ ADD BOTTOMS" },
  { key: "shoes",   addLabel: "Add Shoes",  btnLabel: "+ ADD SHOES"   },
];

// ── Image constants ───────────────────────────────────────────────────────────
const IMG_W = 1023;
const IMG_H = 1537;
const NAV_H = 90;

// ── Landmark fractions (measured from the 1023×1537 PNG) ─────────────────────
// All x-values are fractions of image WIDTH; y-values of image HEIGHT.
//
// Strategy: ClosetRow containers start just BELOW the gold rod (not below the
// hanger arms).  A hanger overlay div at z=20 re-renders the background image
// crop over the hanger area, keeping the gold/pink hangers visually on top.
//
// boxY     = just below the gold rod — where the ClosetRow starts
// boxBot   = where the ClosetRow ends (just before next rod)
// hangerTop/hangerBot = the hanger graphic region (overlay at z=20)
//   TOPS:    rod y≈295–325, pink center hanger base y≈600 (px in image)
//   BOTTOMS: rod y≈864–878, hanger base y≈965
//   SHOES:   rod y≈1192–1207, no hanging hangers → overlay is minimal
const LM = {
  // Inner closet edges (just inside the yellow doors)
  doorL: 0.127,
  doorR: 0.865,

  // Per-row landmarks
  rows: [
    {
      btnCY:     0.202, // centre of "+ ADD TOPS" pill (gold rod centre y=310)
      boxY:      0.217, // ClosetRow top — just below rod bottom (y≈333)
      boxBot:    0.558, // ClosetRow bottom — just before BOTTOMS rod (y≈857)
      hangerTop: 0.217, // hanger overlay top = boxY
      hangerBot: 0.393, // hanger overlay bottom — below centre hanger arms (y≈604)
    },
    {
      btnCY:     0.567, // centre of "+ ADD BOTTOMS" pill (rod y≈871)
      boxY:      0.576, // just below BOTTOMS rod (y≈885)
      boxBot:    0.773, // just before SHOES rod (y≈1188)
      hangerTop: 0.576,
      hangerBot: 0.632, // below BOTTOMS hanger arms (y≈971)
    },
    {
      btnCY:     0.781, // centre of "+ ADD SHOES" pill (rod y≈1200)
      boxY:      0.790, // just below SHOES rod (y≈1214) — no hangers hanging
      boxBot:    0.934, // extended — drawer area now painted over (y≈1435)
      hangerTop: 0.790,
      hangerBot: 0.800, // minimal overlay — only covers the rod bottom shadow
    },
  ],

} as const;

// ── useImageRect ─────────────────────────────────────────────────────────────
interface ImgRect {
  top: number; left: number; width: number; height: number;
  /** Full height of the positioning container (not just the rendered image). */
  containerH: number;
}

function useImageRect(containerRef: RefObject<HTMLDivElement>): ImgRect {
  const [rect, setRect] = useState<ImgRect>({ top: 0, left: 0, width: 0, height: 0, containerH: 0 });
  useEffect(() => {
    const compute = () => {
      const c = containerRef.current;
      if (!c) return;
      const cW = c.clientWidth, cH = c.clientHeight;
      const iR = IMG_W / IMG_H;
      const cR = cW / cH;
      let rW: number, rH: number, rL: number, rT: number;
      if (cR > iR) {
        // Container wider than image: fill height, center horizontally
        rH = cH; rW = cH * iR; rT = 0; rL = (cW - rW) / 2;
      } else {
        // Container taller than image: fill width, anchor top
        rW = cW; rH = cW / iR; rL = 0; rT = 0;
      }
      setRect({ top: rT, left: rL, width: rW, height: rH, containerH: cH });
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

const GOLD = "#C49B2A";

// ── Page ──────────────────────────────────────────────────────────────────────
export default function WardrobePage() {
  const containerRef = useRef<HTMLDivElement>(null!);
  const ir = useImageRect(containerRef);

  const rowRefs: Record<RowKey, RefObject<ClosetRowHandle | null>> = {
    tops:    useRef<ClosetRowHandle | null>(null),
    bottoms: useRef<ClosetRowHandle | null>(null),
    shoes:   useRef<ClosetRowHandle | null>(null),
  };

  const [centred,       setCentred]       = useState<Partial<Record<RowKey, ClothingItem>>>({});
  const [addCategory,   setAddCategory]   = useState<Category | null>(null);
  const [detailsItem,   setDetailsItem]   = useState<ClothingItem | null>(null);
  const [showMannequin, setShowMannequin] = useState(false);
  const [upgradeReason, setUpgradeReason] = useState<UpgradeReason | null>(null);
  const [showPremium,   setShowPremium]   = useState(false);
  const [isSaveOpen,    setIsSaveOpen]    = useState(false);
  const [saveName,      setSaveName]      = useState("");

  const { data: tops    = [] } = useListClothing({ category: "tops"    }, { query: { queryKey: getListClothingQueryKey({ category: "tops"    }) } });
  const { data: bottoms = [] } = useListClothing({ category: "bottoms" }, { query: { queryKey: getListClothingQueryKey({ category: "bottoms" }) } });
  const { data: shoes   = [] } = useListClothing({ category: "shoes"   }, { query: { queryKey: getListClothingQueryKey({ category: "shoes"   }) } });
  const { data: outfits = [] } = useListOutfits();

  const rowData: Record<RowKey, ClothingItem[]> = { tops, bottoms, shoes };
  const totalItems = tops.length + bottoms.length + shoes.length;

  const saveOutfit  = useSaveOutfit();
  const queryClient = useQueryClient();
  const { tier, caps, canAddItem, canSaveOutfit } = useEntitlements();

  useEffect(() => {
    setCentred(prev => {
      const next = { ...prev };
      let changed = false;
      (["tops", "bottoms", "shoes"] as RowKey[]).forEach(key => {
        if (rowData[key].length === 0 && next[key] !== undefined) {
          delete next[key]; changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [tops.length, bottoms.length, shoes.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const setCentredTops    = useCallback((item: ClothingItem | null) =>
    setCentred(p => ({ ...p, tops:    item ?? undefined })), []);
  const setCentredBottoms = useCallback((item: ClothingItem | null) =>
    setCentred(p => ({ ...p, bottoms: item ?? undefined })), []);
  const setCentredShoes   = useCallback((item: ClothingItem | null) =>
    setCentred(p => ({ ...p, shoes:   item ?? undefined })), []);
  const centredHandlers: Record<RowKey, (item: ClothingItem | null) => void> = {
    tops: setCentredTops, bottoms: setCentredBottoms, shoes: setCentredShoes,
  };

  const handleAddClick   = useCallback((cat: Category) => {
    if (canAddItem(totalItems)) setAddCategory(cat); else setUpgradeReason("items");
  }, [canAddItem, totalItems]);
  const handleAddTops    = useCallback(() => handleAddClick("tops"),    [handleAddClick]);
  const handleAddBottoms = useCallback(() => handleAddClick("bottoms"), [handleAddClick]);
  const handleAddShoes   = useCallback(() => handleAddClick("shoes"),   [handleAddClick]);
  const addHandlers: Record<RowKey, () => void> = {
    tops: handleAddTops, bottoms: handleAddBottoms, shoes: handleAddShoes,
  };

  const handleItemTap = useCallback((item: ClothingItem) => setDetailsItem(item), []);

  const handleSaveClick = useCallback(() => {
    if (canSaveOutfit(outfits.length)) setIsSaveOpen(true); else setUpgradeReason("outfits");
  }, [canSaveOutfit, outfits.length]);

  const handleMannequinClick = useCallback(() => {
    if (caps.mannequin) setShowMannequin(true); else setShowPremium(true);
  }, [caps.mannequin]);

  const handleShuffle = useCallback(() => {
    ROWS.forEach(({ key }, i) => {
      const data = rowData[key];
      if (data.length < 2) return;
      const ref = rowRefs[key].current;
      if (!ref) return;
      const idx = Math.floor(Math.random() * data.length);
      setTimeout(() => {
        ref.scrollToIndex(data.length - 1, false);
        setTimeout(() => ref.scrollToIndex(idx, true), 60);
      }, i * 80);
    });
  }, [rowData]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSave = () => {
    if (!saveName.trim()) return;
    if (!canSaveOutfit(outfits.length)) {
      setIsSaveOpen(false); setSaveName(""); setUpgradeReason("outfits"); return;
    }
    const itemIds = Object.values(centred)
      .filter((i): i is ClothingItem => i != null)
      .map(i => i.id);
    saveOutfit.mutate(
      { data: { name: saveName.trim(), itemIds } },
      { onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListOutfitsQueryKey() });
        setIsSaveOpen(false); setSaveName("");
      }},
    );
  };

  const canSave   = ROWS.every(({ key }) => !!centred[key]);
  const isFree    = tier === "free";
  const itemsLeft = isFree ? Math.max(0, FREE_ITEM_LIMIT - totalItems) : null;
  const ready     = ir.width > 0;

  return (
    <div
      ref={containerRef}
      style={{
        position: "relative",
        width: "100%",
        // Full viewport height above the nav bar. The image fills width (~586 px on
        // a 390-wide phone) and the remaining floor space below it holds the save bar.
        height: `calc(100dvh - ${NAV_H}px)`,
        overflow: "hidden",
        // Door-yellow background blends with yellow doors visible at sides/bottom
        background: "#F0C030",
      }}
    >
      {/* ── Background image — object-fit:contain, never cropped ── */}
      <img
        src="/closet-bg.png"
        alt="My Digital Closet"
        style={{
          position: "absolute",
          top:    ready ? ir.top    : 0,
          left:   ready ? ir.left   : 0,
          width:  ready ? ir.width  : "100%",
          height: ready ? ir.height : "auto",
          display: "block",
          pointerEvents: "none",
          userSelect: "none",
          zIndex: 0,
        }}
      />

      {ready && (
        <>
          {/* ── Item-limit warning badge (only when full) ── */}
          {itemsLeft === 0 && (
            <button
              onClick={() => setUpgradeReason("items")}
              data-testid="badge-item-count"
              aria-label="Wardrobe full — tap to upgrade"
              style={{
                position: "absolute",
                top: pY(ir, 0.255), left: "50%", transform: "translateX(-50%)",
                zIndex: 12,
                padding: "3px 14px", borderRadius: 20, border: "none",
                background: "rgba(200,40,40,0.14)",
                boxShadow: "0 0 0 2px rgba(200,40,40,0.40)",
                color: "#aa0000", fontWeight: 700, fontSize: 11,
                letterSpacing: "0.08em", textTransform: "uppercase",
                whiteSpace: "nowrap", cursor: "pointer",
              }}
            >
              WARDROBE FULL
            </button>
          )}

          {/* ── Three clothing rows ── */}
          {ROWS.map(({ key, addLabel, btnLabel }, rowIdx) => {
            const lm      = LM.rows[rowIdx];
            const items   = rowData[key];
            const isShoes = rowIdx === 2;

            // ── Layout constants ──────────────────────────────────────────────
            const carLeft  = pX(ir, LM.doorL);
            const carRight = ir.left + pW(ir, 1 - LM.doorR);

            // Photos start directly below the hanger arms (hangerBot) for
            // TOPS and BOTTOMS so the full photo is visible under the hanger.
            // For SHOES there are no hanging hangers — photos sit on the shelf
            // starting just below the rod (boxY).
            const photoTopFrac = isShoes ? lm.boxY : lm.hangerBot;
            const carTop = pY(ir, photoTopFrac);
            const carH   = pH(ir, lm.boxBot - photoTopFrac);

            // "+ ADD" tap zone — centred on the gold rod / pill
            const tapH   = Math.max(36, pH(ir, 0.052));
            const tapTop = pY(ir, lm.btnCY) - tapH / 2;

            // Hanger overlay — exact crop of the background image re-rendered at
            // z=20 so the gold/pink hanger graphics always appear ABOVE clothing
            // photos.  Shoes have no hanging hangers, so skip the overlay.
            const hangerH      = pH(ir, lm.hangerBot - lm.hangerTop);
            const hangerBgPosX = -pW(ir, LM.doorL);       // align with main image
            const hangerBgPosY = -pH(ir, lm.hangerTop);   // rT=0, so simple fraction

            return (
              <React.Fragment key={key}>
                {/* Fixed "+ ADD" tap zone (transparent — image draws the pill) */}
                <button
                  onClick={addHandlers[key]}
                  aria-label={btnLabel}
                  data-testid={`add-btn-${key}`}
                  style={{
                    position: "absolute",
                    top: tapTop,
                    left: pX(ir, LM.doorL),
                    width: pW(ir, LM.doorR - LM.doorL),
                    height: tapH,
                    zIndex: 12,
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    borderRadius: 20,
                  }}
                />

                {/* ClosetRow — clothing photos below the hanger arms */}
                {items.length > 0 && (
                  <div
                    data-testid={`row-${key}`}
                    style={{
                      position: "absolute",
                      top:    carTop,
                      left:   carLeft,
                      right:  carRight,
                      height: carH,
                      zIndex: 10,
                      overflow: "hidden",
                    }}
                  >
                    <ClosetRow
                      ref={rowRefs[key]}
                      items={items}
                      onCenteredItem={centredHandlers[key]}
                      onItemTap={handleItemTap}
                    />
                  </div>
                )}

                {/* Hanger overlay — only for rows with hanging hangers (TOPS, BOTTOMS).
                    Re-draws the background image crop at z=20 so the gold/pink hanger
                    graphics stay on top of any photo that extends into that region. */}
                {!isShoes && (
                  <div
                    aria-hidden="true"
                    style={{
                      position: "absolute",
                      top:    pY(ir, lm.hangerTop),
                      left:   carLeft,
                      right:  carRight,
                      height: hangerH,
                      zIndex: 20,
                      pointerEvents: "none",
                      backgroundImage: "url('/closet-bg.png')",
                      backgroundSize:     `${ir.width}px ${ir.height}px`,
                      backgroundPosition: `${hangerBgPosX}px ${hangerBgPosY}px`,
                      backgroundRepeat:   "no-repeat",
                    }}
                  />
                )}
              </React.Fragment>
            );
          })}

          {/* ── SAVE OUTFIT bar — sits in the floor zone below the image ──
              The baked-in drawer graphic has been painted out of closet-bg.png,
              so these are real visible buttons (not transparent tap zones).
              Positioned at ir.height + 8 so they land on the yellow floor/rug area. */}
          <div
            style={{
              position: "absolute",
              // Portrait: land in floor zone below image. Landscape/wide: clamp so bar
            // stays inside the container (image fills full height, no floor zone).
            top:   Math.min(ir.top + ir.height + 8, ir.containerH - 56),
              left:  pX(ir, LM.doorL),
              right: ir.left + pW(ir, 1 - LM.doorR),
              height: 48,
              zIndex: 14,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            {/* Shuffle — left circle */}
            <button
              onClick={handleShuffle}
              data-testid="button-shuffle"
              aria-label="Shuffle outfit"
              title="Shuffle outfit"
              style={{
                width: 48, height: 48, borderRadius: "50%", flexShrink: 0,
                background: "rgba(255,248,230,0.97)",
                border: "1.5px solid rgba(196,155,42,0.52)",
                boxShadow: "0 2px 8px rgba(0,0,0,0.14)",
                cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              <Shuffle style={{ width: 18, height: 18, color: GOLD }} />
            </button>

            {/* Save Outfit — expands to fill remaining space */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <AnimatePresence mode="wait">
                {isSaveOpen ? (
                  <motion.div
                    key="input"
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 4 }}
                    style={{ display: "flex", gap: 6, width: "100%" }}
                  >
                    <input
                      autoFocus
                      type="text"
                      placeholder="Name this outfit…"
                      value={saveName}
                      onChange={e => setSaveName(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && handleSave()}
                      data-testid="input-outfit-name"
                      style={{
                        flex: 1, height: 48, borderRadius: 24, padding: "0 14px",
                        fontSize: 13, fontWeight: 600, color: "#3a2400",
                        background: "rgba(255,252,245,0.98)",
                        border: "1.5px solid rgba(196,155,42,0.50)",
                        boxShadow: "0 3px 12px rgba(0,0,0,0.14)",
                        outline: "none", minWidth: 0,
                      }}
                    />
                    <button
                      onClick={() => { setIsSaveOpen(false); setSaveName(""); }}
                      style={{
                        width: 48, height: 48, borderRadius: "50%", flexShrink: 0,
                        background: "rgba(255,250,240,0.97)",
                        border: "1.5px solid rgba(196,155,42,0.36)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        cursor: "pointer",
                      }}
                    >
                      <X style={{ width: 14, height: 14, color: GOLD }} />
                    </button>
                    <button
                      onClick={handleSave}
                      disabled={!saveName.trim() || saveOutfit.isPending}
                      data-testid="button-save-outfit-confirm"
                      style={{
                        padding: "0 16px", height: 48, borderRadius: 24, flexShrink: 0,
                        background: "linear-gradient(to bottom,#f5d840,#c89018)",
                        color: "#3a2400", fontWeight: 700, fontSize: 13, border: "none",
                        boxShadow: "0 3px 10px rgba(200,168,24,0.32)",
                        opacity: (!saveName.trim() || saveOutfit.isPending) ? 0.42 : 1,
                        cursor: "pointer",
                      }}
                    >
                      {saveOutfit.isPending ? "…" : "Save ♡"}
                    </button>
                  </motion.div>
                ) : (
                  <button
                    key="save-zone"
                    onClick={handleSaveClick}
                    data-testid="button-save-outfit"
                    aria-label="Save Outfit"
                    style={{
                      width: "100%", height: 48, borderRadius: 24,
                      background: "rgba(255,248,230,0.97)",
                      border: "1.5px solid rgba(196,155,42,0.52)",
                      color: "#5a3a00", fontWeight: 700, fontSize: 13,
                      letterSpacing: "0.07em",
                      cursor: "pointer",
                      boxShadow: canSave
                        ? "0 0 0 2.5px rgba(196,155,42,0.55), 0 4px 16px rgba(200,168,24,0.28)"
                        : "0 2px 8px rgba(0,0,0,0.14)",
                    }}
                  >
                    SAVE OUTFIT ♡
                  </button>
                )}
              </AnimatePresence>
            </div>

            {/* Mannequin — right circle */}
            <button
              onClick={handleMannequinClick}
              disabled={!canSave}
              data-testid="button-view-mannequin"
              aria-label="View outfit on mannequin"
              title="View on mannequin"
              style={{
                width: 48, height: 48, borderRadius: "50%", flexShrink: 0,
                background: "rgba(255,248,230,0.97)",
                border: "1.5px solid rgba(196,155,42,0.52)",
                boxShadow: "0 2px 8px rgba(0,0,0,0.14)",
                cursor: canSave ? "pointer" : "default",
                display: "flex", alignItems: "center", justifyContent: "center",
                opacity: canSave ? 1 : 0.32,
                fontSize: "1.25rem",
              }}
            >
              👗
            </button>
          </div>
        </>
      )}

      {/* ── Modals ── */}
      <AnimatePresence>
        {showMannequin && (
          <MannequinView
            top={centred.tops} bottom={centred.bottoms} shoes={centred.shoes}
            onClose={() => setShowMannequin(false)}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {upgradeReason && (
          <UpgradeSheet reason={upgradeReason} onClose={() => setUpgradeReason(null)} />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showPremium && <PremiumSheet onClose={() => setShowPremium(false)} />}
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
