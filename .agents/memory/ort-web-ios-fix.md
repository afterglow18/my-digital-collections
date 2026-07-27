---
name: ONNX Runtime Web iOS main-thread fix
description: Three-part fix for @imgly/background-removal freezing the JS main thread on iOS Safari/WKWebView
---

## The problem
`@imgly/background-removal` runs ONNX inference synchronously on the main JS thread by default. On iOS WKWebView this freezes the entire engine — no button taps, no React updates.

## Why the simple fix fails
ORT has `wasm.proxy = true` to move inference into a Web Worker. But imgly resets it to `false` internally right before creating the inference session (it only enables the proxy when WebGPU is available, which iOS Safari/WKWebView never has).

## The three-part fix (all required)

### 1. `Object.defineProperty` with a no-op setter
Locks `proxy = true` so imgly's internal write is silently swallowed:
```js
Object.defineProperty(ort.env.wasm, "proxy", {
  get: () => true,
  set: () => {},       // blocks imgly's proxy = false write
  configurable: true,
});
```

### 2. `numThreads = 1`
iOS Safari has no `SharedArrayBuffer`, which WASM multithreading requires. Any value > 1 silently crashes.
```js
ort.env.wasm.numThreads = 1;
```

### 3. Dynamic `import()` instead of top-level import
Importing `onnxruntime-web` at module parse time triggers Vite's dep pre-bundling mid-session, causing a full page reload that corrupts React's internal dispatcher. Dynamic import defers loading until first use, after everything is stable.
```js
const ort = await import("onnxruntime-web");
```

**Why:** `onnxruntime-web` must also be in `optimizeDeps.exclude` in `vite.config.ts` (alongside `@imgly/background-removal`) for the dynamic import strategy to work.

## Race condition guard
Store the config Promise (not a boolean flag) so concurrent callers all await the same setup run:
```js
let ortConfigPromise: Promise<void> | null = null;
function configureOrt() {
  if (!ortConfigPromise) ortConfigPromise = (async () => { /* setup */ })();
  return ortConfigPromise;
}
```

## Where implemented
`artifacts/outfit-generator/src/lib/backgroundRemoval.ts` — `configureOrt()` called once before first `removeBackground()` invocation.
