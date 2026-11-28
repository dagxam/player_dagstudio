import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const src=read('script.js'),vision=read('studio-vision.js'),css=read('studio-vision.css');
const html=read('index.php'),sw=read('sw.js');
const start=src.indexOf('const WAVE_GENRE_STORAGE_KEY=');
const end=src.indexOf('async function radioSearchPage(',start);
const rules=src.indexOf('const WAVE_THEME_RULES=');
const rulesEnd=src.indexOf('// Normalizes artist collaborations',rules);
const match=src.indexOf('function waveGenreMatchesTrack(');
const matchEnd=src.indexOf('function waveReleasePriority(',match);
assert.ok(start>=0&&end>start&&rules>=0&&rulesEnd>rules&&match>=0&&matchEnd>match);

const store=new Map(),events=[];
const ctx={
 localStorage:{
  getItem:key=>store.get(key)||null,
  setItem:(key,v)=>store.set(key,String(v)),
  removeItem:key=>store.delete(key)
 },
 window:{dispatchEvent:e=>events.push(e.detail?.genre)},
 CustomEvent:class{constructor(type,init){this.type=type;this.detail=init?.detail}},
 waveWarmState:null,
 tasteOwnerKey:()=> 'listener',
 playlists:[],waveLibrarySeeds:()=>[],
 normalizeTrackIdentity:value=>String(value||'').toLocaleLowerCase().trim(),
 INSTANT_MIX_ARTISTS:{
  caucasus:['Ислам Итляшев','Зульфия Чотчаева'],
  russian:['JONY','Баста'],foreign:['Dua Lipa','The Weeknd']
 }
};
runInNewContext(src.slice(start,end),ctx);
runInNewContext(src.slice(rules,rulesEnd),ctx);
runInNewContext(src.slice(match,matchEnd),ctx);
assert.equal(ctx.getWaveGenre(),'all');
assert.equal(ctx.waveSearchDirections([]).slice(0,3).map(v=>v.theme).join(','),
 'russian-pop,caucasus,foreign');

for(const [genre,expected] of [
 ['caucasus',new Set(['caucasus','dagestan','avar','lezgin','dargin','kumyk','chechen'])],
 ['russian',new Set(['russian-pop'])],
 ['foreign',new Set(['foreign'])]
]){
 assert.equal(ctx.setWaveGenre(genre),true);
 assert.equal(ctx.getWaveGenre(),genre);
 const dirs=ctx.waveSearchDirections([]);
 assert.ok(dirs.length>=8,genre+' has sufficient distinct discovery directions');
 assert.ok(dirs.every(d=>expected.has(d.theme)),genre+' must not search unrelated genres');
 assert.ok(dirs.slice(0,5).every(d=>d.query.includes(String(new Date().getFullYear()))),
  genre+' prioritizes release-year search terms');
 assert.equal(ctx.nextWaveSearchCursor(),0,genre+' starts with its own cursor');
 assert.equal(ctx.nextWaveSearchCursor(),1,genre+' keeps its station cursor');
}
assert.equal(ctx.setWaveGenre('all'),true);
assert.equal(ctx.nextWaveSearchCursor(),0,'All station cursor survives genre changes');
assert.equal(ctx.setWaveGenre('invalid'),false);
assert.deepEqual(events,['caucasus','russian','foreign','all']);

assert.equal(ctx.waveGenreMatchesTrack({artist:'Ислам Итляшев'},'caucasus',{fallback:'Магамет Дзыбов'}),true);
assert.equal(ctx.waveGenreMatchesTrack({artist:'Dua Lipa'},'caucasus',{fallback:'Ислам Итляшев'}),false);
assert.equal(ctx.waveGenreMatchesTrack({artist:'Dua Lipa'},'foreign',{fallback:'The Weeknd'}),true);
assert.equal(ctx.waveGenreMatchesTrack({artist:'JONY'},'russian',{fallback:'Баста'}),true);
assert.equal(ctx.waveGenreMatchesTrack({artist:'Неизвестно',genre:'русская поп музыка'},'russian',{}),true);
assert.equal(ctx.waveGenreMatchesTrack({artist:'Неизвестно',genre:'Caucasian music'},'foreign',{}),false);

for(const name of ['Эльбрус Джанмирзоев','Ислам Итляшев','Султан Лагучев',
 'Магамет Дзыбов','Патимат Расулова','Зульфия Чотчаева','Айна Гетагазова'])
 assert.ok(src.includes(JSON.stringify(name)),'Caucasus artist pool has '+name);
for(const key of ['all','caucasus','russian','foreign'])
 assert.ok(vision.includes("['"+key+"'"),'Missing selector '+key);
assert.match(vision,/vision-wave-genre-panel/);
assert.match(vision,/setWaveGenre\?\.\(key\)/);
assert.match(vision,/startQuickMix\('wave'\)/);
assert.match(css,/grid-template-columns:[^;]*clamp\(190px,21vw,286px\)/);
assert.match(css,/\.vision-ui \.vision-wave-genre-option\{[\s\S]*?background:transparent!important;/,
 'Wave station choices must be unfilled, without tile backgrounds');
assert.match(css,/\.vision-ui \.vision-wave-genre-option\.active\{[\s\S]*?box-shadow:inset 2px 0/,
 'Selected station uses a slim theme-colored accent instead of a filled tile');

assert.match(css,/@media\(max-width:768px\)/);
assert.match(html,/script\.js\?v=2393/);
assert.match(html,/studio-vision\.js\?v=14/);
assert.match(html,/studio-vision\.css\?v=16/);
assert.match(sw,/dagstudio-player-shell-v2410/);

const transparent=css.split('/* === WAVE UNIFIED TRANSPARENT BACKDROP 2393 ===')[1];
assert.ok(transparent,'Missing unified Wave background');
assert.match(transparent,/url\('images\/vision-hero\.svg'\) center center \/ cover no-repeat!important/,
  'Wave background should continue across the player and the station rail');
assert.match(transparent,/>\.left-col\{\s*background:transparent!important/,
  'The player itself must not block the shared background');
assert.match(transparent,/>\.vision-wave-genre-panel\{\s*background:transparent!important/,
  'The right rail must not have a solid dark backing');
assert.match(transparent,/>\.vision-wave-genre-panel\{[\s\S]*?backdrop-filter:none!important/,
  'No opaque glass panel or blur may reintroduce the dark rectangle');
assert.match(transparent,/\.vision-wave-genre-option\.active\{[\s\S]*?background:linear-gradient\(/,
  'The selected radio category has a gentle theme accent');
assert.match(transparent,/\.vision-wave-genre-option\.active\{[\s\S]*?border-radius:13px!important/,
  'The selected radio category has a subtle rounded outline');
assert.match(transparent,/@media\(max-width:768px\)/,
  'Transparent Wave styling should remain responsive on mobile');
assert.ok(!transparent.includes('.showcase-wave-only>.vision-wave-genre-panel'),
 'Transparency rules must be scoped to Wave, not collection screens');
console.log('WAVE_TRANSPARENT_FULL_WIDTH_BACKDROP_AND_RADIO_SELECTION_OK');

console.log('WAVE_GENRE_SELECTOR_2026_THREE_STATIONS_PERSISTENCE_AND_RIGHT_PANEL_OK');
