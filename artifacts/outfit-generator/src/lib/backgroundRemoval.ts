import { removeBackground as imglyRemoveBackground } from "@imgly/background-removal";

/**
 * One-time ONNX Runtime Web configuration, applied before the first inference.
 *
 * Three-part fix to unblock the main thread on iOS WKWebView:
 *
 * 1. Dynamic import("onnxruntime-web") — importing at module parse time triggers
 *    Vite's dep pre-bundling mid-session, causing a full page reload that corrupts
 *    React's internal dispatcher. Dynamic import defers loading until first use.
 *
 * 2. Object.defineProperty with a no-op setter — locks wasm.proxy = true.
 *    @imgly/background-removal resets proxy to false internally just before it
 *    creates the ONNX inference session (it only enables the proxy when WebGPU is
 *    available, which it isn't on iOS Safari/WKWebView). The no-op setter silently
 *    swallows that write so the value stays true and ONNX runs in a Web Worker,
 *    freeing the main thread.
 *
 * 3. numThreads = 1 — iOS Safari has no SharedArrayBuffer, which WASM
 *    multithreading requires. Any value > 1 causes a silent crash.
 */
let ortReady = false;

async function configureOrt(): Promise<void> {
  if (ortReady) return;
  ortReady = true;
  // @ts-ignore — onnxruntime-web's package.json exports block TS from resolving types via dynamic import
  const ort = await import("onnxruntime-web");
  Object.defineProperty(ort.env.wasm, "proxy", {
    get: () => true,
    set: () => {},       // block imgly's internal proxy = false write
    configurable: true,
  });
  ort.env.wasm.numThreads = 1;
}

/**
 * Remove the background from a JPEG/PNG data-URL.
 * Returns a PNG data-URL with transparent background.
 * First call downloads ~15 MB ONNX model from imgly CDN (cached after that).
 * Throws on network error or unreadable image — callers should catch and fall back.
 */
export async function removeBackground(dataUrl: string): Promise<string> {
  await configureOrt();
  const sourceBlob = await dataUrlToBlob(dataUrl);
  const resultBlob = await imglyRemoveBackground(sourceBlob, {
    model: "isnet_fp16", // valid: "isnet" | "isnet_fp16" | "isnet_quint8" — NOT "small"/"medium"
    output: { format: "image/png", quality: 0.9 },
  });
  return blobToDataUrl(resultBlob);
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("FileReader failed"));
    reader.readAsDataURL(blob);
  });
}

export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl);
  return res.blob();
}
