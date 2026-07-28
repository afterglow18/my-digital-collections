/**
 * UpgradeSheet — three-tier paywall (Monthly / Yearly / Lifetime).
 *
 * Single-screen, no scroll. Lifetime pre-selected as "Best Value".
 * All accent colour uses bg-primary (warm tan hsl(35 55% 82%)).
 *
 * RC package identifiers expected in the default offering:
 *   $rc_monthly   → Monthly  $1.99
 *   $rc_annual    → Yearly   $19.99
 *   $rc_lifetime  → Lifetime $9.99 (one-time)
 */
import React, { useState, useCallback } from "react";
import { motion } from "framer-motion";
import { X, Check } from "lucide-react";
import { useSubscription } from "@/lib/revenuecat";

export type UpgradeReason = "items" | "outfits" | "mannequin";
type TierId = "monthly" | "yearly" | "lifetime";

interface Props {
  reason:  UpgradeReason;
  onClose: () => void;
}

// ── Copy ──────────────────────────────────────────────────────────────────────

const FEATURES = [
  "Unlimited clothing items",
  "Unlimited saved outfits",
  "Save your entire wardrobe",
  "One-time payment options",
  "Choose monthly, yearly or lifetime!",
] as const;

const HEADLINES: Record<UpgradeReason, string> = {
  items:     "UNLOCK YOUR UNLIMITED DIGITAL COLLECTION",
  outfits:   "UNLOCK YOUR UNLIMITED DIGITAL COLLECTION",
  mannequin: "UNLOCK YOUR UNLIMITED DIGITAL COLLECTION",
};

const SUBTITLES: Record<UpgradeReason, string> = {
  items:     "You've reached the free 20 item limit.\nUpgrade once, collect everything.",
  outfits:   "You've hit the free outfit limit. Upgrade to save every look.",
  mannequin: "A premium feature — unlock it once.",
};

// Fallback tier defs (browser — RC not available)
const TIER_DEFAULTS: Record<TierId, {
  label: string;
  price: string;
  period: string;
  notes: [string, string];
  pkgId: string;
  best?: true;
}> = {
  monthly:  { label: "MONTHLY",  price: "$1.99",  period: "/month",   notes: ["Cancel anytime",  "Billed monthly"],  pkgId: "$rc_monthly"  },
  yearly:   { label: "YEARLY",   price: "$19.99", period: "/year",    notes: ["Save 17%",        "Billed yearly"],   pkgId: "$rc_annual"   },
  lifetime: { label: "LIFETIME", price: "$9.99",  period: "one-time", notes: ["Pay once",        "Yours forever"],   pkgId: "$rc_lifetime", best: true },
};

const TIER_ORDER: TierId[] = ["monthly", "yearly", "lifetime"];

// ── RC helpers ────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getRcPackage(offerings: any, pkgId: string): any | undefined {
  return offerings?.current?.availablePackages?.find(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (p: any) => p.identifier === pkgId,
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getLivePrice(offerings: any, pkgId: string, fallback: string): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (getRcPackage(offerings, pkgId) as any)?.product?.priceString ?? fallback;
}

// ── Tier card ─────────────────────────────────────────────────────────────────

function TierCard({
  id, selected, onSelect, price, period, notes, label, best,
}: {
  id: TierId; selected: boolean; onSelect: (id: TierId) => void;
  price: string; period: string; notes: [string, string]; label: string; best?: true;
}) {
  return (
    <button
      onClick={() => onSelect(id)}
      className="flex-1 flex flex-col rounded-xl border-[3px] transition-all relative overflow-hidden text-left"
      style={{
        borderColor: selected ? "#C4920A" : "rgba(196,146,10,0.3)",
        background:  selected ? "rgba(196,146,10,0.18)" : "rgba(196,146,10,0.07)",
        boxShadow:   selected ? "0 0 0 1px rgba(196,146,10,0.4)" : "none",
      }}
    >
      {best && (
        <span
          className="absolute top-0 right-0 text-[8px] font-bold uppercase tracking-tight px-1.5 py-0.5 rounded-bl-lg"
          style={{ background: "#C0390B", color: "#fff" }}
        >
          BEST ★ VALUE
        </span>
      )}
      <div className="px-2.5 pt-3 pb-2.5 flex flex-col gap-1">
        <p className="text-[9px] font-bold uppercase tracking-widest" style={{ color: "rgba(196,146,10,0.7)" }}>{label}</p>
        <p className="font-display font-bold text-[1.3rem] leading-none" style={{ color: "#D4A520" }}>{price}</p>
        <p className="text-[9px] font-semibold" style={{ color: "rgba(196,146,10,0.6)" }}>{period}</p>
        <ul className="flex flex-col gap-0.5 mt-1.5">
          {notes.map((n) => (
            <li key={n} className="flex items-center gap-1">
              <Check className="w-2.5 h-2.5 shrink-0" style={{ color: "#C4920A" }} strokeWidth={3} />
              <span className="text-[8.5px] font-semibold leading-tight" style={{ color: "rgba(196,146,10,0.75)" }}>{n}</span>
            </li>
          ))}
        </ul>
      </div>
    </button>
  );
}

