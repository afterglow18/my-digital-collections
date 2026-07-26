/**
 * QuickAddSheet
 *
 * Upload flow (single photo — camera or single gallery pick):
 *   pick ──► encoding ──► preview (Original | Cleaned ✨) ──► uploading ──► close
 *
 * Upload flow (multi-photo gallery pick):
 *   pick ──► uploading ──► close  (bg removal skipped for batch)
 */
import React, { useRef, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { X, Loader2, Check, RotateCcw } from "lucide-react";
import { Capacitor } from "@capacitor/core";
import {
  useCreateClothingItem,
  getListClothingQueryKey,
  getWardrobeStatsQueryKey,
} from "@/hooks/useLocalDB";
import { useQueryClient } from "@tanstack/react-query";
import {
  removeBackground,
  blobToDataUrl  as readBlobAsDataUrl,
  dataUrlToBlob,
} from "@/lib/backgroundRemoval";

// ── Types ──────────────────────────────────────────────────────────────────────

type Category = "outfits" | "beauty" | "toiletries" | "essentials";

const CATEGORY_LABELS: Record<Category, string> = {
  outfits:    "Outfits",
  beauty:     "Beauty",
  toiletries: "Toiletries",
  essentials: "Essentials",
};

type Phase = "pick" | "encoding" | "preview" | "uploading";

interface UploadProgress {
  current: number;
  total:   number;
}

// ── Helpers (outside component) ───────────────────────────────────────────────

/**
 * Resize + compress any File/Blob to a JPEG Blob ≤ 2048px.
 * Used before background removal so the ONNX model gets a reasonable input.
 */
async function encodeForUpload(input: File | Blob): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(input);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const MAX   = 2048;
      const scale = Math.min(1, MAX / Math.max(img.naturalWidth, img.naturalHeight));
      const w     = Math.round(img.naturalWidth  * scale);
      const h     = Math.round(img.naturalHeight * scale);
      const canvas = document.createElement("canvas");
      canvas.width  = w;
      canvas.height = h;
      canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
      canvas.toBlob(
        (b) => (b && b.size > 1000 ? resolve(b) : reject(new Error("blank image"))),
        "image/jpeg",
        0.85,
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("failed to load image"));
    };
    img.src = objectUrl;
  });
}

/**
 * Compress a blob to a JPEG data URL at 800px max — for DB storage of originals.
 */
async function blobToJpegDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement("canvas");
      const scale  = Math.min(1, 800 / img.naturalWidth);
      canvas.width  = Math.round(img.naturalWidth  * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", 0.82));
    };
    img.onerror = reject;
    img.src = url;
  });
}

// ── Constants ─────────────────────────────────────────────────────────────────

const PHOTO_TIPS = [
  "Photograph individual products or bundle multiple items together.",
  "Lay everything flat on a plain background.",
  "Take the photo from directly above.",
  "Keep all items fully in frame.",
] as const;

const CATEGORY_EXAMPLES: Record<string, { emoji: string; items: string[] }> = {
  outfits:    { emoji: "👗", items: ["Tops", "Bottoms", "Shoes", "Swim", "Undergarments", "Dresses", "Accessories"] },
  beauty:     { emoji: "💄", items: ["Makeup", "Skincare", "Hair", "Jewelry", "Nail Polish"] },
  toiletries: { emoji: "🪥", items: ["Shower", "Dental", "Medicine", "Feminine Care", "First Aid"] },
  essentials: { emoji: "🧳", items: ["Travel Docs", "Tech", "Snacks", "Books", "Accessories"] },
};

// ── Component ──────────────────────────────────────────────────────────────────

interface Props {
  open:          boolean;
  onOpenChange:  (open: boolean) => void;
  category:      Category;
  existingCount: number;
  onCreated?:    (item: import("@/lib/db").ClothingItem) => void;
}

