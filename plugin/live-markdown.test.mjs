import {tableColumnWidths} from './src/table-layout.js';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {EditorState} from '@codemirror/state';
import {EditorView} from '@codemirror/view';
const dom=new JSDOM('<!doctype html><main></main>',{pretendToBeVisual:true});
for(const name of ['window','Window','document','MutationObserver','HTMLElement','Node'])globalThis[name]=dom.window[name];
globalThis.requestAnimationFrame=dom.window.requestAnimationFrame.bind(dom.window);globalThis.cancelAnimationFrame=dom.window.cancelAnimationFrame.bind(dom.window);
const {liveMarkdown,revealBlock,markdownPreviewUnits,moveLiveLine}=await import('./src/live-markdown.js');
const widths=tableColumnWidths([['ID','Description'],['1','Long detailed content '.repeat(12)]]);assert.ok(widths[1]>widths[0]*3);assert.ok(Math.abs(widths.reduce((a,b)=>a+b,0)-100)<.001);
const text='# Heading\n\n- First **bold** item\n- Second item\n  - Nested item\n- Last item\n\n| Name | Value |\n| --- | --- |\n| Alpha | One |\n| Beta | Two |\n\nParagraph line one\nparagraph line two\nparagraph line three';
const view=new EditorView({parent:document.querySelector('main'),state:EditorState.create({doc:text,extensions:liveMarkdown()})});
const widgets=()=>[...view.dom.querySelectorAll('.cm-markdown-preview')];
const atLine=n=>widgets().find(node=>+node.dataset.sourceFrom===view.state.doc.line(n).from);
assert.ok(atLine(3));assert.ok(atLine(4));assert.ok(atLine(5));assert.equal(atLine(5).querySelectorAll('.cm-list-indent-guide').length,1);assert.equal(atLine(3).querySelectorAll('.cm-list-indent-guide').length,0);assert.equal(atLine(8).querySelector('col').style.width,'50%');assert.equal(atLine(8).querySelector('table').style.width,'');assert.equal(atLine(5).querySelector('li').textContent,'Nested item');
const before=view.dom.innerHTML;atLine(4).dispatchEvent(new window.MouseEvent('pointerenter',{bubbles:false}));assert.equal(view.dom.innerHTML,before,'hover changes neither decorations nor selection');
atLine(4).dispatchEvent(new window.MouseEvent('mousedown',{bubbles:true,cancelable:true,button:0}));assert.equal(view.state.doc.lineAt(view.state.selection.main.head).number,4);assert.equal(atLine(4),undefined);assert.ok(atLine(3));assert.ok(atLine(5));assert.ok(atLine(6));
assert.equal(atLine(10).querySelector('thead'),null);assert.equal(atLine(10).querySelector('td').textContent,'Alpha');
atLine(10).dispatchEvent(new window.MouseEvent('mousedown',{bubbles:true,cancelable:true,button:0}));assert.equal(atLine(10),undefined);assert.ok(atLine(8));assert.ok(atLine(11));assert.ok(atLine(4),'previous line returns to preview');
const line=view.state.doc.line(14);view.dispatch({selection:{anchor:line.from+2},effects:revealBlock.of(line.from+2)});assert.ok(atLine(13));assert.ok(atLine(15));assert.equal(atLine(14),undefined);
view.dispatch({changes:{from:line.to,insert:' edited'}});assert.match(view.state.doc.toString(),/paragraph line two edited/);assert.ok(atLine(15));
const nested=EditorState.create({doc:'- [ ] Parent\n    - Bullet\n      - [ ] Deep task\n- [ ] Next'});
assert.deepEqual(markdownPreviewUnits(nested.doc).map(unit=>unit.depth),[0,1,2,0],'semantic list depth is independent of source indentation width');
view.destroy();
{
 const editor=new EditorView({parent:document.querySelector('main'),state:EditorState.create({doc:'Before\n\n$$\n\\int_0^1 f(x)\\,dx\n$$\n\nAfter',extensions:liveMarkdown()})});
 const display=editor.dom.querySelector('.cm-markdown-preview .katex-display');
 assert.ok(display,'display equation renders in live preview');
 assert.ok(display.closest('.cm-markdown-math'),'display equation has a non-scrolling preview container');
 editor.destroy();
}
{
 const html='<p align="center">\n  <img src="plugin/assets/icon.svg" width="64" height="64" alt="MarkAtlas icon">\n</p>';
 let loads=0;
 const editor=new EditorView({parent:document.querySelector('main'),state:EditorState.create({doc:`Before\n\n${html}\n\nAfter`,extensions:liveMarkdown({resolveEmbed:async()=>{loads++;return {kind:'image',url:'data:image/svg+xml;base64,PHN2Zy8+'};}})})});
 const imageBlock=()=>[...editor.dom.querySelectorAll('.cm-markdown-preview')].find(node=>node.querySelector('img'));
 const original=imageBlock();assert.ok(original);assert.equal(loads,1);
 editor.dispatch({changes:{from:0,insert:'New text\n\n'}});
 assert.equal(imageBlock(),original,'edits before unchanged HTML reuse its DOM');
 assert.equal(+original.dataset.sourceFrom,editor.state.doc.toString().indexOf('<p'));
 editor.dispatch({changes:{from:editor.state.doc.length,insert:' suffix'}});
 assert.equal(imageBlock(),original,'edits after unchanged HTML reuse its DOM');assert.equal(loads,1,'unrelated edits do not reload the image');
 const width=editor.state.doc.toString().indexOf('width="64"')+7;
 editor.dispatch({changes:{from:width,to:width+2,insert:'80'}});
 assert.notEqual(imageBlock(),original,'editing the HTML block rebuilds its preview');assert.equal(imageBlock().querySelector('img').width,80);assert.equal(loads,2);
 editor.destroy();
}
for(const indent of ['\t','  ']){
 const codeText=['- incremental 数据：',indent+'```sh',indent+'/home/dyf/miniconda/envs/qec/bin/python test_result.py '+String.fromCharCode(92),indent+'    --dataset zuchongzhi '+String.fromCharCode(92),indent+'    --figure-name zcz_incremental.png',indent+'```','- 真实数据 加 `--zuchongzhi-mode real`','---'].join('\n');
 const state=EditorState.create({doc:codeText,extensions:liveMarkdown()});const units=markdownPreviewUnits(state.doc),code=units.find(unit=>unit.kind==='list-code');assert.ok(code);assert.equal(units.filter(unit=>unit.kind==='list').length,2);assert.equal(code.text.split('\n').length,5);assert.equal(codeText.slice(code.sourceOffsets[code.text.indexOf('--dataset')],code.sourceOffsets[code.text.indexOf('--dataset')]+9),'--dataset');
 const editor=new EditorView({parent:document.querySelector('main'),state});assert.equal(editor.dom.querySelectorAll('pre code').length,1);assert.match(editor.dom.querySelector('pre code').textContent,/--figure-name zcz_incremental.png/);
 const command=editor.state.doc.line(4);editor.dispatch({selection:{anchor:command.from+indent.length},effects:revealBlock.of(command.from+indent.length)});assert.equal(editor.dom.querySelectorAll('pre code').length,0,'editing reveals one complete fenced block');assert.equal(editor.dom.querySelectorAll('.cm-markdown-list-line').length,2,'sibling items remain rendered');
 editor.dispatch({selection:{anchor:editor.state.doc.line(7).from}});assert.equal(editor.dom.querySelectorAll('pre code').length,1,'code block restores intact after leaving it');assert.equal(editor.state.doc.toString(),codeText);editor.destroy();
}
{
 const text='- first item\n- second item\n- third item\n\nAfter';
 const view=new EditorView({parent:document.querySelector('main'),state:EditorState.create({doc:text,extensions:liveMarkdown()})});
 view.dispatch({selection:{anchor:4},effects:revealBlock.of(4)});
 // Model CodeMirror skipping replacement widgets, while testing the actual correction.
 view.moveVertically=(_range,forward)=>({head:forward?view.state.doc.length:0});
 moveLiveLine(view,true);assert.equal(view.state.selection.main.head,view.state.doc.line(2).from+4);
 moveLiveLine(view,true,true);assert.equal(view.state.selection.main.head,view.state.doc.line(3).from+4);assert.equal(view.state.selection.main.anchor,view.state.doc.line(2).from+4);
 moveLiveLine(view,false);assert.equal(view.state.selection.main.head,view.state.doc.line(2).from+4);
 view.moveVertically=range=>({head:range.head+2});moveLiveLine(view,true);assert.equal(view.state.selection.main.head,view.state.doc.line(2).from+6,'wrapped visual-line motion stays within the source line');view.destroy();
}
// First gesture must keep selecting after its initial widget is replaced.
{
 const view=new EditorView({parent:document.querySelector('main'),state:EditorState.create({doc:'- Alpha bold\n- Second item\n- Third item',extensions:liveMarkdown()})});
 const widget=n=>[...view.dom.querySelectorAll('.cm-markdown-preview')].find(node=>+node.dataset.sourceFrom===view.state.doc.line(n).from);
 let caret=null;
 document.caretRangeFromPoint=()=>caret;
 const point=(node,offset)=>{caret=document.createRange();while(node.nodeType!==3)node=node.firstChild;caret.setStart(node,offset);caret.collapse(true);};
 const down=node=>node.dispatchEvent(new window.MouseEvent('mousedown',{bubbles:true,cancelable:true,button:0,buttons:1,detail:1,clientX:20,clientY:20}));
 const move=()=>document.dispatchEvent(new window.MouseEvent('mousemove',{bubbles:true,buttons:1,clientX:40,clientY:40}));
 const up=()=>document.dispatchEvent(new window.MouseEvent('mouseup',{bubbles:true,button:0}));
 point(widget(1).querySelector('li').firstChild,2);down(widget(1));
 assert.equal(view.state.selection.main.anchor,4,'anchor maps rendered text past list marker');
 point(widget(3).querySelector('li').firstChild,5);move();
 assert.equal(view.state.selection.main.anchor,4);
 assert.equal(view.state.selection.main.head,view.state.doc.line(3).from+7,'first drag spans multiple preview rows');
 up();
 view.dispatch({selection:{anchor:0}});
 point(widget(3).querySelector('li').firstChild,3);down(widget(3));
 const anchor=view.state.doc.line(3).from+5;
 point(widget(1).querySelector('li').firstChild,1);move();
 assert.equal(view.state.selection.main.anchor,anchor);assert.equal(view.state.selection.main.head,3,'reverse drag keeps anchor');
 // Continue into already revealed source using CodeMirror coordinate mapping.
 caret=null;view.posAtCoords=()=>7;move();assert.equal(view.state.selection.main.head,7);
 up();view.posAtCoords=()=>9;move();assert.equal(view.state.selection.main.head,7,'mouseup ends gesture');
 delete document.caretRangeFromPoint;view.destroy();
}
dom.window.close();console.log('Click-only local source, independent list/nested-list/table rows, restored previews and paragraph-line editing passed');
