import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const js=read('script.js'),html=read('index.php'),css=read('studio-vision.css'),sw=read('sw.js');

assert.match(html,/id="search-input"[^>]*placeholder=""[^>]*value=""/);
assert.doesNotMatch(html,/id="search-input"[^>]*placeholder="Исполнитель или песня"/);
assert.match(html,/id="search-history-btn"[^>]*aria-controls="search-history"/);
assert.match(html,/id="search-history"[^>]*aria-label="История поиска" hidden/);
assert.match(js,/const SEARCH_HISTORY_MAX = 8/);
const start=js.indexOf("const searchHistoryButton = document.getElementById('search-history-btn');");
const end=js.indexOf('\nlet searchRequestSerial = 0;',start);
assert.ok(start>0&&end>start,'Search history controller exists');
const performed=[];
const stored=new Map();
function make(tag='div'){
 return {tag,className:'',textContent:'',value:'',children:[],style:{},hidden:true,attrs:{},listeners:{},
 append(...nodes){this.children.push(...nodes);},
 appendChild(item){this.children.push(item);return item;},
 replaceChildren(...items){this.children=[...items];},
 setAttribute(key,value){this.attrs[key]=value;},
 addEventListener(key,fn){this.listeners[key]=fn;},
 contains(){return false;},
 focus(){this.listeners.focus?.();},
 click(){this.listeners.click?.({stopPropagation(){},preventDefault(){}});}
 };
}
const field=make('input'),dropdown=make('div'),historyBtn=make('button');
const ctx={
 mainSearchInput:field,searchHistoryBox:dropdown,
 SEARCH_HISTORY_KEY:'dag_search_history',
 document:{
  getElementById:id=>id==='search-history-btn'?historyBtn:
   id==='search-container-box'?{contains:()=>false}:null,
  createElement:tag=>make(tag),addEventListener:()=>{}
 },
 localStorage:{
  getItem:key=>stored.has(key)?stored.get(key):null,
  setItem:(key,value)=>stored.set(key,String(value)),
  removeItem:key=>stored.delete(key)
 },
 syncSearchClearButton(){},
 performSearch:(query,save)=>performed.push([query,save])
};
runInNewContext(js.slice(start,end)+
 "\nglobalThis.searchTest={saveSearchQuery,readSearchHistory,showSearchHistory,closeSearchHistory};",ctx);
const h=ctx.searchTest;
for(let n=1;n<=10;n++)h.saveSearchQuery('Песня '+n);
assert.equal(h.readSearchHistory().length,8,'Last eight queries only');
assert.equal(h.readSearchHistory()[0],'Песня 10');
assert.equal(h.readSearchHistory()[7],'Песня 3');
h.saveSearchQuery('  пЕсня   7 ');
assert.equal(h.readSearchHistory().length,8,'No case-insensitive duplicates');
assert.equal(h.readSearchHistory()[0],'пЕсня 7');
h.saveSearchQuery('x');
assert.equal(h.readSearchHistory().length,8,'Skip one-character searches');
field.value='';
h.showSearchHistory();
assert.equal(dropdown.hidden,false);
assert.equal(historyBtn.attrs['aria-expanded'],'true');
assert.equal(dropdown.children.length,2,'Header and entries');
assert.equal(dropdown.children[1].children.length,8);
const first=dropdown.children[1].children[0];
assert.equal(first.children[0].tag,'button');
first.children[0].click();
assert.equal(field.value,'пЕсня 7');
assert.equal(dropdown.hidden,true);
assert.equal(performed.length,1);
assert.equal(performed[0][0],'пЕсня 7');
assert.equal(performed[0][1],true);
field.value='';
h.showSearchHistory();
const before=h.readSearchHistory().length;
dropdown.children[1].children[0].children[1].click();
assert.equal(h.readSearchHistory().length,before-1,'Remove one query');
assert.equal(dropdown.hidden,false);
dropdown.children[0].children[2].click();
assert.equal(h.readSearchHistory().length,0,'Clear all search history');
assert.equal(dropdown.hidden,true);
assert.equal(historyBtn.attrs['aria-expanded'],'false');
stored.set('dag_search_history','not valid json');
assert.equal(h.readSearchHistory().length,0,'Corrupted storage should not break search');
field.value='';
h.showSearchHistory();
assert.equal(dropdown.hidden,true);
const performStart=js.indexOf('async function performSearch(');
const performEnd=js.indexOf('\nasync function loadMoreSearchResults(',performStart);
assert.ok(performEnd>performStart);
const searchCode=js.slice(performStart,performEnd);
assert.match(searchCode,/saveSearchQuery\(query\);/);
assert.doesNotMatch(searchCode,/if \(save && searchHistoryBox\)/,'Auto-search saves too');
assert.match(js,/setTimeout\(\(\) => \{ performSearch\(query, false\); \}, delay\)/);
for(const name of ['dag-search-history-head','dag-search-history-row','dag-search-history-remove',
 'dag-search-history-toggle','dag-search-history[hidden]'])
 assert.ok(css.includes(name),'Missing search style '+name);
assert.match(css,/@media\(max-width:768px\)/);
assert.match(html,/studio-vision\.css\?v=5/);
assert.match(html,/script\.js\?v=2340/);
assert.match(sw,/dagstudio-player-shell-v2354/);
assert.ok(sw.includes("'/studio-vision.css?v=5'"));
assert.ok(sw.includes("'/script.js?v=2340'"));
const clean=css.replace(/\/\*[\s\S]*?\*\//g,'');
assert.equal((clean.match(/\{/g)||[]).length,(clean.match(/\}/g)||[]).length);
console.log('SEARCH_PREMIUM_EMPTY_INPUT_LAST_EIGHT_AUTO_HISTORY_CLEAR_ACCESSIBILITY_OK');
