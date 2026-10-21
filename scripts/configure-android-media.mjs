import { readFile, writeFile, mkdir } from 'node:fs/promises';

const path = 'android/app/src/main/AndroidManifest.xml';
let xml = await readFile(path, 'utf8');
if (!xml.includes('<application') || !xml.includes('</application>')) {
  throw new Error('Capacitor AndroidManifest.xml does not have application node');
}
const required = [
  'android.permission.REQUEST_INSTALL_PACKAGES',
  'android.permission.FOREGROUND_SERVICE',
  'android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK',
  'android.permission.WAKE_LOCK'
];
for (const permission of required) {
  if (!xml.includes(permission)) {
    xml = xml.replace('<application',
      '<uses-permission android:name="' + permission + '" />\n    <application');
  }
}

const service = '<service android:name="ru.dagstudio.player.DAGMediaService" ' +
  'android:exported="false" android:stopWithTask="false" ' +
  'android:foregroundServiceType="mediaPlayback" />';
if (!xml.includes('DAGMediaService')) {
  xml = xml.replace('</application>', '    ' + service + '\n    </application>');
}

// Authority is derived by Gradle for both Preview and production application IDs.
const provider = '<provider android:name="androidx.core.content.FileProvider" ' +
  'android:authorities="' + '$' + '{applicationId}.dagstudio.updates" ' +
  'android:exported="false" android:grantUriPermissions="true">' +
  '<meta-data android:name="android.support.FILE_PROVIDER_PATHS" ' +
  'android:resource="@xml/dagstudio_update_paths" /></provider>';
if (!xml.includes('.dagstudio.updates')) {
  xml = xml.replace('</application>', '    ' + provider + '\n    </application>');
}
await writeFile(path, xml, 'utf8');

await mkdir('android/app/src/main/res/xml', { recursive: true });
await writeFile('android/app/src/main/res/xml/dagstudio_update_paths.xml',
  '<?xml version="1.0" encoding="utf-8"?>\n' +
  '<paths xmlns:android="http://schemas.android.com/apk/res/android">' +
  '<cache-path name="updates" path="dag-updates/" /></paths>\n', 'utf8');

console.log('Android media foreground service and APK FileProvider configured');
