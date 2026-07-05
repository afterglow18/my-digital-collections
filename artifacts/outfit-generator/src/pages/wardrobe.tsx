import React, {
  useRef, useState, useCallback, useEffect, RefObject,
} from "react";
import {
  useListClothing, getListClothingQueryKey,
  useSaveOutfit, useListOutfits, getListOutfitsQueryKey,
  ClothingItem,
} from "@workspace/api-client-react";
import { X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { SwipeRow, SwipeRowHandle } from "@/components/SwipeRow";
import { QuickAddSheet } from "@/components/clothing/QuickAddSheet";
import { ItemDetailsSheet } from "@/components/clothing/ItemDetailsSheet";
import { MannequinView } from "@/components/MannequinView";
import { UpgradeSheet, UpgradeReason } from "@/components/paywall/UpgradeSheet";
import { PremiumSheet } from "@/components/paywall/PremiumSheet";
import { useQueryClient } from "@tanstack/react-query";
import { useEntitlements } from "@/hooks/useEntitlements";
import { FREE_ITEM_LIMIT, FREE_OUTFIT_LIMIT } from "@/lib/entitlements";

// ── Types ─────────────────────────────────────────────────────────────────────
type RowKey   = "tops" | "bottoms" | "shoes";
type Category = "tops" | "bottoms" | "shoes" | "accessories" | "outerwear" | "dresses";

// ── Config ────────────────────────────────────────────────────────────────────
const ROWS: { key: RowKey; label: string; addLabel: string; btnLabel: string }[] = [
  { key: "tops",    label: "Tops",    addLabel: "Add Top",    btnLabel: "+ ADD TOPS"    },
  { key: "bottoms", label: "Bottoms", addLabel: "Add Bottom", btnLabel: "+ ADD BOTTOMS" },
  { key: "shoes",   label: "Shoes",   addLabel: "Add Shoes",  btnLabel: "+ ADD SHOES"   },
];

const NAV_H   = 90;   // bottom nav height (px) — from AppLayout
const BAR_H   = 60;   // HTML action bar height (px)

// ── Source image natural size ─────────────────────────────────────────────────
const IMG_W = 853;
const IMG_H = 1844;

// ── Landmarks (fractions of image width / height) ─────────────────────────────
//  All measured from the 853×1844 PNG.
const LM = {
  // Inner closet edges (x fraction) — just inside the yellow doors
  doorL: 0.148,
  doorR: 0.852,

  // Badge y-centre
  badgeCY: 0.297,

  // Per-row: rod centre y, carousel start y, carousel end y
  // rodCY is placed at the image's original small label pill centre (slightly above the rod),
  // so the large pill button covers both the old label and the rod line.
  rows: [
    { rodCY: 0.342, carY: 0.371, carBot: 0.507 }, // TOPS
    { rodCY: 0.543, carY: 0.564, carBot: 0.667 }, // BOTTOMS
    { rodCY: 0.707, carY: 0.727, carBot: 0.800 }, // SHOES
  ],

  // Bottom bar (HTML-rendered, not image-reliant)
  // Positions for icons inside the bar
  hangerCX: 0.222,
  saveBtnL: 0.282,
  saveBtnR: 0.718,
  manneCX:  0.778,
};

// ── Image rect (responsive: fills full width when possible; scales down on short screens) ──
// Strategy:
//   1. Full-width first: imageH = containerW × (IMG_H/IMG_W).
//   2. Content must fit: shoes row bottom (LM.rows[2].carBot) must not exceed
//      (containerH − BAR_H). If it does, shrink the image (small side letterbox).
// This gives zero horizontal letterboxing on all modern iPhones (390+) and
// only a small letterbox on very short screens (SE ≈ 38 px each side).
interface ImgRect { top: number; left: number; width: number; height: number; containerW: number }

const CONTENT_BOTTOM_FRAC = 0.800; // = LM.rows[2].carBot — must stay above bottom bar

function useImageRect(containerRef: RefObject<HTMLDivElement>): ImgRect {
  const [rect, setRect] = useState<ImgRect>({ top: 0, left: 0, width: 0, height: 0, containerW: 0 });
  useEffect(() => {
    const compute = () => {
      const c = containerRef.current;
      if (!c) return;
      const cW = c.clientWidth, cH = c.clientHeight;

      // Full-width natural height
      const fullH = cW * (IMG_H / IMG_W);

      // Maximum usable height above the HTML bottom bar
      const maxContentPx = cH - BAR_H;

      let rW: number, rH: number, rL: number;
      if (fullH * CONTENT_BOTTOM_FRAC <= maxContentPx) {
        // Modern iPhone — fill edge to edge, no letterboxing
        rW = cW; rH = fullH; rL = 0;
      } else {
        // Short viewport (SE) — scale image so shoes row fits; slight side letterbox
        rH = maxContentPx / CONTENT_BOTTOM_FRAC;
        rW = rH * (IMG_W / IMG_H);
        rL = (cW - rW) / 2;
      }
      setRect({ top: 0, left: rL, width: rW, height: rH, containerW: cW });
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
const pX = (ir: ImgRect, f: number) => ir.left   + pW(ir, f);
const pY = (ir: ImgRect, f: number) => ir.top    + pH(ir, f);

// ── Palette ───────────────────────────────────────────────────────────────────
const GOLD  = "#C49B2A";
const PINK  = "#e8a0bc";
const CREAM = "#faf5ec";

// ── Section pill button ───────────────────────────────────────────────────────
interface SectionBtnProps {
  label: string;
  ir: ImgRect;
  rodCY: number;    // rod y-fraction
  onClick: () => void;
  "data-testid"?: string;
}
function SectionBtn({ label, ir, rodCY, onClick, "data-testid": testId }: SectionBtnProps) {
  const btnH   = Math.max(34, Math.round(pH(ir, 0.058)));
  const btnTop = pY(ir, rodCY) - btnH / 2;
  const innerW = pW(ir, LM.doorR - LM.doorL);

  return (
    <button
      onClick={onClick}
      data-testid={testId}
      style={{
        position: "absolute",
        top: btnTop,
        left: pX(ir, LM.doorL),
        width: innerW,
        height: btnH,
        zIndex: 14,
        // Pill shape, blush pink outline, cream background
        borderRadius: btnH / 2,
        background: "linear-gradient(to bottom, rgba(255,248,252,0.97) 0%, rgba(255,238,246,0.95) 100%)",
        border: `1.6px solid ${PINK}`,
        boxShadow: "0 2px 8px rgba(200,120,160,0.18), 0 1px 3px rgba(0,0,0,0.06)",
        // Text
        color: "#b84070",
        fontWeight: 700,
        fontSize: Math.max(11, Math.round(btnH * 0.40)),
        letterSpacing: "0.07em",
        textTransform: "uppercase" as const,
        fontFamily: "'Georgia', serif",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        // prevent text selection
        userSelect: "none",
      }}
    >
      {label}
    </button>
  );
}

// ── Bottom action bar icons ───────────────────────────────────────────────────
function HangerIcon({ size = 22 }: { size?: number }) {
  const w = size, h = size * 0.85;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} fill="none">
      <path d={`M${w/2} ${h*.12} Q${w/2} ${h*.04} ${w/2+2.5} ${h*.04} Q${w/2+6} ${h*.04} ${w/2+6} ${h*.28} Q${w/2+6} ${h*.48} ${w/2} ${h*.48}`} stroke={GOLD} strokeWidth="1.8" strokeLinecap="round" fill="none"/>
      <line x1={w/2} y1={h*.48} x2={w/2} y2={h*.76} stroke={GOLD} strokeWidth="1.8" strokeLinecap="round"/>
      <path d={`M${w/2} ${h*.76} Q${w*.2} ${h*.84} 3 ${h}`} stroke={GOLD} strokeWidth="1.8" strokeLinecap="round" fill="none"/>
      <path d={`M${w/2} ${h*.76} Q${w*.8} ${h*.84} ${w-3} ${h}`} stroke={GOLD} strokeWidth="1.8" strokeLinecap="round" fill="none"/>
      <line x1="3" y1={h} x2={w-3} y2={h} stroke={GOLD} strokeWidth="1.8" strokeLinecap="round"/>
    </svg>
  );
}
function MannequinIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={Math.round(size*1.12)} viewBox="0 0 22 24" fill="none">
      <circle cx="11" cy="3" r="2.2" stroke={GOLD} strokeWidth="1.7"/>
      <path d="M7 7 Q5 11 6 16 L16 16 Q17 11 15 7 Q13 5.5 11 5.5 Q9 5.5 7 7Z" stroke={GOLD} strokeWidth="1.6" fill="none" strokeLinejoin="round"/>
      <line x1="7.5" y1="13" x2="14.5" y2="13" stroke={GOLD} strokeWidth="1.4"/>
      <path d="M6 16 Q4.5 21 11 22 Q17.5 21 16 16" stroke={GOLD} strokeWidth="1.6" fill="none" strokeLinecap="round"/>
      <line x1="11" y1="22" x2="11" y2="24" stroke={GOLD} strokeWidth="1.6" strokeLinecap="round"/>
      <line x1="8"  y1="24" x2="14" y2="24" stroke={GOLD} strokeWidth="1.6" strokeLinecap="round"/>
    </svg>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function WardrobePage() {
  const containerRef = useRef<HTMLDivElement>(null!);
  const ir = useImageRect(containerRef);

  const rowRefs: Record<RowKey, React.RefObject<SwipeRowHandle | null>> = {
    tops:    useRef<SwipeRowHandle | null>(null),
    bottoms: useRef<SwipeRowHandle | null>(null),
    shoes:   useRef<SwipeRowHandle | null>(null),
  };

  const [centred,        setCentred]        = useState<Partial<Record<RowKey, ClothingItem>>>({});
  const [addCategory,    setAddCategory]    = useState<Category | null>(null);
  const [detailsItem,    setDetailsItem]    = useState<ClothingItem | null>(null);
  const [showMannequin,  setShowMannequin]  = useState(false);
  const [upgradeReason,  setUpgradeReason]  = useState<UpgradeReason | null>(null);
  const [showPremium,    setShowPremium]    = useState(false);
  const [isSaveOpen,     setIsSaveOpen]     = useState(false);
  const [saveName,       setSaveName]       = useState("");

  const { data: tops    = [] } = useListClothing({ category: "tops"    }, { query: { queryKey: getListClothingQueryKey({ category: "tops"    }) } });
  const { data: bottoms = [] } = useListClothing({ category: "bottoms" }, { query: { queryKey: getListClothingQueryKey({ category: "bottoms" }) } });
  const { data: shoes   = [] } = useListClothing({ category: "shoes"   }, { query: { queryKey: getListClothingQueryKey({ category: "shoes"   }) } });
  const { data: outfits = [] } = useListOutfits();

  const rowData: Record<RowKey, ClothingItem[]> = { tops, bottoms, shoes };
  const totalItems = tops.length + bottoms.length + shoes.length;

  const saveOutfit  = useSaveOutfit();
  const queryClient = useQueryClient();
  const { tier, caps, canAddItem, canSaveOutfit } = useEntitlements();

  // ── Stable callbacks per row ──────────────────────────────────────────────
  const setCentredTops    = useCallback((item: ClothingItem | null) => setCentred(p => ({ ...p, tops:    item ?? undefined })), []);
  const setCentredBottoms = useCallback((item: ClothingItem | null) => setCentred(p => ({ ...p, bottoms: item ?? undefined })), []);
  const setCentredShoes   = useCallback((item: ClothingItem | null) => setCentred(p => ({ ...p, shoes:   item ?? undefined })), []);
  const centredHandlers: Record<RowKey, (item: ClothingItem | null) => void> = {
    tops: setCentredTops, bottoms: setCentredBottoms, shoes: setCentredShoes,
  };

  const handleItemTap   = useCallback((item: ClothingItem) => setDetailsItem(item), []);
  const handleAddClick  = useCallback((cat: Category) => {
    if (canAddItem(totalItems)) setAddCategory(cat); else setUpgradeReason("items");
  }, [canAddItem, totalItems]);

  const handleAddTops    = useCallback(() => handleAddClick("tops"),    [handleAddClick]);
  const handleAddBottoms = useCallback(() => handleAddClick("bottoms"), [handleAddClick]);
  const handleAddShoes   = useCallback(() => handleAddClick("shoes"),   [handleAddClick]);
  const addHandlers: Record<RowKey, () => void> = {
    tops: handleAddTops, bottoms: handleAddBottoms, shoes: handleAddShoes,
  };

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
  }, [rowData]);

  const handleSave = () => {
    if (!saveName.trim()) return;
    if (!canSaveOutfit(outfits.length)) { setIsSaveOpen(false); setSaveName(""); setUpgradeReason("outfits"); return; }
    const itemIds = Object.values(centred).filter((i): i is ClothingItem => i != null).map(i => i.id);
    saveOutfit.mutate(
      { data: { name: saveName.trim(), itemIds } },
      { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListOutfitsQueryKey() }); setIsSaveOpen(false); setSaveName(""); } },
    );
  };

  const canSave    = ROWS.every(({ key }) => !!centred[key]);
  const isFree     = tier === "free";
  const itemsLeft  = isFree ? Math.max(0, FREE_ITEM_LIMIT  - totalItems)      : null;
  const ready      = ir.width > 0;

  // Inner width between doors
  const innerW = pW(ir, LM.doorR - LM.doorL);

  // Per-row card dimensions from rendered image height
  const rowSizes = LM.rows.map(lm => {
    const carH  = pH(ir, lm.carBot - lm.carY);
    const hH    = Math.min(18, Math.max(8, Math.round(carH * 0.155)));
    const cardH = Math.max(0, carH - hH);
    const cardW = Math.round(Math.max(36, cardH) * 0.80);
    return { carH, hH, cardH, cardW };
  });

  // Container = screen minus bottom nav; image clips from the bottom (rug area)
  const containerH = `calc(100dvh - ${NAV_H}px)`;

  return (
    <div
      ref={containerRef}
      style={{
        position: "relative",
        width: "100%",
        height: containerH,
        overflow: "hidden",
        background: "#f5e8c0",
      }}
    >
      {/* ── Background image — fills full width, clips from the bottom ── */}
      {/*    width: 100% → no horizontal letterboxing                      */}
      <img
        src="/closet-bg.png"
        alt=""
        aria-hidden="true"
        style={{
          display: "block",
          position: "absolute",
          top: 0, left: 0,
          width: "100%",
          height: "auto",          // natural proportional height (taller than container)
          pointerEvents: "none",
          userSelect: "none",
          zIndex: 0,
        }}
      />

      {/* ── Overlays — rendered once image rect is computed ── */}
      {ready && (
        <>
          {/* ── Item count badge — transparent tap zone; red ring when full ── */}
          <button
            onClick={() => setUpgradeReason("items")}
            data-testid="badge-item-count"
            aria-label={`${totalItems} of ${FREE_ITEM_LIMIT} items`}
            style={{
              position: "absolute",
              top: pY(ir, LM.badgeCY) - pH(ir, 0.015),
              left: "50%", transform: "translateX(-50%)",
              zIndex: 12,
              minWidth: pW(ir, 0.28), height: pH(ir, 0.028),
              borderRadius: 20, border: "none",
              background: itemsLeft === 0 ? "rgba(200,40,40,0.12)" : "transparent",
              boxShadow: itemsLeft === 0 ? "0 0 0 2px rgba(200,40,40,0.40)" : "none",
              cursor: "pointer",
            }}
          />

          {/* ── Three section rows ── */}
          {ROWS.map(({ key, addLabel, btnLabel }, rowIdx) => {
            const lm    = LM.rows[rowIdx];
            const items = rowData[key];
            const { carH, hH, cardH, cardW } = rowSizes[rowIdx];
            const carTop  = pY(ir, lm.carY);
            const doorLpx = pX(ir, LM.doorL);
            const doorRpx = pX(ir, LM.doorR);

            return (
              <React.Fragment key={key}>
                {/* ── Large pink pill "+ ADD" button — always visible ── */}
                <SectionBtn
                  label={btnLabel}
                  ir={ir}
                  rodCY={lm.rodCY}
                  onClick={addHandlers[key]}
                  data-testid={`add-btn-${key}`}
                />

                {/* ── Carousel row ── */}
                <div
                  data-testid={`row-${key}`}
                  style={{
                    position: "absolute",
                    top: carTop, left: 0, right: 0,
                    height: carH,
                    zIndex: 11,
                  }}
                >
                  {/* Pink chevrons — only when items exist */}
                  {items.length > 0 && (
                    <>
                      <div style={{ position:"absolute", left: doorLpx - 4, top:"50%", transform:"translateY(-50%)", fontSize: Math.max(18, Math.round(carH * 0.40)), color:PINK, fontWeight:300, lineHeight:1, pointerEvents:"none", userSelect:"none", opacity:0.9, zIndex:13 }}>‹</div>
                      <div style={{ position:"absolute", right: pW(ir, 1 - LM.doorR) - 4, top:"50%", transform:"translateY(-50%)", fontSize: Math.max(18, Math.round(carH * 0.40)), color:PINK, fontWeight:300, lineHeight:1, pointerEvents:"none", userSelect:"none", opacity:0.9, zIndex:13 }}>›</div>
                    </>
                  )}

                  <SwipeRow
                    ref={rowRefs[key]}
                    items={items}
                    addLabel={addLabel}
                    onCenteredItem={centredHandlers[key]}
                    onAddClick={addHandlers[key]}
                    onItemTap={handleItemTap}
                    closetStyle
                    closetItemW={cardW}
                    closetItemH={cardH}
                    closetHangerH={hH}
                  />
                </div>
              </React.Fragment>
            );
          })}
        </>
      )}

      {/* ── Bottom action bar — HTML-rendered, pinned to container bottom ── */}
      {/* Full-width backdrop for visual cleanliness on all screen widths */}
      <div style={{ position:"absolute", bottom:0, left:0, right:0, height:BAR_H, zIndex:19,
        background:"linear-gradient(to bottom, rgba(248,240,220,0.97) 0%, rgba(242,230,198,0.99) 100%)",
        borderTop:"1px solid rgba(196,155,42,0.25)", boxShadow:"0 -2px 10px rgba(0,0,0,0.07)" }} />

      {/* Bar contents — aligned to image rect (handles SE letterboxing) */}
      {ready && (
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: ir.left,
            width: ir.width,
            height: BAR_H,
            zIndex: 20,
          }}
        >
          {/* Shuffle (hanger) — left-side icon */}
          <button
            onClick={handleShuffle}
            data-testid="button-shuffle"
            title="Shuffle outfit"
            style={{
              position: "absolute",
              left: pW(ir, LM.hangerCX) - 22,
              top: "50%", transform: "translateY(-50%)",
              width: 44, height: 44,
              borderRadius: "50%",
              background: "rgba(255,248,240,0.85)",
              border: "1.2px solid rgba(196,155,42,0.30)",
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer",
            }}
          >
            <HangerIcon size={22} />
          </button>

          {/* Save Outfit — centre */}
          <AnimatePresence mode="wait">
            {isSaveOpen ? (
              <motion.div
                key="input"
                initial={{ opacity:0, y:4 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:4 }}
                style={{
                  position: "absolute",
                  bottom: BAR_H + 8,
                  left: pW(ir, LM.saveBtnL),
                  right: pW(ir, 1 - LM.saveBtnR),
                  display: "flex", gap: 6, zIndex: 22,
                }}
              >
                <input
                  autoFocus type="text"
                  placeholder="Name this outfit…"
                  value={saveName}
                  onChange={e => setSaveName(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleSave()}
                  data-testid="input-outfit-name"
                  style={{ flex:1, height:38, borderRadius:20, padding:"0 14px", fontSize:13, fontWeight:600, color:"#3a2400", background:"rgba(255,252,245,0.98)", border:"1.5px solid rgba(196,155,42,0.50)", boxShadow:"0 3px 12px rgba(0,0,0,0.14)", outline:"none" }}
                />
                <button onClick={() => { setIsSaveOpen(false); setSaveName(""); }}
                  style={{ width:38, height:38, borderRadius:"50%", flexShrink:0, background:"rgba(255,250,240,0.97)", border:"1.5px solid rgba(196,155,42,0.36)", display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer" }}>
                  <X style={{ width:14, height:14, color:GOLD }} />
                </button>
                <button
                  onClick={handleSave}
                  disabled={!saveName.trim() || saveOutfit.isPending}
                  data-testid="button-save-outfit-confirm"
                  style={{ padding:"0 16px", height:38, borderRadius:20, flexShrink:0, background:"linear-gradient(to bottom,#f5d840,#c89018)", color:"#3a2400", fontWeight:700, fontSize:13, border:"none", boxShadow:"0 3px 10px rgba(200,168,24,0.32)", opacity:(!saveName.trim()||saveOutfit.isPending)?0.42:1, cursor:"pointer" }}
                >
                  {saveOutfit.isPending ? "…" : "Save ♡"}
                </button>
              </motion.div>
            ) : (
              <motion.button
                key="save"
                initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
                onClick={handleSaveClick}
                data-testid="button-save-outfit"
                style={{
                  position: "absolute",
                  left: pW(ir, LM.saveBtnL),
                  right: pW(ir, 1 - LM.saveBtnR),
                  top: "50%", transform: "translateY(-50%)",
                  height: 40, borderRadius: 20,
                  background: canSave
                    ? "linear-gradient(to bottom, #f8e860, #d4a010)"
                    : "rgba(255,248,232,0.90)",
                  border: `1.5px solid ${canSave ? "rgba(196,155,42,0.60)" : "rgba(196,155,42,0.35)"}`,
                  boxShadow: canSave ? "0 3px 14px rgba(200,168,24,0.35)" : "0 1px 4px rgba(0,0,0,0.06)",
                  color: "#3a2400", fontWeight: 800, fontSize: 14,
                  letterSpacing: "0.06em", textTransform: "uppercase",
                  fontFamily: "'Georgia', serif", cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
                }}
                aria-label="Save Outfit"
              >
                SAVE OUTFIT ♡
              </motion.button>
            )}
          </AnimatePresence>

          {/* Mannequin — right-side icon */}
          <button
            onClick={handleMannequinClick}
            disabled={!canSave}
            data-testid="button-view-mannequin"
            title="View on mannequin"
            style={{
              position: "absolute",
              left: pW(ir, LM.manneCX) - 22,
              top: "50%", transform: "translateY(-50%)",
              width: 44, height: 44,
              borderRadius: "50%",
              background: "rgba(255,248,240,0.85)",
              border: "1.2px solid rgba(196,155,42,0.30)",
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: canSave ? "pointer" : "default",
              opacity: canSave ? 1 : 0.35,
            }}
          >
            <MannequinIcon size={22} />
          </button>
        </div>
      )}

      {/* ── Modals ── */}
      <AnimatePresence>
        {showMannequin && <MannequinView top={centred.tops} bottom={centred.bottoms} shoes={centred.shoes} onClose={() => setShowMannequin(false)} />}
      </AnimatePresence>
      <AnimatePresence>
        {upgradeReason && <UpgradeSheet reason={upgradeReason} onClose={() => setUpgradeReason(null)} />}
      </AnimatePresence>
      <AnimatePresence>
        {showPremium && <PremiumSheet onClose={() => setShowPremium(false)} />}
      </AnimatePresence>
      <AnimatePresence>
        {addCategory && (
          <QuickAddSheet
            key={addCategory} open={!!addCategory}
            onOpenChange={open => !open && setAddCategory(null)}
            category={addCategory}
            existingCount={rowData[addCategory as RowKey]?.length ?? 0}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {detailsItem && <ItemDetailsSheet key={detailsItem.id} item={detailsItem} onClose={() => setDetailsItem(null)} />}
      </AnimatePresence>
    </div>
  );
}
