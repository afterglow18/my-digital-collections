import "@testing-library/jest-dom";

// ── URL helpers ───────────────────────────────────────────────────────────────
let objectUrlCounter = 0;
global.URL.createObjectURL = vi.fn(() => `blob:mock-url-${objectUrlCounter++}`);
global.URL.revokeObjectURL = vi.fn();

// ── Canvas stub ───────────────────────────────────────────────────────────────
// jsdom has no canvas; replace it so encodeForUpload / blobToJpegDataUrl work.
//
// IMPORTANT: encodeForUpload guards against blank canvas with `blob.size > 1000`.
// The toBlob mock must return a blob ≥ 1001 bytes or the upload pipeline aborts.
const LARGE_FAKE_JPEG = new Uint8Array(1500).fill(0xfe);

HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
  drawImage:  vi.fn(),
  clearRect:  vi.fn(),
})) as unknown as typeof HTMLCanvasElement.prototype.getContext;

HTMLCanvasElement.prototype.toBlob = function (cb: BlobCallback) {
  cb(new Blob([LARGE_FAKE_JPEG], { type: "image/jpeg" }));
};

HTMLCanvasElement.prototype.toDataURL = vi.fn(
  () => "data:image/jpeg;base64,/9j/fakedata",
);

// ── Image stub ────────────────────────────────────────────────────────────────
// Make new Image() fire onload synchronously after src is set.
Object.defineProperty(global, "Image", {
  writable: true,
  value: class MockImage {
    naturalWidth  = 800;
    naturalHeight = 600;
    onload:  (() => void) | null = null;
    onerror: (() => void) | null = null;
    private _src = "";
    set src(v: string) {
      this._src = v;
      // Microtask so the assignment completes before the load event fires,
      // matching real browser behaviour close enough for tests.
      Promise.resolve().then(() => this.onload?.());
    }
    get src() { return this._src; }
  },
});

// ── fetch stub ────────────────────────────────────────────────────────────────
// Default: returns a ≥1001-byte JPEG blob for any URL.
global.fetch = vi.fn(async () => ({
  blob: async () => new Blob([LARGE_FAKE_JPEG], { type: "image/jpeg" }),
  ok: true,
})) as unknown as typeof fetch;

// ── FileReader stub ───────────────────────────────────────────────────────────
global.FileReader = class MockFileReader {
  result: string | ArrayBuffer | null = null;
  onload:  ((event: ProgressEvent<FileReader>) => void) | null = null;
  onerror: ((event: ProgressEvent<FileReader>) => void) | null = null;
  readAsDataURL(_blob: Blob) {
    this.result = "data:image/jpeg;base64,/9j/fakeFileReader";
    Promise.resolve().then(() => this.onload?.({} as ProgressEvent<FileReader>));
  }
} as unknown as typeof FileReader;

// ── Between tests ─────────────────────────────────────────────────────────────
// Only reset call history; keep implementations alive so canvas/fetch stubs work.
afterEach(async () => {
  vi.clearAllMocks();
  objectUrlCounter = 0;
  // Drain any remaining microtasks/timers so async ops from the current test
  // don't bleed into the next one.
  await new Promise((r) => setTimeout(r, 0));
});
