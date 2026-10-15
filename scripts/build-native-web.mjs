import { cp, copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
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
  .replace('<html lang="ru">', '<html lang="ru" class="native-app">')
  .replace('</head>', `    <script>window.DAG_NATIVE_APP = true; window.DAG_NATIVE_BUILD_VERSION = ${JSON.stringify(buildVersion)};</script>\n</head>`)
  .replace(/\s*<link rel="manifest"[^>]*>\s*/i, '\n')
  .replace(
    /<link rel="stylesheet" href="https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/font-awesome\/[^"]+\/css\/all\.min\.css">/i,
    '<link rel="stylesheet" href="vendor/fontawesome/css/all.min.css">'
  )
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

// Root-relative images should stay inside the APK web root.
html = html.replace(/(href|src)="\/images\//g, '$1="images/');

await writeFile(join(out, 'index.html'), html, 'utf8');
await copyFile(join(root, 'script.js'), join(out, 'script.js'));
await copyFile(join(root, 'native', 'native-audio-adapter.js'), join(out, 'native-audio-adapter.js'));
await copyFile(join(root, 'style.css'), join(out, 'style.css'));
await copyFile(join(root, 'modern.css'), join(out, 'modern.css'));

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

const faRoot = join(root, 'node_modules', '@fortawesome', 'fontawesome-free');
await mkdir(join(out, 'vendor', 'fontawesome', 'css'), { recursive: true });
await cp(join(faRoot, 'webfonts'), join(out, 'vendor', 'fontawesome', 'webfonts'), { recursive: true });
await copyFile(join(faRoot, 'css', 'all.min.css'), join(out, 'vendor', 'fontawesome', 'css', 'all.min.css'));

// @capacitor/assets Easy Mode: one 1024×1024 source generates Android/iOS icons and splash assets.
await rm(assetsDir, { recursive: true, force: true });
await mkdir(assetsDir, { recursive: true });
await copyFile(join(root, 'images', 'icon.png'), join(assetsDir, 'logo.png'));

console.log('Native web shell prepared in www/');
