import {applyTableColumns,tableCellText} from './table-layout.js';
import {renderProperties} from './markdown-properties.js';
import {parseHeadingProperties} from './heading-properties.js';
import {fromMarkdown} from 'mdast-util-from-markdown';
import {decodeString} from 'micromark-util-decode-string';
import {gfm} from 'micromark-extension-gfm';
import {gfmFromMarkdown} from 'mdast-util-gfm';
import {math} from 'micromark-extension-math';
import {mathFromMarkdown} from 'mdast-util-math';
import {frontmatter} from 'micromark-extension-frontmatter';
import {frontmatterFromMarkdown} from 'mdast-util-frontmatter';
import katex from 'katex';
import createDOMPurify from 'dompurify';
import hljs from './highlighter.js';
import mermaid from 'mermaid';
let diagramId=0;
mermaid.initialize({startOnLoad:false,securityLevel:'strict',suppressErrorRendering:true,htmlLabels:false,flowchart:{htmlLabels:false}});


export function normalize(text) { return text.replace(/\r\n?/g, '\n'); }
export function sourceSelection(source, start, end, selectedText = source.slice(start, end)) {
  return {startOffset: start, endOffset: end, selectedText,
    startLine: source.slice(0, start).split('\n').length,
    endLine: source.slice(0, Math.max(start, end - 1)).split('\n').length};
}

