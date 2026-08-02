/**
 * visionNative.ts — TypeScript wrapper for the native iOS VisionPlugin.
 *
 * The Swift plugin (ios-plugins/VisionPlugin/VisionPlugin.swift) runs:
 *   - VNClassifyImageRequest  → object/scene labels (confidence ≥ 0.3)
 *   - VNRecognizeTextRequest  → text detected inside the photo
 *
 * Falls back silently to empty arrays on any error or non-native environment.
 */

import { Capacitor } from "@capacitor/core";

export interface VisionNativeResult {
  labels: string[];
  text:   string[];
}

type VisionPluginBridge = {
  analyzeImage(args: { base64: string }): Promise<VisionNativeResult>;
};

export async function analyzeImageNative(dataUrl: string): Promise<VisionNativeResult> {
  if (!Capacitor.isNativePlatform()) return { labels: [], text: [] };

  try {
    const plugin = (Capacitor.Plugins as Record<string, unknown>)
      .VisionPlugin as VisionPluginBridge | undefined;

    if (!plugin?.analyzeImage) {
      console.warn("[VisionNative] VisionPlugin not registered");
      return { labels: [], text: [] };
    }

    // Strip the data URL prefix to get raw base64
    const base64 = dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl;
    const result = await plugin.analyzeImage({ base64 });
    return {
      labels: Array.isArray(result?.labels) ? result.labels : [],
      text:   Array.isArray(result?.text)   ? result.text   : [],
    };
  } catch (e) {
    console.warn("[VisionNative] analyzeImage failed:", e);
    return { labels: [], text: [] };
  }
}
