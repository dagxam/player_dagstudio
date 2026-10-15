import { readFile, writeFile } from 'node:fs/promises';
const path = 'android/app/src/main/AndroidManifest.xml';
let xml = await readFile(path, 'utf8');
if (!xml.includes('<application') || !xml.includes('</application>')) {
  throw new Error('Capacitor AndroidManifest.xml does not have application node');
}
const required = ['android.permission.FOREGROUND_SERVICE',
  'android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK','android.permission.WAKE_LOCK'];
for (const permission of required) {
  if (!xml.includes(permission)) {
    xml = xml.replace('<application',
      '<uses-permission android:name="' + permission + '" />\n    <application');
  }
}
const service = '<service android:name="ru.dagstudio.player.DAGMediaService" ' +
  'android:exported="false" android:stopWithTask="false" ' +
  'android:foregroundServiceType="mediaPlayback" />';
if (!xml.includes('DAGMediaService')) xml = xml.replace('</application>',
  '    ' + service + '\n    </application>');
await writeFile(path, xml, 'utf8');
console.log('Android media foreground service configured in manifest');
