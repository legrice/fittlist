import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
if(fs.existsSync('.release/android/signing.json')) {const saved=JSON.parse(fs.readFileSync('.release/android/signing.json','utf8'));for(const name of ['FITT_ANDROID_KEYSTORE','FITT_ANDROID_STORE_PASSWORD','FITT_ANDROID_KEY_ALIAS','FITT_ANDROID_KEY_PASSWORD']) if(!process.env[name]) process.env[name]=saved[name];}
process.env.JAVA_HOME ||= '/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home';
process.env.ANDROID_HOME ||= '/private/tmp/fittlist-android-sdk';
const run=(cmd,args,options={})=>{const result=spawnSync(cmd,args,{stdio:'inherit',...options});if(result.status!==0)process.exit(result.status||1);};
for(const name of ['FITT_ANDROID_KEYSTORE','FITT_ANDROID_STORE_PASSWORD','FITT_ANDROID_KEY_ALIAS','FITT_ANDROID_KEY_PASSWORD']) assert(process.env[name],`Set ${name} for release signing; see docs/ANDROID_BETA.md`);
assert(fs.existsSync(process.env.FITT_ANDROID_KEYSTORE),'Upload keystore must exist');
run('npx',['cap','sync','android']);
run(process.execPath,['scripts/check-android-release.mjs','--require-firebase']);
run('./gradlew',['bundleRelease','--no-daemon'],{cwd:'android'});
const artifact='android/app/build/outputs/bundle/release/app-release.aab';
assert(fs.existsSync(artifact),'Release bundle must exist');
const verified=spawnSync(`${process.env.JAVA_HOME}/bin/jarsigner`,["-verify",artifact],{encoding:"utf8",env:{...process.env,LC_ALL:"C"}});
assert.equal(verified.status,0,"Bundle signature verification failed");
assert(/jar verified/i.test(verified.stdout) && !/jar is unsigned/i.test(verified.stdout),"Bundle must contain a verified release signature");
console.log(`Signed Google Play bundle: ${artifact}`);
