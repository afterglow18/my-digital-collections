/**
 * visionIndexer.ts — background photo-analysis pipeline.
 *
 * Processes clothing items that have not yet been analysed for visual labels:
 *   - Web:    canvas colour extraction (visionVersion 4; 5 = analysed, empty)
 *   - Native: iOS Vision framework labels + OCR text (visionVersion 1)
 *
 * visionVersion scheme:
 *   0 = unanalysed (default)
 *   1 = native iOS Vision only (labels, no colours) — legacy, will be re-indexed
 *   2 = native iOS Vision + canvas colours merged
 *   4 = web canvas analysed (has colours)
 *   5 = web canvas analysed (no foreground colours found — don't retry)
 *
 * Call startVisionIndexer() once at app boot (main.tsx).
 * Call queueItemForIndexing(id) after creating or updating a clothing item.
 */

import { Capacitor } from "@capacitor/core";
import { toast } from "sonner";
import { listClothing, updateClothingItem } from "@/lib/localDB";
import { extractColorsFromDataUrl } from "@/lib/visionWeb";
import { analyzeImageNative } from "@/lib/visionNative";

const DELAY_MS = 350;

let indexerRunning = false;
const pendingIds   = new Set<number>();

/** Queue a specific item for immediate re-analysis. */
export function queueItemForIndexing(id: number): void {
  pendingIds.add(id);
  if (!indexerRunning) {
    runIndexer().catch((e) => console.warn("[VisionIndexer]", e));
  }
}

/** Start the background indexer (fire-and-forget). */
export function startVisionIndexer(): void {
  if (indexerRunning) return;
  runIndexer().catch((e) => console.warn("[VisionIndexer]", e));
}

async function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function runIndexer(): Promise<void> {
  if (indexerRunning) return;
  indexerRunning = true;

  try {
    const isNative = Capacitor.isNativePlatform();
    const allItems = await listClothing();

    // Build work list: unanalysed + any explicitly queued items
    const workSet = new Set<number>(pendingIds);
    pendingIds.clear();

    for (const item of allItems) {
      const v = item.visionVersion ?? 0;
      if (isNative ? v < 2 : (v < 4 && v !== 5)) {
        workSet.add(item.id);
      }
    }

    if (workSet.size === 0) return;

    const toProcess = allItems.filter((i) => workSet.has(i.id));
    const toastId   = toast.loading("Preparing photo search…");

    for (const item of toProcess) {
      try {
        if (!item.imageObjectPath) {
          await updateClothingItem(item.id, {
            visionLabels:  [],
            visionText:    [],
            visionVersion: isNative ? 1 : 5,
          });
        } else if (isNative) {
          // Run native Vision (object/scene labels) and canvas colour extraction in parallel,
          // then merge so search works on both label types.
          const [nativeResult, webColors] = await Promise.all([
            analyzeImageNative(item.imageObjectPath),
            extractColorsFromDataUrl(item.imageObjectPath),
          ]);
          const mergedLabels = [...new Set([...nativeResult.labels, ...webColors])];
          await updateClothingItem(item.id, {
            visionLabels:  mergedLabels,
            visionText:    nativeResult.text,
            visionVersion: 2,
          });
        } else {
          const colors = await extractColorsFromDataUrl(item.imageObjectPath);
          await updateClothingItem(item.id, {
            visionLabels:  colors,
            visionText:    [],
            visionVersion: colors.length > 0 ? 4 : 5,
          });
        }
      } catch (e) {
        console.warn("[VisionIndexer] item", item.id, "failed:", e);
      }

      await delay(DELAY_MS);
    }

    toast.dismiss(toastId);
  } finally {
    indexerRunning = false;

    // If more items were queued while we were running, go again
    if (pendingIds.size > 0) {
      runIndexer().catch((e) => console.warn("[VisionIndexer]", e));
    }
  }
}
