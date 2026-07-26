/**
 * CleanUpPhotoOverlay — full-screen slide-up sheet.
 *
 * 1. On mount, runs @imgly/background-removal on the item's stored image (on-device WASM).
 * 2. Shows Original | Cleaned side-by-side once ready.
 * 3. User taps one to select (pink ring + checkmark), then confirms.
 * 4. Optimistically calls onSaved(chosenUrl) so the parent updates the photo instantly,
 *    then writes to DB in the background — no flash.
 */
import React, { useEffect, useRef, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { X, Check, Loader2, AlertTriangle } from "lucide-react";
import { removeBackground } from "@/lib/backgroundRemoval";
import {
  useUpdateClothingItem,
  getListClothingQueryKey,
  getWardrobeStatsQueryKey,
} from "@/hooks/useLocalDB";
import { useQueryClient } from "@tanstack/react-query";

// ── helpers ───────────────────────────────────────────────────────────────────

/** Resize a PNG blob to maxPx on the longest side, preserving transparency. */
async function resizePng(blob: Blob, maxPx = 800): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
      const w = Math.round(img.width  * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width  = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/png", 0.9));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Image load failed")); };
    img.src = url;
  });
}

// ── types ─────────────────────────────────────────────────────────────────────

type Selection = "original" | "cleaned";

interface Props {
  imageUrl:  string;         // current stored data URL
  itemId:    number;
  onClose:   () => void;
  onSaved:   (newUrl: string) => void;  // called immediately before DB write
}

// ── component ─────────────────────────────────────────────────────────────────

