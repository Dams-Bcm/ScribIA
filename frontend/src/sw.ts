/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from "workbox-precaching";
import { registerRoute, NavigationRoute } from "workbox-routing";
import { CacheFirst, StaleWhileRevalidate, NetworkFirst, NetworkOnly } from "workbox-strategies";
import { CacheableResponsePlugin } from "workbox-cacheable-response";
import { ExpirationPlugin } from "workbox-expiration";
import { BackgroundSyncPlugin } from "workbox-background-sync";

declare const self: ServiceWorkerGlobalScope;

// ── Precache (app shell for offline) ────────────────────────────────────
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

// ── SPA navigation: always serve index.html for all navigation requests ─
const navigationHandler = createHandlerBoundToURL("/index.html");
registerRoute(new NavigationRoute(navigationHandler, {
  // Exclude API and static file paths from navigation handling
  denylist: [/^\/api\//, /\.\w+$/],
}));

// ── Runtime cache: API GET requests (NetworkFirst — fresh data preferred) ─
registerRoute(
  ({ url }) => url.pathname.startsWith("/api/") && !url.pathname.includes("/stream"),
  new NetworkFirst({
    cacheName: "api-cache",
    networkTimeoutSeconds: 10,
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 60 * 60 }), // 1h
    ],
  }),
  "GET",
);

// ── Runtime cache: static assets from CDN or same-origin ────────────────
registerRoute(
  ({ request }) =>
    request.destination === "image" ||
    request.destination === "font" ||
    request.destination === "style",
  new CacheFirst({
    cacheName: "static-assets",
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 80, maxAgeSeconds: 30 * 24 * 60 * 60 }), // 30 days
    ],
  }),
);

// ── Runtime cache: JS/CSS chunks (StaleWhileRevalidate) ─────────────────
registerRoute(
  ({ request }) => request.destination === "script",
  new StaleWhileRevalidate({
    cacheName: "js-cache",
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 50, maxAgeSeconds: 7 * 24 * 60 * 60 }), // 7 days
    ],
  }),
);

// ── Background Sync: retry failed POST/PATCH/DELETE mutations ───────────
// Exclude uploads (multipart), SSE streams, and large file endpoints
const bgSyncPlugin = new BackgroundSyncPlugin("api-mutations-queue", {
  maxRetentionTime: 24 * 60, // 24 hours
});

function isSyncableApiMutation({ url }: { url: URL }): boolean {
  if (!url.pathname.startsWith("/api/")) return false;
  // Skip file uploads and streaming endpoints
  if (url.pathname.includes("/upload")) return false;
  if (url.pathname.includes("/stream")) return false;
  return true;
}

registerRoute(isSyncableApiMutation, new NetworkOnly({ plugins: [bgSyncPlugin] }), "POST");
registerRoute(isSyncableApiMutation, new NetworkOnly({ plugins: [bgSyncPlugin] }), "PATCH");
registerRoute(isSyncableApiMutation, new NetworkOnly({ plugins: [bgSyncPlugin] }), "DELETE");

// ── Push Notifications ──────────────────────────────────────────────────
self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload: { title: string; body: string; url?: string; tag?: string };
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "Scrib' IA", body: event.data.text() };
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/pwa-192x192.png",
      badge: "/pwa-192x192.png",
      tag: payload.tag ?? "scribia-notification",
      data: { url: payload.url ?? "/" },
    }),
  );
});

// ── Click on notification → open app ────────────────────────────────────
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data?.url as string) ?? "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      // Focus existing tab if found
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin)) {
          client.navigate(url);
          return client.focus();
        }
      }
      // Otherwise open new window
      return self.clients.openWindow(url);
    }),
  );
});

// ── Clear API cache on logout (message from main thread) ────────────────
self.addEventListener("message", (event) => {
  if (event.data?.type === "CLEAR_API_CACHE") {
    caches.delete("api-cache");
  }
});

// ── Activate immediately ────────────────────────────────────────────────
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    // Clean stale runtime caches on update, then claim clients
    caches.keys().then((names) =>
      Promise.all(
        names
          .filter((n) => n === "js-cache" || n === "static-assets")
          .map((n) => caches.delete(n)),
      ),
    ).then(() => self.clients.claim()),
  );
});
