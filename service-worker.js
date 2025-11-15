
const CACHE_NAME = 'magic-wand-editor-v4'; // Cache-Version erhöht für Update
const URLS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icon-192.svg',
  '/icon-512.svg',
  // App-Komponenten
  '/index.tsx',
  '/App.tsx',
  '/components/ImageUploader.tsx',
  '/components/ImageEditor.tsx',
  '/components/Icons.tsx',
  // Externe Abhängigkeiten
  'https://cdn.tailwindcss.com',
  'https://aistudiocdn.com/react@^19.2.0',
  'https://aistudiocdn.com/react-dom@^19.2.0/client', // Korrekter Pfad für ReactDOM
  'https://aistudiocdn.com/react@^19.2.0/jsx-runtime' // Benötigt für JSX
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
      .catch(error => {
        console.error('Service Worker Installation fehlgeschlagen:', error);
      })
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
  if (event.request.method !== 'GET' || !event.request.url.startsWith('http')) {
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
              // Vorsicht beim Caching von undurchsichtigen Antworten (z.B. von CDNs ohne CORS)
              if (response.type !== 'opaque') {
                cache.put(event.request, responseToCache);
              }
            });
        }
        return response;
      })
      .catch(() => {
        // Netzwerkanfrage fehlgeschlagen, versucht aus dem Cache zu laden
        console.log('Netzwerkanfrage fehlgeschlagen. Lade aus Cache für:', event.request.url);
        return caches.match(event.request).then(cachedResponse => {
            if (cachedResponse) {
                return cachedResponse;
            }
            // Wenn nichts im Cache ist, gib eine einfache Offline-Antwort zurück
            // Dies ist besser als ein Browser-Fehler
            if (event.request.destination === 'document') {
                return caches.match('/');
            }
            return new Response(null, { status: 404, statusText: "Offline und nicht im Cache" });
        });
      })
  );
});