export function CleanUpPhotoOverlay({ imageUrl, itemId, onClose, onSaved }: Props) {
  const [cleaning,   setCleaning]   = useState(true);   // true while WASM is running
  const [cleanedUrl, setCleanedUrl] = useState<string | null>(null);
  const [selected,   setSelected]   = useState<Selection>("original"); // saveable immediately
  const [errorMsg,   setErrorMsg]   = useState<string | null>(null);

  const updateItem  = useUpdateClothingItem();
  const queryClient = useQueryClient();

  // Guard against stale async results (e.g. if overlay is closed mid-removal)
  const mountedRef = useRef(true);
  useEffect(() => { return () => { mountedRef.current = false; }; }, []);

  // Run background removal on mount
  useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        const resultUrl = await removeBackground(imageUrl);
        if (cancelled || !mountedRef.current) return;
        const resized = await resizePng(
          await (await fetch(resultUrl)).blob()
        );
        if (cancelled || !mountedRef.current) return;
        setCleanedUrl(resized);
        setCleaning(false);
      } catch (err) {
        if (cancelled || !mountedRef.current) return;
        console.error("Background removal failed:", err);
        setErrorMsg("Background removal failed. Please try again with a different photo.");
        setCleaning(false);
      }
    }
    run();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSave = useCallback(() => {
    const chosen = selected === "cleaned" && cleanedUrl ? cleanedUrl : imageUrl;
    // 1. Optimistically update the parent — no DB flash
    onSaved(chosen);
    // 2. Write to DB in background (fire-and-forget from UX perspective)
    updateItem.mutate(
      { id: itemId, data: { imageObjectPath: chosen } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListClothingQueryKey() });
          queryClient.invalidateQueries({ queryKey: getWardrobeStatsQueryKey() });
        },
        onError: (err) => console.error("Failed to save image to DB:", err),
      }
    );
    onClose();
  }, [selected, cleanedUrl, imageUrl, onSaved, updateItem, itemId, queryClient, onClose]);

  // Label for the save button
  const saveLabel = selected === "cleaned" ? "Save Cleaned Version" : "Save Original";
  // Disable save only when user has chosen "cleaned" but it isn't ready yet
  const saveDisabled = selected === "cleaned" && !cleanedUrl;

  return (
    <motion.div
      initial={{ opacity: 0, y: "100%" }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: "100%" }}
      transition={{ type: "spring", damping: 28, stiffness: 240 }}
      className="fixed inset-0 z-[80] flex flex-col max-w-md mx-auto bg-[#f9f4ee]"
    >
      {/* ── Header ── */}
      <div
        className="flex items-center justify-between px-4 bg-white border-b-2 border-black flex-shrink-0"
        style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))", paddingBottom: "0.75rem" }}
      >
        <div>
          <h2 className="font-display font-bold text-xl uppercase tracking-tight">Clean Up Photo</h2>
          <p className="text-[11px] font-medium mt-0.5 text-black/40">
            {cleaning ? "Cleaning in background…" : "Tap to choose your version"}
          </p>
        </div>
        <button
          onClick={onClose}
          className="w-9 h-9 border-2 border-black rounded-full flex items-center justify-center
                     bg-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]
                     active:translate-y-0.5 active:translate-x-0.5 active:shadow-none transition-all"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* ── Body — always shown, no phase gate ── */}
      <div className="flex-1 flex flex-col gap-4 p-4 overflow-y-auto">

        {/* Error banner (only after cleaning finishes with an error) */}
        {errorMsg && (
          <div className="flex items-start gap-2 bg-amber-50 border-2 border-amber-300 rounded-xl px-3 py-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-amber-800 leading-snug">{errorMsg}</p>
          </div>
        )}

        {/* Side-by-side cards */}
        <div className="flex gap-3">

          {/* Original — always tappable */}
          <button
            onClick={() => setSelected("original")}
            className={`flex-1 flex flex-col gap-2 rounded-2xl border-4 overflow-hidden transition-all
              ${selected === "original"
                ? "border-pink-500 shadow-[0_0_0_2px_#ec4899]"
                : "border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]"}`}
          >
            <div className="w-full aspect-square relative" style={{ background: "#B8894E" }}>
              <img src={imageUrl} alt="Original" className="w-full h-full object-contain" />
              {selected === "original" && (
                <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-pink-500 border-2 border-white flex items-center justify-center shadow">
                  <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />
                </div>
              )}
            </div>
            <div className="px-3 pb-3 text-center">
              <p className="font-display font-bold text-sm uppercase tracking-tight">Original</p>
            </div>
          </button>

          {/* Cleaned — spinner while processing, image when ready, error state on failure */}
          {cleanedUrl ? (
            <button
              onClick={() => setSelected("cleaned")}
              className={`flex-1 flex flex-col gap-2 rounded-2xl border-4 overflow-hidden transition-all
                ${selected === "cleaned"
                  ? "border-pink-500 shadow-[0_0_0_2px_#ec4899]"
                  : "border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]"}`}
            >
              <div
                className="w-full aspect-square relative"
                style={{
                  backgroundImage: "repeating-conic-gradient(#e5e7eb 0% 25%, white 0% 50%)",
                  backgroundSize: "16px 16px",
                }}
              >
                <img src={cleanedUrl} alt="Background removed" className="w-full h-full object-contain" />
                {selected === "cleaned" && (
                  <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-pink-500 border-2 border-white flex items-center justify-center shadow">
                    <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />
                  </div>
                )}
              </div>
              <div className="px-3 pb-3 text-center">
                <p className="font-display font-bold text-sm uppercase tracking-tight">Cleaned ✨</p>
              </div>
            </button>
          ) : errorMsg ? (
            /* Failed */
            <div className="flex-1 flex flex-col rounded-2xl border-4 border-black/20 overflow-hidden opacity-40">
              <div className="w-full aspect-square bg-black/5 flex items-center justify-center">
                <AlertTriangle className="w-8 h-8 text-black/30" />
              </div>
              <div className="px-3 pb-3 text-center">
                <p className="font-display font-bold text-sm uppercase tracking-tight">Cleaned ✨</p>
                <p className="text-[10px] text-black/40 mt-0.5">Unavailable</p>
              </div>
            </div>
          ) : (
            /* Still processing — non-interactive spinner card */
            <div className="flex-1 flex flex-col rounded-2xl border-4 border-black/20 overflow-hidden">
              <div className="w-full aspect-square bg-black/5 flex flex-col items-center justify-center gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-black/30" strokeWidth={1.5} />
                <p className="text-[10px] font-bold uppercase tracking-widest text-black/30">Cleaning…</p>
              </div>
              <div className="px-3 pb-3 text-center">
                <p className="font-display font-bold text-sm uppercase tracking-tight text-black/30">Cleaned ✨</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Footer — always visible ── */}
      <div
        className="flex-shrink-0 px-4 py-4 bg-white border-t-2 border-black flex flex-col gap-2"
        style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
      >
        <button
          onClick={handleSave}
          disabled={saveDisabled}
          className="w-full btn-brutalist py-3.5 rounded-xl flex items-center justify-center gap-2 text-sm
                     disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Check className="w-4 h-4" strokeWidth={3} />
          {saveDisabled ? "Waiting for cleaned version…" : saveLabel}
        </button>
        <button
          onClick={onClose}
          className="w-full py-3 rounded-xl text-sm font-bold uppercase border-2 border-black/20
                     text-black/35 hover:border-black/40 transition-all"
        >
          Cancel
        </button>
      </div>
    </motion.div>
  );
}
