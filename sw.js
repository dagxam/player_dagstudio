// sw.js - Service Worker DAGSTUDIO PLAYER PWA
const CACHE_NAME = 'dagstudio-player-shell-v2214';
const RUNTIME_CACHE = 'dagstudio-player-runtime-v2214';

const CORE_ASSETS = [
    '/',
    '/index.php',
    '/style.css?v=2212',
    '/script.js?v=2214',
    '/manifest.json?v=2212',
    '/images/faviconch.png',
    '/images/icon-192.png',
    '/images/cover.png'
];

const OPTIONAL_ASSETS = [
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css'
];

self.addEventListener('install', function(event) {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(function(cache) {
                return Promise.all(CORE_ASSETS.map(function(asset) {
                    return cache.add(asset).catch(function() { return null; });
                }));
            })
            .then(function() {
                return caches.open(RUNTIME_CACHE);
            })
            .then(function(cache) {
                return Promise.all(OPTIONAL_ASSETS.map(function(asset) {
                    return cache.add(asset).catch(function() { return null; });
                }));
            })
            .then(function() { return self.skipWaiting(); })
    );
});

self.addEventListener('activate', function(event) {
    event.waitUntil(
        caches.keys()
            .then(function(names) {
                return Promise.all(names.map(function(name) {
                    if ((name.indexOf('dagstudio-player-shell-') === 0 && name !== CACHE_NAME) ||
                        (name.indexOf('dagstudio-player-runtime-') === 0 && name !== RUNTIME_CACHE)) {
                        return caches.delete(name);
                    }
                    return Promise.resolve(false);
                }));
            })
            .then(function() { return self.clients.claim(); })
    );
});

function cacheRuntime(request, response) {
    if (!response || (!response.ok && response.type !== 'opaque')) return response;
    const copy = response.clone();
    caches.open(RUNTIME_CACHE)
        .then(function(cache) { return cache.put(request, copy); })
        .catch(function() {});
    return response;
}

self.addEventListener('fetch', function(event) {
    const request = event.request;
    if (request.method !== 'GET') return;

    const url = new URL(request.url);

    // API и аудиопотоки не перехватываем: браузер должен управлять Range сам.
    if (url.origin === self.location.origin &&
        (url.pathname.endsWith('/api.php') ||
         url.pathname.endsWith('/download.php') ||
         url.pathname.endsWith('/stream.php') ||
         url.pathname.endsWith('/proxy.php'))) {
        return;
    }

    // PWA запускается мгновенно из shell-кэша даже при очень слабом интернете.
    // Свежая страница параллельно обновляет кэш в фоне.
    if (request.mode === 'navigate') {
        const networkPromise = fetch(request)
            .then(function(response) {
                if (response && response.ok) {
                    const copy = response.clone();
                    caches.open(CACHE_NAME)
                        .then(function(cache) { return cache.put('/index.php', copy); })
                        .catch(function() {});
                }
                return response;
            })
            .catch(function() { return null; });

        event.waitUntil(networkPromise.then(function() {}).catch(function() {}));

        event.respondWith(
            caches.match('/index.php').then(function(cached) {
                if (cached) return cached;
                return networkPromise.then(function(response) {
                    if (response) return response;
                    return caches.match('/');
                });
            })
        );
        return;
    }

    // Внешние шрифты/иконки после первого успешного открытия работают из кэша.
    if (url.origin !== self.location.origin &&
        (request.destination === 'style' || request.destination === 'font')) {
        event.respondWith(
            caches.match(request).then(function(cached) {
                const network = fetch(request)
                    .then(function(response) { return cacheRuntime(request, response); })
                    .catch(function() { return cached || Response.error(); });
                return cached || network;
            })
        );
        return;
    }

    // Локальная статика: cache-first, затем сеть.
    event.respondWith(
        caches.match(request).then(function(cached) {
            if (cached) return cached;
            return fetch(request).then(function(response) {
                if (response.ok && url.origin === self.location.origin) {
                    const copy = response.clone();
                    caches.open(CACHE_NAME)
                        .then(function(cache) { return cache.put(request, copy); })
                        .catch(function() {});
                }
                return response;
            });
        })
    );
});
