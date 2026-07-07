/**
 * UpgradeSheet
 *
 * Full-screen paywall shown when the user hits a free-tier limit (items,
 * outfits) or taps a locked feature (mannequin).
 *
 * Single offer: Unlock Lifetime Unlimited Access — $4.99 one-time.
 */
import React, { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Check } from "lucide-react";
import { useEntitlements, PurchaseResult } from "@/hooks/useEntitlements";
import { FREE_ITEM_LIMIT, FREE_OUTFIT_LIMIT } from "@/lib/entitlements";

export type UpgradeReason = "items" | "outfits";

interface Props {
  reason:  UpgradeReason;
  onClose: () => void;
}

const FEATURES = [
  "Unlimited closet items, forever",
  "Unlimited saved outfits",
  "No subscription, ever",
  "All future core updates",
] as const;

export function UpgradeSheet({ reason, onClose }: Props) {
  const { purchase } = useEntitlements();
  const [status, setStatus] = useState<"idle" | "pending">("idle");

  const handlePurchase = useCallback(async () => {
    if (status === "pending") return;
    setStatus("pending");
    const result: PurchaseResult = await purchase("unlock");
    if (result === "success") {
      onClose();
    } else {
      setStatus("idle");
    }
  }, [status, purchase, onClose]);

  const subtitle =
    reason === "items"
      ? `You've reached ${FREE_ITEM_LIMIT} items — that's the free limit.`
      : `You've saved ${FREE_OUTFIT_LIMIT} outfits — that's the free limit.`;

  return (
    <motion.div
      initial={{ opacity: 0, y: "100%" }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: "100%" }}
      transition={{ type: "spring", damping: 28, stiffness: 240 }}
      className="fixed inset-0 z-[80] flex flex-col max-w-md mx-auto bg-[#f9f4ee]"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-white border-b-2 border-black flex-shrink-0">
        <h2 className="font-display font-bold text-xl uppercase tracking-tight">
          Unlock Lifetime Access
        </h2>
        <button
          onClick={onClose}
          className="w-9 h-9 border-2 border-black rounded-full flex items-center justify-center
                     bg-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]
                     active:translate-y-0.5 active:translate-x-0.5 active:shadow-none transition-all"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto flex flex-col p-5 gap-5">

        {/* Subtitle */}
        <p className="text-sm font-medium text-black/55 text-center leading-snug px-2">
          {subtitle}
        </p>

        {/* Offer card */}
        <div className="border-4 border-black rounded-2xl bg-black text-white
                        shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] overflow-hidden">
          {/* Pricing */}
          <div className="px-5 pt-6 pb-5 flex flex-col gap-1">
            <span className="text-5xl leading-none">🔓</span>
            <p className="font-display font-bold text-3xl uppercase tracking-tight leading-tight mt-2">
              Unlock Lifetime<br />Unlimited Access
            </p>
            <div className="flex items-baseline gap-2 mt-2">
              <span className="font-display font-bold text-5xl leading-none">$4.99</span>
              <span className="text-sm font-bold text-white/50 leading-tight">
                one-time<br />no subscription
              </span>
            </div>
          </div>

          {/* Divider */}
          <div className="border-t-2 border-white/15 mx-5" />

          {/* Features */}
          <ul className="px-5 py-5 flex flex-col gap-3">
            {FEATURES.map((text) => (
              <li key={text} className="flex items-center gap-3 text-sm leading-snug">
                <span className="w-5 h-5 rounded-full bg-primary flex-shrink-0 flex items-center justify-center border-2 border-primary">
                  <Check className="w-3 h-3 text-black" strokeWidth={3} />
                </span>
                <span className="text-white/90 font-medium">{text}</span>
              </li>
            ))}
          </ul>
        </div>

      </div>

      {/* CTA footer */}
      <div className="px-5 pb-6 pt-4 bg-white border-t-2 border-black flex flex-col gap-3 flex-shrink-0">
        <button
          onClick={handlePurchase}
          disabled={status === "pending"}
          className="w-full py-4 rounded-xl font-display font-bold text-xl uppercase
                     tracking-tight border-4 border-black bg-primary text-black
                     shadow-[5px_5px_0px_0px_rgba(0,0,0,1)]
                     active:translate-x-1 active:translate-y-1 active:shadow-none
                     disabled:opacity-60 disabled:cursor-not-allowed transition-all"
        >
          {status === "pending" ? "Opening checkout…" : "Unlock Forever – $4.99"}
        </button>
        <button
          onClick={onClose}
          className="text-sm font-bold text-black/40 text-center underline underline-offset-2
                     hover:text-black/60 transition-colors"
        >
          Maybe Later
        </button>
      </div>
    </motion.div>
  );
}
