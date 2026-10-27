import assert from 'node:assert/strict';import {JSDOM} from 'jsdom';
import {clippedPdfWord,createPdfViewer} from './src/pdf-viewer.js';
const dom=new JSDOM('<article id="pdf"></article>');globalThis.window=dom.window;
window.Range.prototype.getClientRects=()=>[];const container=window.document.getElementById('pdf');let selected,opened;
const data={root:'/project',path:'main.pdf',main:'main.tex',fingerprint:'version',text:'First passage\n\nSecond passage\n',pages:[{number:1,width:600,height:800,startOffset:0,endOffset:14,words:[{text:'First',x:30,y:40,width:25,height:12,startOffset:0,endOffset:5},{text:'passage',x:60,y:40,width:50,height:12,startOffset:6,endOffset:13}]},{number:2,width:600,height:800,startOffset:15,endOffset:30,words:[{text:'Second',x:30,y:40,width:35,height:12,startOffset:15,endOffset:21},{text:'passage',x:70,y:40,width:50,height:12,startOffset:22,endOffset:29}]}]};
const viewer=createPdfViewer(container,{loadPage:async()=>({image:'data:image/png;base64,AA=='}),onSelection:s=>selected=s,onNote:n=>opened=n,onError:e=>{throw e;}});
viewer.show(data);assert.equal(container.querySelectorAll('.pdf-frame').length,2,'all pages belong to one continuous document');
const words=container.querySelectorAll('.pdf-word'),range=window.document.createRange();range.setStart(words[0].firstChild,0);range.setEnd(words[1].firstChild,7);window.getSelection().addRange(range);words[1].dispatchEvent(new window.Event('pointerup',{bubbles:true}));
assert.equal(selected.selectedText,'First passage');assert.equal(selected.pdf.page,1);assert.equal(selected.pdf.rects.length,2);
const note={...selected,id:'test',kind:'comment',message:'Clarify'};viewer.show(data,[note]);assert.equal(container.querySelectorAll('.pdf-highlight').length,2);assert.equal(container.querySelector('.annotation-icon'),null);container.querySelector('.pdf-highlight[data-annotation]').click();assert.equal(opened.id,'test');
viewer.show(data,[note,{...note,id:'explanation',kind:'explanation',message:''}]);const coexisting=[...container.querySelectorAll('.pdf-highlight[data-annotation]')];assert.equal(coexisting.length,4);assert.equal(container.querySelector('.annotation-icon'),null);coexisting[0].click();assert.equal(opened.id,'test');coexisting[2].click();assert.equal(opened.id,'explanation');
window.getSelection().removeAllRanges();words[0].click();assert.equal(opened.id,'explanation','clicking underlined PDF text opens the latest note');