export function QuickAddSheet({ open, onOpenChange, category, existingCount, onCreated }: Props) {
  const [phase,        setPhase]        = useState<Phase>("pick");
  const [errorMsg,     setErrorMsg]     = useState<string | null>(null);
  const [progress,     setProgress]     = useState<UploadProgress | null>(null);

  // ── Background-removal state ─────────────────────────────────────────────
  const [originalBlob, setOriginalBlob] = useState<Blob | null>(null);
  const [originalUrl,  setOriginalUrl]  = useState<string | null>(null);
  const [cleanedBlob,  setCleanedBlob]  = useState<Blob | null>(null);
  const [cleanedUrl,   setCleanedUrl]   = useState<string | null>(null);
  const [bgProcessing, setBgProcessing] = useState(false);
  const [bgFailed,     setBgFailed]     = useState(false);
  const [selected,     setSelected]     = useState<"original" | "cleaned">("original");
  // Each photo bumps this counter; every async step checks it before writing
  // state to prevent a slow first photo clobbering a fast second one.
  const bgGenRef = useRef(0);

  const cameraInputRef  = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const createItem  = useCreateClothingItem();
  const queryClient = useQueryClient();

  // ── handleClose ───────────────────────────────────────────────────────────
  const handleClose = useCallback(() => {
    bgGenRef.current += 1;   // cancels any in-flight removal
    setBgProcessing(false);  // MUST reset — close can happen mid-removal
    setPhase("pick");
    setErrorMsg(null);
    setProgress(null);
    setOriginalBlob(null);
    setOriginalUrl(null);
    setCleanedBlob(null);
    setCleanedUrl(null);
    setBgFailed(false);
    setSelected("original");
    onOpenChange(false);
  }, [onOpenChange]);

  // ── saveOneFile ───────────────────────────────────────────────────────────
  // Accepts a blob (JPEG or PNG), stores it appropriately, creates a DB record.
  const saveOneFile = useCallback(async (file: File | Blob, itemIndex: number): Promise<boolean> => {
    try {
      let path: string;
      if (file.type === "image/png") {
        // Preserve PNG transparency (background-removed image)
        path = await readBlobAsDataUrl(file);
      } else {
        // JPEG: resize to 800px and compress for storage
        path = await blobToJpegDataUrl(file);
      }
      const label    = CATEGORY_LABELS[category];
      const n        = itemIndex + 1;
      const autoName = n === 1 ? label : `${label} ${n}`;
      await new Promise<void>((resolve, reject) => {
        createItem.mutate(
          { data: { name: autoName, category, imageObjectPath: path } },
          {
            onSuccess: (createdItem) => {
              queryClient.invalidateQueries({ queryKey: getListClothingQueryKey() });
              queryClient.invalidateQueries({ queryKey: getWardrobeStatsQueryKey() });
              if (onCreated) onCreated(createdItem);
              resolve();
            },
            onError: reject,
          },
        );
      });
      return true;
    } catch (err) {
      console.error("Upload / create failed:", err);
      return false;
    }
  }, [category, createItem, queryClient, onCreated]);

  // ── handleFile — single-photo bg-removal pipeline ────────────────────────
  const handleFile = useCallback(async (file: File | Blob) => {
    setErrorMsg(null);
    const myGen = ++bgGenRef.current;
    setOriginalBlob(null);
    setOriginalUrl(null);
    setCleanedBlob(null);
    setCleanedUrl(null);
    setBgFailed(false);
    setBgProcessing(false);
    setSelected("original");
    // Show spinner immediately — encoding can take 1–3 s on mobile
    setPhase("encoding");

    let jpeg: Blob;
    try {
      jpeg = await encodeForUpload(file);
    } catch (err) {
      if (bgGenRef.current !== myGen) return;
      setErrorMsg(`Could not read photo: ${err instanceof Error ? err.message : String(err)}`);
      setPhase("pick");
      return;
    }
    if (bgGenRef.current !== myGen) return;

    // Show original → switch to comparison screen
    setOriginalBlob(jpeg);
    setOriginalUrl(URL.createObjectURL(jpeg));
    setPhase("preview");

    // Background removal runs in parallel — generation guard discards stale results
    setBgProcessing(true);
    try {
      const dataUrl   = await readBlobAsDataUrl(jpeg);
      if (bgGenRef.current !== myGen) return;
      const resultUrl = await removeBackground(dataUrl);
      if (bgGenRef.current !== myGen) return;
      const resultBlob   = await dataUrlToBlob(resultUrl);
      const resultObjUrl = URL.createObjectURL(resultBlob);
      if (bgGenRef.current !== myGen) { URL.revokeObjectURL(resultObjUrl); return; }
      setCleanedBlob(resultBlob);
      setCleanedUrl(resultObjUrl);
      setSelected("cleaned");
    } catch (err) {
      if (bgGenRef.current !== myGen) return;
      console.warn("Background removal failed:", err);
      setBgFailed(true);
    } finally {
      if (bgGenRef.current === myGen) setBgProcessing(false);
    }
  }, []);

  // ── handleSave — from preview screen ─────────────────────────────────────
  const handleSave = useCallback(async () => {
    const blob = selected === "cleaned" && cleanedBlob ? cleanedBlob : originalBlob;
    if (!blob) return;
    setPhase("uploading");
    const ok = await saveOneFile(blob, existingCount);
    if (ok) {
      handleClose();
    } else {
      setErrorMsg("Save failed. Please try again.");
      setPhase("preview");
    }
  }, [selected, cleanedBlob, originalBlob, saveOneFile, existingCount, handleClose]);

  // ── handleTakePhoto — native camera ──────────────────────────────────────
  const handleTakePhoto = useCallback(async () => {
    if (!Capacitor.isNativePlatform()) {
      cameraInputRef.current?.click();
      return;
    }
    try {
      const { Camera, CameraResultType, CameraSource } = await import("@capacitor/camera");
      const photo = await Camera.getPhoto({
        quality: 85,
        allowEditing: false,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Camera,
        width: 2048,
      });
      if (!photo.dataUrl) return;
      const res  = await fetch(photo.dataUrl);
      const blob = await res.blob();
      await handleFile(blob);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
      if (msg.includes("cancel") || msg.includes("denied") || msg.includes("user denied")) return;
      console.error("Camera error:", err);
      setErrorMsg("Could not open camera. Please try again.");
    }
  }, [handleFile]);

  // ── handlePickFromGallery — native gallery (Capacitor.pickImages) ─────────
  const handlePickFromGallery = useCallback(async () => {
    if (!Capacitor.isNativePlatform()) {
      galleryInputRef.current?.click();
      return;
    }
    try {
      const { Camera } = await import("@capacitor/camera");
      const result = await Camera.pickImages({
        quality: 85,
        width: 2048,
        presentationStyle: "popover",
      });
      const photos = result.photos;
      if (!photos || photos.length === 0) return;

      if (photos.length === 1) {
        // Single pick → go through bg-removal preview
        const res  = await fetch(photos[0].webPath);
        const blob = await res.blob();
        await handleFile(blob);
        return;
      }

      // Multi-pick → direct upload, no preview
      setErrorMsg(null);
      setPhase("uploading");
      setProgress({ current: 0, total: photos.length });
      let failed = 0;
      for (let i = 0; i < photos.length; i++) {
        setProgress({ current: i + 1, total: photos.length });
        try {
          const res  = await fetch(photos[i].webPath);
          const blob = await res.blob();
          const ok   = await saveOneFile(blob, existingCount + i);
          if (!ok) failed++;
        } catch {
          failed++;
        }
      }
      setProgress(null);
      if (failed > 0) {
        setErrorMsg(`${failed} photo${failed > 1 ? "s" : ""} could not be saved. Please try again.`);
        setPhase("pick");
      } else {
        handleClose();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
      if (msg.includes("cancel") || msg.includes("denied") || msg.includes("user denied")) return;
      console.error("Gallery picker error:", err);
      setErrorMsg("Could not open photo library. Please try again.");
      setPhase("pick");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingCount, handleClose, handleFile, saveOneFile]);

  // ── Browser file input fallback ───────────────────────────────────────────
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!files.length) return;
    if (files.length === 1) {
      handleFile(files[0]);
    } else {
      // Multi-file: direct upload, no preview
      (async () => {
        setErrorMsg(null);
        setPhase("uploading");
        setProgress({ current: 0, total: files.length });
        let failed = 0;
        for (let i = 0; i < files.length; i++) {
          setProgress({ current: i + 1, total: files.length });
          const ok = await saveOneFile(files[i], existingCount + i);
          if (!ok) failed++;
        }
        setProgress(null);
        if (failed > 0) {
          setErrorMsg(`${failed} photo${failed > 1 ? "s" : ""} could not be saved.`);
          setPhase("pick");
        } else {
          handleClose();
        }
      })();
    }
  }, [handleFile, saveOneFile, existingCount, handleClose]);

  if (!open) return null;

  const label = CATEGORY_LABELS[category];

  return (
    <motion.div
      initial={{ opacity: 0, y: "100%" }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: "100%" }}
      transition={{ type: "spring", damping: 28, stiffness: 240 }}
      className="fixed inset-0 z-[70] flex flex-col max-w-md mx-auto bg-[#f9f4ee]"
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 bg-white border-b-2 border-black flex-shrink-0"
        style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))", paddingBottom: "0.75rem" }}
      >
        <h2 className="font-display font-bold text-xl uppercase tracking-tight">
          {phase === "preview" ? "Choose Version" : `Add ${label}`}
        </h2>
        {(phase === "pick" || phase === "preview") && (
          <button
            onClick={phase === "preview" ? () => setPhase("pick") : handleClose}
            className="w-9 h-9 border-2 border-black rounded-full flex items-center justify-center
                       bg-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]
                       active:translate-y-0.5 active:translate-x-0.5 active:shadow-none transition-all"
          >
            {phase === "preview" ? <RotateCcw className="w-4 h-4" /> : <X className="w-4 h-4" />}
          </button>
        )}
      </div>

      {/* Body — plain conditional divs, NO AnimatePresence (causes blank flashes) */}
      <div className="flex-1 flex flex-col overflow-y-auto">

        {/* ── PICK ── */}
        {phase === "pick" && (
          <div className="flex flex-col p-5 gap-5">
            {errorMsg && (
              <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-center">
                {errorMsg}
              </p>
            )}

            <div className="flex gap-3">
              <button
                onClick={handleTakePhoto}
                className="flex-1 flex flex-col items-center justify-center gap-3 py-8
                           border-4 border-black rounded-2xl bg-primary
                           shadow-[5px_5px_0px_0px_rgba(0,0,0,1)]
                           active:translate-x-1 active:translate-y-1 active:shadow-none transition-all"
              >
                <span className="text-4xl leading-none">📷</span>
                <span className="font-display font-bold text-base uppercase tracking-tight text-center leading-tight">
                  Take<br />Photo
                </span>
              </button>

              <button
                onClick={handlePickFromGallery}
                className="flex-1 flex flex-col items-center justify-center gap-3 py-8
                           border-4 border-black rounded-2xl bg-white
                           shadow-[5px_5px_0px_0px_rgba(0,0,0,1)]
                           active:translate-x-1 active:translate-y-1 active:shadow-none transition-all"
              >
                <span className="text-4xl leading-none">🖼️</span>
                <span className="font-display font-bold text-base uppercase tracking-tight text-center leading-tight">
                  Upload<br />Photo
                </span>
              </button>
            </div>

            {CATEGORY_EXAMPLES[category] && (
              <div className="border-2 border-black rounded-2xl bg-white p-4 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]">
                <p className="font-display font-bold text-sm uppercase tracking-tight mb-2 flex items-center gap-2">
                  <span>{CATEGORY_EXAMPLES[category].emoji}</span> WHAT TO ADD
                </p>
                <p className="text-sm text-black/70 leading-snug">
                  {CATEGORY_EXAMPLES[category].items.join(", ")}
                </p>
              </div>
            )}

            <div className="border-2 border-black rounded-2xl bg-white p-4 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]">
              <p className="font-display font-bold text-sm uppercase tracking-tight mb-3 flex items-center gap-2">
                <span>📸</span> PHOTO TIPS
              </p>
              <ul className="flex flex-col gap-2">
                {PHOTO_TIPS.map((tip) => (
                  <li key={tip} className="flex items-start gap-2 text-sm text-black/70 leading-snug">
                    <span className="mt-0.5 w-4 h-4 border-2 border-black rounded-sm bg-primary flex items-center justify-center flex-shrink-0">
                      <Check className="w-2.5 h-2.5" strokeWidth={3} />
                    </span>
                    {tip}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* ── ENCODING — full-screen spinner, shown immediately after pick ── */}
        {phase === "encoding" && (
          <div className="flex-1 flex flex-col items-center justify-center gap-5 p-6">
            <div className="w-28 h-28 border-4 border-black rounded-3xl bg-white flex items-center justify-center shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
              <Loader2 className="w-12 h-12 animate-spin" strokeWidth={1.5} />
            </div>
            <div className="text-center">
              <p className="font-display font-bold text-2xl uppercase tracking-tight">Processing…</p>
              <p className="text-sm text-muted-foreground mt-1">Getting your photo ready.</p>
            </div>
          </div>
        )}

        {/* ── PREVIEW — side-by-side Original | Cleaned ✨ ── */}
        {phase === "preview" && (
          <div className="flex flex-col gap-4 p-5">
            {errorMsg && (
              <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-center">
                {errorMsg}
              </p>
            )}

            <p className="text-center font-display font-bold text-xs uppercase tracking-widest opacity-50">
              {bgProcessing ? "Removing background… this may take a moment" : bgFailed ? "Background removal unavailable" : "Tap to choose your version"}
            </p>

            <div className="flex gap-3">
              {/* Original card */}
              <button
                onClick={() => setSelected("original")}
                className="flex-1 rounded-2xl overflow-hidden transition-all"
                style={{
                  border: selected === "original" ? "4px solid #000" : "4px solid rgba(0,0,0,0.15)",
                  background: "none",
                  padding: 0,
                }}
              >
                <div className="relative" style={{ minHeight: 176, background: "#B8894E" }}>
                  {originalUrl && (
                    <img src={originalUrl} alt="Original"
                      className="w-full object-contain block" style={{ maxHeight: 176 }} />
                  )}
                  {selected === "original" && (
                    <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black border-2 border-white flex items-center justify-center">
                      <Check size={12} color="white" strokeWidth={3} />
                    </div>
                  )}
                </div>
                <p className="text-center font-display font-bold text-xs uppercase tracking-wider py-2 m-0 bg-white">
                  Original
                </p>
              </button>

              {/* Cleaned card */}
              <button
                onClick={() => cleanedUrl && setSelected("cleaned")}
                disabled={!cleanedUrl}
                className="flex-1 rounded-2xl overflow-hidden transition-all"
                style={{
                  border: selected === "cleaned" && cleanedUrl ? "4px solid #000" : "4px solid rgba(0,0,0,0.15)",
                  background: "none",
                  padding: 0,
                }}
              >
                {/* Checkerboard reveals transparency */}
                <div
                  className="relative flex items-center justify-center"
                  style={{
                    minHeight: 176,
                    background: "repeating-conic-gradient(#d1d5db 0% 25%, white 0% 50%) 0 0 / 12px 12px",
                  }}
                >
                  {cleanedUrl ? (
                    <>
                      <img src={cleanedUrl} alt="Cleaned"
                        className="w-full object-contain block" style={{ maxHeight: 176 }} />
                      {selected === "cleaned" && (
                        <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black border-2 border-white flex items-center justify-center">
                          <Check size={12} color="white" strokeWidth={3} />
                        </div>
                      )}
                    </>
                  ) : bgFailed ? (
                    <p className="text-xs font-bold uppercase opacity-40 text-center px-3 py-4">
                      Could not remove background
                    </p>
                  ) : (
                    <div className="flex flex-col items-center gap-2 py-4">
                      <Loader2 size={32} className="animate-spin opacity-50" />
                      <p className="text-xs font-bold uppercase opacity-50">Processing</p>
                    </div>
                  )}
                </div>
                <p className="text-center font-display font-bold text-xs uppercase tracking-wider py-2 m-0 bg-white">
                  Cleaned ✨
                </p>
              </button>
            </div>

            {/* Action row */}
            <div className="flex gap-3 mt-1">
              <button
                onClick={() => setPhase("pick")}
                className="flex items-center justify-center gap-2 px-5 py-3
                           border-3 border-black rounded-xl bg-white font-display font-bold text-sm uppercase
                           shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]
                           active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all"
                style={{ borderWidth: 3 }}
              >
                <RotateCcw className="w-4 h-4" />
                Retake
              </button>
              <button
                onClick={handleSave}
                disabled={bgProcessing}
                className="flex-1 flex items-center justify-center gap-2 py-3
                           border-4 border-black rounded-xl bg-primary font-display font-bold text-sm uppercase
                           shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]
                           active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all
                           disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {bgProcessing ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Processing…</>
                ) : (
                  <><Check className="w-4 h-4" /> Save to Collection</>
                )}
              </button>
            </div>
          </div>
        )}

        {/* ── UPLOADING ── */}
        {phase === "uploading" && (
          <div className="flex-1 flex flex-col items-center justify-center gap-5 p-6">
            <div className="w-28 h-28 border-4 border-black rounded-3xl bg-white flex items-center justify-center shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
              <Loader2 className="w-12 h-12 animate-spin" strokeWidth={1.5} />
            </div>
            <div className="text-center">
              <p className="font-display font-bold text-2xl uppercase tracking-tight">Saving…</p>
              <p className="text-sm text-muted-foreground mt-1">
                {progress && progress.total > 1
                  ? `Photo ${progress.current} of ${progress.total}`
                  : "Adding to your collection."}
              </p>
            </div>
          </div>
        )}

      </div>

      {/* Hidden file inputs — browser fallback only; native uses @capacitor/camera */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleInputChange}
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleInputChange}
      />
    </motion.div>
  );
}
