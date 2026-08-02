/**
 * visionNative.ts — TypeScript wrapper for the native iOS VisionPlugin.
 *
 * Uses Capacitor v8's registerPlugin() for type-safe plugin access.
 *
 * The Swift plugin (ios-plugins/VisionPlugin/VisionPlugin.swift) runs:
 *   - VNClassifyImageRequest  → object/scene labels (confidence ≥ 0.3)
 *   - VNRecognizeTextRequest  → text detected inside the photo
 *
 * Falls back silently to empty arrays on any error or non-native environment.
 */

import { Capacitor, registerPlugin } from "@capacitor/core";

export interface VisionNativeResult {
  labels: string[];
  text:   string[];
}

interface VisionPluginInterface {
  analyzeImage(options: { base64: string }): Promise<VisionNativeResult>;
}

// registerPlugin registers the name on the native side; on web it returns a
// stub that throws — we guard every call with Capacitor.isNativePlatform().
const VisionPluginInstance = registerPlugin<VisionPluginInterface>("VisionPlugin");

export async function analyzeImageNative(imageUrl: string): Promise<VisionNativeResult> {
  if (!Capacitor.isNativePlatform()) return { labels: [], text: [] };

  try {
    // If the path is a remote/local URL we need to fetch its bytes and convert
    // to base64 so the Swift plugin receives raw image data.
    let base64: string;

    if (imageUrl.startsWith("data:")) {
      // Already a data URL — strip the prefix
      base64 = imageUrl.includes(",") ? imageUrl.split(",")[1] : imageUrl;
    } else {
      // Fetch the resource and convert to base64
      const response = await fetch(imageUrl);
      if (!response.ok) throw new Error(`fetch ${imageUrl} → ${response.status}`);
      const blob = await response.blob();
      base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload  = () => resolve((reader.result as string).split(",")[1] ?? "");
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    }

    const result = await VisionPluginInstance.analyzeImage({ base64 });
    return {
      labels: Array.isArray(result?.labels) ? result.labels : [],
      text:   Array.isArray(result?.text)   ? result.text   : [],
    };
  } catch (e) {
    console.warn("[VisionNative] analyzeImage failed:", e);
    return { labels: [], text: [] };
  }
}