const firstWord=words[0];viewer.show(data,[note]);assert.equal(container.querySelector('.pdf-word'),firstWord,'opening notes does not replace the text layer');
range.setStart(words[1].firstChild,0);range.setEnd(words[2].firstChild,6);window.getSelection().removeAllRanges();window.getSelection().addRange(range);words[2].dispatchEvent(new window.Event('pointerup',{bubbles:true}));assert.equal(selected.pdf.endPage,2,'cross-page selections retain both page numbers');
viewer.setZoom(2);assert.equal(container.querySelector('.pdf-frame').style.width,'200px');viewer.setZoom(99);assert.equal(viewer.zoom(),16);viewer.setZoom(8);assert.equal(viewer.zoom(),8,'zoom beyond 300% is supported');viewer.setZoom(.1);assert.equal(viewer.zoom(),.5);viewer.setZoom(1);assert.equal(viewer.zoom(),1);
// Sidebar navigation targets the actual marked passage, including a later page.
let jumped;
window.HTMLElement.prototype.scrollIntoView=function(options){jumped={node:this,options};};
const laterNote={id:'later',kind:'comment',startOffset:22,endOffset:29,pdf:{page:2}};
viewer.show(data,[laterNote]);viewer.goToNote(laterNote);
assert.equal(jumped.node.dataset.annotation,'later');assert.equal(jumped.node.closest('.pdf-frame').dataset.pdfPage,'2');assert.equal(jumped.options.block,'center');assert.equal(viewer.currentPage(),2);
viewer.findSpan(22,29);assert.equal(container.querySelectorAll('.pdf-search-match').length,1);assert.equal(container.querySelector('.pdf-search-match').textContent.trim(),'passage');assert.equal(jumped.node,container.querySelector('.pdf-search-match'));
viewer.goToNote({...laterNote,id:'missing'});assert.equal(jumped.node.dataset.pdfPage,'2');assert.equal(jumped.options.block,'start');
viewer.show(data,[note]);
const ordinaryScroll=new window.WheelEvent('wheel',{deltaY:100,bubbles:true,cancelable:true});container.dispatchEvent(ordinaryScroll);assert.equal(viewer.zoom(),1);assert.equal(ordinaryScroll.defaultPrevented,false,'ordinary wheel scrolling stays available');
for(const modifier of ['ctrlKey','metaKey']){const wheel=new window.WheelEvent('wheel',{deltaY:-50,[modifier]:true,bubbles:true,cancelable:true});container.dispatchEvent(wheel);assert.equal(wheel.defaultPrevented,true);assert.ok(viewer.zoom()>1,'modified wheel zooms the PDF');viewer.setZoom(1);}
viewer.wheelZoom(new window.WheelEvent('wheel',{deltaY:50,cancelable:true}));assert.ok(viewer.zoom()<1,'the floating control can zoom with an unmodified wheel');
// Model browser layout and scrolling to check a point on a later page, not just scale.
let scrollY=700;window.scrollBy=({top})=>{scrollY+=top;};
container.getBoundingClientRect=()=>({left:20,top:80-scrollY,width:600,bottom:2000-scrollY});
const pageFrames=[...container.querySelectorAll('.pdf-frame')];
pageFrames.forEach((frame,index)=>{frame.getBoundingClientRect=()=>{const width=parseFloat(frame.style.width),height=parseFloat(frame.style.height),left=20+(parseFloat(container.firstChild.style.width)-width)/2-container.scrollLeft,top=80-scrollY+pageFrames.slice(0,index).reduce((sum,f)=>sum+parseFloat(f.style.height)+24,0);return {left,top,width,height,bottom:top+height};};});
viewer.setZoom(1);container.scrollLeft=300;
const position=()=>{const r=pageFrames[1].getBoundingClientRect();return {x:r.left+r.width*.7,y:r.top+r.height*.2};};
const point=position();
for(const deltaY of [-100,100]){pageFrames[1].dispatchEvent(new window.WheelEvent('wheel',{deltaY,ctrlKey:true,clientX:point.x,clientY:point.y,bubbles:true,cancelable:true}));const after=position();assert.ok(Math.abs(after.x-point.x)<.001,'horizontal page point stays under mouse');assert.ok(Math.abs(after.y-point.y)<.001,'vertical page point stays under mouse across preceding pages');}
// Region capture uses PDF coordinates at the current zoom and includes graphics-only areas.
let crop;window.HTMLCanvasElement.prototype.getContext=()=>({fillRect(){},drawImage(...args){crop=args;}});
window.HTMLCanvasElement.prototype.toDataURL=()=> 'data:image/jpeg;base64,Y3JvcA==';
const image=pageFrames[0].querySelector('img');Object.defineProperties(image,{complete:{value:true},naturalWidth:{value:600},naturalHeight:{value:800}});
const rect=pageFrames[0].getBoundingClientRect();
viewer.setRegionMode(true);assert.ok(container.classList.contains('pdf-region-mode'));
pageFrames[0].dispatchEvent(new window.MouseEvent('pointerdown',{button:0,clientX:rect.left+30,clientY:rect.top+100,bubbles:true,cancelable:true}));
container.dispatchEvent(new window.MouseEvent('pointermove',{clientX:rect.left+150,clientY:rect.top+200,bubbles:true}));
assert.ok(pageFrames[0].querySelector('.pdf-region-drag'));
container.dispatchEvent(new window.MouseEvent('pointerup',{clientX:rect.left+150,clientY:rect.top+200,bubbles:true,cancelable:true}));
assert.equal(selected.pdf.screenshot,'data:image/jpeg;base64,Y3JvcA==');assert.equal(selected.pdf.page,1);assert.ok(crop);
assert.ok(Math.abs(selected.pdf.region.x-30*600/rect.width)<.001);assert.equal(selected.mappingStatus,'pdf-region');
assert.equal(container.classList.contains('pdf-region-mode'),false);assert.equal(pageFrames[0].querySelector('.pdf-region-drag'),null);
viewer.show(data,[{...selected,id:'region',kind:'comment',message:'Review this diagram'}]);
assert.ok(pageFrames[0].querySelector('.pdf-region-note'),'graphics-only selections retain a visible review marker');
viewer.goToNote({...selected,id:'region'});assert.equal(jumped.node.dataset.annotation,'region');
viewer.setRegionMode(true);window.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape'}));assert.equal(container.classList.contains('pdf-region-mode'),false);
// A long extracted word must not make a short selection highlight the whole line.
const sentence='其中表示一次计算的词元数；对展平后的线性层',word={text:sentence,x:20,y:30,width:sentence.length*10,height:12,startOffset:0,endOffset:sentence.length};
const partialData={...data,text:sentence,pages:[{number:1,width:600,height:800,startOffset:0,endOffset:sentence.length,words:[word]}]};
viewer.show(partialData);const sentenceSpan=container.querySelector('.pdf-word'),partialRange=window.document.createRange();
partialRange.setStart(sentenceSpan.firstChild,1);partialRange.setEnd(sentenceSpan.firstChild,13);window.getSelection().removeAllRanges();window.getSelection().addRange(partialRange);sentenceSpan.dispatchEvent(new window.Event('pointerup',{bubbles:true}));
assert.equal(selected.selectedText,sentence.slice(1,13));assert.equal(selected.pdf.rects[0].x,30);assert.equal(selected.pdf.rects[0].width,120);
const partialNote={...selected,id:'partial',kind:'comment',pdf:{...selected.pdf,rects:[{x:20,y:30,width:word.width,height:12}]}};
for(const snapshot of [partialData,{...partialData}]){
 viewer.show(snapshot,[partialNote]);const mark=container.querySelector('.pdf-highlight');assert.equal(mark.style.left,'30px');assert.equal(mark.style.width,'120px','old whole-word rectangles are ignored when reopening');
 viewer.setZoom(2);assert.equal(mark.style.width,'120px','highlight stays in PDF coordinates across zoom');viewer.setZoom(1);
}
// Proportional Latin glyphs use measured character bounds, not character counts.
const measuredSpan={firstChild:{},ownerDocument:{createRange(){let start=0,end=0;return {setStart(node,value){start=value;},setEnd(node,value){end=value;},getBoundingClientRect(){const positions=[100,130,135,140];return {left:positions[start],right:positions[end],width:positions[end]-positions[start]};}};}}};
const clipped=clippedPdfWord({text:'Wii',x:20,y:30,width:80,height:12,startOffset:0,endOffset:3},1,3,measuredSpan);
assert.equal(clipped.x,80);assert.equal(clipped.width,20);assert.equal(clippedPdfWord(word,word.endOffset,word.endOffset+1),null);
viewer.destroy();assert.equal(container.childElementCount,0);
// Loading ends only after the first page image is ready; stale images cannot end a new load.
let readyCount=0;
const loadingViewer=createPdfViewer(container,{loadPage:async()=>({image:'data:image/png;base64,AA=='}),onReady:()=>readyCount++,onError:()=>{}});
loadingViewer.show(data);
assert.equal(readyCount,0);
const loadingImages=[...container.querySelectorAll('img')];
loadingImages[1].dispatchEvent(new window.Event('load'));assert.equal(readyCount,0);
loadingImages[0].dispatchEvent(new window.Event('load'));assert.equal(readyCount,1);
loadingViewer.show({...data});const staleImage=container.querySelector('img');loadingViewer.destroy();
staleImage.dispatchEvent(new window.Event('load'));assert.equal(readyCount,1);
dom.window.close();delete globalThis.window;
console.log('Continuous PDF pages, native text selection, cross-page anchors, highlights, note reopening, and stable text layers passed');
