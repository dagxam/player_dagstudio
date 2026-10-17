import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pathToFileURL } from 'node:url';

const script = fileURLToPath(new URL('../scripts/ios-prepare.mjs', import.meta.url));
const dir = await mkdtemp(join(tmpdir(),'dag-ios-test-'));
try {
  const appDir=join(dir,'ios','App','App');
  await mkdir(appDir,{recursive:true});
  await writeFile(join(appDir,'Info.plist'), `<?xml version="1.0"?>
<plist version="1.0"><dict>
<key>UIBackgroundModes</key><array><string>remote-notification</string></array>
</dict></plist>`);
  await writeFile(join(appDir,'AppDelegate.swift'), `import UIKit
import Capacitor
class AppDelegate: UIResponder, UIApplicationDelegate {
func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
    return true
}
}`);
  const originalCwd=process.cwd();
  try {
    process.chdir(dir);
    for (let i=0;i<2;i++) await import(pathToFileURL(script).href+'?test-run='+i);
  } finally {
    process.chdir(originalCwd);
  }
  const plist=await readFile(join(appDir,'Info.plist'),'utf8');
  const swift=await readFile(join(appDir,'AppDelegate.swift'),'utf8');
  assert.equal((plist.match(/<string>audio<\/string>/g)||[]).length,1);
  assert.match(plist,/<string>remote-notification<\/string>/);
  assert.equal((swift.match(/DAGSTUDIO_BACKGROUND_AUDIO/g)||[]).length,1);
  assert.match(swift,/import AVFoundation/);
  assert.match(swift,/AVAudioSession\.sharedInstance\(\)\.setCategory\(\.playback/);
  const source=await readFile(new URL('../script.js',import.meta.url),'utf8');
  assert.match(source,/NATIVE_PLATFORM === 'ios'\) return \{ status: 'ios-release-required' \}/);
  console.log('IOS_PREPARATION_OK');
} finally {
  await rm(dir,{recursive:true,force:true});
}
