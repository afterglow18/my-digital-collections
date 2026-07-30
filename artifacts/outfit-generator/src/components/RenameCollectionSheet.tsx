/**
 * RenameCollectionSheet
 *
 * Small bottom sheet with a text input to rename a collection heading.
 */
import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Check } from "lucide-react";

interface Props {
  open:         boolean;
  currentName:  string;
  onSave:       (name: string) => void;
  onClose:      () => void;
}

export function RenameCollectionSheet({ open, currentName, onSave, onClose }: Props) {
  const [value, setValue] = useState(currentName);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset value whenever sheet opens with a (possibly new) current name
  useEffect(() => {
    if (open) {
      setValue(currentName);
      // Give the sheet time to mount before focusing
      setTimeout(() => inputRef.current?.focus(), 200);
    }
  }, [open, currentName]);

  const handleSave = () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    onSave(trimmed);
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSave();
    if (e.key === "Escape") onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[90] bg-black/50"
          />

          {/* Sheet */}
          <motion.div
            key="sheet"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 280 }}
            className="fixed bottom-0 left-0 right-0 z-[91] max-w-md mx-auto
                       border-t-4 border-x-4 border-[#C4AB72] rounded-t-3xl
                       px-5 pt-5"
            style={{
              paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))",
              background: "#1C1208",
            }}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-display font-black text-lg uppercase tracking-tight text-[#EBD9A8]">
                Rename Collection
              </h2>
              <button
                onClick={onClose}
                className="w-9 h-9 rounded-full flex items-center justify-center
                           active:translate-x-0.5 active:translate-y-0.5 transition-all"
                style={{
                  border: "2px solid #C4AB72",
                  background: "#0E0A04",
                  color: "#C4AB72",
                  boxShadow: "2px 2px 0 #C4AB72",
                }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Input */}
            <input
              ref={inputRef}
              type="text"
              value={value}
              onChange={e => setValue(e.target.value.toUpperCase())}
              onKeyDown={handleKeyDown}
              maxLength={24}
              placeholder="COLLECTION NAME"
              className="w-full rounded-xl px-4 py-3
                         font-display font-bold text-base uppercase tracking-wide
                         outline-none placeholder:text-[#C4AB72]/40"
              style={{
                border: "2.5px solid #C4AB72",
                background: "#0E0A04",
                color: "#EBD9A8",
              }}
            />

            {/* Save button */}
            <button
              onClick={handleSave}
              disabled={!value.trim()}
              className="mt-4 w-full flex items-center justify-center gap-2 py-4
                         rounded-2xl font-display font-bold text-sm uppercase tracking-tight
                         active:translate-x-1 active:translate-y-1 transition-all
                         disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                border: "2.5px solid #C4AB72",
                background: "linear-gradient(to bottom, #EBD9A8, #C4AB72)",
                color: "#3A2210",
                boxShadow: "4px 4px 0 #C4AB72",
              }}
            >
              <Check className="w-4 h-4" strokeWidth={3} />
              Save Name
            </button>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
