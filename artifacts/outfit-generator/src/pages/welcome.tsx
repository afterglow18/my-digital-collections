/**
 * WelcomePage — Glass display-case unlock sequence.
 *
 * PHASES
 *   locked     Initial: closed glass case, gold keyhole visible.
 *   unlocking  Key appears and rotates in the lock (0.8 s).
 *   opening    Two glass doors swing open via rotateY (0.9 s).
 *   open       Hero image revealed inside — brief pause (0.5 s).
 *   zooming    Case scales up to fill screen → fades out → onEnter().
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { motion } from "framer-motion";

type Phase = "locked" | "unlocking" | "opening" | "open" | "zooming";
interface Props { onEnter: () => void; }

export default function WelcomePage({ onEnter }: Props) {
  const [phase, setPhase] = useState<Phase>("locked");
  const [vh, setVh]       = useState(700);
  const calledRef         = useRef(false);

  useEffect(() => {
    const update = () => setVh(window.innerHeight);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const handleOpen = useCallback(() => {
    if (phase !== "locked") return;
    setPhase("unlocking");
    setTimeout(() => setPhase("opening"),  820);   // key done
    setTimeout(() => setPhase("open"),    1720);   // doors done
    setTimeout(() => setPhase("zooming"), 2300);   // hero pause done
    setTimeout(() => {
      if (calledRef.current) return;
      calledRef.current = true;
      onEnter();
    }, 2950);                                      // zoom done
  }, [phase, onEnter]);

  const isOpening = phase === "opening" || phase === "open" || phase === "zooming";
  const isOpen    = phase === "open" || phase === "zooming";
  const isZooming = phase === "zooming";

  // Case size: portrait, max ~45 vh tall
  const caseW = Math.min(Math.round(vh * 0.32), 240);
  const caseH = Math.round(caseW * (4 / 3));

  return (
    <motion.div
      animate={{ opacity: isZooming ? 0 : 1 }}
      transition={{ duration: 0.55, ease: "easeIn", delay: isZooming ? 0.38 : 0 }}
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        background: "#0a0806",
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        overflowY: "auto",
      }}
    >
      {/* ── Ambient gold glow ── */}
      <motion.div
        style={{
          position: "absolute",
          width: "70%", height: "55%",
          borderRadius: "50%",
          background: "radial-gradient(ellipse, rgba(184,137,78,0.20) 0%, transparent 70%)",
          filter: "blur(40px)",
          pointerEvents: "none",
          zIndex: 1,
        }}
        animate={{ opacity: isZooming ? 0 : 1, scale: isOpen ? 1.35 : 1 }}
        transition={{ duration: 0.5 }}
      />

      {/* ── Glass display case ── */}
      <motion.div
        style={{ position: "relative", zIndex: 2, width: caseW }}
        animate={isZooming ? { scale: 3.8, opacity: 0 } : { scale: 1, opacity: 1 }}
        transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
      >
        {/* Top gold trim bar */}
        <div style={{
          position: "absolute", top: -5,
          left: "8%", right: "8%",
          height: 5, borderRadius: 3,
          background: "linear-gradient(to right, transparent, #B8894E 20%, #E8D4B0 50%, #B8894E 80%, transparent)",
          zIndex: 10,
        }} />

        {/* ── Back panel: interior + hero ── */}
        <div style={{
          width: caseW, height: caseH,
          background: "linear-gradient(160deg, #1c1409 0%, #0d0a06 100%)",
          border: "1.5px solid rgba(184,137,78,0.45)",
          borderRadius: 14,
          overflow: "hidden",
          position: "relative",
          boxShadow:
            "0 24px 64px rgba(0,0,0,0.95), " +
            "0 0 0 1px rgba(184,137,78,0.12), " +
            "inset 0 1px 0 rgba(184,137,78,0.18)",
        }}>
          {/* Hero image (revealed on open) */}
          <motion.img
            src="/welcome-hero.png"
            alt="My Digital Collections"
            draggable={false}
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            animate={{ opacity: isOpen ? 1 : 0 }}
            transition={{ duration: 0.5, delay: isOpen ? 0.2 : 0 }}
          />

          {/* Dark interior overlay (hides hero when closed) */}
          <motion.div
            style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, #0e0b07 0%, #1a1008 100%)", zIndex: 1 }}
            animate={{ opacity: isOpen ? 0 : 1 }}
            transition={{ duration: 0.35 }}
          />

          {/* Shelf lines (visible when locked) */}
          <motion.div
            style={{ position: "absolute", inset: 0, zIndex: 2, pointerEvents: "none" }}
            animate={{ opacity: isOpen ? 0 : 1 }}
            transition={{ duration: 0.3 }}
          >
            {[0.32, 0.64].map((f) => (
              <div key={f} style={{
                position: "absolute", top: `${f * 100}%`,
                left: "6%", right: "6%", height: 1,
                background: "linear-gradient(to right, transparent, rgba(184,137,78,0.35), transparent)",
              }} />
            ))}
          </motion.div>
        </div>

        {/* ── Door container (perspective parent) ── */}
        <div style={{
          position: "absolute", inset: 0,
          perspective: 900,
          perspectiveOrigin: "50% 50%",
        }}>
          {/* Left glass door */}
          <motion.div
            style={{
              position: "absolute",
              top: 0, bottom: 0, left: 0, right: "50%",
              transformOrigin: "0% 50%",
              transformStyle: "preserve-3d" as const,
              background:
                "linear-gradient(135deg, rgba(220,195,140,0.13) 0%, rgba(10,8,5,0.78) 60%, rgba(220,195,140,0.06) 100%)",
              borderRadius: "14px 0 0 14px",
              border: "1.5px solid rgba(184,137,78,0.4)",
              borderRight: "none",
              backdropFilter: "blur(3px)",
              overflow: "hidden",
            }}
            animate={{ rotateY: isOpening ? -125 : 0 }}
            transition={{ duration: 0.88, ease: [0.22, 1, 0.36, 1] }}
          >
            {/* Reflection strip */}
            <div style={{
              position: "absolute", top: "8%", left: "14%",
              width: "16%", height: "58%",
              background: "linear-gradient(180deg, rgba(255,255,255,0.09) 0%, transparent 100%)",
              borderRadius: 3,
            }} />
          </motion.div>

          {/* Right glass door */}
          <motion.div
            style={{
              position: "absolute",
              top: 0, bottom: 0, left: "50%", right: 0,
              transformOrigin: "100% 50%",
              transformStyle: "preserve-3d" as const,
              background:
                "linear-gradient(225deg, rgba(220,195,140,0.13) 0%, rgba(10,8,5,0.78) 60%, rgba(220,195,140,0.06) 100%)",
              borderRadius: "0 14px 14px 0",
              border: "1.5px solid rgba(184,137,78,0.4)",
              borderLeft: "none",
              backdropFilter: "blur(3px)",
              overflow: "hidden",
            }}
            animate={{ rotateY: isOpening ? 125 : 0 }}
            transition={{ duration: 0.88, ease: [0.22, 1, 0.36, 1] }}
          >
            {/* Reflection strip */}
            <div style={{
              position: "absolute", top: "8%", right: "14%",
              width: "16%", height: "58%",
              background: "linear-gradient(180deg, rgba(255,255,255,0.09) 0%, transparent 100%)",
              borderRadius: 3,
            }} />
          </motion.div>

          {/* ── Keyhole — centred on the door seam ── */}
          <motion.div
            style={{
              position: "absolute",
              bottom: "13%", left: "50%",
              x: "-50%", zIndex: 5,
            }}
            animate={{ opacity: isOpening ? 0 : 1 }}
            transition={{ duration: 0.18 }}
          >
            <svg width="18" height="26" viewBox="0 0 18 26" fill="none">
              <circle cx="9" cy="7.5" r="5.5" fill="rgba(0,0,0,0.95)" stroke="rgba(184,137,78,0.65)" strokeWidth="1.5" />
              <path d="M6 13 L7 22 L11 22 L12 13 Z" fill="rgba(0,0,0,0.95)" stroke="rgba(184,137,78,0.55)" strokeWidth="1" strokeLinejoin="round" />
            </svg>
          </motion.div>

          {/* ── Key — appears and rotates during unlock ── */}
          <motion.div
            style={{
              position: "absolute",
              bottom: "9%", left: "50%",
              x: "-50%",
              transformOrigin: "50% 100%",
              zIndex: 6,
            }}
            animate={
              phase === "unlocking"
                ? { opacity: 1, rotate: [0, -25, 360], transition: { duration: 0.78, ease: [0.4, 0, 0.2, 1] } }
                : phase === "locked"
                ? { opacity: 1, rotate: 0 }
                : { opacity: 0, rotate: 360 }
            }
          >
            <svg width="44" height="66" viewBox="0 0 44 66" fill="none">
              {/* Glow behind bow */}
              <circle cx="22" cy="14" r="14" fill="rgba(184,137,78,0.18)" />
              {/* Bow (head) */}
              <circle cx="22" cy="14" r="12" fill="#B8894E" stroke="#E8D4B0" strokeWidth="2" />
              <circle cx="22" cy="14" r="6.5" fill="#0a0806" />
              {/* Highlight on bow */}
              <circle cx="18" cy="10" r="2.5" fill="rgba(232,212,176,0.35)" />
              {/* Shaft */}
              <rect x="19.5" y="26" width="5" height="26" rx="2.5" fill="#B8894E" />
              {/* Teeth */}
              <rect x="24.5" y="36" width="8" height="4" rx="2" fill="#B8894E" />
              <rect x="24.5" y="44" width="6" height="4" rx="2" fill="#B8894E" />
              <rect x="24.5" y="52" width="4" height="4" rx="2" fill="#B8894E" />
            </svg>
          </motion.div>
        </div>

        {/* Bottom gold trim bar */}
        <div style={{
          position: "absolute", bottom: -5,
          left: "8%", right: "8%",
          height: 5, borderRadius: 3,
          background: "linear-gradient(to right, transparent, #B8894E 20%, #E8D4B0 50%, #B8894E 80%, transparent)",
          zIndex: 10,
        }} />
      </motion.div>

      {/* ── Title + button ── */}
      <motion.div
        style={{
          position: "relative", zIndex: 3,
          display: "flex", flexDirection: "column", alignItems: "center",
          marginTop: vh * 0.04,
        }}
        animate={{ opacity: isZooming ? 0 : 1, y: isZooming ? 10 : 0 }}
        transition={{ duration: 0.25 }}
      >
        <div style={{
          fontFamily: "var(--font-display, serif)",
          fontWeight: 900,
          fontSize: "clamp(20px, 6.5vw, 34px)",
          letterSpacing: "-0.02em",
          lineHeight: 1.08,
          color: "#E8D4B0",
          textAlign: "center",
        }}>
          MY DIGITAL<br />COLLECTIONS
        </div>

        <div style={{
          marginTop: 8,
          fontSize: 11,
          fontWeight: 500,
          letterSpacing: "0.24em",
          textTransform: "uppercase" as const,
          color: "rgba(232,212,176,0.38)",
        }}>
          your personal collections
        </div>

        {/* CTA — hidden once sequence starts */}
        <motion.button
          onClick={handleOpen}
          animate={{ opacity: phase === "locked" ? 1 : 0 }}
          transition={{ duration: 0.2 }}
          style={{
            marginTop: vh * 0.038,
            fontFamily: "var(--font-display, sans-serif)",
            fontWeight: 800, fontSize: 15,
            letterSpacing: "0.03em",
            color: "#3A2210",
            background: "linear-gradient(to bottom, #E8D4B0, #B8894E)",
            border: "1.5px solid #B8894E",
            borderRadius: 100,
            padding: "13px 40px",
            cursor: "pointer",
            boxShadow: "0 4px 20px rgba(120,80,40,0.45), 2px 2px 0 rgba(0,0,0,0.7)",
            whiteSpace: "nowrap" as const,
            pointerEvents: phase === "locked" ? "auto" : "none",
          }}
        >
          Open Collection ✨
        </motion.button>
      </motion.div>

      {/* ── Footer links ── */}
      <div style={{
        position: "fixed",
        bottom: "calc(env(safe-area-inset-bottom) + 10px)",
        left: 0, right: 0,
        display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
        zIndex: 210,
      }}>
        <a
          href="https://classy-alpaca-441.notion.site/Privacy-Policy-39682db6065380b19dedcb108d4a0ef4"
          target="_blank" rel="noopener noreferrer"
          style={{ fontSize: 11, fontWeight: 500, color: "rgba(255,255,255,0.25)", textDecoration: "none", letterSpacing: "0.02em" }}
        >Privacy Policy</a>
        <a
          href="https://app.notion.com/p/My-Digital-Closet-Support-39782db60653802a9088dcbae84c0527?source=copy_link"
          target="_blank" rel="noopener noreferrer"
          style={{ fontSize: 11, fontWeight: 500, color: "rgba(255,255,255,0.25)", textDecoration: "none", letterSpacing: "0.02em" }}
        >Support</a>
      </div>
    </motion.div>
  );
}
