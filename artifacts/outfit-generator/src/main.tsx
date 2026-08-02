import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import { initializeRevenueCat } from './lib/revenuecat';
import { startVisionIndexer } from './lib/visionIndexer';

// Start RC configuration immediately at boot — before React mounts — so the
// SDK is ready (or at least in-flight) by the time any component needs it.
// initializeRevenueCat is synchronous: it fires configure() without awaiting.
initializeRevenueCat();

// Start the background photo-analysis indexer.  Runs after a short yield so
// the app renders its first frame before any DB work begins.
setTimeout(() => startVisionIndexer(), 1500);

// IndexedDB initialises lazily on first query — no explicit init needed here.
// All data is local; no API base URL or token setup required.

createRoot(document.getElementById('root')!).render(<App />);
