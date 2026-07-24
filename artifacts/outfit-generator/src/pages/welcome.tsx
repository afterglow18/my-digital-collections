/**
 * WelcomePage — Display-case hero splash screen.
 *
 * IDLE    : hero image centred, title + button below.
 * EXITING : hero scales up to fill the screen → fades out → onEnter().
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { motion } from "framer-motion";

interface Props { onEnter: () => void; }

export default function WelcomePage({ onEnter }: Props) {
  const [phase, setPhase] = useState<"idle" | "exiting">("idle");
  const [vh, setVh]       = useState(700);
  const calledRef         = useRef(false);

  useEffect(() => {
    const update = () => setVh(window.innerHeight);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const finish = useCallback(() => {
    if (calledRef.current) return;
    calledRef.current = true;
    onEnter();
  }, [onEnter]);

  const handleOpen = () => {
    if (phase !== "idle") return;
    setPhase("exiting");
    setTimeout(finish, 700);
  };

  const isExiting = phase === "exiting";

  return (
    <motion.div
      animate={{ opacity: isExiting ? 0 : 1 }}
      transition={{ duration: 0.55, ease: "easeIn", delay: isExiting ? 0.25 : 0 }}
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        background: "#0a0806",
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        overflowY: "auto",
      }}
    >
      {/* ── Ambient glow behind image ── */}
      <motion.div
        style={{
          position: "absolute",
          width: "70%", height: "55%",
          borderRadius: "50%",
          background: "radial-gradient(ellipse, rgba(184,137,78,0.18) 0%, transparent 70%)",
          filter: "blur(40px)",
          pointerEvents: "none",
          zIndex: 1,
        }}
        animate={{ opacity: isExiting ? 0 : 1 }}
        transition={{ duration: 0.4 }}
      />

      {/* ── Hero image — scales up to fill screen on exit ── */}
      <motion.div
        style={{
          position: "relative",
          zIndex: 2,
          width: "82%",
          maxWidth: 380,
          maxHeight: "48vh",
        }}
        animate={isExiting
          ? { scale: 3.5, opacity: 0 }
          : { scale: 1,   opacity: 1 }
        }
        transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
      >
        <img
          src="/welcome-hero.png"
          alt="My Digital Collections display case"
          draggable={false}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            borderRadius: 18,
            display: "block",
            border: "1.5px solid rgba(184,137,78,0.35)",
            boxShadow: "0 8px 40px rgba(0,0,0,0.80), 0 0 0 1px rgba(184,137,78,0.15)",
            userSelect: "none",
          }}
        />
      </motion.div>

      {/* ── Title + button ── */}
      <motion.div
        style={{
          position: "relative", zIndex: 3,
          display: "flex", flexDirection: "column", alignItems: "center",
          marginTop: vh * 0.038,
        }}
        animate={{ opacity: isExiting ? 0 : 1, y: isExiting ? 10 : 0 }}
        transition={{ duration: 0.25 }}
      >
        <div style={{
          fontFamily: "var(--font-display, serif)",
          fontWeight: 900,
          fontSize: "clamp(28px, 9vw, 44px)",
          letterSpacing: "-0.02em",
          lineHeight: 1.08,
          color: "#E8D4B0",
          textAlign: "center",
        }}>
          MY DIGITAL<br />COLLECTION
        </div>

        <div style={{
          marginTop: 8,
          fontSize: 11,
          fontWeight: 500,
          letterSpacing: "0.24em",
          textTransform: "uppercase" as const,
          color: "rgba(232,212,176,0.38)",
        }}>
          your personal collection
        </div>

        {/* CTA button */}
        <motion.button
          onClick={handleOpen}
          animate={{ opacity: isExiting ? 0 : 1 }}
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
            whiteSpace: "nowrap",
            pointerEvents: isExiting ? "none" : "auto",
          }}
        >
          Open Collection ✨
        </motion.button>
      </motion.div>

      {/* Footer links */}
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
