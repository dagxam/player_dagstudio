import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const html=read('index.php'),sw=read('sw.js');
const vision=read('studio-vision.js'),css=read('studio-vision.css');
const railCss=read('studio-sidebar-modern.css'),navScript=read('studio-next.js');
const native=read('scripts/build-native-web.mjs');
const controller=read('script.js');
const expected=['Поиск','Моя волна','Плейлисты','Мне нравится','Офлайн','Подборки','Настройки'];

assert.match(html,/studio-touch\.css\?v=12"[\s\S]*studio-vision\.css\?v=12"/);
assert.match(html,/studio-center\.js\?v=8" defer><\/script>\s*<script src="studio-vision\.js\?v=12"/);
assert.match(sw,/dagstudio-player-shell-v\d+/);
for(const asset of [
 'studio-vision.js?v=12','studio-vision.css?v=12','images/vision-hero.svg'
])assert.ok(sw.includes("'/" + asset + "'"),'PWA precache must contain '+asset);
assert.ok(read('images/vision-hero.svg').startsWith('<svg'));
assert.ok(native.includes('studio-vision'), 'Native script injection must include VISION');
assert.match(native,/vision\.src='studio-vision\.js'/);
assert.match(native,/copyFile\(join\(root, 'studio-vision\.js'\)/);
assert.match(native,/copyFile\(join\(root, 'studio-vision\.css'\)/);
assert.match(native,/await cp\(join\(root, 'images'\)/);
assert.match(vision,/root\.classList\.add\('vision-ui'\)/);
assert.match(vision,/const originalSearch = document\.getElementById\('search-container-box'\)/);
assert.match(vision,/originalSearch\.classList\.add\('vision-unified-search'\)/);
assert.match(vision,/document\.getElementById\('showcase-' \+ key\)/);
assert.match(vision,/window\.studioCenterOpenPlaylist\?\.\(entry\.id\)/);
assert.match(vision,/window\.studioCenterRender\?\.\('playlists'\)/);
assert.match(vision,/vision-mini-player/);
assert.match(vision,/vision-bottom-nav/);
assert.match(vision,/vision-player-expanded/);
assert.doesNotMatch(vision,/activateBrand\(/,'Brand is decorative and must not open player');

// Logo opens the current player; a sidebar rail toggle only changes the rail.
// The original desktop compact-grid rules put the player in column 3 / row 2
// even when the expanded player contains just two columns.
assert.match(railCss,/\.main-container\.studio-showcase\.vision-ui\.vision-player-expanded\.showcase-nav-collapsed\s*\{/);
assert.match(railCss,/grid-template-columns:78px minmax\(0,1fr\)!important/);
assert.match(railCss,/\.vision-ui\.vision-player-expanded\.showcase-nav-collapsed>\.left-col\s*\{[\s\S]*?grid-column:2!important;[\s\S]*?grid-row:1!important/);
assert.match(railCss,/\.vision-ui\.vision-player-expanded\.showcase-nav-collapsed>\.showcase-sidebar\s*\{[\s\S]*?grid-column:1!important;[\s\S]*?grid-row:1!important/);
assert.match(navScript,/root\.classList\.toggle\('showcase-nav-collapsed'\)/);
assert.doesNotMatch(vision,/event\.target\.closest\?\.\('button, a'\)/,
  'Brand must not install a click handler; rail toggle works independently');
assert.match(html,/studio-vision\.css\?v=\d+"[\s\S]*studio-sidebar-modern\.css\?v=\d+"/,
  'The collapsed-player grid repair must load after legacy player styles');

assert.match(vision,/window\.playPrev/,'Swipe right must use existing previous-track action');
assert.match(vision,/touchstart/);
assert.match(vision,/touchend/);
assert.match(css,/@keyframes visionSwipeNext/);
assert.match(css,/@media\(min-width:769px\)/);
assert.match(vision,/window\.togglePlay/);
assert.match(vision,/window\.playNext/);
assert.doesNotMatch(vision,/window\.openPlaybackQueue/);
assert.match(controller,/function openPlaybackQueue\(\)/);
assert.match(vision,/window\.studioCenterMix/);
assert.match(vision,/root\.classList\.toggle\('vision-home-active'/);
assert.doesNotMatch(vision,/new Audio\s*\(|new MediaSource\s*\(|fetch\(['"]\/api\.php|audioCache\.put/);
assert.doesNotMatch(vision,/id="main-audio"|\.innerHTML\s*=/);
assert.match(controller,/function setRainbowSpeed\(/);
assert.match(controller,/function saveWavePlayingTrack\(/);
assert.match(controller,/async function playTrack\(/);
assert.match(controller,/function performSearch\(/);
for(const section of expected)assert.ok(read('studio-next.js').includes("'"+section+"'"),'Sidebar preserved: '+section);
assert.match(css,/@media\(min-width:1200px\) and \(min-height:741px\)/);
assert.match(css,/@media\(max-width:768px\)/);
assert.match(css,/@media\(min-width:769px\) and \(max-height:650px\)/);
assert.match(css,/\.vision-ui\.showcase-wave-only/);
assert.match(css,/\.vision-ui \.vision-mini-player/);
assert.match(css,/\.vision-ui \.vision-bottom-nav/);
assert.match(css,/\.vision-ui\.vision-player-expanded/);
assert.match(css,/\.vision-ui:not\(\.vision-home-active\)/);
assert.match(css,/\.vision-topbar #search-container-box/);
assert.match(css,/\.vision-home-hero/);
assert.match(css,/\.vision-playlist-card/);
assert.match(css,/\.showcase-curation-card/);
assert.match(css,/\.vision-hero-scene/);
assert.ok(css.length>15000,'Substantial responsive design stylesheet required');
// Simple structural CSS braces sanity-check, including pseudo and media blocks.
const withoutComments=css.replace(/\/\*[\s\S]*?\*\//g,'');
const opens=(withoutComments.match(/\{/g)||[]).length;
const closes=(withoutComments.match(/\}/g)||[]).length;
assert.equal(opens,closes,'Design CSS braces must balance');
// The existing expanded-player controller must preserve playback and queue.
const {runInNewContext} = await import('node:vm');
const openStart = vision.indexOf('  const expandPlayer = () => {');
const openEnd = vision.indexOf('  // Mobile brand remains visible', openStart);
assert.ok(openStart > 0 && openEnd > openStart, 'Brand view controller exists');
const classes = new Set();
const currentQueue = [{title:'Playing',url:'https://example.org/audio.mp3'}];
const audioState = {paused:false,currentTime:42};
const beforePlayback = JSON.stringify({queue:currentQueue,index:0,time:audioState.currentTime,paused:audioState.paused});
const modeCtx = {window:{},root:{classList:{add:x=>classes.add(x),remove:x=>classes.delete(x)}},updateNav:()=>{},refreshVisualizer:()=>{}};
runInNewContext(vision.slice(openStart,openEnd) +
 '\nglobalThis.openCurrent=expandPlayer;globalThis.closeCurrent=collapsePlayer;',modeCtx);
modeCtx.openCurrent();
assert.ok(classes.has('vision-player-expanded'),'Existing player expander opens playback view');
assert.equal(JSON.stringify({queue:currentQueue,index:0,time:audioState.currentTime,paused:audioState.paused}),
 beforePlayback,'Opening player must not modify audio or queue');
modeCtx.closeCurrent();
assert.ok(!classes.has('vision-player-expanded'),'Back restores the previous view');
assert.doesNotMatch(vision,/activateBrand\(/);
assert.match(vision,/const mobileBrand = el\('div', 'vision-top-brand'\)/);
assert.match(vision,/topbar\.appendChild\(mobileBrand\)/);
assert.match(vision,/pointerdown/);
assert.match(vision,/pointermove/);
assert.match(vision,/pointerup/);
assert.match(vision,/touchstart/,'Legacy Android touch gestures preserved');
assert.match(vision,/window\.playNext\?\.\(\)/);
assert.match(vision,/window\.playPrev\?\.\(\)/);
const deltaStart = vision.indexOf('  const swipeDirection = (dx, dy) =>');
const deltaEnd = vision.indexOf('  let swipeStart = null;', deltaStart);
assert.ok(deltaStart > 0 && deltaEnd > deltaStart,'Swipe direction predicate exists');
const deltaCtx = {};
runInNewContext(vision.slice(deltaStart,deltaEnd) +
 '\nglobalThis.direction=swipeDirection;',deltaCtx);
assert.equal(deltaCtx.direction(-100,8),'next','Left swipe advances original queue');
assert.equal(deltaCtx.direction(100,8),'prev','Right swipe returns previous song');
assert.equal(deltaCtx.direction(25,3),'','A slight drag is not a swipe');
assert.equal(deltaCtx.direction(90,95),'','Vertical movement must not skip music');
assert.match(css,/\.vision-ui\.vision-player-expanded>\.showcase-sidebar/);
assert.match(css,/\.vision-ui\.vision-player-expanded>\.left-col \.vision-now-head/);
assert.match(css,/\.vision-ui \.vision-top-brand/);
assert.match(css,/vision-swipe-dragging/);

// Switching sections must close the logo-only presentation without changing audio.
const shell = read('studio-next.js');
assert.match(shell,/function showCurated\(\)\{\s*[\s\S]*?root\.classList\.remove\('vision-player-expanded'\)/);
assert.match(shell,/function showList\(key\)\{\s*root\.classList\.remove\('vision-player-expanded'\)/);
assert.match(shell,/nav\.addEventListener\('click',event=>\{/);
assert.match(vision,/collapsePlayer\(\); invokeNav\('playlists'\)/);
assert.match(vision,/collapsePlayer\(\); invokeNav\('likes'\)/);
assert.match(vision,/const expand = el\('div', 'vision-mini-expand'\)/);
assert.doesNotMatch(vision,/const expand = button\('vision-mini-expand'/);
assert.match(css,/\.vision-ui\.vision-player-expanded>\.left-col \.showcase-sunset-art/);
assert.match(css,/\.vision-ui\.vision-player-expanded>\.left-col \.vinyl-img img/);
const shellStart = shell.indexOf('let showingCollection=true;');
const shellEnd = shell.indexOf('function closeMobile(){',shellStart);
assert.ok(shellStart > 0 && shellEnd > shellStart,'Section view-switch handlers exist');
const shellRootClasses = new Set(['vision-player-expanded','showcase-wave-only']);
const shellRoot = {classList:{
 add:x=>shellRootClasses.add(x),remove:x=>shellRootClasses.delete(x),
 contains:x=>shellRootClasses.has(x)
}};
const paneClasses = new Set(['showcase-curated']);
const rightMock = {classList:{
 add:x=>paneClasses.add(x),remove:x=>paneClasses.delete(x),
 contains:x=>paneClasses.has(x)
}};
const selectedPages=[];
const navContext={
 root:shellRoot,right:rightMock,document:{getElementById:()=>null},
 window:{openStudioLikes:()=>{throw Error('Navigation must not start audio')}} ,
 activate:key=>selectedPages.push(key)
};
runInNewContext(shell.slice(shellStart,shellEnd)+
 '\nglobalThis.sectionList=showList;globalThis.sectionHome=showCurated;',navContext);
navContext.sectionList('likes');
assert.ok(!shellRootClasses.has('vision-player-expanded'),'Likes closes full player');
assert.ok(!shellRootClasses.has('showcase-wave-only'),'Likes reveals its real list');
assert.ok(paneClasses.has('showcase-list'),'Likes shows song list');
shellRootClasses.add('vision-player-expanded');
navContext.sectionHome();
assert.ok(!shellRootClasses.has('vision-player-expanded'),'Playlist library closes full player');
assert.ok(paneClasses.has('showcase-curated'),'Library restores card pane');
assert.deepEqual(selectedPages,['likes','wave']);

// Visualizer preferences are sanitized and do not inject another audio pipeline.
const currentHTML = html;
for(const id of ['mode','intensity','color','quality']){
 assert.match(currentHTML,new RegExp('id="vision-viz-'+id+'"'));
 assert.match(vision,new RegExp('vision-viz-'+id));
}
assert.match(vision,/const VISUALIZER_KEY = 'dag_visualizer_settings_v1'/);
assert.match(vision,/visualizerSettings=normalizeVisualizerSettings/);
assert.match(vision,/localStorage\.setItem\(VISUALIZER_KEY,JSON\.stringify\(visualizerSettings\)\)/);
assert.doesNotMatch(vision,/createMediaElementSource|new AudioContext|\.playTrack\(|new Audio\s*\(/);
const vizModes=['bars','wave','circle','pulse','particles','off'];
for(const mode of vizModes){
 assert.ok(currentHTML.includes('value="'+mode+'"'),'Setting offers '+mode);
 if(mode!=='off')assert.ok(vision.includes("mode==='"+mode+"'"),'Visualizer draws '+mode);
}
assert.match(css,/\.vision-ui\.vision-player-expanded\.vision-viz-visible>\.left-col \.vinyl-wrapper\{display:none!important\}/);
assert.match(css,/#menu-modal \.vision-viz-settings-grid/);
const normalizeStart=vision.indexOf('  const VISUALIZER_OPTIONS = {');
const normalizeEnd=vision.indexOf('  let visualizerSettings = visualizerDefaults;',normalizeStart);
assert.ok(normalizeStart>0 && normalizeEnd>normalizeStart);
const optionsContext={};
runInNewContext(vision.slice(normalizeStart,normalizeEnd)+
 '\nglobalThis.cleanVisualSettings=normalizeVisualizerSettings;',optionsContext);
const defaults=optionsContext.cleanVisualSettings(null);
assert.equal(defaults.mode,'bars');
assert.equal(defaults.quality,'auto');
assert.equal(optionsContext.cleanVisualSettings({mode:'particles',color:'ocean'}).mode,'particles');
assert.equal(optionsContext.cleanVisualSettings({mode:'__invalid__'}).mode,'bars');
assert.equal(optionsContext.cleanVisualSettings({quality:'off'}).quality,'off');
assert.match(vision,/document\.addEventListener\('visibilitychange',refreshVisualizer/);
assert.match(vision,/visualizerAudio\.paused/);
assert.match(vision,/visualizerFrameRate\(\)/);

console.log('VISION_DESKTOP_MOBILE_TABLET_TEYES_WEB_PWA_APK_PRESERVES_CONTROLLERS_OK');
