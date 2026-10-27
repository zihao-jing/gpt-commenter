import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {build} from 'esbuild';
import {workspaceAccess} from './src/workspace.js';
import {mkdtemp,mkdir,readFile,realpath,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';

const dom=new JSDOM('<!doctype html><main></main>',{url:'https://insert.test',runScripts:'outside-only',pretendToBeVisual:true});
const {window}=dom;window.Range.prototype.getClientRects=()=>[];window.Range.prototype.getBoundingClientRect=()=>({left:0,right:0,top:0,bottom:0,width:0,height:0});
const result=await build({stdin:{contents:"import {createCodeEditor} from './editor.js'; window.editor=createCodeEditor(document.querySelector('main'),{onChange:text=>{window.edited=text},onSelection(){},onNote(){},onSave(){},onPasteImage:async()=>''});",resolveDir:new URL('./src',import.meta.url).pathname},bundle:true,format:'iife',write:false});window.eval(result.outputFiles[0].text);
function key(key,ctrlKey=false){const event=new window.KeyboardEvent('keydown',{key,ctrlKey,bubbles:true,cancelable:true});window.document.querySelector('.cm-content').dispatchEvent(event);return event;}
function show(text){window.edited=text;window.editor.show({name:'note.md',text,original:text,mode:'edit',live:false});}
show('one\ntwo\nthree');window.editor.selectSpan(0,7);assert.equal(key(']',true).defaultPrevented,true);assert.equal(window.edited,'    one\n    two\nthree');assert.equal(key('[',true).defaultPrevented,true);assert.equal(window.edited,'one\ntwo\nthree');
window.editor.selectSpan(0,3);assert.equal(key('`').defaultPrevented,true);assert.equal(window.edited,'`one`\ntwo\nthree');
window.editor.destroy();show('alpha\nbeta\ngamma');window.editor.selectSpan(0,10);
const content=window.document.querySelector('.cm-content');content.dispatchEvent(new window.MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:20,clientY:20}));
const menu=window.document.querySelector('.markdown-insert-menu');assert.equal(menu.hidden,false);[...menu.querySelectorAll('button')].find(button=>button.textContent==='Numbered list').click();assert.equal(window.edited,'1. alpha\n2. beta\ngamma');
window.editor.destroy();show('');content.isConnected;window.document.querySelector('.cm-content').dispatchEvent(new window.MouseEvent('contextmenu',{bubbles:true,cancelable:true}));[...menu.querySelectorAll('button')].find(button=>button.textContent==='Callout').click();assert.equal(window.edited,'> [!note]\n> ');
window.editor.destroy();show('');window.document.querySelector('.cm-content').dispatchEvent(new window.MouseEvent('contextmenu',{bubbles:true,cancelable:true}));[...menu.querySelectorAll('button')].find(button=>button.textContent==='Add table').click();assert.equal(window.edited.split('\n').length,3);assert.equal(window.edited.match(/\|/g).length,12);
window.editor.destroy();show('existing');window.editor.focusAt(8);window.document.querySelector('.cm-content').dispatchEvent(new window.MouseEvent('contextmenu',{bubbles:true,cancelable:true}));[...menu.querySelectorAll('button')].find(button=>button.textContent==='Bulleted list').click();assert.equal(window.edited,'existing\n- ');
window.editor.destroy();dom.window.close();

const root=await realpath(await mkdtemp(join(tmpdir(),'markatlas-image-test-')));await mkdir(join(root,'docs'));
const workspace=workspaceAccess(async()=>[{uri:pathToFileURL(root).href}]);
const data='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
const image=await workspace.addImage(root,'docs','image/png',data);
assert.match(image.path,/^docs\/pasted-image-[\da-f-]+\.png$/);
assert.equal((await readFile(join(root,image.path))).toString('base64'),data);
await assert.rejects(()=>workspace.addImage(root,'../','image/png',data),/inside|outside/);
await assert.rejects(()=>workspace.addImage(root,'docs','image/png',Buffer.from('bad').toString('base64')),/invalid/);
await rm(root,{recursive:true,force:true});
console.log('Markdown context templates, inline code, Cmd brackets, and pasted image storage passed');
