import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { copyFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const base=fileURLToPath(new URL('../',import.meta.url));
const root=await mkdtemp(join(tmpdir(),'dag-favorites-api-'));
await copyFile(join(base,'api.php'),join(root,'api.php'));
await copyFile(join(base,'db.php'),join(root,'db.php'));
const socket=createServer();
await new Promise(resolve=>socket.listen(0,'127.0.0.1',resolve));
const port=socket.address().port;
await new Promise(resolve=>socket.close(resolve));
const php=spawn('php',['-S',`127.0.0.1:${port}`,'-t',root],{cwd:root,stdio:'pipe'});
let stderr='';
php.stderr.on('data',bytes=>{stderr+=String(bytes).slice(0,1000);});
const url=`http://127.0.0.1:${port}/api.php`;
let cookie='';
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const post=async(payload,authenticated=true)=>{
  const headers={'Content-Type':'application/json'};
  if(authenticated&&cookie)headers.Cookie=cookie;
  const response=await fetch(url,{method:'POST',headers,body:JSON.stringify(payload)});
  assert.equal(response.status,200);
  const next=response.headers.get('set-cookie');
  if(next && !cookie)cookie=next.split(';')[0];
  const body=await response.text();
  try{return JSON.parse(body);}
  catch{throw Error('Non-JSON PHP reply: '+body.slice(0,400)+' / '+stderr.slice(-400));}
};
try {
  let online=false;
  for(let i=0;i<40;i++){
    if(php.exitCode!==null)throw Error('PHP server exited: '+stderr);
    try{await fetch(url);online=true;break;}catch{await sleep(100);}
  }
  assert.ok(online,'PHP server failed to start: '+stderr);
  const register=await post({action:'register',name:'heart_smoke',pass:'HeartSmoke_2026'});
  assert.equal(register.success,true,'Registration must work');
  assert.ok(cookie.startsWith('PHPSESSID='));
  const regular=await post({action:'create_playlist',name:'Дорога',type:'standard'});
  assert.equal(regular.success,true);
  const original={title:'Мама',artist:'Исполнитель',url:'https://example.org/music/mama.mp3',thumb:''};
  assert.equal((await post({action:'add_track',playlist_id:regular.id,track:original})).success,true);
  const add=await post({action:'set_favorite',liked:true,track:original});
  assert.equal(add.success,true);assert.equal(add.liked,true);
  assert.ok(add.track_id&&add.playlist_id);
  const same=await post({action:'set_favorite',liked:true,track:original});
  assert.equal(same.success,true);assert.equal(same.track_id,add.track_id);
  const sameSong={...original,url:'https://other.example.org/audio.mp3'};
  assert.equal((await post({action:'set_favorite',liked:true,track:sameSong})).success,true);
  let data=await post({action:'get_data'});
  let favorite=data.find(p=>p.type==='favorites');
  let standard=data.find(p=>String(p.id)===String(regular.id));
  assert.ok(favorite);assert.equal(favorite.icon,'heart');
  assert.equal(favorite.tracks.length,1,'No duplicate on repeated favorite tap');
  assert.equal(standard.tracks.length,1,'Normal playlist is not changed by liking');
  const remove=await post({action:'set_favorite',liked:false,track:sameSong});
  assert.equal(remove.success,true);assert.equal(remove.liked,false);
  assert.equal((await post({action:'set_favorite',liked:false,track:original})).success,true);
  data=await post({action:'get_data'});
  favorite=data.find(p=>p.type==='favorites');
  standard=data.find(p=>String(p.id)===String(regular.id));
  assert.equal(favorite.tracks.length,0);
  assert.equal(standard.tracks.length,1,'Unheart never deletes a normal playlist song');
  const denied=await post({action:'set_favorite',liked:true,track:original},false);
  assert.ok(denied.error,'Unauthenticated favorites writes must be refused');
  console.log('FAVORITES_PHP_ADD_UNLIKE_DEDUPE_ACCOUNT_ISOLATION_OK');
} finally {
  php.kill('SIGTERM');
  await rm(root,{recursive:true,force:true});
}
