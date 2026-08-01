import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import { initializeRevenueCat } from './lib/revenuecat';

// Start RC configuration immediately at boot — before React mounts — so the
// SDK is ready (or at least in-flight) by the time any component needs it.
// initializeRevenueCat is synchronous: it fires configure() without awaiting.
initializeRevenueCat();

// IndexedDB initialises lazily on first query — no explicit init needed here.
// All data is local; no API base URL or token setup required.

createRoot(document.getElementById('root')!).render(<App />);
