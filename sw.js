// sw.js - Service Worker DAGSTUDIO PLAYER PWA
const CACHE_NAME = 'dagstudio-player-shell-v2407';
const RUNTIME_CACHE = 'dagstudio-player-runtime-v2297';

const CORE_ASSETS = [
    '/',
    '/index.php',
    '/style.css?v=2229',
    '/modern.css?v=16',
    '/profile-sync.js?v=1',
    '/script.js?v=2390',
    '/studio.css?v=6',
    '/studio.js?v=8',
    '/studio-next.css?v=23',
    '/studio-next.js?v=21',
    '/studio-center.js?v=9',
    '/studio-touch.css?v=12',
    '/studio-vision.css?v=13',
    '/studio-sidebar-modern.css?v=11',
    '/search-polish.css?v=1',
    '/studio-vision.js?v=13',
    '/images/vision-hero.svg',
    '/vendor/fontawesome/css/all.min.css?v=6722',
    '/vendor/fontawesome/webfonts/fa-solid-900.woff2',
    '/vendor/fontawesome/webfonts/fa-regular-400.woff2',
    '/vendor/fontawesome/webfonts/fa-brands-400.woff2',
    '/images/studio-wave.svg',
    '/images/studio-sunset.svg',
    '/manifest.json?v=2217',
    '/images/faviconch.png',
    '/images/icon-192.png',
    '/images/cover.png'
];

// Icon CSS and font files are cached locally above; no optional CDN calls.

// Never use a version-specific HTML substring for navigation: an older
// controlling worker may see a newer, perfectly valid deployment. The strict
// same-build check below remains in install() before promoting a new worker.
function isPlayerShellHtml(html) {
    return /<script\b[^>]*\bsrc=["']\/?script\.js\?v=\d+(?:-[a-f0-9]{12})?["'][^>]*>/i.test(String(html || '')) &&
        /\bid=["']app-update-btn["']/i.test(String(html || ''));
}

async function findCachedPlayerShell() {
    // Root and index.php are both precached. A successful connection to either
    // route must be enough to open the installed PWA when DNS fails later.
    for (const path of ['/index.php', '/']) {
        const response = await caches.match(path);
        if (!response || !response.ok) continue;
        try {
            if (isPlayerShellHtml(await response.clone().text())) return response;
        } catch (_) {}
    }
    return null;
}


// Do not promote a new service worker when a partial FTP deployment has
// served old HTML, a missing controller or a network error. Keep the previous
// working SW installed instead of replacing it with a broken shell.
self.addEventListener('install', function(event) {
    event.waitUntil((async function() {
        const cache=await caches.open(CACHE_NAME);
        await Promise.all(CORE_ASSETS.map(function(asset) {
            return cache.add(asset).catch(function() { return null; });
        }));
        const index=await cache.match('/index.php');
        const controller=await cache.match('/script.js?v=2390');
        if (!index || !controller ||
            !(await index.text()).includes('script.js?v=2390') ||
            !(await controller.text()).includes("WEB_BUILD_LABEL = '2390'")) {
            await caches.delete(CACHE_NAME);
            throw new Error('PWA update deferred: incomplete web deployment');
        }
        return self.skipWaiting();
    })());
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

    // Media Range, аудио и видео не пропускаем через общий cache-first.
    if (request.headers.has('range') || request.destination === 'audio' ||
        request.destination === 'video' ||
        /\.(mp3|m4a|aac|ogg|opus|wav|flac|mp4|webm)$/i.test(url.pathname)) return;

    // The deployment marker must always come from the network, never SW cache.
    if (url.origin === self.location.origin && url.pathname === '/deploy-version.txt') return;

    // API и аудиопотоки не перехватываем: браузер должен управлять Range сам.
    if (url.origin === self.location.origin &&
        (url.pathname.endsWith('/api.php') ||
         url.pathname.endsWith('/download.php') ||
         url.pathname.endsWith('/stream.php') ||
         url.pathname.endsWith('/proxy.php'))) {
        return;
    }

    // APK downloads and version manifests are never player-shell navigation
    // and must never be served from a stale runtime cache.
    if (url.origin === self.location.origin &&
        (url.pathname === '/apk-download.php' || url.pathname.startsWith('/apk/'))) return;

    // Навигация: сеть получает короткий шанс обновить оболочку, но установленная
    // PWA ждёт свежий HTML до 3 секунд, затем переходит в офлайн-режим.
    if (request.mode === 'navigate') {
        event.respondWith((async function() {
            const cached = await findCachedPlayerShell();
            const network = fetch(request, { cache: 'no-store' })
                .then(async function(response) {
                    if (!response || !response.ok) return null;
                    const html = await response.clone().text();
                    if (!isPlayerShellHtml(html)) return null;
                    // Keep BOTH entry points available when a newer deployment
                    // arrives; no cache is destroyed before a valid replacement.
                    const cache = await caches.open(CACHE_NAME);
                    await cache.put('/index.php', response.clone());
                    await cache.put('/', response.clone());
                    return response;
                })
                .catch(function() { return null; });

            if (!cached) {
                const fresh = await network;
                if (fresh) return fresh;
                const recovered = await findCachedPlayerShell();
                if (recovered) return recovered;
                // A genuinely unconnected, never-successfully-installed PWA
                // cannot invent offline HTML. Tell the user how to retry.
                return new Response(
                    '<!doctype html><html lang="ru"><meta charset="utf-8">' +
                    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
                    '<title>DAGSTUDIO PLAYER — нет соединения</title>' +
                    '<body style="background:#10121b;color:#fff;font:16px system-ui;padding:32px;max-width:480px;margin:10vh auto">' +
                    '<h1>Нет соединения</h1><p>Не удалось загрузить сайт и сохранённую копию приложения. ' +
                    'Проверьте интернет и повторите открытие.</p>' +
                    '<button style="padding:14px 22px;border:0;border-radius:12px;background:#e9b179;color:#111;font-weight:700" ' +
                    'onclick="location.reload()">Повторить</button></body></html>', {
                        status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control':'no-store' }
                    });
            }

            const timeout = new Promise(function(resolve) {
                setTimeout(function() { resolve(null); }, 3000);
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

    // CSS/JS/manifest: сначала пробуем свежий файл. В офлайне и на слабом
    // интернете быстро возвращаем сохранённую копию без долгой блокировки.
    if (url.origin === self.location.origin &&
        /\.(css|js|json)$/.test(url.pathname)) {
        event.respondWith((async function() {
            const cached = await caches.match(request);
            const network = fetch(request, { cache: 'no-store' })
                .then(async function(response) {
                    if(!response || !response.ok)return null;
                    const cache=await caches.open(CACHE_NAME);
                    await cache.put(request,response.clone());
                    return response;
                })
                .catch(function() { return null; });
            if (!cached) return (await network) || new Response('Файл временно недоступен', {
                status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}
            });
            const timeout = new Promise(function(resolve) {
                setTimeout(function() { resolve(null); }, 1600);
            });
            const fresh = await Promise.race([network, timeout]);
            if (fresh) return fresh;
            event.waitUntil(network.then(function() {}).catch(function() {}));
            return cached;
        })());
        return;
    }

    // Do not intercept unrelated cross-origin fetches or extension requests.
    if (url.origin !== self.location.origin) return;

    // Остальная локальная статика: cache-first, затем сеть.
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
            }).catch(function(error) {
                // A rejected network request must never become an unhandled
                // FetchEvent rejection; the cache can still serve an offline icon.
                return caches.match(request).then(function(fallback) {
                    return fallback || Response.error();
                });
            });
        }).catch(function() { return Response.error(); })
    );
});
