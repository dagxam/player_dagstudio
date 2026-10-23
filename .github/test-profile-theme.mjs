import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const source=readFileSync(new URL('../script.js',import.meta.url),'utf8');
const start=source.indexOf('let themeLocalChangeEpoch=0;');
const end=source.indexOf('\nfunction setTheme(',start);
assert.ok(start>0&&end>start);
let applied=[],remote='blue',calls=0;
const storage=new Map([['dag_theme','brown']]);
const ctx={
 Date,Promise,console,navigator:{onLine:true},currentUser:'tester',
 localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},
 colorThemes:{brown:{},red:{},blue:{},green:{}},
 api:async action=>{assert.equal(action,'check_auth');calls++;
   return {logged_in:true,username:'tester',theme:remote};},
 setTheme:(name,save)=>{applied.push([name,save]);storage.set('dag_theme',name);}
};
runInNewContext(source.slice(start,end)+
 '\nglobalThis.test={synchronizeProfileTheme,themeEpoch:()=>themeLocalChangeEpoch};',ctx);
await ctx.test.synchronizeProfileTheme(true);
assert.equal(storage.get('dag_theme'),'blue');
assert.equal(applied.length,1);assert.equal(applied[0][1],false);
await ctx.test.synchronizeProfileTheme();
assert.equal(calls,1,'Polling must be rate limited');
remote='red';
await ctx.test.synchronizeProfileTheme(true);
assert.equal(storage.get('dag_theme'),'red');
ctx.currentUser=null;
await ctx.test.synchronizeProfileTheme(true);
assert.equal(calls,2,'Never access profile when signed out');
assert.match(source,/addEventListener\('dag-native-state'/);
assert.match(source,/setInterval\(\(\)=>\{/);
assert.match(source,/loadUserData\(true\)/);
assert.match(source,/themeLocalChangeEpoch\+\+/);
console.log('PROFILE_THEME_CROSS_DEVICE_REFRESH_AND_SESSION_GUARDS_OK');