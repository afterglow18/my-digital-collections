/**
 * QuickAddSheet — photo upload tests
 *
 * Covers:
 *  1. Web fallback: single file → bg-removal preview → DB record created
 *  2. Web fallback: multi-file → direct batch upload → progress state
 *  3. Native path:  Camera.pickImages() single → bg-removal preview
 *  4. Native path:  Camera.pickImages() multi  → batch upload + progress
 *  5. Edge case:    zero photos returned
 *  6. Edge case:    one photo fails mid-batch
 *  7. Edge case:    user cancellation (native)
 *  8. Edge case:    user denial (native)
 *  9. Edge case:    unexpected gallery error (native)
 */

import React from "react";
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";

// ── Module mocks — must come before any component import ──────────────────────

// Background-removal lib — controlled per-test, fast/synchronous
vi.mock("@/lib/backgroundRemoval", () => ({
  removeBackground: vi.fn(async () => "data:image/png;base64,fakeRemovedBg"),
  blobToDataUrl:    vi.fn(async () => "data:image/jpeg;base64,fakeBlobDataUrl"),
  dataUrlToBlob:    vi.fn(async () => new Blob(["removed-bg-data"], { type: "image/png" })),
}));

// Capacitor core — default web (non-native); flipped per describe block
vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: vi.fn(() => false) },
}));

// @capacitor/camera — mock the module so dynamic import resolves correctly
const mockPickImages = vi.fn();
const mockGetPhoto   = vi.fn();
vi.mock("@capacitor/camera", () => ({
  Camera:           { pickImages: mockPickImages, getPhoto: mockGetPhoto },
  CameraResultType: { DataUrl: "dataUrl" },
  CameraSource:     { Camera: "CAMERA" },
}));

// React Query — capture invalidation calls
const mockInvalidateQueries = vi.fn();
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries }),
}));

// useLocalDB — capture mutate calls, simulate success/failure per test
const mockMutate = vi.fn();
vi.mock("@/hooks/useLocalDB", () => ({
  useCreateClothingItem:    () => ({ mutate: mockMutate }),
  getListClothingQueryKey:  () => ["clothing"],
  getWardrobeStatsQueryKey: () => ["wardrobe-stats"],
}));

// ── Import component after all mocks are declared ─────────────────────────────
import { QuickAddSheet } from "./QuickAddSheet";
import { Capacitor } from "@capacitor/core";

// ── Shared helpers ────────────────────────────────────────────────────────────

/** Make every DB write succeed and call onCreated. */
function mutateSucceeds() {
  mockMutate.mockImplementation(
    (_args: unknown, cbs: { onSuccess: (item: unknown) => void; onError: (e: unknown) => void }) => {
      cbs.onSuccess({
        id: 1, name: "Outfits", category: "outfits",
        imageObjectPath: "data:image/jpeg;base64,x",
        isFavorite: false, timesWorn: 0, createdAt: "", updatedAt: "",
      });
    },
  );
}

/** Make every DB write fail. */
function mutateFails() {
  mockMutate.mockImplementation(
    (_args: unknown, cbs: { onSuccess: (item: unknown) => void; onError: (e: unknown) => void }) => {
      cbs.onError(new Error("DB write failed"));
    },
  );
}

/** Make the Nth call (1-based) succeed, all others fail. */
function mutateOnlyFirstSucceeds() {
  let count = 0;
  mockMutate.mockImplementation(
    (_args: unknown, cbs: { onSuccess: (item: unknown) => void; onError: (e: unknown) => void }) => {
      count++;
      if (count === 1) {
        cbs.onSuccess({ id: 1, name: "Outfits", category: "outfits", imageObjectPath: "", isFavorite: false, timesWorn: 0, createdAt: "", updatedAt: "" });
      } else {
        cbs.onError(new Error("fail"));
      }
    },
  );
}

function makeFile(name = "photo.jpg", type = "image/jpeg"): File {
  // 1500-byte body so encodeForUpload's b.size > 1000 guard passes.
  return new File([new Uint8Array(1500).fill(0xff)], name, { type });
}

