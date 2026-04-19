// Service Worker stub (v0.1.0). Real caching strategy is implemented in Phase 5.
const VERSION = 'v0.1.0';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Pass-through for Phase 1. Cache strategy comes later.
});
