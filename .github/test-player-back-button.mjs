import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const vision=read('studio-vision.js'),css=read('studio-sidebar-modern.css'),html=read('index.php'),sw=read('sw.js'),script=read('script.js');
const start=vision.indexOf('  const goBackFromPlayer = () => {');
const end=vision.indexOf('  const back = button(',start);
assert.ok(start>0&&end>start,'Back action is defined before button construction');
const fnSource=vision.slice(start,end)+'\nglobalThis.goBack=goBackFromPlayer;';
assert.match(vision,/button\('vision-player-back', 'Назад', 'arrow-left', goBackFromPlayer\)/);
assert.match(vision,/back\.appendChild\(el\('span', 'vision-back-label', 'Назад'\)\)/);
assert.doesNotMatch(vision,/button\('vision-player-back'[^\n]*'chevron-down'/);
function scenario(mode){
  const classes=new Set(mode==='mix'||mode==='wave'?['vision-player-expanded','showcase-wave-only']:['vision-player-expanded']);
  const dataset=mode==='mix'?{activeMix:'caucasus'}:{};
  let destinations=[],collapsed=0,rendered=0,updates=0;
  const state={root:{classList:{contains:n=>classes.has(n),remove:n=>classes.delete(n)},dataset},
    window:{studioCenterRender:name=>destinations.push(name),studioShowCurated:()=>rendered++},
    collapsePlayer:()=>{collapsed++;classes.delete('vision-player-expanded');},
    updateNav:()=>updates++};
  runInNewContext(fnSource,state);
  state.goBack();
  return {classes,dataset,destinations,collapsed,updates,rendered};
}
const list=scenario('list');
assert.equal(list.collapsed,1);
assert.equal(list.destinations.length,0,'Playlist/search/likes/offline keep their existing list');
assert.ok(!list.classes.has('vision-player-expanded'));
const wave=scenario('wave');
assert.deepEqual(wave.destinations,['home'],'Wave returns to the home screen');
assert.ok(!wave.classes.has('showcase-wave-only'));
const mix=scenario('mix');
assert.deepEqual(mix.destinations,['collections'],'A collection mix goes back to collections');
assert.equal(mix.dataset.activeMix,undefined,'Mix metadata is cleared');
assert.match(css,/\.vision-ui\.vision-player-expanded>\.vision-player-back,/);
assert.match(css,/\.vision-ui\.showcase-wave-only>\.vision-player-back/);
assert.match(css,/\.vision-player-back:focus-visible/);
assert.match(css,/@media\(max-width:768px\)/);
assert.match(css,/width:48px!important;min-width:48px!important/);
assert.match(read('studio-center.js'),/selectNav\(mode==='home'\?'wave':'collections'\)/);
assert.match(html,/studio-center\.js\?v=9/);
assert.match(html,/studio-vision\.js\?v=14/);
assert.match(html,/studio-sidebar-modern\.css\?v=11/);
assert.match(sw,/studio-vision\.js\?v=14/);
assert.match(sw,/studio-sidebar-modern\.css\?v=11/);
assert.match(html,/script\.js\?v=2392/);
assert.match(sw,/dagstudio-player-shell-v2409/);
assert.match(script,/WEB_BUILD_LABEL = '2392'/);
console.log('BACK_BUTTON_RESTORES_CONTEXT_AND_STOPS_NO_AUDIO_OK');