/** Trigger the hidden multi-select gallery file input. */
function triggerGalleryInput(container: HTMLElement, files: File[]) {
  const input = container.querySelector<HTMLInputElement>('input[type="file"][multiple]')!;
  Object.defineProperty(input, "files", { value: files, configurable: true });
  fireEvent.change(input);
}

/** Find the "Upload Photo" gallery button regardless of <br> in its text. */
function getUploadPhotoButton(): HTMLElement {
  const buttons = screen.getAllByRole("button");
  const btn = buttons.find((b) => /upload/i.test(b.textContent ?? ""));
  if (!btn) throw new Error("Could not find Upload Photo button");
  return btn;
}

const defaultProps = {
  open:          true,
  onOpenChange:  vi.fn(),
  category:      "outfits" as const,
  existingCount: 0,
  onCreated:     vi.fn(),
};

// ── Web fallback tests ────────────────────────────────────────────────────────

describe("QuickAddSheet — web fallback (non-native platform)", () => {
  beforeEach(() => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);
    mutateSucceeds();
  });

  it("renders pick phase on open", () => {
    render(<QuickAddSheet {...defaultProps} />);
    expect(screen.getByText(/Add Outfits/i)).toBeInTheDocument();
  });

  it("single file → encoding phase appears immediately", async () => {
    const { container } = render(<QuickAddSheet {...defaultProps} />);
    triggerGalleryInput(container, [makeFile()]);
    await waitFor(() =>
      expect(screen.getByText(/Processing…/i)).toBeInTheDocument(),
    );
  });

  it("single file → reaches preview phase after encoding", async () => {
    const { container } = render(<QuickAddSheet {...defaultProps} />);
    triggerGalleryInput(container, [makeFile()]);
    await waitFor(() =>
      expect(screen.getByText(/Choose Version/i)).toBeInTheDocument(),
      { timeout: 4000 },
    );
  });

  it("single file → save → DB record created with JPEG data URL", async () => {
    const { container } = render(<QuickAddSheet {...defaultProps} />);
    triggerGalleryInput(container, [makeFile()]);

    await waitFor(() =>
      expect(screen.getByText(/Choose Version/i)).toBeInTheDocument(),
      { timeout: 4000 },
    );

    const saveBtn = screen.getByRole("button", { name: /save to collection/i });
    await act(async () => { fireEvent.click(saveBtn); });

    await waitFor(() => {
      expect(mockMutate).toHaveBeenCalledTimes(1);
      const { data } = (mockMutate.mock.calls[0][0] as { data: { category: string; imageObjectPath: string } });
      expect(data.category).toBe("outfits");
      expect(data.imageObjectPath).toMatch(/^data:image\/(jpeg|png)/);
    });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["clothing"] });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["wardrobe-stats"] });
    // Sheet closes after a successful save
    expect(defaultProps.onOpenChange).toHaveBeenCalledWith(false);
  });

  it("multiple files → skips preview, goes to uploading phase", async () => {
    const { container } = render(<QuickAddSheet {...defaultProps} />);
    triggerGalleryInput(container, [makeFile("a.jpg"), makeFile("b.jpg")]);
    await waitFor(() =>
      expect(screen.getByText(/Saving…/i)).toBeInTheDocument(),
    );
  });

  it("multiple files → all items saved, sheet closes", async () => {
    const { container } = render(<QuickAddSheet {...defaultProps} />);
    triggerGalleryInput(container, [makeFile("a.jpg"), makeFile("b.jpg"), makeFile("c.jpg")]);

    await waitFor(() => {
      expect(mockMutate).toHaveBeenCalledTimes(3);
    }, { timeout: 4000 });

    await waitFor(() =>
      expect(defaultProps.onOpenChange).toHaveBeenCalledWith(false),
    );
  });

  it("multiple files → progress text shows current/total", async () => {
    const { container } = render(<QuickAddSheet {...defaultProps} />);
    triggerGalleryInput(container, [makeFile("a.jpg"), makeFile("b.jpg")]);

    await waitFor(() =>
      expect(screen.getByText(/Photo \d+ of 2/i)).toBeInTheDocument(),
      { timeout: 4000 },
    );
  });

  it("zero files selected → stays on pick, no DB call", async () => {
    const { container } = render(<QuickAddSheet {...defaultProps} />);
    triggerGalleryInput(container, []);
    await new Promise((r) => setTimeout(r, 150));
    expect(screen.getByText(/Add Outfits/i)).toBeInTheDocument();
    expect(mockMutate).not.toHaveBeenCalled();
  });

  it("one file fails mid-batch → error message, returns to pick", async () => {
    mutateOnlyFirstSucceeds();
    const { container } = render(<QuickAddSheet {...defaultProps} />);
    triggerGalleryInput(container, [makeFile("ok.jpg"), makeFile("fail.jpg")]);

    await waitFor(() =>
      expect(screen.getByText(/1 photo could not be saved/i)).toBeInTheDocument(),
      { timeout: 4000 },
    );
    expect(screen.getByText(/Add Outfits/i)).toBeInTheDocument();
  });

  it("save failure on single photo → error shown, stays on preview", async () => {
    mutateFails();
    const { container } = render(<QuickAddSheet {...defaultProps} />);
    triggerGalleryInput(container, [makeFile()]);

    await waitFor(() =>
      expect(screen.getByText(/Choose Version/i)).toBeInTheDocument(),
      { timeout: 4000 },
    );

    const saveBtn = screen.getByRole("button", { name: /save to collection/i });
    await act(async () => { fireEvent.click(saveBtn); });

    await waitFor(() =>
      expect(screen.getByText(/Save failed/i)).toBeInTheDocument(),
    );
    expect(screen.getByText(/Choose Version/i)).toBeInTheDocument();
  });
});

