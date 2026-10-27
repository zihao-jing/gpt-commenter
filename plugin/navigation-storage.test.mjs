import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,symlink,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join} from 'node:path';import {randomUUID} from 'node:crypto';
import {reviewStore} from './src/review-store.js';import {prepareReviewBatch} from './src/prepare-review-batch.js';
import {pdfNavigation} from './src/pdf-navigation.js';import {navigationPdf} from './test-fixtures/navigation-pdf.mjs';
const root=await mkdtemp(join(tmpdir(),'markatlas-project-'));
try{
 const first=join(root,'one'),second=join(root,'two');await mkdir(first);await mkdir(second);
 const store=reviewStore(join(root,'registry')),id=randomUUID(),note={id,kind:'comment',startOffset:0,endOffset:5,selectedText:'Alpha',message:'Clarify Alpha'};
 const data={root:first,identity:'project:one/file.md',sourceName:'file.md',text:'Alpha edited',baseText:'Alpha',annotations:[note]};
 await store.update(data);const state={entries:[[id,{root:first,identity:data.identity,path:'file.md',item:note}]],drafts:{[data.identity]:{text:data.text,base:data.baseText,items:[note]}},removedIds:[]};await store.project(first,state);
 assert.deepEqual(JSON.parse(await readFile(join(first,'.markatlas/project.json'),'utf8')),state);
 const restored=reviewStore(join(root,'fresh-registry'));assert.deepEqual(await restored.project(first),state);assert.equal((await restored.resolve(id)).comment,note.message);
 assert.deepEqual((await restored.project(second)).entries,[],'projects do not share notes');
 const prepared=await prepareReviewBatch([{root:first,path:'file.md',etag:'old',item:note}],{reviews:store,workspace:{read:async()=>({text:'Introduction\nAlpha\nUpdated context',etag:'new'})}});
 assert.equal(prepared[0].item.selectedText,'Alpha');assert.equal(prepared[0].item.startLine,2);assert.equal(prepared[0].item.diskContext.matched,true);assert.match(prepared[0].item.diskContext.context,/Updated context/);
 const replaced=await prepareReviewBatch([{root:first,path:'file.md',etag:'old',item:note}],{reviews:store,workspace:{read:async()=>({text:'Completely replaced',etag:'new'})}});assert.equal(replaced[0].item.selectedText,'Alpha');assert.equal(replaced[0].item.diskContext.matched,false);
 const escape=join(root,'escape');await mkdir(escape);await symlink(first,join(escape,'.markatlas'));await assert.rejects(()=>store.project(escape,state),/symbolic link/);
 const navigation=await pdfNavigation(navigationPdf());assert.equal(navigation.links[1][0].page,2);assert.equal(navigation.links[1][0].y,87);assert.equal(navigation.links[1][1].url,'https://example.com/');assert.equal(navigation.outline[0].page,2);
 console.log('Project-local persistence, clean-browser recovery, isolation, disk refresh, original quotes, metadata boundaries and PDF destinations passed');
}finally{await rm(root,{recursive:true,force:true});}
