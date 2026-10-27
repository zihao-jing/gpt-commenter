// Continuous PDF pages use fixed page coordinates; image loading follows visibility.
export const PDF_MIN_ZOOM=.5,PDF_MAX_ZOOM=16;
// PDF extractors often group a whole Chinese line as one word. Clip that box
// to the selected character interval, using browser glyph widths when available.
export function clippedPdfWord(word,startOffset,endOffset,span){
 const length=word.text.length,start=Math.max(0,startOffset-word.startOffset),end=Math.min(length,endOffset-word.startOffset);
 if(end<=start)return null;
 let left=start/length,right=end/length;
 if(span?.firstChild && (start>0 || end<length)){
  const range=span.ownerDocument.createRange();
  range.setStart(span.firstChild,0);range.setEnd(span.firstChild,length);
  const full=range.getBoundingClientRect?.();
  if(full?.width>0){
   range.setStart(span.firstChild,start);range.setEnd(span.firstChild,end);
   const part=range.getBoundingClientRect();
   left=Math.max(0,Math.min(1,(part.left-full.left)/full.width));right=Math.max(left,Math.min(1,(part.right-full.left)/full.width));
  }
 }
 return {x:word.x+word.width*left,y:word.y,width:word.width*(right-left),height:word.height};
}
export function createPdfViewer(container,{loadPage,onSelection,onNote,onError,onReady=()=>{},onPage=()=>{},onZoom=()=>{},onRegionMode=()=>{}}){
  let document=null,epoch=0,notes=[],resizeObserver=null,intersection=null;
  let regionMode=false,drag=null,findSpan=()=>{};
  function setRegionMode(value){regionMode=!!value;container.classList.toggle('pdf-region-mode',regionMode);if(drag){drag.box.remove();drag=null;}onRegionMode(regionMode);}
  const frames=new Map();let zoom=1,resizePages=()=>{},currentPage=1,pageObserver=null;
  function destroy(){findSpan=()=>{};setRegionMode(false);++epoch;resizeObserver?.disconnect();intersection?.disconnect();pageObserver?.disconnect();pageObserver=null;resizeObserver=intersection=null;frames.clear();container.replaceChildren();document=null;}
  function marks(){
    for(const {page,highlights,wordSpans} of frames.values()){
      highlights.replaceChildren();
      for(const item of notes){
        if(item.pdf?.region){
          if(item.pdf.page!==page.number)continue;
          const r=item.pdf.region,mark=window.document.createElement(item.temporary?'div':'button');mark.className=item.temporary?'pdf-region-drag':'pdf-region-note annotation-icon';if(!item.temporary){mark.setAttribute('aria-label',`Screenshot comment on PDF page ${page.number}`);mark.title=item.anchorStatus==='edited'?'PDF changed — review this screenshot comment':item.message || 'Screenshot selection';}
          Object.assign(mark.style,{left:`${r.x}px`,top:`${r.y}px`,width:`${r.width}px`,height:`${r.height}px`});
          if(!item.temporary){mark.dataset.annotation=item.id;mark.textContent=item.kind==='explanation'?'?':'▤';mark.addEventListener('click',event=>{event.stopPropagation();onNote(item,mark.getBoundingClientRect());});}
          highlights.append(mark);continue;
        }
        const words=page.words.filter(w=>w.endOffset>item.startOffset && w.startOffset<item.endOffset);
        for(const word of words){const rect=clippedPdfWord(word,item.startOffset,item.endOffset,wordSpans.get(word.startOffset));if(!rect)continue;const mark=window.document.createElement('span');mark.className='pdf-highlight'+(item.temporary?' pending-selection':'');if(item.anchorStatus==='edited')mark.classList.add('pdf-changed');Object.assign(mark.style,{left:`${rect.x}px`,top:`${rect.y}px`,width:`${rect.width}px`,height:`${rect.height}px`});if(!item.temporary){mark.dataset.annotation=item.id;mark.tabIndex=0;mark.setAttribute('role','button');mark.setAttribute('aria-label',`Review note on PDF page ${page.number}`);const activate=event=>{event.stopPropagation();onNote(item,mark.getBoundingClientRect());};mark.addEventListener('click',activate);mark.addEventListener('keydown',event=>{if(['Enter',' '].includes(event.key)){event.preventDefault();activate(event);}});}highlights.append(mark);}

      }
    }
  }
  function show(data,items=[]){
    if(document===data){notes=items;marks();return;}
    destroy();const current=epoch;document=data;notes=items;
    const stack=window.document.createElement('div');stack.className='pdf-pages';container.append(stack);
    function resize(){if(current!==epoch)return;const available=Math.max(100,container.getBoundingClientRect().width);let widest=available;for(const {page,canvas,frame} of frames.values()){const width=Math.min(page.width,available)*zoom,scale=width/page.width;canvas.style.transform=`scale(${scale})`;frame.style.height=`${page.height*scale}px`;frame.style.width=`${width}px`;widest=Math.max(widest,width);}stack.style.width=`${widest+available}px`;}
    async function load(number){
      const entry=frames.get(number);if(!entry || entry.loaded)return;entry.loaded=true;
      const text=window.document.createElement('div');text.className='pdf-text';text.setAttribute('aria-label',`Selectable text, PDF page ${number}`);
      for(const word of entry.page.words){const span=window.document.createElement('span');span.className='pdf-word';span.dataset.start=word.startOffset;span.dataset.end=word.endOffset;span.dataset.page=number;span.textContent=word.text+' ';Object.assign(span.style,{left:`${word.x}px`,top:`${word.y}px`,height:`${word.height}px`,fontSize:`${word.height*.9}px`,lineHeight:`${word.height}px`});text.append(span);entry.wordSpans.set(word.startOffset,span);}
      entry.canvas.insertBefore(text,entry.highlights);marks();
      try{const result=await loadPage(data,number);if(current===epoch)entry.image.src=result.image;}catch(error){if(current===epoch){entry.loaded=false;onError(error);}}
    }
    for(const page of data.pages){
      const frame=window.document.createElement('div');frame.className='pdf-frame';frame.dataset.pdfPage=page.number;frame.setAttribute('aria-label',`PDF page ${page.number}`);
      const canvas=window.document.createElement('div');canvas.className='pdf-page';canvas.style.width=`${page.width}px`;canvas.style.height=`${page.height}px`;
      // Give vector images their actual display size, outside the scaled text overlay.
      const image=window.document.createElement('img');image.alt='';image.draggable=false;image.className='pdf-image';
      image.addEventListener('load',()=>{if(current===epoch && page.number===1)onReady();},{once:true});
      image.addEventListener('error',()=>{if(current===epoch)onError(Error('Unable to load this page.'));},{once:true});
      const highlights=window.document.createElement('div');highlights.className='pdf-notes';canvas.append(highlights);for(const link of data.navigation?.links?.[page.number] || []){
        const anchor=window.document.createElement('a');anchor.className='pdf-link';anchor.title=link.page?`Go to page ${link.page}`:link.url;
        Object.assign(anchor.style,{position:'absolute',zIndex:3,left:`${link.x}px`,top:`${link.y}px`,width:`${link.width}px`,height:`${link.height}px`});
        if(link.page){anchor.href=`#page-${link.page}`;anchor.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();frames.get(link.page)?.frame.scrollIntoView({block:'start',behavior:'smooth'});});}else{anchor.href=link.url;anchor.target='_blank';anchor.rel='noopener noreferrer';}
        canvas.append(anchor);
      }
      frame.append(image,canvas);stack.append(frame);frames.set(page.number,{page,frame,canvas,image,highlights,wordSpans:new Map(),loaded:false});
    }
    findSpan=(from,to)=>{
      const page=data.pages.find(p=>from>=p.startOffset && from<p.endOffset);if(!page)return;
      load(page.number);
      for(const span of container.querySelectorAll('.pdf-search-match'))span.classList.remove('pdf-search-match');
      const entry=frames.get(page.number),matches=[...entry.wordSpans.values()].filter(span=>Number(span.dataset.end)>from && Number(span.dataset.start)<to);
      for(const span of matches)span.classList.add('pdf-search-match');
      (matches[0] || entry.frame).scrollIntoView?.({block:'center',behavior:'instant'});
    };
    resizePages=resize;resize();container.scrollLeft=(parseFloat(stack.style.width)-Math.max(100,container.getBoundingClientRect().width))/2;marks();onZoom(zoom);
    if(typeof ResizeObserver!=='undefined'){resizeObserver=new ResizeObserver(resize);resizeObserver.observe(container);}
    if(typeof IntersectionObserver!=='undefined'){
      intersection=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting)load(Number(entry.target.dataset.pdfPage));},{rootMargin:'600px'});
      for(const entry of frames.values())intersection.observe(entry.frame);
    }else for(const number of frames.keys())load(number);
    if(typeof IntersectionObserver!=='undefined'){
      const visible=new Map();pageObserver=new IntersectionObserver(entries=>{for(const e of entries){const number=Number(e.target.dataset.pdfPage);if(e.isIntersecting)visible.set(number,e.intersectionRatio);else visible.delete(number);}if(visible.size){currentPage=[...visible].sort((a,b)=>b[1]-a[1])[0][0];onPage(currentPage,data.pages.length);}},{threshold:[0,.1,.25,.5,.75,1]});for(const entry of frames.values())pageObserver.observe(entry.frame);
    }
    currentPage=1;onPage(1,data.pages.length);load(1);
  }
  function endpoint(node,offset,end=false){
    const direct=(node.nodeType===3?node.parentElement:node).closest?.('.pdf-word');
    if(direct)return {span:direct,offset:node.nodeType===3?offset:(end?direct.textContent.length:0)};
    const child=node.childNodes?.[end?offset-1:offset];const candidates=child?.querySelectorAll?.('.pdf-word');const span=child?.matches?.('.pdf-word')?child:(end?candidates?.[candidates.length-1]:candidates?.[0]);
    return span?{span,offset:end?span.textContent.length:0}:null;
  }
  container.addEventListener('click',event=>{const word=event.target.closest?.('.pdf-word');if(!word || !window.getSelection()?.isCollapsed)return;const note=notes.findLast(item=>!item.temporary && !item.pdf?.region && item.startOffset<Number(word.dataset.end) && item.endOffset>Number(word.dataset.start));if(note){event.stopPropagation();onNote(note,word.getBoundingClientRect());}});
  function capture(event){
    if(!document || regionMode || drag || event.target.closest?.('.annotation-icon'))return;
    const selection=window.getSelection();if(!selection?.rangeCount || selection.isCollapsed)return;
    const range=selection.getRangeAt(0),a=endpoint(range.startContainer,range.startOffset),b=endpoint(range.endContainer,range.endOffset,true);
    if(!a || !b || !container.contains(a.span) || !container.contains(b.span))return;
    const start=Number(a.span.dataset.start)+Math.min(a.offset,a.span.textContent.trimEnd().length),end=Number(b.span.dataset.start)+Math.min(b.offset,b.span.textContent.trimEnd().length);if(end<=start)return;
    const firstPage=Number(a.span.dataset.page),lastPage=Number(b.span.dataset.page),page=document.pages[firstPage-1];const words=page.words.filter(w=>w.endOffset>start&&w.startOffset<end);if(!words.length)return;
    const rects=[...range.getClientRects()],anchor=rects.at(-1) || a.span.getBoundingClientRect();
    onSelection({startOffset:start,endOffset:end,startLine:document.text.slice(0,start).split('\n').length,endLine:document.text.slice(0,end).split('\n').length,selectedText:document.text.slice(start,end),mappingStatus:'exact',pdf:{root:document.root,path:document.path,main:document.main,fingerprint:document.fingerprint,page:firstPage,endPage:lastPage,x:words[0].x,y:words[0].y,rects:words.map(w=>clippedPdfWord(w,start,end,frames.get(firstPage)?.wordSpans.get(w.startOffset))).filter(Boolean)}},anchor);
  }
  function setZoom(value,point){
    const next=Math.max(PDF_MIN_ZOOM,Math.min(PDF_MAX_ZOOM,value));if(next===zoom)return;
    // Preserve page coordinates, including the height of preceding pages and gaps.
    let anchor=null;
    if(point){let distance=Infinity;for(const {frame} of frames.values()){const r=frame.getBoundingClientRect();if(!r.width || !r.height)continue;const d=Math.max(r.top-point.y,0,point.y-r.bottom);if(d<distance){distance=d;anchor={frame,x:(point.x-r.left)/r.width,y:(point.y-r.top)/r.height};}}}
    zoom=next;resizePages();
    if(anchor){const r=anchor.frame.getBoundingClientRect();container.scrollLeft+=r.left+anchor.x*r.width-point.x;(container.closest('main') || window).scrollBy({top:r.top+anchor.y*r.height-point.y,left:0,behavior:'instant'});}
    onZoom(zoom);
  }
  function wheelZoom(event){
    if(!document || !event.deltaY)return;
    event.preventDefault();
    const amount=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?window.innerHeight:1);
    const bounds=container.getBoundingClientRect(),overDocument=container.contains(event.target);
    const point=overDocument?{x:event.clientX,y:event.clientY}:{x:bounds.left+bounds.width/2,y:Math.max(bounds.top,0)+(Math.min(bounds.bottom,window.innerHeight)-Math.max(bounds.top,0))/2};
    setZoom(zoom*Math.exp(-Math.max(-100,Math.min(100,amount))*.0045),point);
  }
  container.addEventListener('wheel',event=>{if(event.ctrlKey || event.metaKey)wheelZoom(event);},{passive:false});
  container.addEventListener('pointerup',capture);container.addEventListener('keyup',capture);
  container.addEventListener('pointerdown',event=>{
    if(!regionMode || !document || event.button!==0)return;
    const frame=event.target.closest?.('.pdf-frame'),entry=frames.get(Number(frame?.dataset.pdfPage));if(!entry)return;
    event.preventDefault();event.stopPropagation();window.getSelection()?.removeAllRanges();
    const box=window.document.createElement('div');box.className='pdf-region-drag';entry.frame.append(box);
    drag={entry,box,id:event.pointerId,x:event.clientX,y:event.clientY};container.setPointerCapture?.(event.pointerId);
  });
  function regionBounds(event){
    const r=drag.entry.frame.getBoundingClientRect(),clamp=(n,max)=>Math.max(0,Math.min(max,n));
    const x=clamp(drag.x-r.left,r.width),y=clamp(drag.y-r.top,r.height),endX=clamp(event.clientX-r.left,r.width),endY=clamp(event.clientY-r.top,r.height);
    return {x:Math.min(x,endX),y:Math.min(y,endY),width:Math.abs(endX-x),height:Math.abs(endY-y)};
  }
  container.addEventListener('pointermove',event=>{if(!drag || drag.id!==event.pointerId)return;const r=regionBounds(event);Object.assign(drag.box.style,{left:`${r.x}px`,top:`${r.y}px`,width:`${r.width}px`,height:`${r.height}px`});});
  container.addEventListener('pointerup',async event=>{
    if(!drag || drag.id!==event.pointerId)return;
    event.preventDefault();event.stopPropagation();const bounds=regionBounds(event),{entry}=drag,data=document,generation=epoch;
    setRegionMode(false);container.releasePointerCapture?.(event.pointerId);
    if(bounds.width<6 || bounds.height<6)return;
    try{
      if(!entry.image.complete || !entry.image.naturalWidth)throw Error('Wait for this PDF page to finish loading, then select the region again.');
      const frame=entry.frame.getBoundingClientRect(),page=entry.page;
      const region={x:bounds.x*page.width/frame.width,y:bounds.y*page.height/frame.height,width:bounds.width*page.width/frame.width,height:bounds.height*page.height/frame.height};
      const canvas=window.document.createElement('canvas'),scale=Math.min(2,1600/Math.max(region.width,region.height));canvas.width=Math.max(1,Math.round(region.width*scale));canvas.height=Math.max(1,Math.round(region.height*scale));
      const context=canvas.getContext('2d');if(!context)throw Error('Screenshot capture is unavailable.');context.fillStyle='white';context.fillRect(0,0,canvas.width,canvas.height);
      context.drawImage(entry.image,region.x/page.width*entry.image.naturalWidth,region.y/page.height*entry.image.naturalHeight,region.width/page.width*entry.image.naturalWidth,region.height/page.height*entry.image.naturalHeight,0,0,canvas.width,canvas.height);
      const screenshot=canvas.toDataURL('image/jpeg',.9);
      const words=page.words.filter(w=>w.x+w.width>region.x && w.x<region.x+region.width && w.y+w.height>region.y && w.y<region.y+region.height);
      const start=words[0]?.startOffset ?? page.startOffset,end=words.at(-1)?.endOffset ?? start;
      if(epoch!==generation || document!==data)return;
      onSelection({startOffset:start,endOffset:end,startLine:data.text.slice(0,start).split('\n').length,endLine:data.text.slice(0,end).split('\n').length,selectedText:words.map(w=>w.text).join(' ') || `Screenshot region on PDF page ${page.number}`,mappingStatus:'pdf-region',pdf:{root:data.root,path:data.path,main:data.main,fingerprint:data.fingerprint,page:page.number,x:region.x,y:region.y,region,screenshot}}, {left:frame.left+bounds.x,top:frame.top+bounds.y,right:frame.left+bounds.x+bounds.width,bottom:frame.top+bounds.y+bounds.height,width:bounds.width,height:bounds.height});
    }catch(error){onError(error);}
  });
  container.addEventListener('pointercancel',()=>{if(drag)setRegionMode(false);});
  window.addEventListener('keydown',event=>{if(event.key==='Escape' && regionMode)setRegionMode(false);});
  return {show,destroy,findSpan:(from,to)=>findSpan(from,to),
    setZoom,wheelZoom,setRegionMode,
    zoom:()=>zoom,
    goToPage(number){const entry=frames.get(Math.max(1,Math.min(frames.size,number)));entry?.frame.scrollIntoView({behavior:'smooth',block:'start'});},
    goToNote(note){
      const page=note.pdf?.region?note.pdf.page:document?.pages.find(page=>note.startOffset>=page.startOffset && note.startOffset<page.endOffset)?.number ?? note.pdf?.page;
      const entry=frames.get(page);if(!entry)return null;
      const mark=[...entry.highlights.querySelectorAll('[data-annotation]')].find(node=>node.dataset.annotation===note.id);
      const target=mark || entry.frame;
      target.scrollIntoView({behavior:'instant',block:mark?'center':'start',inline:'nearest'});
      currentPage=page;onPage(page,document.pages.length);
      return mark?.getBoundingClientRect() || null;
    },
    currentPage:()=>currentPage
  };
}
