import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const js=readFileSync(new URL('../profile-sync.js',import.meta.url),'utf8');
const controller=readFileSync(new URL('../script.js',import.meta.url),'utf8');
const native=readFileSync(new URL('../native/native-bridge.js',import.meta.url),'utf8');
const plugin=readFileSync(new URL('../native/android/DAGCarModePlugin.java',import.meta.url),'utf8');
const web=readFileSync(new URL('../index.php',import.meta.url),'utf8');

assert.match(web,/src="profile-sync\.js\?v=\d+" defer/);
assert.match(controller,/DAG_PROFILE_SYNC\?\.start\(currentUser\)/);
assert.match(controller,/DAG_PROFILE_SYNC\?\.refresh/);
assert.match(native,/'get_profile_settings','save_profile_setting'/);
assert.match(plugin,/"get_profile_settings", "save_profile_setting"/);
assert.match(js,/expected_revision: entry\.revision/);

const cloud=new Map();
const clone=x=>JSON.parse(JSON.stringify(x));
function device(initialUser, prefill={}) {
  let user=initialUser, nextTimer=0;
  const store=new Map(Object.entries(prefill)), applied=[],window={};
  const navigator={onLine:true};
  const localStorage={
    getItem:k=>store.has(k)?store.get(k):null,
    setItem:(k,v)=>store.set(k,String(v)),
    removeItem:k=>store.delete(k)
  };
  runInNewContext(js,{window,navigator,localStorage,console,
    setTimeout:()=>++nextTimer,clearTimeout:()=>{}});
  const api=async(action,payload={})=>{
    if(action==='get_profile_settings'){
      const settings={};
      for(const [full,entry] of cloud)
        if(full.startsWith(user+':'))settings[full.slice(user.length+1)]=clone(entry);
      return {success:true,settings};
    }
    assert.equal(action,'save_profile_setting');
    const id=user+':'+payload.key,entry=cloud.get(id);
    const revision=entry?.revision||0;
    if(payload.expected_revision!==revision)return {success:false,conflict:true,
      setting:clone(entry||{value:null,revision:0})};
    cloud.set(id,{value:clone(payload.value),revision:revision+1});
    return {success:true,revision:revision+1};
  };
  window.DAG_PROFILE_SYNC.configure({
    api,getUser:()=>user,
    read:key=>{
      const name=key==='taste'?'dag_taste_v1_'+user:
        key==='likes_exclusions'?'dag_likes_exclusions_v1:'+user:'init:'+key;
      return store.has(name)?JSON.parse(store.get(name)):undefined;
    },
    apply:(key,value)=>{
      applied.push([key,value]);
      if(key==='taste'){
        if(value===undefined)store.delete('dag_taste_v1_'+user);
        else store.set('dag_taste_v1_'+user,JSON.stringify(value));
      }
    }
  });
  return {sync:window.DAG_PROFILE_SYNC,store,applied,navigator,setUser:name=>{user=name;}};
}
const computer=device('alice',{
  'init:smart_radio':'false',
  'init:rainbow_speed':'22',
  'init:equalizer':JSON.stringify({enabled:true,preset:'bass',gains:[7,5,2,0,-1,-2,-2]})
});
assert.equal(computer.sync.change('smart_radio',false),false,'Not logged in yet');
await computer.sync.start('alice');
await computer.sync.flush();
assert.equal(cloud.get('alice:smart_radio').value,false);
assert.equal(cloud.get('alice:equalizer').value.preset,'bass');

const android=device('alice');
await android.sync.start('alice');
assert.equal(android.applied.findLast(row=>row[0]==='smart_radio')[1],false);
assert.equal(android.applied.findLast(row=>row[0]==='equalizer')[1].preset,'bass');

android.sync.change('smart_radio',true);
await android.sync.flush();
await computer.sync.refresh(true);
assert.equal(computer.applied.at(-1)[1],true,'PC receives Android changes');

computer.sync.change('rainbow_speed',30);
android.sync.change('rainbow_speed',34);
await computer.sync.flush();
await android.sync.flush();
assert.equal(cloud.get('alice:rainbow_speed').value,34,'Concurrent edits require version CAS');
assert.equal(cloud.get('alice:rainbow_speed').revision,3);

android.navigator.onLine=false;
android.sync.change('traffic_saver',true);
assert.equal(await android.sync.flush(),false);
assert.equal(cloud.has('alice:traffic_saver'),false);
android.navigator.onLine=true;
await android.sync.refresh(true);
await android.sync.flush();
assert.equal(cloud.get('alice:traffic_saver').value,true,'Offline changes resume syncing');

const bobTaste={tracks:{bob:{score:1,at:1}},artists:{},genres:{},regions:{}};
android.store.set('dag_taste_v1_bob',JSON.stringify(bobTaste));
android.sync.signOut();
android.setUser('bob');
await android.sync.start('bob');
assert.deepEqual(JSON.parse(android.store.get('dag_taste_v1_bob')),bobTaste,
  'Another account must retain its existing taste profile');
assert.ok(android.applied.some(row=>row[0]==='smart_radio'&&row[1]===undefined),
  'New account cannot inherit global settings from previous user');
await android.sync.flush();
assert.equal(cloud.get('bob:taste').value.tracks.bob.score,1);
assert.equal(cloud.get('alice:smart_radio').value,true);
android.sync.signOut();
assert.equal(android.sync.change('smart_radio',false),false,'Signed-out settings stay local');
console.log('CLOUD_PROFILE_DESKTOP_ANDROID_CAS_OFFLINE_AND_ACCOUNT_ISOLATION_OK');
