import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";
import { Plus } from "lucide-react";
import { ClothingItem } from "@workspace/api-client-react";
import { getImageUrl } from "@/lib/utils";

// ── Constants ─────────────────────────────────────────────────────────────────
export const ITEM_W   = 120; // px — card width
export const ITEM_H   = 148; // px — card height
export const ITEM_GAP =  12; // px — gap between cards

// ── Public handle (used by parent for shuffle) ─────────────────────────────
export interface SwipeRowHandle {
  scrollToIndex: (index: number, smooth?: boolean) => void;
  getLength: () => number;
}

// ── Props ──────────────────────────────────────────────────────────────────
interface SwipeRowProps {
  items: ClothingItem[];
  addLabel: string;
  onCenteredItem: (item: ClothingItem | null) => void;
  onAddClick: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────
export const SwipeRow = forwardRef<SwipeRowHandle, SwipeRowProps>(
  ({ items, addLabel, onCenteredItem, onAddClick }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const itemRefs     = useRef<(HTMLDivElement | null)[]>([]);
    const lastSnapIdx  = useRef(-1);
    const STEP = ITEM_W + ITEM_GAP;

    // ── Imperative API ──────────────────────────────────────────────────────
    useImperativeHandle(ref, () => ({
      scrollToIndex: (index, smooth = true) => {
        containerRef.current?.scrollTo({
          left: index * STEP,
          behavior: smooth ? "smooth" : "instant",
        });
      },
      getLength: () => items.length,
    }));

    // ── Visual update on every scroll tick ─────────────────────────────────
    // Runs directly on the DOM (no setState) for buttery smoothness.
    const updateVisuals = useCallback(() => {
      const el = containerRef.current;
      if (!el || items.length === 0) return;

      const raw     = el.scrollLeft / STEP;   // e.g. 1.42 while dragging past item 1
      const snapIdx = Math.max(0, Math.min(items.length - 1, Math.round(raw)));

      itemRefs.current.forEach((node, i) => {
        if (!node) return;
        const dist    = Math.abs(i - raw);
        const clamped = Math.min(dist, 1);
        const scale   = 1 - clamped * 0.14;        // 1.0 → 0.86
        const opacity = 1 - clamped * 0.60;        // 1.0 → 0.40
        node.style.transform = `scale(${scale.toFixed(3)})`;
        node.style.opacity   = opacity.toFixed(3);
      });

      if (snapIdx !== lastSnapIdx.current) {
        lastSnapIdx.current = snapIdx;
        onCenteredItem(items[snapIdx] ?? null);
      }
    }, [items, onCenteredItem, STEP]);

    // Run once on mount / when items change
    useEffect(() => {
      updateVisuals();
      if (items.length > 0 && lastSnapIdx.current === -1) {
        onCenteredItem(items[0]);
      }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [items.length]);

    // ── Empty row ──────────────────────────────────────────────────────────
    if (items.length === 0) {
      return (
        <div
          className="flex justify-center items-center"
          style={{ height: ITEM_H + 20 }}
        >
          <button
            onClick={onAddClick}
            className="border-2 border-dashed border-black/35 rounded-2xl
                       flex flex-col items-center justify-center gap-2
                       bg-white/60 hover:border-black hover:bg-white
                       transition-all active:scale-95"
            style={{ width: ITEM_W, height: ITEM_H }}
          >
            <div className="w-9 h-9 rounded-full border-2 border-black/35 flex items-center justify-center">
              <Plus className="w-5 h-5 text-black/45" />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-wide text-black/45 text-center px-2 leading-tight">
              {addLabel}
            </span>
          </button>
        </div>
      );
    }

    // ── Scroll row ──────────────────────────────────────────────────────────
    return (
      <div className="relative" style={{ height: ITEM_H + 20 }}>

        {/* Centre viewfinder — a fixed frame that marks the "active slot" */}
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2
                     pointer-events-none z-10 rounded-2xl"
          style={{
            width:     ITEM_W + 6,
            height:    ITEM_H + 6,
            boxShadow: "0 0 0 2.5px black, 0 4px 0 0 black",
          }}
        />

        {/* Scrollable strip */}
        <div
          ref={containerRef}
          onScroll={updateVisuals}
          className="flex items-center h-full overflow-x-auto no-scrollbar"
          style={{
            scrollSnapType:             "x mandatory",
            WebkitOverflowScrolling:    "touch",
          }}
        >
          {/* Left spacer → first card can reach centre */}
          <div
            className="flex-none shrink-0"
            style={{ width: `calc(50% - ${ITEM_W / 2}px)` }}
          />

          {items.map((item, i) => (
            <div
              key={item.id}
              ref={(el) => { itemRefs.current[i] = el; }}
              className="flex-none flex flex-col rounded-2xl overflow-hidden
                         bg-white border-2 border-black"
              style={{
                width:         ITEM_W,
                height:        ITEM_H,
                marginLeft:    i === 0 ? 0 : ITEM_GAP,
                scrollSnapAlign: "center",
                willChange:    "transform, opacity",
                // Initial values — overwritten immediately by updateVisuals
                transform:     "scale(1)",
                opacity:       i === 0 ? "1" : "0.4",
              }}
            >
              {/* Photo */}
              <div className="flex-1 bg-muted overflow-hidden">
                {item.imageObjectPath ? (
                  <img
                    src={getImageUrl(item.imageObjectPath)!}
                    alt={item.name}
                    className="w-full h-full object-cover"
                    draggable={false}
                  />
                ) : (
                  <div className="w-full h-full bg-secondary/30 flex items-center justify-center p-2">
                    <span className="font-display font-bold text-center text-[9px] uppercase leading-tight">
                      {item.name}
                    </span>
                  </div>
                )}
              </div>

              {/* Name strip */}
              <div className="px-2 py-1.5 border-t-2 border-black bg-white shrink-0">
                <span className="font-bold text-[10px] uppercase tracking-tight line-clamp-1 block">
                  {item.name}
                </span>
              </div>
            </div>
          ))}

          {/* Right spacer → last card can reach centre */}
          <div
            className="flex-none shrink-0"
            style={{ width: `calc(50% - ${ITEM_W / 2}px)` }}
          />
        </div>
      </div>
    );
  }
);

SwipeRow.displayName = "SwipeRow";
