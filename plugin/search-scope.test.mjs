import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {createNativeNavigation} from './src/native-navigation.js';
const dom=new JSDOM('<button id="width-mode">Width</button>',{url:'https://search.test'}),{window}=dom;globalThis.document=window.document;globalThis.window=window;globalThis.localStorage=window.localStorage;
const $=id=>document.getElementById(id);let reads=0,jumped=null,current={identity:'draft',name:'draft.md',path:'draft.md',text:'Unsaved alpha with SEARCH\nsearch then ALPHA\nalpha only\n'},project={rootPath:'/project',root:{type:'directory',children:[{type:'file',path:'other.md',name:'other.md',supported:true}]}};
const nav=createNativeNavigation({getProject:()=>project,readFile:async()=>{reads++;return {text:'alpha search on disk'};},openFile:async()=>{},jump:async result=>{jumped=result;},getCurrentFile:()=>current,jumpCurrent:async result=>{jumped=result;}});
const until=async check=>{for(let i=0;i<100;i++){if(check())return;await new Promise(r=>setTimeout(r,5));}assert.ok(check(),'search settled');};
try{
 nav.search(' alpha SEARCH ');await until(()=>$('project-search-status').textContent==='1 matching lines');assert.equal(reads,1);
 $('project-search-mask').value='*.tex';$('project-search-query').dispatchEvent(new window.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true,cancelable:true}));await until(()=>$('project-search-status').textContent==='2 matching lines in current file');assert.equal($('search-in-file').getAttribute('aria-selected'),'true');assert.equal(localStorage.getItem('markatlas:search-scope'),'file');assert.equal($('project-search-mask').closest('label').hidden,true);assert.equal($('search-scope-arrow').textContent,'←');assert.equal(reads,1,'current-file search does not read project files');
 assert.deepEqual([...$('project-search-results').querySelectorAll('mark')].map(n=>n.textContent.toLowerCase()),['alpha','search','search','alpha']);
 $('project-search-query').dispatchEvent(new window.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));await until(()=>jumped);assert.equal(jumped.currentFile,true);assert.equal(jumped.quote,'alpha with SEARCH');assert.equal(current.text.slice(jumped.from,jumped.to),jumped.quote);
 project=null;nav.search('ALPHA search');await until(()=>$('project-search-status').textContent==='2 matching lines in current file');assert.equal($('search-in-file').getAttribute('aria-selected'),'true','scope persists when reopening');
 $('project-search-query').dispatchEvent(new window.KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true,cancelable:true}));assert.equal($('project-search-status').textContent,'Open a project first');assert.equal(localStorage.getItem('markatlas:search-scope'),'project');assert.equal($('search-scope-arrow').textContent,'→');
 $('search-in-file').click();await until(()=>$('project-search-status').textContent==='2 matching lines in current file');current=null;nav.search('alpha');await until(()=>$('project-search-status').textContent==='Open a readable file first');
 nav.search('   ');assert.equal($('project-search-status').textContent,'Type to search the current file');
 console.log('Search scopes, arrows, persistence, unsaved text, word-order matching, masks and local-file isolation passed');
}finally{dom.window.close();delete globalThis.document;delete globalThis.window;delete globalThis.localStorage;}