// ── Native platform tests (Camera.pickImages) ─────────────────────────────────

describe("QuickAddSheet — native platform (Camera.pickImages)", () => {
  beforeEach(() => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    mutateSucceeds();
    mockPickImages.mockReset();
    mockGetPhoto.mockReset();
  });

  it("zero photos returned → stays on pick, no DB call", async () => {
    mockPickImages.mockResolvedValue({ photos: [] });
    render(<QuickAddSheet {...defaultProps} />);

    await act(async () => {
      fireEvent.click(getUploadPhotoButton());
      await new Promise((r) => setTimeout(r, 300));
    });

    expect(mockMutate).not.toHaveBeenCalled();
    expect(screen.getByText(/Add Outfits/i)).toBeInTheDocument();
  });

  it("single photo → webPath fetched → encoding → preview phase", async () => {
    mockPickImages.mockResolvedValue({
      photos: [{ webPath: "capacitor://localhost/img.jpg" }],
    });

    render(<QuickAddSheet {...defaultProps} />);
    await act(async () => {
      fireEvent.click(getUploadPhotoButton());
      await new Promise((r) => setTimeout(r, 200));
    });

    // fetch must be called with the webPath
    await waitFor(() => {
      const urls = vi.mocked(global.fetch).mock.calls.map(([u]) => String(u));
      expect(urls.some((u) => u.includes("img.jpg"))).toBe(true);
    });

    // Ultimately lands on preview
    await waitFor(() =>
      expect(screen.getByText(/Choose Version/i)).toBeInTheDocument(),
      { timeout: 4000 },
    );
  });

  it("multiple photos → batch upload, all webPaths fetched, sheet closes", async () => {
    mockPickImages.mockResolvedValue({
      photos: [
        { webPath: "capacitor://localhost/p1.jpg" },
        { webPath: "capacitor://localhost/p2.jpg" },
        { webPath: "capacitor://localhost/p3.jpg" },
      ],
    });

    render(<QuickAddSheet {...defaultProps} />);
    await act(async () => {
      fireEvent.click(getUploadPhotoButton());
      await new Promise((r) => setTimeout(r, 150));
    });

    // All three webPaths must be fetched and persisted
    await waitFor(() => {
      expect(mockMutate).toHaveBeenCalledTimes(3);
    }, { timeout: 5000 });

    // Verify each webPath was fetched
    const fetchedUrls = vi.mocked(global.fetch).mock.calls.map(([u]) => String(u));
    expect(fetchedUrls.some((u) => u.includes("p1.jpg"))).toBe(true);
    expect(fetchedUrls.some((u) => u.includes("p2.jpg"))).toBe(true);
    expect(fetchedUrls.some((u) => u.includes("p3.jpg"))).toBe(true);

    // Sheet closes after success
    await waitFor(() =>
      expect(defaultProps.onOpenChange).toHaveBeenCalledWith(false),
    );
  });

  it("multiple photos → progress state set with correct total before upload", async () => {
    // Track setProgress calls by intercepting the component's rendering.
    // Since the upload is mocked to complete instantly, capture the progress
    // text by briefly delaying one of the fetch calls.
    let fetchCallCount = 0;
    vi.mocked(global.fetch).mockImplementation(async (url) => {
      fetchCallCount++;
      // Introduce a small delay on the first call so the progress state has
      // time to be reflected in the DOM before the batch finishes.
      if (fetchCallCount === 1) await new Promise((r) => setTimeout(r, 80));
      return { blob: async () => new Blob([new Uint8Array(1500).fill(0xff)], { type: "image/jpeg" }), ok: true } as Response;
    });

    mockPickImages.mockResolvedValue({
      photos: [
        { webPath: "capacitor://localhost/p1.jpg" },
        { webPath: "capacitor://localhost/p2.jpg" },
      ],
    });

    render(<QuickAddSheet {...defaultProps} />);
    await act(async () => {
      fireEvent.click(getUploadPhotoButton());
      // Wait enough for the upload phase to start but not finish
      await new Promise((r) => setTimeout(r, 60));
    });

    // Progress text should be visible while upload is in progress
    await waitFor(() =>
      expect(screen.getByText(/Photo \d+ of 2/i)).toBeInTheDocument(),
      { timeout: 4000 },
    );

    // Wait for completion
    await waitFor(() =>
      expect(defaultProps.onOpenChange).toHaveBeenCalledWith(false),
      { timeout: 5000 },
    );
  });

  it("one photo fails mid-batch → error message, returns to pick", async () => {
    mockPickImages.mockResolvedValue({
      photos: [
        { webPath: "capacitor://localhost/ok.jpg" },
        { webPath: "capacitor://localhost/fail.jpg" },
      ],
    });
    mutateOnlyFirstSucceeds();

    render(<QuickAddSheet {...defaultProps} />);
    await act(async () => {
      fireEvent.click(getUploadPhotoButton());
      await new Promise((r) => setTimeout(r, 150));
    });

    await waitFor(() =>
      expect(screen.getByText(/1 photo could not be saved/i)).toBeInTheDocument(),
      { timeout: 5000 },
    );
    expect(screen.getByText(/Add Outfits/i)).toBeInTheDocument();
  });

  it("user cancellation → silent, stays on pick, no error message", async () => {
    mockPickImages.mockRejectedValue(new Error("User cancelled photos app"));

    render(<QuickAddSheet {...defaultProps} />);
    await act(async () => {
      fireEvent.click(getUploadPhotoButton());
      await new Promise((r) => setTimeout(r, 300));
    });

    expect(screen.queryByText(/could not open/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/could not be saved/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Add Outfits/i)).toBeInTheDocument();
    expect(mockMutate).not.toHaveBeenCalled();
  });

  it("user denial → silent, stays on pick, no error message", async () => {
    mockPickImages.mockRejectedValue(new Error("User denied access to photos"));

    render(<QuickAddSheet {...defaultProps} />);
    await act(async () => {
      fireEvent.click(getUploadPhotoButton());
      await new Promise((r) => setTimeout(r, 300));
    });

    expect(screen.queryByText(/could not open/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Add Outfits/i)).toBeInTheDocument();
    expect(mockMutate).not.toHaveBeenCalled();
  });

  it("unexpected gallery error → error message shown, returns to pick", async () => {
    mockPickImages.mockRejectedValue(new Error("Permission unavailable"));

    render(<QuickAddSheet {...defaultProps} />);
    await act(async () => {
      fireEvent.click(getUploadPhotoButton());
      await new Promise((r) => setTimeout(r, 300));
    });

    await waitFor(() =>
      expect(screen.getByText(/Could not open photo library/i)).toBeInTheDocument(),
    );
    expect(screen.getByText(/Add Outfits/i)).toBeInTheDocument();
  });
});
