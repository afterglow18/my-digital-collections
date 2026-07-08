/**
 * AuthContext — single source of truth for auth state across the app.
 * Wrap the root in <AuthProvider> and call useAuthContext() anywhere.
 */

import { createContext, useContext, type ReactNode } from "react";
import { useAuth, type AuthState } from "@/hooks/useAuth";

interface AuthContextValue {
  state: AuthState;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
}

export function useAuthContext(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuthContext must be used inside <AuthProvider>");
  return ctx;
}
