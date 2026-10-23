import { cp, copyFile, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as esbuild } from 'esbuild';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'www');
const assetsDir = join(root, 'assets');
const buildVersion = process.env.DAG_NATIVE_BUILD_VERSION || process.env.GITHUB_SHA || 'dev';

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

let html = await readFile(join(root, 'index.php'), 'utf8');
if (html.includes('<?php')) {
  throw new Error('index.php contains PHP code and cannot be packaged directly into the native shell.');
}

// PWA-only metadata is unnecessary inside Capacitor.
html = html
  .replace(/<html lang="ru"(?: class="([^"]*)")?>/,
    (_, classes = '') => `<html lang="ru" class="${classes} native-app">`)
  .replace('</head>', `    <script>window.DAG_NATIVE_APP = true; window.DAG_NATIVE_BUILD_VERSION = ${JSON.stringify(buildVersion)}; window.DAG_NATIVE_BUILD_COMMIT = ${JSON.stringify(process.env.GITHUB_SHA || "")};</script>\n</head>`)
  .replace(/\s*<link rel="manifest"[^>]*>\s*/i, '\n')
  // Local Font Awesome is referenced directly by index.php.
  .replace(
    /<button id="pwa-install-btn"[\s\S]*?<\/button>/i,
    ''
  )
  .replace(
    /<script src="script\.js\?v=[^"]+" defer><\/script>/i,
    `<script src="native-bridge.js"></script>
<script src="native-audio-adapter.js"></script>
<script>
window.DAG_MEDIA3_ENABLED = false;
Promise.race([
  window.DAG_NATIVE_BRIDGE.audioPlayer.status().then(() => true).catch(() => false),
  new Promise(resolve => setTimeout(() => resolve(false), 2500))
]).then(supported => {
  window.DAG_MEDIA3_ENABLED = supported;
  const script = document.createElement('script');
  script.src = 'script.js';
  document.body.appendChild(script);
});
</script>`
  );

// Defer the studio UI until the main audio/controller script is loaded.
// Native Media3 capability detection injects script.js asynchronously, whereas
// studio.js normally has "defer". Loading the UI too early can lose playlist state.
html = html.replace(/\s*<script src="studio\.js\?v=[^"]+" defer><\/script>/i, '');
html = html.replace(/\s*<script src="studio-next\.js\?v=[^"]+" defer><\/script>/i, '');
html = html.replace(/\s*<script src="studio-center\.js\?v=[^"]+" defer><\/script>/i, '');
html = html.replace(
  'document.body.appendChild(script);',
  `script.addEventListener('load', () => {
  const ui = document.createElement('script');
  ui.src = 'studio.js';
  ui.addEventListener('load', () => {
    const showcase = document.createElement('script');
    showcase.src = 'studio-next.js';
    showcase.addEventListener('load',()=>{
      const center=document.createElement('script');
      center.src='studio-center.js';
      document.body.appendChild(center);
    });
    document.body.appendChild(showcase);
  });
  document.body.appendChild(ui);
});
document.body.appendChild(script);`
);

// Root-relative images should stay inside the APK web root.
html = html.replace(/(href|src)="\/images\//g, '$1="images/');

if (!html.includes('href="vendor/fontawesome/css/all.min.css?v=6722"') ||
    /cdnjs\.cloudflare\.com\/ajax\/libs\/font-awesome\//i.test(html)) {
  throw new Error('Native HTML must use the local Font Awesome stylesheet, never CDN.');
}
await writeFile(join(out, 'index.html'), html, 'utf8');
await copyFile(join(root, 'script.js'), join(out, 'script.js'));
await copyFile(join(root, 'native', 'native-audio-adapter.js'), join(out, 'native-audio-adapter.js'));
await copyFile(join(root, 'style.css'), join(out, 'style.css'));
await copyFile(join(root, 'modern.css'), join(out, 'modern.css'));
await copyFile(join(root, 'studio.css'), join(out, 'studio.css'));
await copyFile(join(root, 'studio.js'), join(out, 'studio.js'));
await copyFile(join(root, 'studio-next.css'), join(out, 'studio-next.css'));
await copyFile(join(root, 'studio-touch.css'), join(out, 'studio-touch.css'));
await copyFile(join(root, 'studio-next.js'), join(out, 'studio-next.js'));
await copyFile(join(root, 'studio-center.js'), join(out, 'studio-center.js'));

await esbuild({
  entryPoints: [join(root, 'native', 'native-bridge.js')],
  bundle: true,
  minify: true,
  platform: 'browser',
  format: 'iife',
  target: ['es2017'],
  outfile: join(out, 'native-bridge.js')
});
await cp(join(root, 'images'), join(out, 'images'), { recursive: true });

// Ship the exact same self-hosted font version in website, OTA and APK.
const faRoot = join(root, 'vendor', 'fontawesome');
for (const name of ['fa-solid-900', 'fa-regular-400', 'fa-brands-400']) {
  const font = await stat(join(faRoot, 'webfonts', name + '.woff2'));
  if (font.size < 10000) throw new Error('Missing Font Awesome ' + name);
}
await cp(faRoot, join(out, 'vendor', 'fontawesome'), { recursive: true });

// @capacitor/assets Easy Mode: one 1024×1024 source generates Android/iOS icons and splash assets.
await rm(assetsDir, { recursive: true, force: true });
await mkdir(assetsDir, { recursive: true });
await copyFile(join(root, 'images', 'icon.png'), join(assetsDir, 'logo.png'));

console.log('Native web shell prepared in www/');