// ── Sheet ─────────────────────────────────────────────────────────────────────

export function UpgradeSheet({ reason, onClose }: Props) {
  const { offerings, purchase, restore, isRestoring } = useSubscription();
  const [selected, setSelected] = useState<TierId>("lifetime");
  const [status,   setStatus]   = useState<"idle" | "pending">("idle");

  const prices: Record<TierId, string> = {
    monthly:  getLivePrice(offerings, "$rc_monthly",  "$1.99"),
    yearly:   getLivePrice(offerings, "$rc_annual",   "$19.99"),
    lifetime: getLivePrice(offerings, "$rc_lifetime", "$9.99"),
  };

  const ctaLabel =
    status === "pending"        ? "Opening…"
    : selected === "lifetime"   ? `UNLOCK FOREVER – ${prices.lifetime} ›`
    : selected === "yearly"     ? `SUBSCRIBE – ${prices.yearly}/YR ›`
    :                             `SUBSCRIBE – ${prices.monthly}/MO ›`;

  const handlePurchase = useCallback(async () => {
    if (status === "pending") return;
    setStatus("pending");
    const pkg = getRcPackage(offerings, TIER_DEFAULTS[selected].pkgId);
    if (!pkg) { setStatus("idle"); return; }
    try {
      await purchase(pkg);
      onClose();
    } catch (err: unknown) {
      setStatus("idle");
      const msg = err instanceof Error ? err.message.toLowerCase() : "";
      if (!msg.includes("cancel") && !msg.includes("dismiss")) console.error("Purchase error:", err);
    }
  }, [status, offerings, selected, purchase, onClose]);

  return (
    <motion.div
      initial={{ opacity: 0, y: "100%" }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: "100%" }}
      transition={{ type: "spring", damping: 28, stiffness: 240 }}
      className="fixed inset-0 z-[80] flex flex-col max-w-md mx-auto"
      style={{ background: "#0e0b07" }}
    >
      {/* ── Gold plaid hero ─────────────────────────────────────────────────── */}
      <div style={{
        position: "relative",
        flexShrink: 0,
        paddingTop: "max(1rem, env(safe-area-inset-top))",
        paddingBottom: "1.5rem",
        paddingLeft: "1.25rem",
        paddingRight: "1.25rem",
        overflow: "hidden",
        background: "#0e0b07",
      }}>
        {/* Plaid SVG pattern overlay */}
        <svg
          aria-hidden="true"
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <pattern id="plaid" x="0" y="0" width="40" height="40" patternUnits="userSpaceOnUse">
              {/* Horizontal stripes */}
              <rect x="0" y="0"  width="40" height="3"  fill="rgba(196,146,10,0.45)" />
              <rect x="0" y="10" width="40" height="1"  fill="rgba(196,146,10,0.22)" />
              <rect x="0" y="18" width="40" height="3"  fill="rgba(196,146,10,0.45)" />
              <rect x="0" y="28" width="40" height="1"  fill="rgba(196,146,10,0.22)" />
              {/* Vertical stripes */}
              <rect x="0"  y="0" width="3"  height="40" fill="rgba(196,146,10,0.45)" />
              <rect x="10" y="0" width="1"  height="40" fill="rgba(196,146,10,0.22)" />
              <rect x="18" y="0" width="3"  height="40" fill="rgba(196,146,10,0.45)" />
              <rect x="28" y="0" width="1"  height="40" fill="rgba(196,146,10,0.22)" />
              {/* Intersection highlights */}
              <rect x="0"  y="0"  width="3" height="3" fill="rgba(212,165,32,0.70)" />
              <rect x="18" y="0"  width="3" height="3" fill="rgba(212,165,32,0.70)" />
              <rect x="0"  y="18" width="3" height="3" fill="rgba(212,165,32,0.70)" />
              <rect x="18" y="18" width="3" height="3" fill="rgba(212,165,32,0.70)" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#plaid)" />
        </svg>

        {/* Close button */}
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "1rem", position: "relative", zIndex: 2 }}>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              width: 36, height: 36, borderRadius: "50%",
              border: "1.5px solid rgba(196,146,10,0.8)",
              background: "rgba(14,11,7,0.7)",
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer",
            }}
          >
            <X style={{ width: 16, height: 16, color: "#D4A520" }} />
          </button>
        </div>

        {/* Headline */}
        <div style={{ position: "relative", zIndex: 2 }}>
          <h1 style={{
            fontFamily: "var(--font-display)",
            fontWeight: 800,
            fontSize: "2rem",
            textTransform: "uppercase",
            letterSpacing: "-0.01em",
            lineHeight: 0.9,
            color: "#D4A520",
            margin: 0,
          }}>
            {HEADLINES[reason]}
          </h1>
          <p style={{ fontSize: "0.72rem", fontWeight: 600, color: "rgba(196,146,10,0.85)", marginTop: "0.5rem", whiteSpace: "pre-line" }}>
            {SUBTITLES[reason]}
          </p>
        </div>
      </div>

      {/* Content — fills remaining height, no scroll */}
      <div className="flex-1 min-h-0 flex flex-col justify-between px-5 pt-3 pb-2"
           style={{ background: "#0e0b07" }}>

        {/* Spacer — headline moved to hero above */}
        <div />

        {/* Features card */}
        <div className="rounded-2xl border-[3px] border-black overflow-hidden" style={{ background: "#111" }}>
          <div className="px-4 py-4 flex flex-col gap-2">
            <p className="font-display font-bold uppercase text-[1.45rem] leading-[0.92] tracking-tight"
               style={{ color: "#D4A520" }}>
              Unlimited collections
            </p>
            <p className="font-display font-bold uppercase text-[1.45rem] leading-[0.92] tracking-tight"
               style={{ color: "#D4A520" }}>
              Unlimited saved outfits
            </p>
            <p className="text-white/60 text-xs font-medium mt-1 leading-snug">
              Your entire wardrobe, beautifully packed — forever.
            </p>
          </div>
        </div>

        {/* Plan selector */}
        <div>
          <p className="text-[9px] font-bold uppercase tracking-widest text-center mb-1.5" style={{ color: "rgba(196,146,10,0.6)" }}>
            Choose Your Plan
          </p>
          <div className="flex gap-2">
            {TIER_ORDER.map((id) => {
              const t = TIER_DEFAULTS[id];
              return (
                <TierCard
                  key={id}
                  id={id}
                  selected={selected === id}
                  onSelect={setSelected}
                  label={t.label}
                  price={prices[id]}
                  period={t.period}
                  notes={t.notes}
                  best={t.best}
                />
              );
            })}
          </div>
        </div>

      </div>

      {/* CTA footer */}
      <div
        className="px-5 pt-2 flex flex-col gap-2 flex-shrink-0"
        style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}
      >
        <button
          onClick={handlePurchase}
          disabled={status === "pending"}
          className="w-full py-3.5 rounded-2xl font-display font-bold text-lg uppercase
                     tracking-tight active:opacity-80 transition-all
                     disabled:opacity-60 disabled:cursor-not-allowed"
          style={{
            background: "linear-gradient(135deg, #C4920A 0%, #A07808 100%)",
            color: "#0e0b07",
            border: "1px solid rgba(212,165,32,0.4)",
            boxShadow: status === "pending" ? "none" : "0 2px 12px rgba(196,146,10,0.35)",
          }}
        >
          {ctaLabel}
        </button>
        <button
          onClick={onClose}
          className="text-sm font-semibold text-black/35 text-center hover:text-black/55 transition-colors"
        >
          Maybe Later
        </button>
        <button
          onClick={() => { restore().catch(() => {}); }}
          disabled={isRestoring}
          className="text-xs font-semibold text-black/30 text-center hover:text-black/50 transition-colors disabled:opacity-40"
        >
          {isRestoring ? "Restoring…" : "Restore Purchases"}
        </button>
        {/* Legal links — required by Apple */}
        <div className="flex items-center justify-center gap-3 pt-1">
          <button
            onClick={() => window.open("https://www.apple.com/legal/internet-services/itunes/dev/stdeula/", "_system")}
            className="text-[10px] font-medium text-black/30 underline underline-offset-2 hover:text-black/50 transition-colors"
          >
            Terms of Use
          </button>
          <span className="text-black/20 text-[10px]">•</span>
          <button
            onClick={() => window.open("https://app.notion.com/p/My-Digital-Collection-Privacy-Policy-39682db6065380b19dedcb108d4a0ef4?source=copy_link", "_system")}
            className="text-[10px] font-medium text-black/30 underline underline-offset-2 hover:text-black/50 transition-colors"
          >
            Privacy Policy
          </button>
        </div>
      </div>
    </motion.div>
  );
}
