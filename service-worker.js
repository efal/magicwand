
const CACHE_NAME = 'magic-wand-editor-v2'; // Cache-Version erhöht, um ein Update zu erzwingen
const URLS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icon-192.svg',
  '/icon-512.svg'
];

// Installiert den Service Worker
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Cache geöffnet');
        return cache.addAll(URLS_TO_CACHE);
      })
      .then(() => self.skipWaiting()) // Aktiviert den neuen Service Worker sofort
  );
});

// Aktualisiert den Service Worker und löscht alte Caches
self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            console.log('Lösche alten Cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim()) // Übernimmt die Kontrolle über alle offenen Seiten
  );
});

// Fängt Anfragen ab und wendet eine "Network First"-Strategie an
self.addEventListener('fetch', event => {
  // Ignoriert Anfragen, die keine GET-Anfragen sind
  if (event.request.method !== 'GET') {
      return;
  }
  
  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Überprüft, ob eine gültige Antwort empfangen wurde
        if (response && response.ok) {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME)
            .then(cache => {
              cache.put(event.request, responseToCache);
            });
        }
        return response;
      })
      .catch(() => {
        // Netzwerkanfrage fehlgeschlagen, versucht aus dem Cache zu laden
        console.log('Netzwerkanfrage fehlgeschlagen. Lade aus Cache für:', event.request.url);
        return caches.match(event.request);
      })
  );
});
