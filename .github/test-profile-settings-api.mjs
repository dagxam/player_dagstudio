import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {copyFileSync,mkdtempSync,rmSync} from 'node:fs';
import {join,resolve,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {createServer} from 'node:net';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const dir=mkdtempSync(join(tmpdir(),'dag-profile-settings-'));
for(const file of ['api.php','db.php','hitmos-config.php','openverse-provider.php','partner-config.php','catalog-2026.php'])
  copyFileSync(join(root,file),join(dir,file));
const socket=createServer();
await new Promise(resolve=>socket.listen(0,'127.0.0.1',resolve));
const port=socket.address().port;
await new Promise(resolve=>socket.close(resolve));
const url='http://127.0.0.1:'+port+'/api.php';
const php=spawn('php',['-S','127.0.0.1:'+port,'-t',dir],{cwd:dir,stdio:'ignore'});
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function post(payload,token=''){
  const headers={'Content-Type':'application/json'};
  if(token)headers['X-DAG-Session']=token;
  const response=await fetch(url,{method:'POST',headers,body:JSON.stringify(payload)});
  return {status:response.status,data:await response.json()};
}
try {
  let ready=false;
  for(let i=0;i<30;i++){
    try {await post({action:'check_auth'});ready=true;break;}
    catch(_) {await wait(100);}
  }
  assert.equal(ready,true,'PHP API must start');
  const alice=await post({action:'register',name:'profile_alice',pass:'PassWord123'});
  assert.equal(alice.data.success,true);
  const token1=alice.data.session_token;
  const empty=await post({action:'get_profile_settings'},token1);
  assert.deepEqual(empty.data.settings,{});

  const saved=await post({action:'save_profile_setting',key:'equalizer',
    value:{enabled:true,preset:'bass',gains:[7,5,2,0,-1,-2,-2]},
    expected_revision:0},token1);
  assert.equal(saved.data.success,true);assert.equal(saved.data.revision,1);
  const second=await post({action:'login',name:'profile_alice',pass:'PassWord123'});
  assert.equal(second.data.success,true);
  const token2=second.data.session_token;
  const same=await post({action:'get_profile_settings'},token2);
  assert.equal(same.data.settings.equalizer.value.preset,'bass');
  assert.equal(same.data.settings.equalizer.revision,1);
  const lean=await post({action:'get_profile_settings',known_revisions:{equalizer:1}},token2);
  assert.equal(lean.data.settings.equalizer.unchanged,true);
  assert.equal('value' in lean.data.settings.equalizer,false,'Do not retransmit large unchanged settings');

  const next=await post({action:'save_profile_setting',key:'equalizer',
    value:{enabled:true,preset:'rock',gains:[4,2,-1,1,3,4,3]},
    expected_revision:1},token2);
  assert.equal(next.data.revision,2);
  const stale=await post({action:'save_profile_setting',key:'equalizer',
    value:{enabled:false,preset:'flat',gains:[0,0,0,0,0,0,0]},
    expected_revision:1},token1);
  assert.equal(stale.data.conflict,true);
  assert.equal(stale.data.setting.revision,2);
  assert.equal(stale.data.setting.value.preset,'rock');

  const cleared=await post({action:'save_profile_setting',key:'likes_exclusions',
    value:{},expected_revision:0},token1);
  assert.equal(cleared.data.success,true,'Empty object must be savable');
  const again=await post({action:'get_profile_settings'},token2);
  assert.equal(Array.isArray(again.data.settings.likes_exclusions.value),false);
  assert.deepEqual(again.data.settings.likes_exclusions.value,{});

  const forbidden=await post({action:'save_profile_setting',key:'session_token',
    value:'malicious',expected_revision:0},token1);
  assert.equal(forbidden.status,400);
  const unauth=await post({action:'get_profile_settings'});
  assert.equal(unauth.status,401,'Guest must not access preferences');

  const bob=await post({action:'register',name:'profile_bob',pass:'PassWord123'});
  assert.equal(bob.data.success,true);
  const b=await post({action:'get_profile_settings'},bob.data.session_token);
  assert.deepEqual(b.data.settings,{},'Each account owns a separate set of settings');
  const aliceStill=await post({action:'get_profile_settings'},token1);
  assert.equal(aliceStill.data.settings.equalizer.value.preset,'rock');
  console.log('PROFILE_PHP_SQLITE_TWO_DEVICES_REVISION_CONFLICT_ISOLATION_OK');
} finally {
  php.kill('SIGTERM');
  await wait(100);
  rmSync(dir,{recursive:true,force:true});
}