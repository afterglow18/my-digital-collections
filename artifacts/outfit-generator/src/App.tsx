import { QueryClientProvider } from '@tanstack/react-query';
import { Route, Switch, Redirect, Router as WouterRouter } from 'wouter';
import { useState, useCallback, useEffect, useRef } from 'react';
import { AppLayout } from './components/layout/AppLayout';
import WardrobePage from './pages/wardrobe';
import GeneratePage from './pages/generate';
import SavedPage from './pages/saved';
import FavoritesPage from './pages/favorites';
import AccountPage from './pages/account';
import WelcomePage from './pages/welcome';
import AuthPage from './pages/auth';
import { setGlobalTier } from '@/hooks/useEntitlements';
import { AuthProvider, useAuthContext } from '@/context/AuthContext';
import { queryClient } from '@/lib/queryClient';

function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center h-full p-8 text-center space-y-4">
      <h1 className="text-6xl font-display font-bold text-primary drop-shadow-[4px_4px_0px_rgba(0,0,0,1)]">404</h1>
      <p className="text-xl font-bold uppercase">As if! This page is totally lost.</p>
    </div>
  );
}

function Router() {
  return (
    <AppLayout>
      <Switch>
        <Route path="/" component={WardrobePage} />
        <Route path="/generate" component={GeneratePage} />
        <Route path="/saved" component={SavedPage} />
        <Route path="/favorites" component={FavoritesPage} />
        <Route path="/account" component={AccountPage} />
        <Redirect to="/" />
      </Switch>
    </AppLayout>
  );
}

function AppShell() {
  const { state } = useAuthContext();

  const [entered, setEntered] = useState<boolean>(
    () =>
      sessionStorage.getItem("closet-entered") === "1" ||
      new URLSearchParams(window.location.search).get("preview") === "1"
  );

  const handleEnter = useCallback(() => {
    sessionStorage.setItem("closet-entered", "1");
    setEntered(true);
  }, []);

  // Reset entered when user logs out
  useEffect(() => {
    if (state.status === 'unauthenticated') {
      setEntered(false);
    }
  }, [state.status]);

  const routerWrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = routerWrapRef.current;
    if (!el) return;
    if (!entered) {
      el.setAttribute("inert", "");
      el.setAttribute("aria-hidden", "true");
    } else {
      el.removeAttribute("inert");
      el.removeAttribute("aria-hidden");
    }
  }, [entered]);

  // ── Stripe success callback ──────────────────────────────────────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const unlock = params.get("unlock");
    const sessionId = params.get("session_id");

    if (unlock !== "success" || !sessionId) return;

    const cleanUrl = new URL(window.location.href);
    cleanUrl.searchParams.delete("unlock");
    cleanUrl.searchParams.delete("session_id");
    window.history.replaceState({}, "", cleanUrl.toString());

    sessionStorage.setItem("closet-entered", "1");
    setEntered(true);

    fetch(`/api/stripe/verify?session_id=${encodeURIComponent(sessionId)}`)
      .then((r) => r.json())
      .then(({ verified, product }: { verified: boolean; product: string | null }) => {
        if (verified && product === "unlock") setGlobalTier("unlock");
        if (verified && product === "premium") setGlobalTier("premium");
      })
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Still verifying stored token — show blank yellow screen (avoids flash)
  if (state.status === 'loading') {
    return <div style={{ position: 'fixed', inset: 0, background: '#ff91b0' }} />;
  }

  return (
    <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
      <div ref={routerWrapRef}>
        <Router />
      </div>

      {/* Auth gate */}
      {state.status === 'unauthenticated' && (
        <AuthPage onAuthenticated={handleEnter} />
      )}

      {/* Welcome doors — shown after auth, once per session */}
      {state.status === 'authenticated' && !entered && (
        <WelcomePage onEnter={handleEnter} />
      )}
    </WouterRouter>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AppShell />
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
