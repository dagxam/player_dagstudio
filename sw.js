// sw.js - Service Worker DAGSTUDIO PLAYER PWA
const CACHE_NAME = 'dagstudio-player-shell-v2216';
const RUNTIME_CACHE = 'dagstudio-player-runtime-v2216';

const CORE_ASSETS = [
    '/',
    '/index.php',
    '/style.css?v=2216',
    '/script.js?v=2216',
    '/manifest.json?v=2216',
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

    // Навигация: свежая версия с сервера имеет приоритет.
    // При действительно слабой/пропавшей сети через 8 секунд используем
    // локальную оболочку, чтобы приложение всё равно запускалось.
    if (request.mode === 'navigate') {
        event.respondWith((async function() {
            const cached = await caches.match('/index.php');
            const network = fetch(request, { cache: 'no-store' })
                .then(async function(response) {
                    if (response && response.ok) {
                        const copy = response.clone();
                        const cache = await caches.open(CACHE_NAME);
                        await cache.put('/index.php', copy);
                    }
                    return response;
                })
                .catch(function() { return null; });

            if (!cached) {
                return (await network) || (await caches.match('/'));
            }

            const timeout = new Promise(function(resolve) {
                setTimeout(function() { resolve(null); }, 8000);
            });

            const fresh = await Promise.race([network, timeout]);
            if (fresh) return fresh;

            event.waitUntil(network.then(function() {}).catch(function() {}));
            return cached;
        })());
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
