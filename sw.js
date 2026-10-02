// sw.js - Service Worker DAGSTUDIO PLAYER PWA
const CACHE_NAME = 'dagstudio-player-shell-v2209';
const ASSETS_TO_CACHE = [
    './index.php',
    './style.css?v=2200',
    './script.js?v=2208',
    './manifest.json',
    './images/faviconch.png',
    './images/cover.png',
    './images/icon.png'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(ASSETS_TO_CACHE))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(names => Promise.all(
            names
                .filter(name => name.startsWith('dagstudio-player-shell-') && name !== CACHE_NAME)
                .map(name => caches.delete(name))
        )).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', event => {
    const request = event.request;
    if (request.method !== 'GET') return;

    const url = new URL(request.url);
    // API, поток и скачивание всегда должны идти в сеть.
    if (url.pathname.endsWith('/api.php') ||
        url.pathname.endsWith('/download.php') ||
        url.pathname.endsWith('/stream.php') ||
        url.pathname.endsWith('/proxy.php')) {
        return;
    }

    // Навигация: сначала сеть, чтобы пользователь получал актуальную версию;
    // при отсутствии сети используем закэшированный index.php.
    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request).then(response => {
                const copy = response.clone();
                caches.open(CACHE_NAME).then(cache => cache.put('./index.php', copy)).catch(() => {});
                return response;
            }).catch(() => caches.match('./index.php'))
        );
        return;
    }

    // Статика: cache-first, затем сеть.
    event.respondWith(
        caches.match(request).then(cached => {
            if (cached) return cached;
            return fetch(request).then(response => {
                if (response.ok && url.origin === self.location.origin) {
                    const copy = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(request, copy)).catch(() => {});
                }
                return response;
            });
        })
    );
});
