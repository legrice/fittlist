import assert from 'node:assert/strict';
import fs from 'node:fs';
const config=JSON.parse(fs.readFileSync('android/app/src/main/assets/capacitor.config.json','utf8'));
assert.equal(config.appId,'co.fittlist.app');
assert.equal(config.server.url,'https://www.fittlist.co');
assert.equal(config.server.cleartext,false);
assert.equal(config.android.allowMixedContent,false);
assert.equal(config.android.webContentsDebuggingEnabled,false);
assert.equal(config.loggingBehavior,'none');
assert.deepEqual(config.server.allowNavigation,['fittlist.co','www.fittlist.co']);
const manifest=fs.readFileSync('android/app/src/main/AndroidManifest.xml','utf8');
assert(manifest.includes('android:allowBackup="false"'));
assert(manifest.includes('android:usesCleartextTraffic="false"'));
assert(manifest.includes('android:autoVerify="true"'));
assert(!manifest.includes('android:debuggable="true"'));
const gradle=fs.readFileSync('android/variables.gradle','utf8');
assert(/targetSdkVersion = 36/.test(gradle));
if(process.argv.includes('--require-firebase')){
 const firebase=JSON.parse(fs.readFileSync('android/app/google-services.json','utf8'));
 assert(firebase.client.some(client=>client.client_info?.android_client_info?.package_name==='co.fittlist.app'),'Firebase must register co.fittlist.app');
 assert(firebase.project_info?.project_id,'Firebase project ID required');
}
console.log('PASS Android release configuration: app ID, canonical origin, HTTPS, debug policy, backup policy, app links and target SDK');
