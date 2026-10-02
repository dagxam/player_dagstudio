// sw.js - Service Worker DAGSTUDIO PLAYER PWA
const CACHE_NAME = 'dagstudio-player-shell-v2210';
const ASSETS_TO_CACHE = [
    '/',
    '/index.php',
    '/style.css?v=2200',
    '/script.js?v=2210',
    '/manifest.json?v=2210',
    '/images/faviconch.png',
    '/images/icon-192.png',
    '/images/cover.png'
];

self.addEventListener('install', event => {
    event.waitUntil((async () => {
        const cache = await caches.open(CACHE_NAME);
        // Один временно недоступный ресурс не должен ломать установку всего SW.
        await Promise.allSettled(ASSETS_TO_CACHE.map(asset => cache.add(asset)));
        await self.skipWaiting();
    })());
});

self.addEventListener('activate', event => {
    event.waitUntil((async () => {
        const names = await caches.keys();
        await Promise.all(
            names
                .filter(name => name.startsWith('dagstudio-player-shell-') && name !== CACHE_NAME)
                .map(name => caches.delete(name))
        );
        await self.clients.claim();
    })());
});

self.addEventListener('fetch', event => {
    const request = event.request;
    if (request.method !== 'GET') return;

    const url = new URL(request.url);
    if (url.pathname.endsWith('/api.php') ||
        url.pathname.endsWith('/download.php') ||
        url.pathname.endsWith('/stream.php') ||
        url.pathname.endsWith('/proxy.php')) {
        return;
    }

    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request).then(response => {
                if (response && response.ok) {
                    const copy = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put('/index.php', copy)).catch(() => {});
                }
                return response;
            }).catch(async () => {
                return (await caches.match('/index.php')) || (await caches.match('/'));
            })
        );
        return;
    }

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