// Keep a map for every displayed text boundary, including Markdown escapes/entities.
function boundaries(raw, value, start) {
  const map = [start];
  let decoded = '';
  for (let i = 0; i < raw.length;) {
    const match = /^(?:\\[!"#$%&'()*+,\-./:;<=>?@[\]\\^_`{|}~]|&(?:#[xX][\da-fA-F]+|#\d+|[a-zA-Z][\da-zA-Z]+);)/.exec(raw.slice(i));
    const unit = match ? match[0] : raw[i];
    const text = match ? decodeString(unit) : unit;
    for (let j = 0; j < text.length; j++) map.push(start + i + (j === text.length - 1 ? unit.length : 0));
    decoded += text;
    i += unit.length;
  }
  return decoded === value ? map : null;
}

export function renderMarkdown(container, source, mode, items = [], options = {}) {
  const doc = container.ownerDocument;
  container.replaceChildren();
  container.classList.toggle('markdown-rendered',mode!=='source');
  const dark=doc.documentElement.dataset.theme==='dark';container.classList.toggle('theme-dark',dark);container.classList.toggle('theme-light',!dark);
  const purify=createDOMPurify(doc.defaultView);
  const definitions=new Map(),footnotes=new Map();
  const mappings = new WeakMap(),mappedNodes=[];
  function text(parent, value, start, end, map = null) {
    const exact = map || (source.slice(start, end) === value ? Array.from({length: value.length + 1}, (_, i) => start + i) : null);
    const cuts = new Set([0, value.length]);
    if (exact) for (const item of items) {
      for (const offset of [item.startOffset, item.endOffset]) {
        const index = exact.indexOf(offset);
        if (index >= 0) cuts.add(index);
      }
    }
    const points = [...cuts].sort((a,b) => a-b);
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i], b = points[i+1];
      const lo = exact ? exact[a] : start, hi = exact ? exact[b] : end;
      const active = items.filter(item => item.startOffset < hi && item.endOffset > lo);
      const node = doc.createTextNode(value.slice(a,b));
      mappedNodes.push(node);mappings.set(node, {start: lo, end: hi, boundaries: exact?.slice(a,b+1)});
      let target = parent;
      if (active.length) {
        target = doc.createElement('mark');
        const saved=active.findLast(item=>!item.temporary);
        if(saved){target.dataset.annotation=saved.id;target.dataset.noteKind=saved.kind;target.setAttribute('role','button');target.tabIndex=0;target.setAttribute('aria-label',`${saved.kind==='comment'?'Comment':'Explanation'} on lines ${saved.startLine}–${saved.endLine}`);target.title=saved.message||'Explanation';}
        if (active.some(item => item.temporary)) target.classList.add('pending-selection');
        parent.append(target);
      }
      target.append(node);

    }
  }

  function mappedHTML(parent,html,start,end){
    const fragment=purify.sanitize(html,{RETURN_DOM_FRAGMENT:true,ADD_TAGS:['annotation','semantics'],ADD_ATTR:['encoding']});
    const walker=doc.createTreeWalker(fragment,4);let n;
    while(n=walker.nextNode()){mappedNodes.push(n);mappings.set(n,{start,end});}
    const images=[...fragment.querySelectorAll('img[src]')];
    parent.append(fragment);
    for(const image of images){
      const target=image.getAttribute('src');
      if(!target || /^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(target) || !options.resolveEmbed)continue;
      image.removeAttribute('src');
      Promise.resolve(options.resolveEmbed(target)).then(result=>{
        if(!result || result.kind!=='image'){image.setAttribute('src',target);return;}
        if(!parent.contains(image))return;
        image.src=result.url;
      }).catch(error=>{image.setAttribute('src',target);image.classList.add('is-unresolved');image.title=error.message;});
    }
  }
  function localLink(parent,target,label,start,end,embed=false){
    const link=doc.createElement(embed?'span':'a');link.className=embed?'internal-embed':'internal-link';
    link.dataset.target=target;text(link,label,start,end);parent.append(link);
    if(!embed){link.href='#';link.addEventListener('click',e=>{e.preventDefault();if(target.startsWith('#')){const id=target.slice(1).replace(/^\^/,'');[...container.querySelectorAll('[id]')].find(n=>n.id===id)?.scrollIntoView?.();}else options.openLink?.(target);});return;}
    link.contentEditable='false';
    if(!options.resolveEmbed)return;
    Promise.resolve(options.resolveEmbed(target)).then(result=>{
      if(!result || !container.contains(link))return;
      if(result.kind==='image'){const image=doc.createElement('img');image.src=result.url;image.alt=label;const parts=label.split('|'),size=/^(\d+)(?:x(\d+))?$/.exec(parts.at(-1));image.alt=size?parts.slice(0,-1).join('|')||target:label;if(size){image.width=Number(size[1]);if(size[2])image.height=Number(size[2]);image.style.height=size[2]?`${size[2]}px`:'auto';image.style.width=`${size[1]}px`;}link.classList.add('image-embed');link.replaceChildren(image);}
      else if(result.kind==='text' && (options.depth||0)<3){
        const nested=doc.createElement('div');link.replaceChildren(nested);
        renderMarkdown(nested,result.text,'rendered',[],{...options,depth:(options.depth||0)+1,resolveEmbed:result.resolveEmbed||options.resolveEmbed,openLink:result.openLink||options.openLink});
      }else if(result.url){const media=doc.createElement(result.kind==='audio'?'audio':result.kind==='video'?'video':'a');if(media.tagName==='A'){media.href=result.url;media.textContent=label;media.target='_blank';}else{media.src=result.url;media.controls=true;}link.replaceChildren(media);}
    }).catch(error=>{link.title=error.message;link.classList.add('is-unresolved');link.textContent=`Attachment unavailable: ${target}`;});
  }
  function obsidianText(parent,value,start,end){
    const map=boundaries(source.slice(start,end),value,start);
    const pattern=/!?\[\[([^\]\n]+)\]\]|((?!))|%%[\s\S]*?%%|(^|[\s，、。；（(])(#[\p{L}\p{N}_\/-]+)|(?:^|\s)\^([A-Za-z0-9-]+)(?=\s*$)/gu;
    let last=0;
    for(const match of value.matchAll(pattern)){
      const a=match.index,b=a+match[0].length,lo=map?.[a]??start,hi=map?.[b]??end;
      if(a>last)text(parent,value.slice(last,a),map?.[last]??start,lo,map?.slice(last,a+1));
      if(source.slice(lo,hi).startsWith('\\') || source[lo-1]==='\\'){text(parent,match[0],lo,hi,map?.slice(a,b+1));}
      else if(match[1]){const [target,...alias]=match[1].split('|');localLink(parent,target,alias.join('|')||target,lo,hi,match[0].startsWith('!'));}
      else if(match[2]){const mark=doc.createElement('mark');parent.append(mark);text(mark,match[2],map?.[a+2]??lo,map?.[b-2]??hi,map?.slice(a+2,b-1));}
      else if(match[4]){if(match[3])text(parent,match[3],lo,map?.[a+match[3].length]??lo);const tag=doc.createElement('a');tag.className='tag';tag.href='#';tag.addEventListener('click',e=>{e.preventDefault();options.searchTag?.(match[4]);});parent.append(tag);text(tag,match[4],map?.[a+match[3].length]??lo,hi);}
      else if(match[5]){const id=doc.createElement('span');id.id=match[5];parent.append(id);}
      last=b;
    }
    if(last<value.length)text(parent,value.slice(last),map?.[last]??start,end,map?.slice(last));
  }

  function visitChildren(nodes,parent){
    const stack=[parent];
    for(const child of nodes||[]){
      if(child.type==='html'){
        const open=/^<(span|mark|kbd|sub|sup|b|i|u|strong|em)\b[^>]*>$/i.exec(child.value),close=/^<\/(span|mark|kbd|sub|sup|b|i|u|strong|em)>$/i.exec(child.value);
        if(open){const fragment=purify.sanitize(child.value+'</'+open[1]+'>',{RETURN_DOM_FRAGMENT:true});const element=fragment.firstElementChild;if(element){stack.at(-1).append(element);stack.push(element);continue;}}
        if(close&&stack.length>1&&stack.at(-1).tagName.toLowerCase()===close[1].toLowerCase()){stack.pop();continue;}
      }
      visit(child,stack.at(-1));
    }
  }
  function visit(node, parent) {
    const start = node.position?.start.offset ?? 0, end = node.position?.end.offset ?? start;
    if (node.type === 'table') {
      const table=doc.createElement('table'),head=doc.createElement('thead'),body=doc.createElement('tbody');
      table.append(head,body);applyTableColumns(table,node.children.map(row=>row.children.map(tableCellText)));parent.append(table);
      node.children.forEach((row,index)=>{
        const tr=doc.createElement('tr');(index===0 ? head : body).append(tr);
        row.children.forEach((cell,column)=>{
          const td=doc.createElement(index===0 ? 'th' : 'td');
          if(index===0)td.scope='col';
          if(node.align[column])td.style.textAlign=node.align[column];
          tr.append(td);for(const child of cell.children)visit(child,td);
        });
      });
      return;
    }
    if(node.type==='highlight'){const mark=doc.createElement('mark');mark.className='obsidian-highlight';parent.append(mark);for(const child of node.children)visit(child,mark);return;}
    if (node.type === 'text') {obsidianText(parent,node.value,start,end);return;}

    if(node.type==='yaml' && renderProperties(parent,node.value,source.indexOf('\n',start)+1,text))return;
    if(node.type==='yaml' || node.type==='toml'){
      const details=doc.createElement('details'),summary=doc.createElement('summary'),pre=doc.createElement('pre');details.className='metadata';summary.textContent='Properties';details.append(summary,pre);parent.append(details);text(pre,node.value,start,end);return;
    }
    if(node.type==='math' || node.type==='inlineMath'){
      const el=doc.createElement(node.type==='math'?'div':'span');el.contentEditable='false';el.className='math';parent.append(el);
      mappedHTML(el,katex.renderToString(node.value,{displayMode:node.type==='math',throwOnError:false,trust:false}),start,end);return;
    }
    if(node.type==='footnoteDefinition')return;
    if(node.type==='footnoteReference'){
      const sup=doc.createElement('sup'),a=doc.createElement('a');a.href='#fn-'+node.identifier;a.textContent=node.label||node.identifier;sup.append(a);parent.append(sup);return;
    }
    if(node.type==='blockquote'){
      const first=node.children?.[0]?.children?.[0],match=first?.type==='text' && /^\[!([^\]]+)\]([+-])?(?:[ \t]+([^\n]*))?\n?/.exec(first.value);
      if(match){
        const box=doc.createElement(match[2]?'details':'blockquote'),title=doc.createElement(match[2]?'summary':'div'),body=doc.createElement('div');box.className='callout';box.dataset.callout=match[1].toLowerCase();if(match[2]==='+')box.open=true;title.className='callout-title';title.textContent=match[3]||match[1];body.className='callout-content';box.append(title,body);parent.append(box);
        const copy=structuredClone(node);const content=copy.children[0].children[0];content.value=content.value.slice(match[0].length);content.position.start.offset+=match[0].length;
        for(const child of copy.children)visit(child,body);return;
      }
    }
    if (node.type === 'inlineCode' || node.type === 'code') {
      const code = doc.createElement('code');
      const wrap = node.type === 'code' ? doc.createElement('pre') : code;
      if (wrap !== code) wrap.append(code);
      parent.append(wrap);
      const raw = source.slice(start,end);
      let offset = -1;
      if (node.type === 'code') {
        const fence = /^(?: {0,3})(?:`{3,}|~{3,})[^\n]*\n/.exec(raw);
        if (fence && raw.slice(fence[0].length).startsWith(node.value)) offset = start + fence[0].length;
      } else if (/^`+/.test(raw)) {
        const ticks = /^`+/.exec(raw)[0].length;
        if (raw.slice(ticks, raw.length-ticks) === node.value) offset = start + ticks;
      }

      if(node.type==='code' && node.lang==='mermaid'){
        wrap.className='mermaid';wrap.contentEditable='false';text(code,node.value,offset>=0?offset:start,end);
        // Retain readable source on syntax failure, and ignore stale async renders.
        mermaid.render(`markatlas-diagram-${++diagramId}`,node.value).then(({svg})=>{if(container.contains(wrap)){wrap.replaceChildren();mappedHTML(wrap,svg,start,end);}}).catch(error=>{wrap.title=error.message;});
      }else if(node.type==='code' && node.lang && hljs.getLanguage(node.lang)){
        const template=doc.createElement('template');template.innerHTML=hljs.highlight(node.value,{language:node.lang}).value;
        let cursor=offset>=0?offset:start;
        function tokens(from,to){for(const child of from.childNodes){if(child.nodeType===3){text(to,child.textContent,cursor,cursor+child.textContent.length);cursor+=child.textContent.length;}else{const span=doc.createElement('span');span.className=child.className;to.append(span);tokens(child,span);}}}tokens(template.content,code);
      }else text(code, node.value, offset >= 0 ? offset : start, offset >= 0 ? offset + node.value.length : end);
      return;
    }
    if (node.type === 'html') {mappedHTML(parent,source.slice(start,end),start,end);return;}
    if(node.type==='image' || node.type==='imageReference'){
      const url=node.url||definitions.get(node.identifier)?.url;
      if(url && /^(https?:|data:image\/(?:png|jpeg|gif|webp);base64,)/i.test(url)){const image=doc.createElement('img');image.src=url;image.alt=node.alt||'';parent.append(image);}
      else if(url)localLink(parent,url,node.alt||url,start,end,true);return;
    }
    if (node.type === 'break') {parent.append(doc.createElement('br')); return;}
    if (node.type === 'thematicBreak') {parent.append(doc.createElement('hr')); return;}
    if (node.type === 'definition') return;
    const tags = {root: null, paragraph:'p', heading:`h${node.depth}`, emphasis:'em', strong:'strong', blockquote:'blockquote', list:node.ordered?'ol':'ul', listItem:'li', link:'a', linkReference:'a', delete:'del'};
    const tag = tags[node.type] || (node.type === 'root' ? null : 'span');
    const target = tag ? doc.createElement(tag) : parent;
    if (tag) parent.append(target);
    if(node.type==='heading')target.id=node.children.map(c=>c.value||'').join('');
    if(node.type==='listItem' && typeof node.checked==='boolean'){
      const raw=source.slice(start,end),task=/^(?:[-+*]|\d+[.)])\s+\[([^\]\r\n])\]/.exec(raw);
      const state=task?.[1]??(node.checked?'x':' '),offset=task?start+task[0].length-2:null;
      target.className='task-list-item';target.dataset.task=state;
      const check=doc.createElement('input');check.type='checkbox';check.checked=/^[xX]$/.test(state);check.dataset.task=state;check.className='task-list-item-checkbox';check.contentEditable='false';
      check.disabled=!options.toggleTask || offset===null || !!options.depth;check.setAttribute('aria-label',`Task ${state===' '?'not done':state}`);
      check.addEventListener('pointerdown',e=>e.stopPropagation());check.addEventListener('click',e=>e.stopPropagation());
      check.addEventListener('change',()=>options.toggleTask?.(offset,check.checked?'x':' ',state));target.append(check);
    }
    if(node.type==='linkReference')node={...node,...definitions.get(node.identifier),type:'link',children:node.children};
    if(node.type==='link' && !/^(?:[a-z][a-z0-9+.-]*:|#)/i.test(node.url||'')){target.href='#';target.className='internal-link';target.addEventListener('click',e=>{e.preventDefault();if(!/^[a-z][a-z0-9+.-]*:/i.test(node.url))options.openLink?.(node.url);});}
    if (node.type === 'list' && node.ordered && node.start) target.start = node.start;
    if (node.type === 'link' && /^(https?:|mailto:|#)/i.test(node.url)) {
      target.classList.add('external-link');target.href = node.url; if(node.url.startsWith('#')){target.addEventListener('click',event=>{event.preventDefault();let id;try{id=decodeURIComponent(node.url.slice(1));}catch{id=node.url.slice(1);}[...container.querySelectorAll('[id]')].find(n=>n.id===id)?.scrollIntoView?.();});} target.rel = 'noopener noreferrer'; target.target = '_blank';
    }
    visitChildren(node.children,target);
  }
  if (mode === 'source') {
    const pre = doc.createElement('pre'); pre.className = 'source'; container.append(pre);
    text(pre, source, 0, source.length);
  } else {
    const parse=input=>fromMarkdown(input,{extensions:[gfm(),math(),frontmatter(['yaml','toml'])],mdastExtensions:[gfmFromMarkdown(),mathFromMarkdown(),frontmatterFromMarkdown(['yaml','toml'])]});
    let tree=parseHeadingProperties(source,parse);
    const taskOffsets=[];
    function tasks(node){if(node.type==='listItem'){const start=node.position.start.offset,m=/^(?:[-+*]|\d+[.)])\s+\[([^\]\r\n])\](?=\s|$)/.exec(source.slice(start,node.position.end.offset));if(m)taskOffsets.push(start+m[0].length-2);}for(const child of node.children||[])tasks(child);}tasks(tree);
    if(taskOffsets.length){const chars=source.split('');for(const offset of taskOffsets)chars[offset]='x';tree=parseHeadingProperties(chars.join(''),parse);}
    function highlights(node){
      for(const child of node.children||[])highlights(child);
      if(!node.children || !['paragraph','heading','emphasis','strong','delete','link','tableCell'].includes(node.type))return;
      const pieces=[];
      for(const child of node.children){
        if(child.type!=='text'){pieces.push(child);continue;}
        const raw=source.slice(child.position.start.offset,child.position.end.offset);
        const map=boundaries(raw,child.value,child.position.start.offset);if(!map){pieces.push(child);continue;}
        let last=0;for(const match of child.value.matchAll(/==/g)){
          const i=match.index,offset=map[i];if(source[offset-1]==='\\')continue;
          if(i>last)pieces.push({...child,value:child.value.slice(last,i),position:{start:{offset:map[last]},end:{offset}}});
          pieces.push({type:'highlightDelimiter',value:'==',position:{start:{offset},end:{offset:map[i+2]}}});last=i+2;
        }
        if(last<child.value.length)pieces.push({...child,value:child.value.slice(last),position:{start:{offset:map[last]},end:child.position.end}});
      }
      const result=[];let pending=null;
      for(const child of pieces){if(child.type==='highlightDelimiter'){if(pending){result.push({type:'highlight',children:pending.children,position:{start:pending.marker.position.start,end:child.position.end}});pending=null;}else pending={marker:child,children:[]};}else (pending?pending.children:result).push(child);}
      if(pending)result.push({...pending.marker,type:'text'},...pending.children);node.children=result;
    }
    highlights(tree);

    function index(node){if(node.type==='definition')definitions.set(node.identifier,node);if(node.type==='footnoteDefinition')footnotes.set(node.identifier,node);for(const child of node.children||[])index(child);}index(tree);visit(tree,container);
    if(footnotes.size){const section=doc.createElement('section');section.className='footnotes';container.append(section);for(const [id,node] of footnotes){const div=doc.createElement('div');div.id='fn-'+id;section.append(div);for(const child of node.children)visit(child,div);}}
  }
  function endpoint(node, offset, end) {
      if (node.nodeType === 3) {
        const m = mappings.get(node);
        return m ? {offset: m.boundaries ? m.boundaries[offset] : end ? m.end : m.start, exact: !!m.boundaries} : null;
      }
      const walker = doc.createTreeWalker(node, 4);
      const nodes = [];
      while (walker.nextNode()) if (mappings.has(walker.currentNode)) nodes.push(walker.currentNode);
      const child = end ? node.childNodes[offset - 1] : node.childNodes[offset];
      const contained = child && nodes.filter(n => child === n || child.contains?.(n));
      const chosen = contained?.length ? (end ? contained.at(-1) : contained[0]) : (end ? nodes.at(-1) : nodes[0]);
      return chosen ? endpoint(chosen, end ? chosen.length : 0, end) : null;
    }
  function resolve(range){
    const a = endpoint(range.startContainer, range.startOffset, false);
    const b = endpoint(range.endContainer, range.endOffset, true);
    if(!a || !b)return null;
    return {startOffset:a.offset,endOffset:b.offset,mappingStatus:a.exact && b.exact ? 'exact' : 'source-span'};
  }
  function pointAt(offset){
    let found=null,distance=Infinity,index=0;
    for(const node of mappedNodes){const m=mappings.get(node);if(!m.boundaries)continue;for(let i=0;i<m.boundaries.length;i++){const d=Math.abs(m.boundaries[i]-offset);if(d<distance){found=node;distance=d;index=i;}}}
    return found?{node:found,index}:null;
  }
  return {resolve,selectSpan(from,to,scroll=false){
    const a=pointAt(from),b=pointAt(to);if(!a || !b)return;
    const range=doc.createRange();range.setStart(a.node,a.index);range.setEnd(b.node,b.index);
    const selection=doc.getSelection();selection.removeAllRanges();selection.addRange(range);if(scroll)a.node.parentElement?.scrollIntoView?.({block:'center',behavior:'instant'});
  },selection(range,selectedText){
    const span=resolve(range);
    if(!span || span.startOffset>=span.endOffset || !selectedText.trim())return null;
    return {...sourceSelection(source,span.startOffset,span.endOffset,selectedText),mappingStatus:span.mappingStatus};
  },appendCaret(offset){
    const p=doc.createElement('p'),node=doc.createTextNode('');p.append(node,doc.createElement('br'));container.append(p);mappings.set(node,{start:offset,end:offset,boundaries:[offset]});mappedNodes.push(node);
  },focusAt(offset){
    let found=null,distance=Infinity,index=0;
    for(const node of mappedNodes){const m=mappings.get(node);if(!m.boundaries)continue;for(let i=0;i<m.boundaries.length;i++){const d=Math.abs(m.boundaries[i]-offset);if(d<distance){found=node;distance=d;index=i;}}}
    if(found){const range=doc.createRange();range.setStart(found,index);range.collapse(true);const selection=doc.getSelection();selection.removeAllRanges();selection.addRange(range);}
  }};
}
