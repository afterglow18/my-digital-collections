import { useState, useEffect, useCallback } from "react";
import { setAuthTokenGetter } from "@workspace/api-client-react";

export interface AuthUser {
  id: number;
  email: string;
}

const TOKEN_KEY = "closet-auth-token";

function getStoredToken(): string | null {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}
function setStoredToken(t: string | null) {
  try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch {}
}

export type AuthState =
  | { status: "loading" }
  | { status: "unauthenticated" }
  | { status: "authenticated"; user: AuthUser; token: string };

let _globalSetState: ((s: AuthState) => void) | null = null;

export function useAuth() {
  const [state, setState] = useState<AuthState>(() =>
    getStoredToken() ? { status: "loading" } : { status: "unauthenticated" }
  );

  // Register the setter so logout can be called from outside a component
  useEffect(() => { _globalSetState = setState; return () => { _globalSetState = null; }; }, []);

  // On mount, verify stored token
  useEffect(() => {
    const token = getStoredToken();
    if (!token) { setState({ status: "unauthenticated" }); return; }

    setAuthTokenGetter(() => token);

    fetch("/api/auth/me", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.ok ? r.json() : Promise.reject(r.status))
      .then(({ user }) => setState({ status: "authenticated", user, token }))
      .catch(() => {
        setStoredToken(null);
        setAuthTokenGetter(null);
        setState({ status: "unauthenticated" });
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const r = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error ?? "Login failed");
    setStoredToken(data.token);
    setAuthTokenGetter(() => data.token);
    setState({ status: "authenticated", user: data.user, token: data.token });
  }, []);

  const register = useCallback(async (email: string, password: string) => {
    const r = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error ?? "Registration failed");
    setStoredToken(data.token);
    setAuthTokenGetter(() => data.token);
    setState({ status: "authenticated", user: data.user, token: data.token });
  }, []);

  const logout = useCallback(() => {
    setStoredToken(null);
    setAuthTokenGetter(null);
    setState({ status: "unauthenticated" });
    sessionStorage.removeItem("closet-entered");
    // Clear all cached API data so the next user starts fresh
    import("@/lib/queryClient").then(({ queryClient }) => {
      queryClient.clear();
    });
  }, []);

  return { state, login, register, logout };
}

/** Call from anywhere (e.g. on 401) to force sign-out */
export function forceLogout() {
  try { localStorage.removeItem(TOKEN_KEY); } catch {}
  setAuthTokenGetter(null);
  sessionStorage.removeItem("closet-entered");
  _globalSetState?.({ status: "unauthenticated" });
}
