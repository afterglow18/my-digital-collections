/**
 * AuthPage — sign-in / sign-up screen.
 *
 * Visual: same yellow wardrobe background as WelcomePage, with a
 * frosted dark card floating in the center of the closet image.
 */

import { useState, useRef, useEffect, useCallback, FormEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuthContext } from "@/context/AuthContext";

const IMG_W = 941;
const IMG_H = 1672;

interface Rect { top: number; left: number; width: number; height: number; }

function useImageRect(containerRef: React.RefObject<HTMLDivElement | null>) {
  const [ir, setIr] = useState<Rect | null>(null);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    function measure() {
      if (!el) return;
      const cw = el.clientWidth;
      const ch = el.clientHeight;
      const scale = Math.min(cw / IMG_W, ch / IMG_H);
      const w = IMG_W * scale;
      const h = IMG_H * scale;
      setIr({ top: (ch - h) / 2, left: (cw - w) / 2, width: w, height: h });
    }
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [containerRef]);
  return ir;
}

export default function AuthPage({ onAuthenticated }: { onAuthenticated: () => void }) {
  const { login, register } = useAuthContext();
  const containerRef = useRef<HTMLDivElement>(null);
  const ir = useImageRect(containerRef);

  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = useCallback(async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (mode === "signin") {
        await login(email, password);
      } else {
        await register(email, password);
      }
      onAuthenticated();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }, [mode, email, password, login, register, onAuthenticated]);

  // Card positioned in the middle of the closet image
  const cardTop = ir ? ir.top + ir.height * 0.32 : null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        background: "#F0C030",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      <div
        ref={containerRef}
        style={{
          width: "100%",
          maxWidth: 448,
          height: "calc(100dvh - 90px)",
          position: "relative",
          overflow: "hidden",
          background: "#F0C030",
        }}
      >
        {/* Background wardrobe image */}
        {ir && (
          <img
            src="/closet-bg.png"
            alt=""
            draggable={false}
            style={{
              position: "absolute",
              top: ir.top, left: ir.left,
              width: ir.width, height: ir.height,
              display: "block",
              userSelect: "none",
              pointerEvents: "none",
            }}
          />
        )}

        {/* Auth card */}
        {cardTop !== null && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
            style={{
              position: "absolute",
              top: cardTop,
              left: 20,
              right: 20,
              zIndex: 10,
              background: "rgba(0,0,0,0.58)",
              backdropFilter: "blur(18px)",
              WebkitBackdropFilter: "blur(18px)",
              borderRadius: 20,
              border: "1.5px solid rgba(255,255,255,0.18)",
              boxShadow: "0 8px 40px rgba(0,0,0,0.35)",
              padding: "28px 24px 24px",
            }}
          >
            {/* App name */}
            <p
              style={{
                fontFamily: "var(--font-display, sans-serif)",
                fontWeight: 900,
                fontSize: 11,
                letterSpacing: "0.16em",
                color: "rgba(255,255,255,0.5)",
                textTransform: "uppercase",
                textAlign: "center",
                marginBottom: 4,
              }}
            >
              My Digital Closet
            </p>

            {/* Mode title */}
            <AnimatePresence mode="wait">
              <motion.h1
                key={mode}
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 4 }}
                transition={{ duration: 0.18 }}
                style={{
                  fontFamily: "var(--font-display, sans-serif)",
                  fontWeight: 800,
                  fontSize: 22,
                  color: "#fff",
                  textAlign: "center",
                  marginBottom: 22,
                  letterSpacing: "-0.02em",
                }}
              >
                {mode === "signin" ? "Welcome back ✨" : "Create your closet ✨"}
              </motion.h1>
            </AnimatePresence>

            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {/* Email */}
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoCapitalize="none"
                autoCorrect="off"
                style={{
                  width: "100%",
                  height: 44,
                  borderRadius: 100,
                  padding: "0 18px",
                  fontSize: 14,
                  fontWeight: 500,
                  color: "#fff",
                  background: "rgba(255,255,255,0.12)",
                  border: "1.5px solid rgba(255,255,255,0.22)",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />

              {/* Password */}
              <input
                type="password"
                placeholder={mode === "signup" ? "Password (min. 6 characters)" : "Password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                style={{
                  width: "100%",
                  height: 44,
                  borderRadius: 100,
                  padding: "0 18px",
                  fontSize: 14,
                  fontWeight: 500,
                  color: "#fff",
                  background: "rgba(255,255,255,0.12)",
                  border: "1.5px solid rgba(255,255,255,0.22)",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />

              {/* Error */}
              <AnimatePresence>
                {error && (
                  <motion.p
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: "#ff7070",
                      textAlign: "center",
                      margin: "0 4px",
                    }}
                  >
                    {error}
                  </motion.p>
                )}
              </AnimatePresence>

              {/* Submit button */}
              <button
                type="submit"
                disabled={loading}
                style={{
                  marginTop: 4,
                  height: 46,
                  borderRadius: 100,
                  fontFamily: "var(--font-display, sans-serif)",
                  fontWeight: 800,
                  fontSize: 15,
                  letterSpacing: "-0.01em",
                  color: "#3a2400",
                  background: loading
                    ? "rgba(245,216,64,0.5)"
                    : "linear-gradient(to bottom, #f5d840, #c89018)",
                  border: "none",
                  cursor: loading ? "not-allowed" : "pointer",
                  boxShadow: "0 4px 16px rgba(200,144,24,0.35)",
                  transition: "opacity 0.15s",
                }}
              >
                {loading ? "…" : mode === "signin" ? "Sign In" : "Create Account"}
              </button>
            </form>

            {/* Toggle mode */}
            <button
              onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(""); }}
              style={{
                marginTop: 16,
                width: "100%",
                background: "none",
                border: "none",
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 600,
                color: "rgba(255,255,255,0.55)",
                textAlign: "center",
              }}
            >
              {mode === "signin"
                ? "Don't have an account? Sign up"
                : "Already have an account? Sign in"}
            </button>
          </motion.div>
        )}
      </div>

      {/* Bottom links */}
      <div
        style={{
          position: "fixed",
          bottom: "calc(env(safe-area-inset-bottom) + 10px)",
          left: 0, right: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 4,
          zIndex: 210,
        }}
      >
        <a
          href="https://classy-alpaca-441.notion.site/Privacy-Policy-39682db6065380b19dedcb108d4a0ef4"
          target="_blank"
          rel="noopener noreferrer"
          style={{ fontSize: 11, fontWeight: 500, color: "rgba(255,255,255,0.45)", textDecoration: "none" }}
        >
          Privacy Policy
        </a>
        <a
          href="https://app.notion.com/p/My-Digital-Closet-Support-39782db60653802a9088dcbae84c0527?source=copy_link"
          target="_blank"
          rel="noopener noreferrer"
          style={{ fontSize: 11, fontWeight: 500, color: "rgba(255,255,255,0.45)", textDecoration: "none" }}
        >
          Support
        </a>
      </div>
    </div>
  );
}
