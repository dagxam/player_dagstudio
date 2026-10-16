import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';

const root=resolve('ios/App/App');
const plistPath=resolve(root,'Info.plist');
const appDelegatePath=resolve(root,'AppDelegate.swift');
let plist=await readFile(plistPath,'utf8');
if(!plist.includes('UIBackgroundModes')){
    if(!plist.includes('<dict>'))throw Error('Unexpected iOS Info.plist format');
    plist=plist.replace('<dict>','<dict>\n\t<key>UIBackgroundModes</key>\n\t<array>\n\t\t<string>audio</string>\n\t</array>');
    await writeFile(plistPath,plist);
}
let app=await readFile(appDelegatePath,'utf8');
if(!app.includes('import AVFoundation')){
    if(!app.includes('import UIKit'))throw Error('Missing UIKit import');
    app=app.replace('import UIKit','import UIKit\nimport AVFoundation');
}
if(!app.includes('DAGSTUDIO_BACKGROUND_AUDIO')){
    const pattern=/(func application\([\s\S]{0,700}?didFinishLaunchingWithOptions[\s\S]{0,200}?\)\s*->\s*Bool\s*\{)/;
    if(!pattern.test(app))throw Error('Unknown AppDelegate startup method; configure AVAudioSession manually');
    app=app.replace(pattern,match=>match+
      '\n        // DAGSTUDIO_BACKGROUND_AUDIO: native playback session. Physical-device verification required.\n'+
      '        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .default, options: [])\n');
}
await writeFile(appDelegatePath,app);
console.log('iOS playback session and audio background mode prepared');
