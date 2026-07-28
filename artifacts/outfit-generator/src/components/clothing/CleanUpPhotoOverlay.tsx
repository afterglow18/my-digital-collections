/**
 * CleanUpPhotoOverlay — full-screen slide-up sheet.
 * Dark gold luxury theme, matching the rest of the app.
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

// ── Design tokens (same as ItemDetailsSheet) ──────────────────────────────────
const T = {
  bg:         "#0e0b07",
  bgCard:     "#161008",
  bgInput:    "#1a1208",
  gold:       "#B8894E",
  goldLight:  "#E8D4B0",
  goldBorder: "rgba(184,137,78,0.28)",
  goldHi:     "rgba(184,137,78,0.75)",
  textPrimary:"#E8D4B0",
  textMuted:  "rgba(232,212,176,0.45)",
  textFaint:  "rgba(232,212,176,0.22)",
};

// ── helpers ───────────────────────────────────────────────────────────────────

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
      canvas.width = w; canvas.height = h;
      canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/png", 0.9));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Image load failed")); };
    img.src = url;
  });
}

// ── types ─────────────────────────────────────────────────────────────────────

type Selection = "original" | "cleaned";

interface Props {
  imageUrl: string;
  itemId:   number;
  onClose:  () => void;
  onSaved:  (newUrl: string) => void;
}

// ── component ─────────────────────────────────────────────────────────────────

export function CleanUpPhotoOverlay({ imageUrl, itemId, onClose, onSaved }: Props) {
  const [cleaning,   setCleaning]   = useState(true);
  const [cleanedUrl, setCleanedUrl] = useState<string | null>(null);
  const [selected,   setSelected]   = useState<Selection>("original");
  const [errorMsg,   setErrorMsg]   = useState<string | null>(null);

  const updateItem  = useUpdateClothingItem();
  const queryClient = useQueryClient();
  const mountedRef  = useRef(true);
  useEffect(() => { return () => { mountedRef.current = false; }; }, []);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        const resultUrl = await removeBackground(imageUrl);
        if (cancelled || !mountedRef.current) return;
        const resized = await resizePng(await (await fetch(resultUrl)).blob());
        if (cancelled || !mountedRef.current) return;
        setCleanedUrl(resized);
        setCleaning(false);
      } catch (err) {
        if (cancelled || !mountedRef.current) return;
        console.error("Background removal failed:", err);
        setErrorMsg("Background removal failed. Try a different photo.");
        setCleaning(false);
      }
    }
    run();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSave = useCallback(() => {
    const chosen = selected === "cleaned" && cleanedUrl ? cleanedUrl : imageUrl;
    onSaved(chosen);
    updateItem.mutate(
      { id: itemId, data: { imageObjectPath: chosen, ...(selected === "cleaned" && cleanedUrl ? { bgRemoved: true } : {}) } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListClothingQueryKey() });
          queryClient.invalidateQueries({ queryKey: getWardrobeStatsQueryKey() });
        },
        onError: (err) => console.error("Failed to save image:", err),
      }
    );
    onClose();
  }, [selected, cleanedUrl, imageUrl, onSaved, updateItem, itemId, queryClient, onClose]);

  const saveLabel    = selected === "cleaned" ? "Save Cleaned Version" : "Save Original";
  const saveDisabled = selected === "cleaned" && !cleanedUrl;

  return (
    <motion.div
      initial={{ opacity: 0, y: "100%" }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: "100%" }}
      transition={{ type: "spring", damping: 28, stiffness: 240 }}
      style={{
        position: "fixed", inset: 0, zIndex: 80,
        display: "flex", flexDirection: "column",
        maxWidth: 448, margin: "0 auto",
        background: T.bg,
      }}
    >
      {/* ── Header ── */}
      <div style={{
        display: "flex", alignItems: "flex-start", justifyContent: "space-between",
        padding: "0 16px 12px",
        paddingTop: "max(0.75rem, env(safe-area-inset-top))",
        background: T.bg,
        borderBottom: `1px solid ${T.goldBorder}`,
        flexShrink: 0,
      }}>
        <div>
          <h2 style={{
            fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 16,
            letterSpacing: "0.08em", textTransform: "uppercase",
            color: T.textPrimary, margin: 0,
          }}>
            Clean Up Photo
          </h2>
          <p style={{
            fontSize: 11, marginTop: 4, color: T.textMuted,
            fontFamily: "var(--font-sans)",
          }}>
            {cleaning ? "Cleaning in background…" : "Tap to choose your version"}
          </p>
        </div>
        <button
          onClick={onClose}
          style={{
            width: 36, height: 36, borderRadius: "50%",
            border: `1.5px solid ${T.goldBorder}`,
            background: T.bgCard,
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", flexShrink: 0,
          }}
        >
          <X style={{ width: 15, height: 15, color: T.textMuted }} />
        </button>
      </div>

      {/* ── Body ── */}
      <div style={{
        flex: 1, display: "flex", flexDirection: "column",
        gap: 16, padding: 16, overflowY: "auto",
      }}>

        {/* Error banner */}
        {errorMsg && (
          <div style={{
            display: "flex", alignItems: "flex-start", gap: 8,
            background: "rgba(184,137,78,0.08)",
            border: `1px solid rgba(184,137,78,0.30)`,
            borderRadius: 12, padding: "10px 12px",
          }}>
            <AlertTriangle style={{ width: 15, height: 15, color: T.gold, flexShrink: 0, marginTop: 1 }} />
            <p style={{ fontSize: 12, color: T.textMuted, lineHeight: 1.5, margin: 0 }}>{errorMsg}</p>
          </div>
        )}

        {/* Side-by-side cards */}
        <div style={{ display: "flex", gap: 12 }}>

          {/* Original */}
          <button
            onClick={() => setSelected("original")}
            style={{
              flex: 1, display: "flex", flexDirection: "column",
              borderRadius: 16, overflow: "hidden",
              border: `2px solid ${selected === "original" ? T.goldHi : T.goldBorder}`,
              boxShadow: selected === "original"
                ? `0 0 0 2px ${T.gold}, 0 4px 20px rgba(184,137,78,0.20)`
                : "none",
              background: T.bgCard,
              cursor: "pointer",
              transition: "border-color 0.15s, box-shadow 0.15s",
            }}
          >
            <div style={{
              width: "100%", aspectRatio: "1",
              position: "relative", background: T.bgInput,
            }}>
              <img src={imageUrl} alt="Original"
                style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} />
              {selected === "original" && (
                <div style={{
                  position: "absolute", top: 8, right: 8,
                  width: 22, height: 22, borderRadius: "50%",
                  background: T.gold,
                  border: `2px solid ${T.goldLight}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <Check style={{ width: 12, height: 12, color: "#3A2210" }} strokeWidth={3} />
                </div>
              )}
            </div>
            <div style={{ padding: "8px 12px 10px", textAlign: "center" }}>
              <p style={{
                fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 11,
                letterSpacing: "0.10em", textTransform: "uppercase",
                color: selected === "original" ? T.goldLight : T.textMuted,
                margin: 0,
              }}>Original</p>
            </div>
          </button>

          {/* Cleaned */}
          {cleanedUrl ? (
            <button
              onClick={() => setSelected("cleaned")}
              style={{
                flex: 1, display: "flex", flexDirection: "column",
                borderRadius: 16, overflow: "hidden",
                border: `2px solid ${selected === "cleaned" ? T.goldHi : T.goldBorder}`,
                boxShadow: selected === "cleaned"
                  ? `0 0 0 2px ${T.gold}, 0 4px 20px rgba(184,137,78,0.20)`
                  : "none",
                background: T.bgCard,
                cursor: "pointer",
                transition: "border-color 0.15s, box-shadow 0.15s",
              }}
            >
              <div style={{
                width: "100%", aspectRatio: "1", position: "relative",
                backgroundImage: "repeating-conic-gradient(rgba(184,137,78,0.07) 0% 25%, transparent 0% 50%)",
                backgroundSize: "16px 16px",
              }}>
                <img src={cleanedUrl} alt="Background removed"
                  style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} />
                {selected === "cleaned" && (
                  <div style={{
                    position: "absolute", top: 8, right: 8,
                    width: 22, height: 22, borderRadius: "50%",
                    background: T.gold,
                    border: `2px solid ${T.goldLight}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <Check style={{ width: 12, height: 12, color: "#3A2210" }} strokeWidth={3} />
                  </div>
                )}
              </div>
              <div style={{ padding: "8px 12px 10px", textAlign: "center" }}>
                <p style={{
                  fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 11,
                  letterSpacing: "0.10em", textTransform: "uppercase",
                  color: selected === "cleaned" ? T.goldLight : T.textMuted,
                  margin: 0,
                }}>Cleaned ✨</p>
              </div>
            </button>
          ) : errorMsg ? (
            <div style={{
              flex: 1, display: "flex", flexDirection: "column",
              borderRadius: 16, overflow: "hidden",
              border: `2px solid ${T.goldBorder}`,
              background: T.bgCard, opacity: 0.4,
            }}>
              <div style={{
                width: "100%", aspectRatio: "1",
                display: "flex", alignItems: "center", justifyContent: "center",
                background: T.bgInput,
              }}>
                <AlertTriangle style={{ width: 28, height: 28, color: T.textFaint }} />
              </div>
              <div style={{ padding: "8px 12px 10px", textAlign: "center" }}>
                <p style={{
                  fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 11,
                  letterSpacing: "0.10em", textTransform: "uppercase",
                  color: T.textFaint, margin: 0,
                }}>Cleaned ✨</p>
              </div>
            </div>
          ) : (
            <div style={{
              flex: 1, display: "flex", flexDirection: "column",
              borderRadius: 16, overflow: "hidden",
              border: `2px solid ${T.goldBorder}`,
              background: T.bgCard,
            }}>
              <div style={{
                width: "100%", aspectRatio: "1",
                display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center", gap: 10,
                background: T.bgInput,
              }}>
                <Loader2 style={{ width: 28, height: 28, color: T.textMuted }} className="animate-spin" strokeWidth={1.5} />
                <p style={{
                  fontSize: 9, fontWeight: 700,
                  letterSpacing: "0.16em", textTransform: "uppercase",
                  color: T.textFaint, fontFamily: "var(--font-display)", margin: 0,
                }}>Cleaning…</p>
              </div>
              <div style={{ padding: "8px 12px 10px", textAlign: "center" }}>
                <p style={{
                  fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 11,
                  letterSpacing: "0.10em", textTransform: "uppercase",
                  color: T.textFaint, margin: 0,
                }}>Cleaned ✨</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Footer ── */}
      <div style={{
        flexShrink: 0, padding: "12px 16px",
        paddingBottom: "max(12px, env(safe-area-inset-bottom))",
        background: T.bg,
        borderTop: `1px solid ${T.goldBorder}`,
        display: "flex", flexDirection: "column", gap: 8,
      }}>
        <button
          onClick={handleSave}
          disabled={saveDisabled}
          style={{
            width: "100%", padding: "13px 16px", borderRadius: 12,
            background: saveDisabled
              ? "rgba(184,137,78,0.15)"
              : "linear-gradient(to bottom, #E8D4B0, #B8894E)",
            border: `1.5px solid ${saveDisabled ? T.goldBorder : T.gold}`,
            display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            fontSize: 12, fontWeight: 800,
            letterSpacing: "0.10em", textTransform: "uppercase" as const,
            color: saveDisabled ? T.textMuted : "#3A2210",
            fontFamily: "var(--font-display)",
            cursor: saveDisabled ? "not-allowed" : "pointer",
            opacity: saveDisabled ? 0.5 : 1,
          }}
        >
          <Check style={{ width: 14, height: 14 }} strokeWidth={3} />
          {saveDisabled ? "Waiting for cleaned version…" : saveLabel}
        </button>
        <button
          onClick={onClose}
          style={{
            width: "100%", padding: "12px 16px", borderRadius: 12,
            background: "transparent",
            border: `1.5px solid rgba(184,137,78,0.15)`,
            fontSize: 11, fontWeight: 700,
            letterSpacing: "0.10em", textTransform: "uppercase" as const,
            color: T.textFaint, fontFamily: "var(--font-display)",
            cursor: "pointer",
          }}
        >
          Cancel
        </button>
      </div>
    </motion.div>
  );
}
