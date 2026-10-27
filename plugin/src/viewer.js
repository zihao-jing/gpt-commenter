import {trackHostBottomInset} from './host-bottom-inset.js';
import {createPatchReview} from './patch-review.js';
import {mergeNotes,mergeProjectState} from './project-state.js';
import {createTreeToolbar} from './tree-toolbar.js';
import {createDeleteEntryDialog} from './delete-entry-dialog.js';
import {createEntryDialog} from './create-entry-dialog.js';
import {applyThemeColor,syncRecentHistory,recentRootsKey} from './viewer-settings.js';
import {applyHostAccent} from './host-accent.js';
import {createTreePreferences,appendGitBadge} from './tree-preferences.js';
import {fitBreadcrumb} from './breadcrumb-layout.js';
import {createNativeNavigation} from './native-navigation.js';
import {paneConfig,paneBridge,PaneApp,PaneExtensions} from './pane-bridge.js';
import {createSplitView,PANE_DRAG,FILE_DRAG} from './split-view.js';
import {createDocumentNavigation} from './document-navigation.js';
import {htmlPreviewDocument} from './html-preview.js';
import {resolveObsidianPath,embeddedSection} from './obsidian-links.js';
import {renamePaths} from './rename-paths.js';
import {createFileMenu} from './file-menu.js';
import {clippedPdfWord,createPdfViewer,PDF_MIN_ZOOM,PDF_MAX_ZOOM} from './pdf-viewer.js';
import {createEditHistory} from './edit-history.js';
import {ChangeSet} from '@codemirror/state';
import {moveAnnotations} from './annotation-edits.js';
import {createCodeEditor} from './editor.js';
import {isMarkdown,isImage,isPdf,isLatex} from './file-types.js';
import {fileContent,fileLimit} from './file-content.js';
import {renderWordPreview,createWordViewer} from './word-viewer.js';
import {App} from '@modelcontextprotocol/ext-apps';
import {OpenAIExtensions, OpenAIFileEntrypointInputSchema} from '@openai/mcp-extensions/app';
import {normalize, renderMarkdown} from './markdown.js';
import {requestExplanation} from './chat.js';
import {sendReviewBatch} from './review-batch.js';
import {floatingPosition} from './project.js';
import {createFileRefresh} from './refresh.js';
const appIcon = document.getElementById('app-icon').content.querySelector('svg');
const AppClass=paneConfig?PaneApp:App;
const app = new AppClass({name:document.title,title:document.title,version:'0.16.2',icons:appIcon ? [{
  src:`data:image/svg+xml;base64,${btoa(appIcon.outerHTML)}`,mimeType:'image/svg+xml',sizes:['any']
}] : []});
const extensions = paneConfig?new PaneExtensions():new OpenAIExtensions(app);

const $ = id => document.getElementById(id);
function scrollViewport(left,top){const node=viewport();if(typeof left==='object'){if(left.top!==undefined)node.scrollTop=left.top;if(left.left!==undefined)node.scrollLeft=left.left;}else{node.scrollLeft=left;node.scrollTop=top;}}
const viewport=()=>document.querySelector('main');
const viewWidth=()=>$('primary-pane')?.clientWidth || window.innerWidth;
const viewHeight=()=>$('primary-pane')?.clientHeight || window.innerHeight;
const toolbarPaths={
  outline:'<path d="M8 5h13M8 12h13M8 19h13M3 5h.01M3 12h.01M3 19h.01"/>',
  files:'<path d="M3 7h6l2-3h10v16H3z"/><path d="M3 10h18"/>',
  comments:'<path d="M21 11a8 8 0 0 1-8 8H8l-5 3V5a2 2 0 0 1 2-2h8a8 8 0 0 1 8 8Z"/><path d="M7 8h9M7 12h7"/>',
  find:'<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>',
  preview:'<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  source:'<path d="m8 5-6 7 6 7m8-14 6 7-6 7m-3-15-2 16"/>',
  edit:'<path d="m16 3 5 5-12 12-6 1 1-6Z"/><path d="m13 6 5 5"/>',
  wide:'<path d="M3 4v16M21 4v16M4 12h16m-12-4-4 4 4 4m8-8 4 4-4 4"/>',
  readable:'<path d="M6 4v16M18 4v16M9 7h6M9 11h6M9 15h6"/>',
  wrap:'<path d="M4 4v16M8 8h12v5a4 4 0 0 1-4 4h-7m3-3-3 3 3 3"/>',
  nowrap:'<path d="M4 4v16M8 8h8M8 12h8M8 16h8m1-7 4 3-4 3"/>'
};
function toolbarIcon(id,label,icon){const button=$(id);button.innerHTML=`<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${toolbarPaths[icon]}</svg>`;button.title=label;button.setAttribute('aria-label',label);}
for(const [id,label,icon] of [['document-nav-toggle','Outline','outline'],['comments-toggle','Comments','comments'],['tree-toggle','Files','files'],['mode-cycle','Preview','preview']])toolbarIcon(id,label,icon);

let source = '', fileName = '', sourcePath = null, documentHash = '', identity = '', revision = 0, incomingRevision = 0;
let displayWork=null;
let diskSource='',diskHash='',hashWork=null,syncTimer=null,syncQueue=Promise.resolve(),renderedCaret=null;
let codeMode='edit',currentEtag=null,saving=false,codeFile=false;
let saveTimer=null,saveWork=null,pdfDocument=null,pdfPoll=null,pdfPollBusy=false;
let pdfRefreshTarget=null,pdfReloading=false;
let filePreview=null;
let navigationOpen=false;
const navigation=createDocumentNavigation($('document-nav'),{loadPage:(data,page)=>serverData('render_latex_pdf_page',{root:data.root,path:data.path,page,fingerprint:data.fingerprint,format:'png'}),jumpPage:number=>pdfViewer.goToPage(number),jumpHeading:(offset,index)=>{if($('document').querySelector('.cm-editor'))codeEditor.findSpan(offset,offset);else $('document').querySelectorAll('h1,h2,h3,h4,h5,h6')[index]?.scrollIntoView({block:'start'});}});
function renderNavigation(){const available=!!pdfDocument || isMarkdown(fileName);$('document-nav-toggle').disabled=!available;$('document-nav-toggle').title=pdfDocument?'PDF thumbnails and outline':'Markdown outline';$('document-nav-toggle').setAttribute('aria-label',$('document-nav-toggle').title);$('document-nav-toggle').setAttribute('aria-expanded',String(available && navigationOpen));navigation.show({pdf:pdfDocument,source,name:fileName,visible:available && navigationOpen});}
$('document-nav-toggle').addEventListener('click',()=>{navigationOpen=!navigationOpen;renderNavigation();updateLayout();});
$('pdf-page-input').addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();$('pdf-page-input').dispatchEvent(new Event('change'));}});
$('pdf-page-input').addEventListener('change',()=>{const page=Number($('pdf-page-input').value);if(Number.isInteger(page))activePageViewer().goToPage(page);});
let textScale=1;
try{const saved=Number(localStorage.getItem('markdown-review:text-scale'));if(saved>=.75 && saved<=2)textScale=saved;}catch{}
const editHistory=createEditHistory();
let linkedPdf=null;
let connectedFolder = paneConfig?.root || null, breadcrumbFolder = null;
const pastedImagePaths=new Map();
let treeAutoExpand=true;
let project = null, activeProjectPath = null, selectionAnchor = null, ignoreOutsideClick = false;
let mode = 'rendered', commenting = true, mapping, items = [], pending = null, kind = 'comment', editingId = null, detail = null;
let commentDraft='',patchExplanation=null,patchSubmitting=false;
let replyTimer=null,replyGeneration=0;
function stopReply(){clearTimeout(replyTimer);replyTimer=null;++replyGeneration;}
function explanationStatus(message,error=false){
  const node=$('explanation-status');node.textContent=message;node.classList.toggle('is-error',error);node.setAttribute('role',error?'alert':'status');
}
function showExplanation(item) {
  stopReply();
  const visible=kind==='explanation' && !!(item?.explanationRequestId || item?.explanationStatus);
  $('explanation-box').hidden=!visible;
  renderMarkdown($('explanation-answer'),visible ? normalize(item.explanationAnswer || '') : '','rendered');
  explanationStatus(visible ? item.explanationError || (item.explanationAnswer ? `Explanation${item.explanationModel ? ' · '+item.explanationModel : ''}` : 'Waiting for the model’s response. This may take a few seconds…') : '',!!(visible && item.explanationError));
  if(!visible || !item.explanationRequestId || item.explanationAnswer || item.explanationError)return;
  const generation=replyGeneration,current=revision,id=item.id,requestId=item.explanationRequestId,started=Date.now();
  async function poll(){
    const active=()=>generation===replyGeneration && current===revision && editingId===id && !$('composer').hidden;
    if(!active())return;
    try {
      const reply=await serverData('read_markdown_explanation',{requestId});
      if(!active())return;
      const note=pending?.patch?patchExplanation:items.find(note=>note.id===id && note.explanationRequestId===requestId);
      if(!note)return;
      if(reply.status==='answered' && typeof reply.answer==='string'){
        note.explanationAnswer=reply.answer;note.explanationStatus='answered';if(!pending?.patch)persist();
        renderMarkdown($('explanation-answer'),normalize(reply.answer),'rendered');explanationStatus(`Explanation${note.explanationModel ? ' · '+note.explanationModel : ''}`);positionComposer();return;
      }
      if(Date.now()-started>=5*60*1000){$('explanation-status').textContent='No reply yet. Reopen this note to check again.';return;}
      replyTimer=setTimeout(poll,1000);
    } catch(error){if(active()){explanationStatus(error.message,true);}}
  }
  // Defer until open() has made the composer visible.
  replyTimer=setTimeout(poll,0);
}
const wordViewer=createWordViewer($('document'),{
  onSelection(selection,anchor){if(commenting){offerSelection(selection,anchor);}},
  onNote(item,anchor){open(item,item,anchor);},onDismiss:()=>close(),
  onZoom:updateDocumentZoom,onPage:(number,total)=>{$('pdf-page-float').textContent=`${number}/${total}`;$('pdf-page-input').value=number;$('pdf-page-input').max=total;$('pdf-page-total').textContent=`/ ${total}`;}
});
const fileRefresh=createFileRefresh({
  isBusy:()=>document.body.classList.contains('patch-review-open') || batchSending || !$('composer').hidden || source!==diskSource || saving,
  async apply(text,metadata) {
    const scroll=viewport().scrollTop,generation=incomingRevision;
    let preview=filePreview?.kind==='image' ? {...filePreview,url:text} : filePreview;
    if(preview?.kind==='word')preview={...preview,data:text,...await renderWordPreview(text)};
    if(generation!==incomingRevision)return;
    if(await displayFile(fileName,preview?.kind==='word' ? preview.text : preview?.kind==='image' ? '' : text,identity,true,sourcePath,preview)) {
      if(metadata?.etag)currentEtag=metadata.etag;fileRefresh.setText(text,metadata?.etag);
      scrollViewport({top:scroll});
      updateStatus('File refreshed. Annotations for the previous version remain in its saved draft.');
    }
  },
  onError:error=>updateStatus(`Cannot refresh file: ${error.message}. Retrying automatically.`)
});
let documentLoadingTimer;
function setDocumentLoading(active){
  clearTimeout(documentLoadingTimer);
  const indicator=$('document-loading');indicator.hidden=!active;
  $('document').setAttribute('aria-busy',String(active));
  if(active){viewport().scrollTop=0;indicator.textContent='Loading...';documentLoadingTimer=setTimeout(()=>{indicator.textContent='Opening a large file, it may take a few seconds...';},2000);}
}
function beginFileChange(){clearPdfRefresh();setDocumentLoading(false);hideSelectionAction();wordViewer.destroy();clearTimeout(pdfPoll);pdfDocument=null;pdfViewer.destroy();clearTimeout(saveTimer);if(syncTimer!==null){clearTimeout(syncTimer);syncTimer=null;syncAnnotations().catch(()=>{});}fileRefresh.stop();++revision;}
const storageKey = () => `markdown-review:v1:${identity}:${documentHash}`;
const workingKey=()=>`markdown-review:working:${identity}:${diskHash}`;
async function hashText(text){const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));return [...new Uint8Array(digest)].map(n=>n.toString(16).padStart(2,'0')).join('');}
const removedNotesKey='markatlas:removed-annotations:v1';
let removedNoteIds=new Set();
try{removedNoteIds=new Set(JSON.parse(localStorage.getItem(removedNotesKey) || '[]'));}catch{}
const batchKey='markatlas:review-batch:v1';
let batchEntries=new Map(),batchSending=false,composerUnavailable=false;
try{batchEntries=new Map(JSON.parse(localStorage.getItem(batchKey) || '[]').filter(([id])=>!removedNoteIds.has(id)));}catch{}
let projectDrafts={},dirtyIdentities=new Set(),projectSaveTimer=null,projectSaveQueue=Promise.resolve();
function saveProjectState(){clearTimeout(projectSaveTimer);projectSaveTimer=setTimeout(()=>flushProjectState().catch(error=>updateStatus(`Cannot save project notes: ${error.message}`)),200);}
async function flushProjectState(){
 clearTimeout(projectSaveTimer);const root=project?.rootPath;if(!root || project.singleFile)return;
 const changedIdentities=[...dirtyIdentities];dirtyIdentities.clear();
 const state={entries:[...batchEntries].filter(([,entry])=>entryRoot(entry)===normalizedRoot(root)),drafts:JSON.parse(JSON.stringify(projectDrafts)),changedIdentities,removedIds:[...removedNoteIds]};
 projectSaveQueue=projectSaveQueue.catch(()=>{}).then(()=>serverData('review_project_state',{root,state}));
 try{return !!(await projectSaveQueue)?.saved;}catch(error){for(const identity of changedIdentities)dirtyIdentities.add(identity);throw error;}
}
const queuePrefix='markatlas:review-project:v2:';
const normalizedRoot=root=>root?.replace(/[\\/]+$/,'') || '';
const entryRoot=entry=>normalizedRoot(entry.root || entry.item?.projectRoot || entry.item?.pdf?.root);
try{for(const key of Object.keys(localStorage).filter(key=>key.startsWith(queuePrefix)))for(const [id,entry] of JSON.parse(localStorage.getItem(key)||'[]'))if(!removedNoteIds.has(id))batchEntries.set(id,entry);}catch{}
function currentBatchEntries(){const root=normalizedRoot(fileName && !sourcePath ? null : project?.rootPath);return [...batchEntries.values()].filter(entry=>entryRoot(entry)===root);}
function saveBatchQueue(){try{
 const root=normalizedRoot(fileName && !sourcePath ? null : project?.rootPath);
 for(const [id,entry] of JSON.parse(localStorage.getItem(queuePrefix+encodeURIComponent(root))||'[]'))if(!removedNoteIds.has(id) && entry.identity!==identity && !dirtyIdentities.has(entry.identity))batchEntries.set(id,entry);
 saveProjectState();
  // Migrate the legacy queue once without discarding any project's notes.
  if(localStorage.getItem(batchKey)!==null){
    const groups=new Map();for(const pair of batchEntries){const key=queuePrefix+encodeURIComponent(entryRoot(pair[1]));if(!groups.has(key))groups.set(key,[]);groups.get(key).push(pair);}
    for(const [key,entries] of groups)localStorage.setItem(key,JSON.stringify(entries));
    localStorage.removeItem(batchKey);
  }
  localStorage.setItem(queuePrefix+encodeURIComponent(root),JSON.stringify([...batchEntries].filter(([,entry])=>entryRoot(entry)===root)));
}catch{updateStatus('Review queue is kept for this session only.');}}

window.addEventListener('storage',event=>{
 const root=normalizedRoot(project?.rootPath);if(!root)return;
 if(event.key===removedNotesKey){try{for(const id of JSON.parse(event.newValue || '[]'))removedNoteIds.add(id);}catch{}items=items.filter(note=>!removedNoteIds.has(note.id));for(const id of removedNoteIds)batchEntries.delete(id);renderBatch();return;}
 if(event.key!==queuePrefix+encodeURIComponent(root))return;
 try{const incoming=new Map(JSON.parse(event.newValue || '[]'));for(const [id,entry] of batchEntries)if(entryRoot(entry)===root && entry.identity!==identity)batchEntries.delete(id);for(const [id,entry] of incoming)if(!removedNoteIds.has(id)){batchEntries.set(id,entry);if(entry.identity===identity && !items.some(note=>note.id===id))items.push(entry.item);}renderBatch();}catch{}
});
function updateBatchDraft(){
  if(!identity || (filePreview && filePreview.kind!=='word'))return;
  dirtyIdentities.add(identity);
  const rootPrefix=project?.rootPath?.replace(/[\\/]+$/,'');
  const currentPath=sourcePath && rootPrefix && sourcePath.startsWith(rootPrefix+'/') ? sourcePath.slice(rootPrefix.length+1) : (!sourcePath && identity.startsWith('project:')?fileName:null);
  const ids=new Set(items.map(item=>item.id));
  for(const [id,entry] of batchEntries)if(entry.identity===identity && !ids.has(id))batchEntries.delete(id);
  for(const item of items){
    if(!['comment','explanation'].includes(item.kind) || item.batchSentVersion){batchEntries.delete(item.id);continue;}
    batchEntries.set(item.id,{identity,root:item.pdf?.root || (sourcePath && currentPath?project?.rootPath:null) || null,path:item.pdf?.path || currentPath || null,etag:currentEtag,item:{...item},storage:storageKey(),working:workingKey()});
  }
  saveBatchQueue();renderBatch();
}
let noteFilter=null;
for(const [id,value] of [['filter-comments','comment'],['filter-explanations','explanation']])$(id).addEventListener('click',()=>{noteFilter=noteFilter===value?null:value;renderBatch();});
function renderBatch(){
  const all=currentBatchEntries(),comments=all.filter(entry=>entry.item.kind==='comment'),entries=all.filter(entry=>!noteFilter || entry.item.kind===noteFilter).sort((a,b)=>(a.path||a.item.sourceName||'').localeCompare(b.path||b.item.sourceName||'') || (a.item.startOffset||0)-(b.item.startOffset||0));
  $('filter-comments').setAttribute('aria-pressed',String(noteFilter==='comment'));$('filter-explanations').setAttribute('aria-pressed',String(noteFilter==='explanation'));$('comments-empty').textContent=all.length?'No notes match this filter.':'No notes yet. Select text to comment or explain.';
  $('review-batch').hidden=!document.body.classList.contains('comments-open') && (!commenting || !all.length);$('comments-empty').hidden=!!entries.length;
  const fileCount=new Set(entries.map(entry=>JSON.stringify([entry.root || entry.item.pdf?.root || '',entry.path || entry.item.sourcePath || entry.item.sourceName]))).size;
  $('review-count').textContent=`${fileCount} ${fileCount===1?'File':'Files'}, ${entries.length} ${entries.length===1?'Annotation':'Annotations'}`;
  $('review-cancel-all').disabled=batchSending || !comments.length;
  $('review-send').disabled=batchSending || !comments.length;$('review-send').textContent=batchSending?'Sending…':'Send';
  $('review-send-new').hidden=!composerUnavailable;
  $('review-send-new').disabled=batchSending || !comments.length;
  const list=$('review-list');list.replaceChildren();
  for(const entry of entries){
    const row=document.createElement('div');row.className='review-row';row.dataset.noteId=entry.item.id;row.classList.toggle('active',editingId===entry.item.id);
    const location=document.createElement('p');location.className='review-location';location.textContent=`${entry.path || entry.item.sourceName} · ${entry.item.pdf?`Page ${entry.item.pdf.page}`:`Lines ${entry.item.startLine}–${entry.item.endLine}`}`;
    const quote=document.createElement('p');quote.className='review-excerpt';quote.textContent=entry.item.selectedText;
    const comment=document.createElement('p');comment.textContent=entry.item.kind==='explanation' ? `Explanation · ${entry.item.message || entry.item.explanationAnswer || entry.item.explanationStatus || 'Open explanation'}` : entry.item.message;
    const remove=document.createElement('button');remove.className='review-remove';remove.innerHTML='<svg width=14 height=14 viewBox="0 0 24 24" fill=none stroke=currentColor stroke-width=1.6 aria-hidden=true><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/></svg>';remove.setAttribute('aria-label',entry.item.kind==='explanation'?'Delete explanation':'Delete comment');remove.disabled=batchSending;
    remove.addEventListener('click',event=>{event.stopPropagation();removeReviewNotes([entry.item.id]);});
    row.tabIndex=0;row.setAttribute('role','button');row.setAttribute('aria-label',`Go to annotation in ${entry.path || entry.item.sourceName}`);
    const locate=()=>locateReviewEntry(entry);
    row.addEventListener('click',event=>{event.stopPropagation();locate().catch(error=>{$('review-error').textContent=error.message;});});row.addEventListener('keydown',event=>{if(event.target===row && ['Enter',' '].includes(event.key)){event.preventDefault();row.click();}});
    row.append(location,quote,comment,remove);
    if(entry.item.pdf?.screenshot || entry.item.html?.screenshot){const image=document.createElement('img');image.src=entry.item.pdf?.screenshot || entry.item.html.screenshot;image.alt='Screenshot for this comment';row.append(image);}
    list.append(row);
  }
}
async function locateReviewEntry(entry,local=false){
  if(!local && splitView?.activePane()==='secondary')return splitView.call('locateReview',entry);
  if(entry.identity!==identity)await openPaneFile(entry.root,entry.path);
  if(entry.identity===identity){$('review-batch').classList.add('preview-dismissed');const note=items.find(n=>n.id===entry.item.id)||entry.item;open(note,note);if(pdfDocument && note.pdf){selectionAnchor=pdfViewer.goToNote(note);positionComposer();}}
}
function pruneReviewNotes(ids){
  for(const id of ids){const entry=batchEntries.get(id);if(entry?.identity)dirtyIdentities.add(entry.identity);removedNoteIds.add(id);batchEntries.delete(id);}
  try{
    // Purge every cached version, not only the last draft key of an open file.
    for(const key of Object.keys(localStorage)){
      const working=key.startsWith('markdown-review:working:');
      if(!working && !key.startsWith('markdown-review:v1:'))continue;
      try{const data=JSON.parse(localStorage.getItem(key));const notes=working?data?.items:data;if(!Array.isArray(notes))continue;
        const retained=notes.filter(note=>!removedNoteIds.has(note.id) && !note.batchSentVersion);
        if(retained.length!==notes.length)localStorage.setItem(key,JSON.stringify(working?{...data,items:retained}:retained));
      }catch{}
    }
    localStorage.setItem(removedNotesKey,JSON.stringify([...removedNoteIds]));
  }catch{updateStatus('Annotation removal is kept for this session only.');}
  for(const draft of Object.values(projectDrafts))draft.items=draft.items.filter(note=>!removedNoteIds.has(note.id));
  items=items.filter(note=>!removedNoteIds.has(note.id) && !note.batchSentVersion);
  saveBatchQueue();
}
function removeReviewNotes(ids){pruneReviewNotes(ids);persist();syncAnnotations().catch(()=>{});close(true);}
$('review-cancel-all').addEventListener('click',()=>{
  if(batchSending)return;
  removeReviewNotes(currentBatchEntries().filter(entry=>entry.item.kind==='comment').map(entry=>entry.item.id));
  $('review-count').setAttribute('aria-expanded','false');$('review-batch').classList.remove('expanded');$('review-error').textContent='';renderBatch();
});
$('review-count').addEventListener('click',()=>{$('review-batch').classList.remove('minimized');const open=$('review-count').getAttribute('aria-expanded')!=='true';$('review-count').setAttribute('aria-expanded',String(open));$('review-batch').classList.toggle('expanded',open);$('review-batch').classList.toggle('preview-dismissed',!open);});
$('review-minimize').addEventListener('click',()=>{
  if(document.body.classList.contains('comments-open'))$('comments-toggle').click();
  $('review-batch').classList.remove('expanded');$('review-batch').classList.add('minimized','preview-dismissed');
  $('review-count').setAttribute('aria-expanded','false');$('review-count').focus({preventScroll:true});
});
$('review-batch').addEventListener('pointerleave',()=>$('review-batch').classList.remove('preview-dismissed'));
async function sendQueuedReview(target='active'){
  if(batchSending)return;
  const previewChanges=$('preview-changes').getAttribute('aria-pressed')==='true';
  batchSending=true;$('review-error').textContent='';renderBatch();
  const main=document.querySelector('main'),header=document.querySelector('header');main.inert=true;header.inert=true;$('project-drawer').inert=true;$('composer').inert=true;
  try{
    await saveCode();if(hashWork)await hashWork;
    if(!pdfDocument && !filePreview && project?.rootPath && activeProjectPath && source===diskSource){const latest=await serverData('read_markdown_project_file',{root:project.rootPath,path:activeProjectPath});if(typeof latest.text==='string' && latest.text!==source){applyWorkingText(latest.text);diskSource=latest.text;diskHash=await hashText(diskSource);currentEtag=latest.etag;render();}}
    await syncAnnotations();updateBatchDraft();
    const entries=currentBatchEntries().filter(entry=>entry.item.kind==='comment');
    if(!entries.length){updateStatus('No comments remain to send.');return;}
    const result=await serverData('prepare_review_batch',{entries:entries.map(entry=>({...entry,item:{...entry.item,html:entry.item.html?{...entry.item.html,screenshot:undefined}:undefined,pdf:entry.item.pdf?{...entry.item.pdf,screenshot:undefined}:undefined}}))});
    const prepared=result.entries.map(entry=>({...entry,item:{...entry.item,html:entry.item.html?{...entry.item.html,screenshot:batchEntries.get(entry.item.id)?.item.html?.screenshot}:undefined,pdf:entry.item.pdf?{...entry.item.pdf,screenshot:batchEntries.get(entry.item.id)?.item.pdf?.screenshot}:undefined}}));
    const validIds=new Set(prepared.map(entry=>entry.item.id));
    const obsolete=entries.filter(entry=>!validIds.has(entry.item.id));
    if(obsolete.length)removeReviewNotes(obsolete.map(entry=>entry.item.id));
    if(!prepared.length){updateStatus('Obsolete comments removed. No comments remain to send.');return;}
    await sendReviewBatch(extensions,prepared,target,project?.rootPath,{previewChanges});
    composerUnavailable=false;
    removeReviewNotes(entries.map(entry=>entry.item.id));updateStatus(target==='new'?'Review sent with separate attachments to a new chat.':'Review sent with separate attachments to the current conversation.');
  }catch(error){composerUnavailable=error.code==='COMPOSER_UNAVAILABLE';$('review-error').textContent=error.message;}
  finally{batchSending=false;main.inert=false;header.inert=false;$('project-drawer').inert=false;$('composer').inert=false;renderBatch();}
}
const patchReview=createPatchReview({document,call:serverData,onSelection:offerSelection,onClose:()=>close(),send:async message=>{if(!extensions.message)throw Error('No chat input is available.');const result=await extensions.message.send(message);if(result?.isError)throw Error('Could not send patch comments.');return result;},beforeOpen:async()=>{if(!await canLeaveFile())return false;close();hideSelectionAction();return true;},onApplied:async()=>{const path=activeProjectPath;if(path){activeProjectPath=null;await openProjectFile(path);}}});
try{$('preview-changes').setAttribute('aria-pressed',String(localStorage.getItem('markatlas:preview-changes')==='true'));}catch{}
$('preview-changes').addEventListener('click',()=>{const active=$('preview-changes').getAttribute('aria-pressed')!=='true';$('preview-changes').setAttribute('aria-pressed',String(active));try{localStorage.setItem('markatlas:preview-changes',String(active));}catch{}});
$('review-send').addEventListener('click',()=>sendQueuedReview());
$('review-send-new').addEventListener('click',()=>sendQueuedReview('new'));
renderBatch();
const recoveryKey=()=>`markatlas:unsaved:${identity}`;
function readLocalDraft(key,fallback=null){try{return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback;}catch{return fallback;}}
let saveConflict=false,conflictBase=null;
function persist() {
  if(filePreview && filePreview.kind!=='word')return true;
  if(identity && sourcePath && project?.rootPath && sourcePath.startsWith(project.rootPath+'/'))projectDrafts[identity]={text:source,base:diskSource,items};
  updateBatchDraft();
  try {if(source!==diskSource)localStorage.setItem(recoveryKey(),JSON.stringify({text:source,base:saveConflict ? conflictBase ?? diskSource : diskSource,items}));else localStorage.removeItem(recoveryKey());localStorage.setItem(storageKey(),JSON.stringify(items));localStorage.setItem(workingKey(),JSON.stringify({text:source,items}));return true;}
  catch {return false;}
}
function syncAnnotations(checkpointAnnotationId){
  if(!identity || (filePreview && filePreview.kind!=='word'))return Promise.resolve();
  const data={...(project?.rootPath && !project.singleFile && sourcePath?.startsWith(project.rootPath+'/')?{root:project.rootPath}:{}),identity,...(checkpointAnnotationId?{checkpointAnnotationId}:{}),sourceName:fileName,...(sourcePath?{sourcePath}:{}),text:source,baseText:diskSource,annotations:items.map(item=>({...item,...(item.html?{html:{...item.html,screenshot:undefined}}:{}),...(item.pdf?{pdf:{...item.pdf,screenshot:undefined}}:{}),sourceText:undefined,selectedText:undefined,originalSnapshot:item.originalSnapshot ? {...item.originalSnapshot,selectedText:Array.from(item.originalSnapshot.selectedText || '').slice(0,180).join('')} : undefined}))};
  syncQueue=syncQueue.catch(()=>{}).then(()=>serverData('update_review_document',data));return syncQueue;
}
function applyWorkingText(text,changes,record=true,caret){
  hideSelectionAction();window.CSS?.highlights?.delete("markatlas-selection");
  if(filePreview)return;
  if(text===source)return;
  if(record)editHistory.record(source,text,caret ?? (codeFile || mode==='source' ? codeEditor.caret() : renderedCaret ?? 0));
  if(!$('composer').hidden){$('composer').hidden=true;editingId=null;selectionAnchor=null;document.body.classList.remove('composing');}

  const generation=revision;const before=source;items=moveAnnotations(items,before,text,changes);source=text;pending=null;persist();
  const work=hashText(text).then(hash=>{if(generation!==revision || source!==text)return;documentHash=hash;items=items.map(item=>({...item,documentHash:hash}));persist();}).finally(()=>{if(hashWork===work)hashWork=null;});hashWork=work;
  clearTimeout(syncTimer);syncTimer=setTimeout(()=>{renderNavigation();syncAnnotations().catch(()=>{if(items.some(x=>x.liveReference)){$('code-error').hidden=false;$('code-error').textContent='Live annotation sync failed. Reopen this viewer before acting on old chat attachments.';}});},200);
  scheduleSave();updateEditorControls();
}
function scheduleSave(){clearTimeout(saveTimer);saveTimer=setTimeout(()=>saveCode(),500);}
let wrapLines=readLocalDraft('markatlas:wrap-lines',false)===true;
const codeEditor=createCodeEditor($('document'),{
  onChange(text,changes,caret){applyWorkingText(text,changes,true,caret);return items;},
  onSelection(selection,anchor){if(commenting && !filePreview && codeMode!=='changes'){offerSelection(selection,anchor);}},
  onNote(item,anchor){open(item,item,anchor);},onSave:()=>saveCode(),
  onPasteImage:pasteMarkdownImage,
  onError(error){$('code-error').hidden=false;$('code-error').textContent=`Could not paste image: ${error.message}`;}
});
codeEditor.setLineWrapping(wrapLines);
async function pasteMarkdownImage(file){
  if(!file)throw Error('No image was found on the clipboard.');
  if(file.size>20*1024*1024)throw Error('Images must be under 20 MB.');
  const bytes=new Uint8Array(await file.arrayBuffer());
  if(project?.rootPath && activeProjectPath && !project.singleFile){
    const folder=activeProjectPath.includes('/')?activeProjectPath.slice(0,activeProjectPath.lastIndexOf('/')):'';
    const saved=await serverData('paste_review_project_image',{root:project.rootPath,folder,mime:file.type,data:base64Bytes(bytes)});
    if(!pastedImagePaths.has(project.rootPath))pastedImagePaths.set(project.rootPath,new Set());
    pastedImagePaths.get(project.rootPath).add(saved.path);
    return `![image](${saved.name})`;
  }
  if(bytes.length>1024*1024)throw Error('Open a project folder to paste images over 1 MB.');
  return `![image](data:${file.type};base64,${base64Bytes(bytes)})`;
}
function isSourceOnlyFile(){return !!fileName && codeFile && !filePreview && !pdfDocument && !isLatex(fileName) && !/\.html?$/i.test(fileName);}
function isSourceView(){return !!fileName && !filePreview && !pdfDocument && (mode==='source' || isSourceOnlyFile());}
function updateEditorControls(){
  const word=filePreview?.kind==='word',paged=!!pdfDocument || word;
  const textDocument=!!fileName && !pdfDocument && !filePreview;
  $('font-tools').hidden=!textDocument;$('document').classList.toggle('text-document',textDocument);
  $('pdf-tools').hidden=!paged;$('pdf-page-float').hidden=!word;$('document').classList.toggle('pdf-document',!!pdfDocument);$('document').classList.toggle('word-document',word);
  $('pdf-zoom-level').setAttribute('aria-label',word?'Fit Word to width':'Fit PDF to width');
  $('pdf-page-float').setAttribute('aria-label',word?'Current Word page':'Current PDF page');
  if(word)updateDocumentZoom(wordViewer.zoom());
  $('pdf-screenshot').hidden=!pdfDocument && !isHtmlPreview();
  $('pdf-screenshot').title=isHtmlPreview()?'Select HTML region':'Circle an area to comment';
  $('pdf-screenshot').setAttribute('aria-label',isHtmlPreview()?'Select HTML region':'Circle an area to comment');
  $('mode-cycle').hidden=!fileName || !!filePreview || isSourceOnlyFile() || (!!pdfDocument && !pdfDocument.main);
  const modeLabel=isMarkdown(fileName)?(mode==='source'?'Source':codeMode==='edit'?'Edit':'Preview'):/\.html?$/i.test(fileName)?(mode==='source'?'Source':'Preview'):'Source';
  toolbarIcon('mode-cycle',modeLabel,modeLabel.toLowerCase());
  $('mode-cycle').title=`${modeLabel} — Preview → Edit → Source (⌘/ / Ctrl+/)`;
  $('mode-cycle').disabled=!isMarkdown(fileName) && !/\.html?$/i.test(fileName) && !pdfDocument;
  $('code-edit').hidden=!fileName || !!pdfDocument || !!filePreview || isSourceOnlyFile();
  $('code-edit').textContent='Edit';
  $('code-edit').setAttribute('aria-pressed',String(codeMode==='edit'));
  $('code-edit').setAttribute('aria-label','Edit');

  $('view-toggle').hidden=!!filePreview || (!!pdfDocument && !pdfDocument.main) || (codeFile && !pdfDocument && !(isLatex(fileName) && linkedPdf?.root===project?.rootPath));$('diff-labels').hidden=codeMode!=='changes';
  $('comment').disabled=!fileName || !!(filePreview && filePreview.kind!=='word') || codeMode==='changes';
}
function markdownOptions(currentPath){
  const selected=project;
  function paths(nodes){return nodes.flatMap(n=>n.type==='directory'?paths(n.children):[n.path]);}
  const names=selected?[...paths(selected.root.children),...(pastedImagePaths.get(selected.rootPath)||[])]:[];
  return {
    searchTag:tag=>nativeNavigation.search(tag),
    toggleTask(offset,state,expected){if(source[offset]!==expected)return;preserveViewport(()=>{applyWorkingText(source.slice(0,offset)+state+source.slice(offset+1),ChangeSet.of({from:offset,to:offset+1,insert:state},source.length),true,offset);render();});},
    async openLink(target){try{const {path,fragment}=resolveObsidianPath(target,currentPath,names);await openProjectFile(path);if(fragment)[...$('document').querySelectorAll('[id]')].find(n=>n.id===fragment.replace(/^\^/,''))?.scrollIntoView();}catch(error){$('status').textContent=error.message;}},
    async resolveEmbed(target){
      if(!selected?.rootPath)return null;
      const {path,fragment}=resolveObsidianPath(target,currentPath,names);
      const snapshot=await serverData('read_markdown_project_file',{root:selected.rootPath,path});
      if(snapshot.kind==='text'){
        if(!isMarkdown(path))return {kind:'text',text:'```\n'+snapshot.text+'\n```'};
        return {...snapshot,text:embeddedSection(snapshot.text,fragment),...markdownOptions(path)};
      }
      return snapshot;
    }
  };
}
let htmlFrameState=null;
function isHtmlPreview(){return /\.html?$/i.test(fileName) && mode==='rendered' && codeMode!=='edit' && !filePreview;}
function frameNotes(){
  htmlFrameState?.frame.contentWindow?.postMessage({markatlas:htmlFrameState.channel,type:'notes',notes:items.map(n=>({id:n.id,startOffset:n.startOffset,endOffset:n.endOffset,selectedText:n.selectedText,html:n.html?{...n.html,screenshot:undefined}:undefined})),active:editingId,pending:!!pending && !editingId,accent:getComputedStyle(document.documentElement).getPropertyValue('--markatlas-accent').trim(),enabled:commenting},'*');
}
function renderHtmlPreview(){
  if(htmlFrameState?.source===source && htmlFrameState.identity===identity && htmlFrameState.frame.isConnected){frameNotes();return;}
  codeEditor.destroy();mapping=null;$('document').contentEditable='false';$('document').classList.remove('markdown-rendered');
  const frame=document.createElement('iframe');frame.id='html-frame';frame.title='HTML web preview';
  // Untrusted file scripts run in an opaque origin, without access to plugin APIs or storage.
  frame.setAttribute('sandbox','allow-scripts');
  const state={frame,channel:crypto.randomUUID(),source,identity,baseURL:null};htmlFrameState=state;
  $('document').replaceChildren(frame);
  const load=async()=>{
    if(project?.rootPath && sourcePath){
      try{const result=await serverData('open_html_web_preview',{root:project.rootPath,path:fileName,launchBrowser:false});state.baseURL=result.url;}catch(error){$('status').textContent=`HTML opened without relative assets: ${error.message}`;}
    }
    if(htmlFrameState===state)frame.srcdoc=htmlPreviewDocument(state.source,state.baseURL,state.channel);
  };load();
}
window.addEventListener('message',event=>{
  const state=htmlFrameState,data=event.data;
  if(!state || event.source!==state.frame.contentWindow || data?.markatlas!==state.channel || !isHtmlPreview())return;
  if(data.type==='ready'){frameNotes();return;}
  if(data.type==='dismiss'){close();return;}
  if(data.type==='region-mode'){$('pdf-screenshot').setAttribute('aria-pressed',String(!!data.active));return;}
  if(data.type==='error'){$('code-error').hidden=false;$('code-error').textContent=String(data.message).slice(0,500);return;}
  if(data.type==='selection'){
    if(!commenting || !Number.isInteger(data.startOffset)||!Number.isInteger(data.endOffset)||data.startOffset<0||data.endOffset>source.length||data.endOffset<=data.startOffset||typeof data.selectedText!=='string')return;
    const box=state.frame.getBoundingClientRect(),rect=data.rect||{};
    const anchor={left:box.left+(Number(rect.left)||0),right:box.left+(Number(rect.right)||0),top:box.top+(Number(rect.top)||0),bottom:box.top+(Number(rect.bottom)||0)};
    if(data.html?.screenshot && (!/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(data.html.screenshot) || data.html.screenshot.length>8*1024*1024))return;
    if(data.html?.region && !['x','y','width','height'].every(k=>Number.isFinite(data.html.region[k]) && data.html.region[k]>=0))return;
    open({html:data.html,startOffset:data.startOffset,endOffset:data.endOffset,selectedText:data.selectedText,startLine:source.slice(0,data.startOffset).split('\n').length,endLine:source.slice(0,data.endOffset).split('\n').length,mappingStatus:'source-span'},null,anchor);
  }
  if(data.type==='note'){const note=items.find(n=>n.id===data.id);if(note)open(note,note);}
  if(data.type==='link'){
    try{const base=new URL(state.baseURL),url=new URL(data.url),prefix=base.pathname.split('/').slice(0,2).join('/')+'/';
      if(url.origin===base.origin && url.pathname.startsWith(prefix))openProjectFile(decodeURIComponent(url.pathname.slice(prefix.length)));
      else $('status').textContent='External link: open it separately to keep this review available.';
    }catch{}
  }
});
function render() {
  renderNavigation();updateLayout();
  const active=items.filter(item=>item.anchorStatus!=='deleted' && (item.pdf?.region || item.endOffset>item.startOffset));
  const visible = pending && !editingId ? [...active,{...pending,id:'pending-selection',temporary:true}] : active;
  updateEditorControls();
  if(isHtmlPreview()){renderHtmlPreview();return;}
  htmlFrameState=null;
  if(!fileName){
    codeEditor.destroy();mapping=null;$('document').contentEditable='false';
    const prompt=document.createElement('p');prompt.className='empty';prompt.textContent='Open a file to read, understand, comment, and edit with AI assistant';
    $('document').replaceChildren(prompt);setProjectOpen(true);return;
  }
  if(filePreview?.kind==='word'){
    if($('document').querySelector('.cm-editor'))codeEditor.destroy();mapping=null;$('document').contentEditable='false';
    wordViewer.show(filePreview,visible);return;
  }
  if(filePreview?.kind==='image'){
    codeEditor.destroy();mapping=null;$('document').contentEditable='false';
    const figure=document.createElement('figure'),image=document.createElement('img'),caption=document.createElement('figcaption');
    figure.className='image-preview';image.src=filePreview.url;image.alt=fileName;image.draggable=false;caption.textContent=fileName;
    image.addEventListener('error',()=>{caption.textContent=`Cannot display ${fileName}. The image may be damaged or its format unavailable in this browser.`;});
    figure.append(image,caption);$('document').append(figure);return;
  }
  if(pdfDocument){if($('document').querySelector('.cm-editor'))codeEditor.destroy();mapping=null;$('document').contentEditable='false';$('view-toggle').textContent='View source';pdfViewer.show(pdfDocument,visible);return;}
  const editorMode=codeFile || mode==='source' || codeMode==='edit' || codeMode==='changes';
  if($('document').contentEditable!=='false')$('document').contentEditable='false';
  if(editorMode){mapping=null;codeEditor.show({name:fileName,text:source,original:diskSource,mode:codeMode,items:visible,live:isMarkdown(fileName) && mode==='rendered' && codeMode==='edit',markdownOptions:markdownOptions(fileName)});$('view-toggle').textContent=isLatex(fileName) && linkedPdf?.root===project?.rootPath?'View PDF':mode==='source'?'Preview':'View source';return;}
  codeEditor.destroy();
  mapping = renderMarkdown($('document'),source,mode,visible,markdownOptions(fileName));
  $('document').contentEditable=codeMode==='edit'?'true':'false';
  if(codeMode==='edit' && (!source || /\n\n$/.test(source)))mapping.appendCaret(source.length);
  $('view-toggle').textContent = mode === 'source' ? 'Preview' : 'View source';
}
async function canLeaveFile(){
  if(!await patchReview.canLeave())return false;
  if(displayWork)await displayWork;
  await saveCode();
  return !project?.rootPath || !activeProjectPath || source===diskSource || persist();
}
let treeRefreshTimer;
async function saveCode(){
  clearTimeout(saveTimer);
  if(displayWork || saveConflict)return;
  if(saveWork)return saveWork;
  if(pdfDocument || filePreview || source===diskSource || !project?.rootPath || !activeProjectPath || !currentEtag)return;
  const generation=revision,projectRoot=project.rootPath,path=activeProjectPath;
  saving=true;$('reload-disk').hidden=true;$('code-error').hidden=true;
  saveWork=(async()=>{
    try {
      // Serialize writes and include edits made while a previous write was in flight.
      while(generation===revision && source!==diskSource){
        const text=source,expectedEtag=currentEtag;
        let snapshot;
        try{snapshot=await serverData('save_review_project_file',{root:projectRoot,path,text,expectedEtag});}
        catch(error){
          const latest=await serverData('read_markdown_project_file',{root:projectRoot,path});
          if(generation!==revision)return;
          if(!latest.readOnly && normalize(latest.text)===text)snapshot=latest;
          else if(!latest.readOnly && normalize(latest.text)===diskSource)snapshot=await serverData('save_review_project_file',{root:projectRoot,path,text,expectedEtag:latest.etag});
          else {saveConflict=true;conflictBase=diskSource;throw error;}
        }
        if(generation!==revision)return;
        const savedText=normalize(snapshot.text),savedHash=await hashText(savedText);
        if(generation!==revision)return;
        saveConflict=false;conflictBase=null;currentEtag=snapshot.etag;diskSource=savedText;diskHash=savedHash;
        persist();syncAnnotations().catch(()=>{});fileRefresh.setText(diskSource,snapshot.etag);
        clearTimeout(treeRefreshTimer);treeRefreshTimer=setTimeout(()=>loadWorkspace(),1200);
      }
    } catch(error){if(generation===revision){$('code-error').textContent=`Autosave failed: ${error.message} Your draft is kept locally; you can switch files and return to it. Use Reload from disk to discard this draft, or copy your edits before resolving the disk change.`;$('code-error').hidden=false;$('reload-disk').hidden=false;}}
    finally{saving=false;saveWork=null;updateEditorControls();}
  })();
  return saveWork;
}
function focusEditingDocument(){if(pdfDocument || codeMode!=='edit')return;if($('document').querySelector('.cm-editor'))codeEditor.focus();else{$('document').focus({preventScroll:true});if(renderedCaret!==null)mapping?.focusAt(renderedCaret);}}
function preserveViewport(action){
  const x=viewport().scrollLeft,y=viewport().scrollTop,scrollers=[...document.querySelectorAll('main,#document,.cm-scroller')].map(el=>({el,x:el.scrollLeft,y:el.scrollTop}));
  action();const restore=()=>{for(const p of scrollers)if(p.el.isConnected){p.el.scrollLeft=p.x;p.el.scrollTop=p.y;}scrollViewport(x,y);};restore();requestAnimationFrame(restore);
}
function viewportCaret(){
  if(codeFile||mode==='source')return codeEditor.caret();
  const walker=document.createTreeWalker($('document'),4);let node,best=null,distance=Infinity;
  while(node=walker.nextNode()){const range=document.createRange();range.selectNodeContents(node);const rect=range.getBoundingClientRect();if(!rect.height||rect.bottom<70||rect.top>viewHeight())continue;const span=mapping?.resolve(range);if(!span)continue;const d=Math.abs((rect.top+rect.bottom)/2-viewHeight()/2);if(d<distance){best=span.startOffset;distance=d;}}
  return best??renderedCaret;
}
$('code-edit').addEventListener('click',()=>{const caret=viewportCaret();preserveViewport(()=>{editHistory.boundary();close(false);codeMode=codeMode==='edit'?'review':'edit';renderedCaret=caret;render();if(codeMode==='edit' && caret!==null)codeEditor.focusAt(caret);});});
$('reload-disk').addEventListener('click',async()=>{if(!window.confirm('Discard this local draft and reload the disk version?'))return;const snapshot=await serverData('read_markdown_project_file',{root:project.rootPath,path:activeProjectPath});localStorage.removeItem(recoveryKey());localStorage.removeItem(workingKey());await displaySnapshot(activeProjectPath,snapshot,identity,sourcePath);currentEtag=snapshot.etag;fileRefresh.setText(diskSource,currentEtag);});

window.addEventListener('beforeunload',e=>{if(project?.rootPath && activeProjectPath && source!==diskSource){e.preventDefault();e.returnValue='';}});
function updateActiveNoteHighlight(){
  for(const mark of $('document').querySelectorAll('[data-annotation]'))mark.classList.toggle('annotation-active',!!editingId && mark.dataset.annotation===editingId);
}
// CodeMirror replaces preview widgets as the caret moves; retain the selected note color.
new MutationObserver(updateActiveNoteHighlight).observe($('document'),{childList:true,subtree:true});
function close(renderDocument=false) {
  hideSelectionAction();window.CSS?.highlights?.delete("markatlas-selection");
  stopReply();
  $('composer').hidden = true; pending = null; editingId = null;updateActiveNoteHighlight();
  // Repaint only persisted HTML notes; discard the temporary selected range.
  frameNotes();codeEditor.setNotes(items);if(filePreview?.kind==='word')wordViewer.show(filePreview,items);
  if(pdfDocument)pdfViewer.show(pdfDocument,items);
  selectionAnchor = null;document.body.classList.remove('composing');if(renderDocument)render();
  queueMicrotask(()=>fileRefresh.check());
}
function setDetail(value) {
  detail = value;
  for (const length of ['short','medium','long']) $(`detail-${length}`).setAttribute('aria-checked',String(length === detail));
}
function sameSelection(a,b){
  return a && b && a.startOffset===b.startOffset && a.endOffset===b.endOffset && a.selectedText===b.selectedText
    && a.pdf?.page===b.pdf?.page && JSON.stringify(a.pdf?.region)===JSON.stringify(b.pdf?.region) && JSON.stringify(a.html?.region)===JSON.stringify(b.html?.region);
}
function setKind(value,selectNote=true) {
  if(selectNote && value!==kind){
    if(kind==='comment')commentDraft=$('message').value;
    const counterpart=pending?.patch?(value==='explanation'?patchExplanation:null):items.find(item=>item.kind===value && sameSelection(item,pending));
    editingId=counterpart?.id || null;
    if(value==='comment')$('message').value=counterpart?.message ?? commentDraft;
    $('delete').hidden=!counterpart;
  }
  if(value === 'explanation')setDetail(null);
  kind = value;
  $('kind-comment').setAttribute('aria-pressed',String(kind === 'comment'));
  $('kind-explanation').setAttribute('aria-pressed',String(kind === 'explanation'));
  $('comment-input').hidden = kind !== 'comment';
  $('explanation-options').hidden = kind !== 'explanation';
  showExplanation(pending?.patch?patchExplanation:items.find(item=>item.id===editingId));
  positionComposer();
}
function open(selection,item = null,anchor = null) {
  if(!selection.patch && filePreview && filePreview.kind!=='word')return;
  editHistory.boundary();
  const draft=sameSelection(pending,selection)?commentDraft:'';
  selectionAnchor = anchor;
  pending = Object.fromEntries(['startOffset','endOffset','startLine','endLine','selectedText','mappingStatus','pdf','word','html','patch'].map(key => [key,selection[key]]));
  if(pdfDocument)pdfViewer.show(pdfDocument,[...items,...(!item?[{...pending,id:'pending-selection',temporary:true}]:[])]);
  if(selection.patch)patchExplanation=null;
  editingId = item?.id || null;
  const shot=selection.pdf?.screenshot || selection.html?.screenshot;
  $('screenshot-preview').hidden=!shot;
  if(shot)$('screenshot-preview').src=shot;else $('screenshot-preview').removeAttribute('src');
  $('quote').textContent = selection.selectedText;
  $('location').textContent = selection.patch?`${selection.patch.path} · Patch revision ${selection.patch.expectedRevision}`:selection.word?`${fileName} · Word selection`:selection.pdf?`${fileName} · PDF page ${selection.pdf.page}`:`${fileName} · lines ${selection.startLine}–${selection.endLine}`;
  $('mapping').hidden = selection.mappingStatus !== 'source-span';
  commentDraft=item?.kind==='comment'?item.message || '':draft;
  $('message').value = commentDraft;
  $('explanation-prompt').value=item?.explanationPrompt || '';
  $('feedback').textContent = '';
  $('delete').hidden = !item;
  setDetail(null); setKind(item?.kind || 'comment',false);
  $('composer').hidden = false;document.body.classList.add('composing');
  hideSelectionAction();
  if(selection.patch){const selected=window.getSelection();if(window.Highlight && window.CSS?.highlights && selected?.rangeCount)window.CSS.highlights.set('markatlas-selection',new Highlight(selected.getRangeAt(0).cloneRange()));resizeMessage();positionComposer();return;}
  codeEditor.setNotes([...items,...(!item?[{...pending,temporary:true}]:[])]);
  if(filePreview?.kind==='word')wordViewer.show(filePreview,[...items,...(!item?[{...pending,temporary:true}]:[])]);
  const keepSelection=codeMode==='edit' && !item && !pdfDocument;
  updateActiveNoteHighlight();
  if(item){for(const row of $('review-list').querySelectorAll('.review-row'))row.classList.toggle('active',row.dataset.noteId===item.id);if(document.body.classList.contains('comments-open'))$('review-list').querySelector('.active')?.scrollIntoView?.({block:'nearest'});}
  if(isHtmlPreview() && item){frameNotes();htmlFrameState?.frame.contentWindow?.postMessage({markatlas:htmlFrameState.channel,type:'locate',note:item},'*');}
  if(mapping && item)mapping.selectSpan(pending.startOffset,pending.endOffset,true);else if(item && !pdfDocument && !filePreview && !isHtmlPreview())codeEditor.findSpan(pending.startOffset,pending.endOffset);resizeMessage();positionComposer();
  const nativeSelection=window.getSelection();if(window.Highlight && window.CSS?.highlights && nativeSelection?.rangeCount && $('document').contains(nativeSelection.anchorNode))window.CSS.highlights.set('markatlas-selection',new Highlight(nativeSelection.getRangeAt(0).cloneRange()));
  if(keepSelection && !item)return;
  if (kind === 'comment') $('message').focus({preventScroll:true}); else $('kind-explanation').focus({preventScroll:true});
}
function updateStatus(extra = '') {
  $('status').textContent = `${fileName} · ${items.length} saved · ${extra || (commenting ? 'Select text to annotate.' : 'Enable Request edits to annotate selections.')}`;
}
async function displayFile(...args){
  const work=displayFileContent(...args);displayWork=work;
  try{return await work;}finally{if(displayWork===work)displayWork=null;}
}
async function displayFileContent(name,text,fileIdentity = name,keepWatch = false,fileSourcePath = null,preview = null) {
  if(!keepWatch)fileRefresh.stop();
  const current = ++revision,previousText=source,previousItems=items;
  close();if(filePreview?.kind==='word' && preview?.kind!=='word')wordViewer.destroy();filePreview=preview;source = '';items = [];documentHash = '';$('comment').disabled = true;
  $('status').textContent = `Opening ${name}…`;
  const normalized = normalize(text);
  const digest = await crypto.subtle.digest('SHA-256',new TextEncoder().encode(normalized));
  if (current !== revision) return false;
  source = normalized;diskSource=normalized;diskHash=[...new Uint8Array(digest)].map(n=>n.toString(16).padStart(2,'0')).join('');codeFile=!!preview || !isMarkdown(name);if(!keepWatch){const previewable=isMarkdown(name)||/\.html?$/i.test(name)||preview;codeMode=isMarkdown(name)?'edit':previewable?'review':'edit';mode=previewable?'rendered':'source';}editHistory.clear();renderedCaret=null;fileName = name;identity = fileIdentity;
  $('code-error').hidden=true;$('reload-disk').hidden=true;saveConflict=false;
  if(!keepWatch)sourcePath=fileSourcePath;
  documentHash = [...new Uint8Array(digest)].map(n => n.toString(16).padStart(2,'0')).join('');
  if(!preview || preview.kind==='word')try {
    const saved=projectDrafts[fileIdentity];
    const recovery=!keepWatch && (readLocalDraft(recoveryKey()) || (saved?.text!==saved?.base?saved:null));
    const working=recovery || (!keepWatch && readLocalDraft(workingKey()));
    if(recovery && recovery.base!==diskSource && recovery.text!==diskSource){saveConflict=true;conflictBase=recovery.base;}
    if(working && typeof working.text==='string' && Array.isArray(working.items)){
      const restoredHash=await hashText(working.text);if(current!==revision)return false;source=working.text;documentHash=restoredHash;items=working.items;
    } else if(keepWatch)items=moveAnnotations(previousItems,previousText,source);
    else items=saved?.items ? moveAnnotations(saved.items,saved.text,source) : readLocalDraft(storageKey(),[]);
    if(!Array.isArray(items))items=[];
    if(saved?.items)items=mergeNotes(items,moveAnnotations(saved.items,saved.text,source),[...removedNoteIds]);
    const queued=[...batchEntries.values()].filter(entry=>entry.identity===identity && entry.item.documentHash===documentHash).map(entry=>entry.item);
    items=mergeNotes(items,queued,[...removedNoteIds]);
    items=items.filter(x=>!removedNoteIds.has(x.id) && !x.batchSentVersion && typeof x.id==='string' && ['comment','explanation'].includes(x.kind) && Number.isInteger(x.startOffset) && Number.isInteger(x.endOffset) && x.startOffset>=0 && (x.pdf?.region || x.endOffset<=source.length) && x.startOffset<=x.endOffset);
    items=items.map(item=>({...item,documentHash}));
  } catch {items=[];}
  hashWork=null;updateBatchDraft();syncAnnotations().catch(()=>{});
  renderBreadcrumb();render();updateStatus(preview?.kind==='word' ? 'Word preview (read-only).' : preview?.kind==='image' ? 'Image preview.' : preview?.readOnly ? 'Read-only text preview. This file contains binary data or a non-UTF-8 encoding.' : '');
  if(saveConflict){$('reload-disk').hidden=false;$('code-error').textContent='Recovered your unsaved draft. The disk file has different content; automatic saving is paused. Copy your edits or use Reload from disk to discard the draft.';$('code-error').hidden=false;}
  if(preview?.readOnly){$('code-error').textContent='Read-only text preview: binary data or an unsupported text encoding. Some characters may be unreadable.';$('code-error').hidden=false;}
  return true;
}
async function displaySnapshot(name,snapshot,fileIdentity=name,fileSourcePath=null){
  const generation=incomingRevision;
  if(snapshot.kind==='word'){
    $('code-error').textContent='Rendering Word document…';$('code-error').hidden=false;
    snapshot={...snapshot,...await renderWordPreview(snapshot.data)};
    if(generation!==incomingRevision)return false;
  }
  return displayFile(name,snapshot.text || '',fileIdentity,false,fileSourcePath,['image','word'].includes(snapshot.kind) || snapshot.readOnly ? snapshot : null);
}
async function localSnapshot(file){
  if(file.size>fileLimit(file.name))throw Error('File exceeds the preview size limit.');
  return fileContent(file.name,new Uint8Array(await file.arrayBuffer()));
}
$('comment').addEventListener('click',() => {
  commenting = !commenting;
  $('comment').setAttribute('aria-pressed',String(commenting));
  if (!commenting) close();renderBatch();frameNotes();updateStatus();
});
let compositionAnchor=null;
function renderedSpan(range){
  if(!mapping)return null;
  const selected=window.getSelection();
  const actual=range || (selected?.rangeCount ? selected.getRangeAt(0) : null);
  if(!actual || !$('document').contains(actual.startContainer) || !$('document').contains(actual.endContainer))return null;
  const span=mapping.resolve(actual);
  if(actual.collapsed && renderedCaret!==null && span)span.startOffset=span.endOffset=renderedCaret;
  return span;
}
function renderedReplace(span,text,record=true){
  if(!span || span.mappingStatus!=='exact'){$('code-error').hidden=false;$('code-error').textContent='Edit this passage in source mode to preserve its Markdown formatting.';render();return;}
  const updated=source.slice(0,span.startOffset)+text+source.slice(span.endOffset);
  applyWorkingText(updated,ChangeSet.of({from:span.startOffset,to:span.endOffset,insert:text},source.length),record,span.startOffset);renderedCaret=span.startOffset+text.length;render();$('document').focus();mapping?.focusAt(renderedCaret);
}
$('document').addEventListener('pointerdown',()=>{renderedCaret=null;editHistory.boundary();});
function restoreHistory(redo=false){
  const previous=editHistory.restore(source,$('document').querySelector('.cm-editor')?codeEditor.caret():renderedCaret ?? 0,redo);if(!previous)return;
  applyWorkingText(previous.text,undefined,false);renderedCaret=previous.caret;
  render();if($('document').querySelector('.cm-editor'))codeEditor.focusAt(previous.caret);else{$('document').focus();mapping?.focusAt(previous.caret);}
}
$('document').addEventListener('keydown',e=>{
  if(/^(Arrow|Home|End|Page)/.test(e.key)){renderedCaret=null;editHistory.boundary();}
  if(pdfDocument || codeMode!=='edit' || e.isComposing || e.altKey || !(e.metaKey || e.ctrlKey))return;
  if(e.key.toLowerCase()==='z' || (!e.metaKey && e.key.toLowerCase()==='y')){
    e.preventDefault();e.stopPropagation();restoreHistory(e.shiftKey || e.key.toLowerCase()==='y');
  }
},{capture:true});
$('document').addEventListener('compositionstart',()=>{if(!pdfDocument && !codeFile && mode==='rendered' && codeMode==='edit')compositionAnchor=renderedSpan();});
$('document').addEventListener('compositionend',e=>{if(compositionAnchor){const span=compositionAnchor;compositionAnchor=null;if(!e.data){render();mapping?.focusAt(span.startOffset);return;}renderedReplace(span,e.data);}});
$('document').addEventListener('beforeinput',e=>{
  if($('document').querySelector('.cm-editor') || pdfDocument || codeFile || mode!=='rendered' || codeMode!=='edit')return;
  if(e.isComposing || compositionAnchor)return;
  e.preventDefault();
  if(['historyUndo','historyRedo'].includes(e.inputType)){
    restoreHistory(e.inputType==='historyRedo');return;
  }
  const targets=e.getTargetRanges?.();let span=renderedSpan(targets?.[0]);if(!span)return;
  let text=e.data || '';
  if(e.inputType==='insertParagraph' || e.inputType==='insertLineBreak')text=e.inputType==='insertLineBreak'?'\n':'\n\n';
  else if(e.inputType.startsWith('delete')){
    text='';
    if(span.startOffset===span.endOffset){if(e.inputType.includes('Backward'))span.startOffset-=Array.from(source.slice(0,span.startOffset)).at(-1)?.length || 0;else span.endOffset+=Array.from(source.slice(span.endOffset))[0]?.length || 0;}
  } else if(!['insertText','insertReplacementText'].includes(e.inputType)){$('code-error').hidden=false;$('code-error').textContent='Use source mode for this formatting change.';return;}
  renderedReplace(span,text);
});
$('document').addEventListener('paste',e=>{if(!$('document').querySelector('.cm-editor') && !pdfDocument && !codeFile && mode==='rendered' && codeMode==='edit'){
  e.preventDefault();const span=renderedSpan();const image=[...e.clipboardData?.items||[]].find(item=>item.kind==='file' && /^image\/(png|jpeg|gif|webp)$/.test(item.type));
  if(image){const generation=revision;pasteMarkdownImage(image.getAsFile()).then(reference=>{if(generation===revision)renderedReplace(span,reference);}).catch(error=>{$('code-error').hidden=false;$('code-error').textContent=`Could not paste image: ${error.message}`;});}
  else renderedReplace(span,e.clipboardData.getData('text/plain'));
}});
$('document').addEventListener('cut',e=>{if(!$('document').querySelector('.cm-editor') && !pdfDocument && !codeFile && mode==='rendered' && codeMode==='edit'){const selection=window.getSelection();e.preventDefault();e.clipboardData.setData('text/plain',selection?.toString() || '');renderedReplace(renderedSpan(),'');}});
$('document').addEventListener('drop',e=>{if(!pdfDocument && !codeFile && mode==='rendered' && codeMode==='edit')e.preventDefault();});
$('view-toggle').addEventListener('click',() => {if(pdfDocument){openPdfSource();return;}if(isLatex(fileName) && linkedPdf?.root===project?.rootPath){openProjectFile(linkedPdf.path);return;}editHistory.boundary();close();mode = mode === 'source' ? 'rendered' : 'source';render();focusEditingDocument();});
for (const value of ['comment','explanation']) $(`kind-${value}`).addEventListener('click',() => {
  setKind(value);if (value === 'comment') $('message').focus({preventScroll:true});else $('kind-explanation').focus({preventScroll:true});
});
for (const length of ['short','medium','long']) $(`detail-${length}`).addEventListener('click',() => {setDetail(length);});
$('explanation-prompt').addEventListener('keydown',event=>{
  if(event.key!=='Enter' || !(event.metaKey||event.ctrlKey) || event.isComposing || event.keyCode===229)return;
  event.preventDefault();event.stopPropagation();submitNote();
});
$('length-options').addEventListener('keydown',e => {
  const lengths = ['short','medium','long'];
  if (!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)) return;
  e.preventDefault();const step = ['ArrowRight','ArrowDown'].includes(e.key) ? 1 : -1;
  const focused=lengths.indexOf(e.target.id?.replace('detail-',''));
  const next=lengths[(Math.max(0,focused) + step + 3) % 3];$(`detail-${next}`).focus();
});

document.addEventListener('pointerdown',()=>{ignoreOutsideClick=false;});
document.addEventListener('click',e=>{
  if(!$('composer').hidden && !$('composer').contains(e.target) && !e.target.closest?.('.annotation-icon,[data-annotation],#selection-action') && !ignoreOutsideClick)close();
  ignoreOutsideClick=false;
});
document.addEventListener('keydown',e => {if (e.key === 'Escape' && !$('composer').hidden) close();});
function resizeMessage() {
  const field=$('message');field.style.height='auto';field.style.height=`${Math.max(36,Math.min(180,field.scrollHeight))}px`;positionComposer();
}
$('message').addEventListener('focus',()=>editHistory.boundary());
$('message').addEventListener('input',resizeMessage);
$('message').addEventListener('keydown',e => {
  if(e.key!=='Enter' || !(e.metaKey||e.ctrlKey) || e.isComposing || e.keyCode===229)return;
  e.preventDefault();submitNote();
});
let offeredSelection=null;
function canCommentShortcut(){return !$('patch-review').hidden || !!pdfDocument || filePreview?.kind==='word' || codeMode!=='edit' && mode!=='source' && (!codeFile || isHtmlPreview());}
function hideSelectionAction(){
  if(offeredSelection?.selection.pdf?.region && pdfDocument && !pending)pdfViewer.show(pdfDocument,items);
  $('selection-action').hidden=true;offeredSelection=null;
}
function offerSelection(selection,anchor){
  if(!commenting && !selection.patch)return;
  offeredSelection={selection,anchor,revision};
  if(pdfDocument && selection.pdf?.region)pdfViewer.show(pdfDocument,[...items,{...selection,id:'pending-selection',temporary:true}]);
  const button=$('selection-action');button.hidden=false;button.querySelector('kbd').hidden=!canCommentShortcut();button.title=canCommentShortcut()?'Comment (C)':'Comment';
  const rect=anchor || {left:24,top:100};button.style.left=`${Math.max(8,Math.min(viewWidth()-120,rect.left))}px`;button.style.top=`${Math.max(48,rect.top-38)}px`;
}
function acceptSelection(){const offered=offeredSelection;if(!offered || offered.revision!==revision)return;open(offered.selection,null,offered.anchor);$('message').focus({preventScroll:true});}
$('selection-action').addEventListener('pointerdown',event=>event.preventDefault());
$('selection-action').addEventListener('click',event=>{event.stopPropagation();acceptSelection();});
document.addEventListener('keydown',event=>{
  if(event.key==='Escape'){hideSelectionAction();return;}
  const editing=event.target.closest?.('input,textarea,select,[contenteditable=true],.cm-content');
  const shortcut=canCommentShortcut() && event.key.toLowerCase()==='c' && !editing && !event.metaKey && !event.ctrlKey && !event.altKey;
  if(shortcut && offeredSelection && !event.isComposing){event.preventDefault();event.stopImmediatePropagation();acceptSelection();}
},true);
let selectionFrame=0;document.addEventListener('selectionchange',()=>{if(selectionFrame)return;selectionFrame=requestAnimationFrame(()=>{selectionFrame=0;const selection=window.getSelection();if(selection?.isCollapsed){if(!$('selection-action').matches(':hover'))hideSelectionAction();return;}if($('composer').hidden && selection?.anchorNode && $('document').contains(selection.anchorNode))capture({target:selection.anchorNode.parentElement,type:'selectionchange'});});});
viewport().addEventListener('scroll',hideSelectionAction,{passive:true});
$('comments-toggle').addEventListener('click',()=>{const opened=document.body.classList.toggle('comments-open');if(opened)$('review-batch').classList.remove('minimized','preview-dismissed');$('comments-toggle').setAttribute('aria-expanded',String(opened));renderBatch();positionDrawer();requestAnimationFrame(positionComposer);});
$('inline-mode').addEventListener('click',async()=>{try{const mode=app.getHostContext()?.displayMode==='inline'?'fullscreen':'inline';await app.requestDisplayMode({mode});}catch(error){$('project-status').hidden=false;$('project-status').textContent=`This host cannot change the display mode: ${error.message}`;}});

function capture(event) {
  if ($('document').querySelector('.cm-editor') || pdfDocument || codeFile || mode==='source' || codeMode==='changes' || !commenting || !source || event.target.closest?.('.annotation-icon')) return;
  const selected = window.getSelection();
  if (!selected?.rangeCount || selected.isCollapsed) return;
  const range = selected.getRangeAt(0);
  if (!$('document').contains(range.startContainer) || !$('document').contains(range.endContainer)) return;
  const fragment = range.cloneContents();fragment.querySelectorAll('.annotation-icon').forEach(node => node.remove());
  const selection = mapping.selection(range,fragment.textContent);
  if(selection){const rects=range.getClientRects?.();const rect=rects?.length ? rects[rects.length-1] : range.getBoundingClientRect?.();offerSelection(selection,rect);}
}
$('document').addEventListener('pointerup',capture);$('document').addEventListener('keyup',capture);
$('document').addEventListener('keydown',event=>{const mark=event.target.closest?.('[data-annotation]');if(mark && ['Enter',' '].includes(event.key)){const item=items.find(note=>note.id===mark.dataset.annotation);if(item){event.preventDefault();event.stopPropagation();open(item,item,mark.getBoundingClientRect());}}},{capture:true});
$('document').addEventListener('click',e => {
  const icon = e.target.closest('[data-item-id],[data-annotation]');if(!icon || (!window.getSelection()?.isCollapsed && !icon.dataset.itemId))return;
  const item = items.find(x=>x.id === (icon.dataset.itemId || icon.dataset.annotation));if(item)open(item,item,icon.getBoundingClientRect());
});
async function submitNote() {
  editHistory.boundary();
  if(hashWork)await hashWork;if (!pending) return;
  if(kind==='explanation' && !['short','medium','long'].includes(detail)){$('feedback').textContent='Choose how much detail first.';return;}
  const message = kind === 'comment' ? $('message').value.trim() : '';
  if (kind === 'comment' && !message) {$('feedback').textContent = 'Write a comment first.';$('message').focus();return;}
  if(pending.patch){
    if(patchSubmitting)return;
    const selected=pending;patchSubmitting=true;
    try{
      if(kind==='comment'){await patchReview.saveComment(selected.patch,message);if(pending===selected)close();}
      else{
        const note={...selected,id:crypto.randomUUID(),kind:'explanation',detail,explanationPrompt:$('explanation-prompt').value.trim(),sourceName:`${selected.patch.path} · Patch revision ${selected.patch.expectedRevision}`,sourceText:selected.selectedText,documentHash:`patch:${selected.patch.id}:${selected.patch.expectedRevision}`,updatedAt:new Date().toISOString(),explanationStatus:'starting'};
        patchExplanation=note;editingId=note.id;showExplanation(note);
        await requestExplanation(app,extensions,note,undefined,(requestId,result)=>{
          Object.assign(note,{explanationRequestId:requestId,explanationModel:result?.model,explanationStatus:result?.status || 'pending',explanationAnswer:result?.answer});
          if(pending===selected && kind==='explanation')showExplanation(note);
        });
      }
    }catch(error){if(pending===selected)$('feedback').textContent=error.message;}
    finally{patchSubmitting=false;}
    return;
  }
  const selectedPending=pending,selectedRevision=revision,selectedKind=kind,selectedEditingId=editingId,selectedDetail=detail;
  if(kind==='explanation' && pending.pdf && !pending.pdf.region){try{pending.pdf.source=await serverData('locate_latex_pdf_selection',{root:pending.pdf.root,path:pending.pdf.path,selection:{...pending.pdf,startOffset:pending.startOffset,quote:pending.selectedText}});}catch(error){$('feedback').textContent=error.message;return;}}
  if(pending!==selectedPending || selectedRevision!==revision || kind!==selectedKind || editingId!==selectedEditingId || detail!==selectedDetail)return;
  const previous = items.find(x=>x.id === editingId && x.kind===kind);
  const item = {...pending,batchSentVersion:undefined,originalSnapshot:previous?.originalSnapshot || {...(pending.pdf?{pdf:{...pending.pdf,screenshot:undefined}}:{}),documentHash,startLine:pending.startLine,endLine:pending.endLine,startOffset:pending.startOffset,endOffset:pending.endOffset,selectedText:pending.selectedText},id:previous?.id || crypto.randomUUID(),kind,message,hasUnsavedEdits:source!==diskSource,...(kind === 'explanation' ? {detail,explanationPrompt:$('explanation-prompt').value.trim()} : {}),sourceName:fileName,...(sourcePath ? {sourcePath} : {}),...(sourcePath && project?.rootPath?{projectRoot:project.rootPath}:{}),documentHash,sourceText:source.slice(pending.startOffset,pending.endOffset),updatedAt:new Date().toISOString()};
  if(previous)items = items.map(x=>x.id === previous.id ? item : x);else items.push(item);
  if(kind==='explanation'){delete item.explanationRequestId;delete item.explanationAnswer;delete item.explanationError;item.explanationStatus='starting';}
  const saved = persist();const current = revision;
  if(kind==='explanation'){render();open(item,item,selectionAnchor);}else{codeEditor.clearSelection();if(filePreview?.kind==='word')wordViewer.clearSelection();if($('document').contains(window.getSelection()?.anchorNode))window.getSelection().removeAllRanges();close(true);}
  updateStatus(saved ? (kind === 'explanation' ? 'Generating explanation…' : 'Comment queued for review.') : 'Saved for this session only.');
  try {
    try{await syncAnnotations(item.id);item.liveReference=true;if(current===revision)persist();await flushProjectState();}catch(error){updateStatus(`Comment kept locally; disk save failed: ${error.message}`);}
    if(item.kind === 'comment') {
      if(current===revision)updateStatus('Comment queued for review.');
    } else {
      await requestExplanation(app,extensions,item,undefined,(requestId,result)=>{
        if(current!==revision)return;
        const note=items.find(note=>note.id===item.id && note.updatedAt===item.updatedAt);
        if(!note)return;
        note.explanationRequestId=requestId;note.explanationModel=result?.model;note.explanationStatus=result?.status || 'pending';
        if(result?.answer)note.explanationAnswer=result.answer;persist();
        if(editingId===item.id && !$('composer').hidden)showExplanation(note);
      });
      if(current === revision)updateStatus('Explanation ready.');
    }
  } catch(error) {if(current === revision){
    if(item.kind==='explanation'){
      const note=items.find(note=>note.id===item.id && note.updatedAt===item.updatedAt);
      if(note){note.explanationError=error.message;note.explanationStatus='error';persist();if(editingId===item.id && !$('composer').hidden)showExplanation(note);}
    }
    updateStatus(error.message);
  }}
}
$('delete').addEventListener('click',async () => {
  const removed = items.find(x=>x.id === editingId);if(!removed)return;
  removeReviewNotes([removed.id]);updateStatus('Note deleted.');
  if(removed.explanationRequestId)serverData('remove_markdown_explanation',{requestId:removed.explanationRequestId}).catch(()=>{});
});
function base64Bytes(bytes){let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(binary);}
async function importSingleFile(name,bytes,resourceKey){return serverData('open_review_single_file',{name,data:base64Bytes(bytes),...(resourceKey?{resourceKey}:{})});}
async function resourceBytes(uri){
  if(!extensions.resources)throw Error('This host cannot read this file resource. Use Open file to select a local copy.');
  const resource=await extensions.resources.read({uri}),content=resource.contents?.[0];
  if(typeof content?.blob==='string')return Uint8Array.from(atob(content.blob),c=>c.charCodeAt(0));
  if(typeof content?.text==='string')return new TextEncoder().encode(content.text);
  throw Error('Unsupported file representation.');
}
async function openSingleWorkspace(tree,resourceUri){
  if(project?.rootPath && !project.singleFile && tree.sourcePath?.startsWith(project.rootPath.replace(/\/$/,'')+'/')){
    await openProjectFile(tree.sourcePath.slice(project.rootPath.replace(/\/$/,'').length+1));return true;
  }
  ++workspaceRequest;
  if(!await acceptWorkspace({...tree,...(resourceUri?{resourceUri}:{})},{allowDefault:false}))return;
  connectedFolder=tree.singleFile?null:tree.rootPath;await openProjectFile(tree.singlePath);return true;
}
// File entrypoints carry the original local path on the server tool call,
// even when their resource URI is opaque to the browser.
app.addEventListener('toolresult',async result=>{
  const tree=result.structuredContent;
  if(tree?.root && tree.singlePath){++incomingRevision;await openSingleWorkspace(tree);}
});
$('picker').addEventListener('change',async () => {
  const file=$('picker').files?.[0];if(!file || !(await canLeaveFile()))return;
  const request=++incomingRevision;
  try{
    if(file.size>(isPdf(file.name)?50*1024*1024:fileLimit(file.name)))throw Error('File exceeds the preview size limit.');
    const tree=await importSingleFile(file.name,new Uint8Array(await file.arrayBuffer()));
    if(request===incomingRevision)await openSingleWorkspace(tree);
  }catch(error){
    if(!isPdf(file.name) && /Unknown tool|not found|unsupported/i.test(error.message)){activeProjectPath=null;await displaySnapshot(file.name,await localSnapshot(file));renderProjectTree();}
    else showPdfError(error);
  }finally{$('picker').value='';}
});
app.addEventListener('toolinput',async ({arguments:args}) => {
  const input = OpenAIFileEntrypointInputSchema.safeParse(args);if(!input.success){loadWorkspace();return;}
  const inputGeneration=++incomingRevision;
  if(!(await canLeaveFile()) || inputGeneration!==incomingRevision)return;
  if(/\.(docx|xlsx)$/i.test(input.data.file.name) && extensions.files?.open){
    try{
      const uri=new URL(input.data.file.resourceUri);
      if(uri.protocol!=='file:' || (uri.hostname && uri.hostname!=='localhost'))throw Error('Open the folder containing this file, then select it in the file tree.');
      await extensions.files.open(decodeURIComponent(uri.pathname));
    }catch(error){$('project-status').hidden=false;$('project-status').textContent=error.message;}
    return;
  }
  const uri=input.data.file.resourceUri;
  if(isPdf(input.data.file.name)){
    const current=++incomingRevision;
    try{
      const local=new URL(uri);
      const tree=local.protocol==='file:' && (!local.hostname || local.hostname==='localhost')
        ? await serverData('open_review_single_file',{path:decodeURIComponent(local.pathname)})
        : await importSingleFile(input.data.file.name,await resourceBytes(uri),uri);
      if(current===incomingRevision)await openSingleWorkspace(tree,local.protocol==='file:'?null:uri);
    }catch(error){showPdfError(error);}
    return;
  }
  // Open local text files with their containing folder, just like local PDFs.
  try{
    const local=new URL(uri);
    if(local.protocol==='file:' && (!local.hostname || local.hostname==='localhost')){
      const tree=await serverData('open_review_single_file',{path:decodeURIComponent(local.pathname)});
      await openSingleWorkspace(tree);return;
    }
  }catch{/* Older hosts may expose only resource reads for text inputs. */}
  await loadWorkspace();beginFileChange();const current = ++incomingRevision;
  try {
    if(!extensions.resources)throw new Error('This host does not expose file resources. Use Open file.');
    const resource = await extensions.resources.read({uri:input.data.file.resourceUri});if(current !== incomingRevision)return;
    const content = resource.contents?.[0];
    const bytes=typeof content?.text==='string' ? new TextEncoder().encode(content.text) : typeof content?.blob==='string' ? Uint8Array.from(atob(content.blob),c=>c.charCodeAt(0)) : null;
    if(bytes === null)throw new Error('Unsupported file representation.');
    try{const tree=await importSingleFile(input.data.file.name,bytes,uri);if(current===incomingRevision)await openSingleWorkspace(tree,uri);return;}catch(error){if(!/Unknown tool|not found|unsupported|unavailable/i.test(error.message))throw error;}
    activeProjectPath=null;
    await displaySnapshot(input.data.file.name,fileContent(input.data.file.name,bytes),input.data.file.resourceUri);
    if(current!==incomingRevision)return;
    if(!filePreview)watchResource(input.data.file.resourceUri,source);renderProjectTree();
  } catch(error){if(current === incomingRevision){$('status').textContent = `Cannot open file: ${error.message}`;showPdfError(error);}}
});
const pdfViewer=createPdfViewer($('document'),{
  loadPage:(data,page)=>serverData('render_latex_pdf_page',{root:data.root,path:data.path,page,fingerprint:data.fingerprint,format:'svg'}),
  onSelection(selection,anchor){if(!commenting && !selection.pdf?.region)return;offerSelection(selection,anchor);},
  onRegionMode:active=>$('pdf-screenshot').setAttribute('aria-pressed',String(active)),
  onNote:(item,anchor)=>open(item,item,anchor),onError:showPdfError,onReady:()=>setDocumentLoading(false),
  onPage:(number,total)=>{$('pdf-page-float').textContent=`${number}/${total}`;$('pdf-page-input').value=number;$('pdf-page-input').max=total;$('pdf-page-total').textContent=`/ ${total}`;},
  onZoom:updateDocumentZoom
});
$('pdf-screenshot').addEventListener('click',()=>{
  close();const active=$('pdf-screenshot').getAttribute('aria-pressed')!=='true';
  if(isHtmlPreview()){if(!commenting)$('comment').click();htmlFrameState?.frame.contentWindow?.postMessage({markatlas:htmlFrameState.channel,type:'region',active},'*');}
  else pdfViewer.setRegionMode(active);
});
function updateDocumentZoom(value){$('pdf-zoom-level').textContent=`${Math.round(value*100)}%`;$('pdf-zoom-out').disabled=value<=PDF_MIN_ZOOM;$('pdf-zoom-in').disabled=value>=PDF_MAX_ZOOM;}
const activePageViewer=()=>filePreview?.kind==='word'?wordViewer:pdfViewer;
function setTextScale(value){
  textScale=Math.max(.75,Math.min(2,Math.round(value*100)/100));
  document.documentElement.style.setProperty('--text-scale',String(textScale));
  $('font-level').textContent=`${Math.round(textScale*100)}%`;
  $('font-smaller').disabled=textScale<=.75;$('font-larger').disabled=textScale>=2;
  try{localStorage.setItem('markdown-review:text-scale',String(textScale));}catch{}
  codeEditor.measure();requestAnimationFrame(positionComposer);
}
$('font-smaller').addEventListener('click',()=>setTextScale(textScale-.1));
$('font-larger').addEventListener('click',()=>setTextScale(textScale+.1));
$('font-level').addEventListener('click',()=>setTextScale(1));
setTextScale(textScale);
$('pdf-zoom-in').addEventListener('click',()=>{const viewer=activePageViewer();viewer.setZoom(viewer.zoom()+.25);});
$('pdf-zoom-out').addEventListener('click',()=>{const viewer=activePageViewer();viewer.setZoom(viewer.zoom()-.25);});
$('pdf-zoom-level').addEventListener('click',()=>activePageViewer().setZoom(1));
$('pdf-tools').addEventListener('wheel',event=>activePageViewer().wheelZoom(event),{passive:false});
$('pdf-page-float').addEventListener('click',()=>{const viewer=activePageViewer();viewer.goToPage(viewer.currentPage());});
async function openPdfSource(){
  if(!pdfDocument?.main)return;
  const data=pdfDocument,selection=pending,generation=incomingRevision;let target=data.main,line;
  if(selection?.pdf){try{const location=await serverData('locate_latex_pdf_selection',{root:data.root,path:data.path,selection:{...selection.pdf,startOffset:selection.startOffset,quote:selection.selectedText}});if(location.status==='located'){target=location.path;line=location.line;}}catch(error){showPdfError(error);return;}}
  if(generation===incomingRevision && pdfDocument===data)await openProjectFile(target,line);
}
function pdfNeedsRefresh(error){return /project is no longer available|could not refresh project access|PDF (?:version )?(?:changed|is changing)|ENOENT|no such file/i.test(error.message);}
function clearPdfRefresh(){pdfRefreshTarget=null;$('pdf-refresh').hidden=true;$('pdf-refresh').disabled=false;$('pdf-refresh').querySelector('span').textContent='Refresh preview';}
function offerPdfRefresh(data=pdfDocument){if(!data)return;if(pdfNeedsRefresh({message:$('code-error').textContent})){$('code-error').hidden=true;$('code-error').textContent='';}pdfRefreshTarget=data;clearTimeout(pdfPoll);$('pdf-refresh').hidden=false;setDocumentLoading(false);}
function showPdfError(error){if(pdfDocument && pdfNeedsRefresh(error)){offerPdfRefresh();return;}setDocumentLoading(false);$('code-error').textContent=error.message;$('code-error').hidden=false;}
async function refreshPdfPreview(){
  const data=pdfRefreshTarget;if(!data || data!==pdfDocument || pdfReloading)return;
  pdfReloading=true;const generation=incomingRevision,selectedProject=project;
  $('pdf-refresh').disabled=true;$('pdf-refresh').querySelector('span').textContent='Refreshing...';
  const active=()=>generation===incomingRevision && project===selectedProject && pdfDocument===data;
  try{
    // Reconnect before reading: an external compile may outlive the host's workspace connection.
    let root=data.root,path=data.path;
    if(selectedProject?.singleFile){
      const reopened=selectedProject.resourceUri?await importSingleFile(path.split('/').at(-1),await resourceBytes(selectedProject.resourceUri),selectedProject.resourceUri):await serverData('open_review_single_file',{path:data.sourcePath || `${root}/${path}`});
      root=reopened.rootPath;path=reopened.singlePath;
    }else await serverData('list_markdown_project',{folderPath:root});
    if(!active())return;
    const latest=await serverData('read_latex_pdf',{root,path});
    if(!active())return;
    await displayPdf(latest,true);
    if(generation===incomingRevision && pdfRefreshTarget===data)clearPdfRefresh();
  }catch(error){if(active())showPdfError(error);}
  finally{pdfReloading=false;if(generation===incomingRevision){$('pdf-refresh').disabled=false;$('pdf-refresh').querySelector('span').textContent='Refresh preview';schedulePdfPoll();}}
}
$('pdf-refresh').addEventListener('click',refreshPdfPreview);
async function displayPdf(data,refresh=false){
  if(!refresh)setDocumentLoading(true);
  const generation=incomingRevision,scroll=refresh?viewport().scrollTop:0;pdfDocument=null;
  const shown=await displayFile(data.path,data.text,data.main?`latex:${data.root}/${data.main}`:`pdf:${data.root}/${data.path}`,refresh,data.sourcePath);
  if(!shown || generation!==incomingRevision)return;
  pdfDocument=data;linkedPdf=data.main?{root:data.root,path:data.path,main:data.main}:null;sourcePath=data.sourcePath;activeProjectPath=data.path;currentEtag=data.etag;codeFile=false;fileRefresh.stop();
  if(!refresh)pdfViewer.destroy();
  // Recompute page geometry from tracked text offsets; never keep coordinates from an old build.
  items=items.map(item=>{const page=data.pages.find(p=>item.startOffset>=p.startOffset && item.startOffset<p.endOffset);if(item.pdf?.region)return {...item,anchorStatus:item.pdf.fingerprint===data.fingerprint?item.anchorStatus:'edited'};if(!item.pdf || !page)return item;const words=page.words.filter(w=>w.endOffset>item.startOffset&&w.startOffset<item.endOffset);return {...item,pdf:{...item.pdf,path:data.path,fingerprint:data.fingerprint,page:page.number,x:words[0]?.x || 0,y:words[0]?.y || 0,rects:words.map(w=>clippedPdfWord(w,item.startOffset,item.endOffset)).filter(Boolean),source:undefined}};});
  persist();syncAnnotations().catch(()=>{});render();renderBreadcrumb();renderProjectTree();$('project-status').hidden=true;
  scrollViewport({top:scroll});
  schedulePdfPoll();
}
function schedulePdfPoll(){clearTimeout(pdfPoll);if(pdfDocument && !pdfRefreshTarget && !pdfReloading)pdfPoll=setTimeout(checkPdf,3000);}
let pdfPollError=null;
async function checkPdf(){
  const data=pdfDocument;if(!data || pdfPollBusy || pdfRefreshTarget || pdfReloading)return;pdfPollBusy=true;
  try{
    if(!document.body.classList.contains('patch-review-open') && !batchSending && $('composer').hidden){
      if(project?.singleFile && project.resourceUri)await importSingleFile(data.path.split('/').at(-1),await resourceBytes(project.resourceUri),project.resourceUri);
      const result=await serverData('read_latex_pdf',{root:data.root,path:data.path,ifNoneMatch:data.etag});
      if(data===pdfDocument){if(pdfPollError && $('code-error').textContent===pdfPollError){$('code-error').hidden=true;$('code-error').textContent='';}pdfPollError=null;if(!result.notModified)offerPdfRefresh(data);}
    }
  }catch(error){if(data===pdfDocument){pdfPollError=error.message;showPdfError(error);}}finally{pdfPollBusy=false;schedulePdfPoll();}
}
function positionComposer() {
  if($('composer').hidden)return;
  const rects=[...$('document').querySelectorAll('.pending-selection')].flatMap(node=>[...node.getClientRects()]);
  const rect=rects.filter(r=>r.width || r.height).at(-1) || selectionAnchor || {left:viewWidth()/2,right:viewWidth()/2,top:100,bottom:100};
  const panel=$('composer');
  const bounds=document.querySelector('main').getBoundingClientRect();
  const left=Math.max(0,bounds.left),right=bounds.width?Math.min(viewWidth(),bounds.right):viewWidth();
  const anchor={...rect,left:rect.left-left,right:rect.right-left,top:rect.top,bottom:rect.bottom};
  const position=floatingPosition(anchor,Math.min(300,right-left-24),panel.getBoundingClientRect().height || 360,{width:right-left,height:viewHeight()},document.querySelector('header').getBoundingClientRect().bottom);
  Object.assign(panel.style,{left:`${position.left+left}px`,top:`${position.top}px`,maxWidth:`${position.maxWidth}px`,maxHeight:`${position.maxHeight}px`});
}
function renderBreadcrumb() {
  patchReview.setLocation(project?.rootPath && fileName?{root:project.rootPath,path:activeProjectPath || fileName}:null);
  renderRecentRoots();
  $('project-label').textContent=project?.root.name || 'Add files or folders';
  $('project-root-arrow').hidden=!!fileName;
  const folders=$('path-folders');folders.replaceChildren();
  const parts=(sourcePath && project ? fileName : '').split('/').filter(Boolean);
  let path='';
  for(const name of parts.slice(0,-1)) {
    path=path ? `${path}/${name}` : name;
    const separator=document.createElement('span');separator.className='path-separator';separator.textContent='›';separator.setAttribute('aria-hidden','true');
    const button=document.createElement('button');button.type='button';button.dataset.breadcrumbFolder=path;button.textContent=name;button.setAttribute('aria-label',`Browse ${name}`);button.setAttribute('aria-controls','path-popover');
    folders.append(separator,button);
  }
  $('filename').textContent=fileName.split('/').at(-1) || '';
  if(paneBridge && project?.rootPath && fileName)paneBridge.call('location',{root:project.rootPath,path:activeProjectPath || fileName}).catch(()=>{});
  $('filename').title=fileName;$('filename').draggable=!!fileName;
  $('close-pane').hidden=!fileName;$('filename').hidden=!fileName;$('filename-separator').hidden=!fileName;requestAnimationFrame(()=>{updateLayout();positionDrawer();});
}
async function browseFolder(path='',anchor) {
  nativeNavigation.browse(path,anchor);
}
$('filename').addEventListener('click',()=>nativeNavigation.browse((activeProjectPath||fileName).split('/').slice(0,-1).join('/'),$('filename')));
$('filename').addEventListener('keydown',event=>{if(['Enter',' '].includes(event.key)){event.preventDefault();$('filename').click();}});
let breadcrumbDrag=null,suppressBreadcrumbClick=false;
const breadcrumb=document.querySelector('.breadcrumb');
breadcrumb.addEventListener('pointerdown',event=>{if(event.button!==0 || event.pointerType==='touch')return;suppressBreadcrumbClick=false;breadcrumbDrag={id:event.pointerId,x:event.clientX,scroll:breadcrumb.scrollLeft,moved:false};});
window.addEventListener('pointermove',event=>{if(!breadcrumbDrag || event.pointerId!==breadcrumbDrag.id)return;const delta=breadcrumbDrag.x-event.clientX;if(!breadcrumbDrag.moved && Math.abs(delta)<4)return;breadcrumbDrag.moved=true;breadcrumb.classList.add('dragging');breadcrumb.setPointerCapture?.(event.pointerId);breadcrumb.scrollLeft=breadcrumbDrag.scroll+delta;event.preventDefault();});
function finishBreadcrumbDrag(event){if(!breadcrumbDrag || event.pointerId!==breadcrumbDrag.id)return;suppressBreadcrumbClick=breadcrumbDrag.moved;breadcrumbDrag=null;breadcrumb.classList.remove('dragging');}
window.addEventListener('pointerup',finishBreadcrumbDrag);window.addEventListener('pointercancel',finishBreadcrumbDrag);
breadcrumb.addEventListener('click',event=>{if(suppressBreadcrumbClick){suppressBreadcrumbClick=false;event.preventDefault();event.stopPropagation();}},{capture:true});
$('path-folders').addEventListener('click',e=>{const button=e.target.closest('[data-breadcrumb-folder]');if(button)browseFolder(button.dataset.breadcrumbFolder,button);});
let preferredTreeWidth=280,treeDrag=null;
let preferredCommentsWidth=320,commentsDrag=null;
try{const saved=Number(localStorage.getItem('markatlas:comments-width'));if(saved>=220 && saved<=640)preferredCommentsWidth=saved;}catch{}
const commentsHandle=document.createElement('div');commentsHandle.id='comments-resize';commentsHandle.hidden=true;commentsHandle.tabIndex=0;commentsHandle.setAttribute('role','separator');commentsHandle.setAttribute('aria-label','Resize comments sidebar');commentsHandle.setAttribute('aria-orientation','vertical');document.body.append(commentsHandle);
function commentsWidthBounds(){const tree=document.body.classList.contains('project-open')?parseFloat(document.documentElement.style.getPropertyValue('--tree-width'))||280:0;const max=Math.max(160,Math.min(640,viewWidth()-tree-160));return {min:Math.min(220,max),max};}
function commentsWidth(){const {min,max}=commentsWidthBounds();return Math.round(Math.max(min,Math.min(max,preferredCommentsWidth)));}
function resizeComments(value){const {min,max}=commentsWidthBounds();preferredCommentsWidth=Math.max(min,Math.min(max,value));updateLayout();codeEditor.measure();positionComposer();}
function saveCommentsWidth(){try{localStorage.setItem('markatlas:comments-width',String(preferredCommentsWidth));}catch{}}
commentsHandle.addEventListener('pointerdown',event=>{if(event.button!==0)return;event.preventDefault();commentsDrag={id:event.pointerId,x:event.clientX,width:commentsWidth()};commentsHandle.setPointerCapture?.(event.pointerId);document.body.classList.add('resizing-comments');});
window.addEventListener('pointermove',event=>{if(commentsDrag && event.pointerId===commentsDrag.id)resizeComments(commentsDrag.width+commentsDrag.x-event.clientX);});
function finishCommentsDrag(event){if(!commentsDrag || event.pointerId!==commentsDrag.id)return;commentsDrag=null;document.body.classList.remove('resizing-comments');saveCommentsWidth();}
window.addEventListener('pointerup',finishCommentsDrag);window.addEventListener('pointercancel',finishCommentsDrag);
commentsHandle.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const {min,max}=commentsWidthBounds();resizeComments(event.key==='Home'?min:event.key==='End'?max:commentsWidth()+(event.key==='ArrowLeft'?16:-16));saveCommentsWidth();});
let viewerPreferences={themeColor:'host',showGitChanges:true},lastSettings=null,settingsRequest=null;
let treeSide=localStorage.getItem('markatlas:tree-side')==='right'?'right':'left';
let outlineSide=localStorage.getItem('markatlas:outline-side')==='right'?'right':'left';
let preferredOutlineWidth=Number(localStorage.getItem('markatlas:outline-width'))||200,outlineDrag=null;
const outlineHandle=document.createElement('div');outlineHandle.id='outline-resize';outlineHandle.hidden=true;outlineHandle.tabIndex=0;outlineHandle.setAttribute('role','separator');outlineHandle.setAttribute('aria-label','Resize outline');outlineHandle.setAttribute('aria-orientation','vertical');outlineHandle.setAttribute('aria-controls','document-nav');document.body.append(outlineHandle);
const outlineMenu=document.createElement('div');outlineMenu.id='outline-position-menu';outlineMenu.hidden=true;outlineMenu.setAttribute('role','menu');outlineMenu.setAttribute('aria-label','Outline position');outlineMenu.innerHTML='<button role="menuitem" data-side="left">Show on Left</button><button role="menuitem" data-side="right">Show on Right</button>';document.body.append(outlineMenu);
function outlineWidthBounds(){const tree=document.body.classList.contains('project-open')?parseFloat(document.documentElement.style.getPropertyValue('--tree-width'))||280:0;const comments=document.body.classList.contains('comments-open') && !document.body.classList.contains('split-open')?commentsWidth():0;const max=Math.max(100,Math.min(480,viewWidth()-tree-comments-160));return {min:Math.min(140,max),max};}
function outlineWidth(){const {min,max}=outlineWidthBounds();return Math.round(Math.max(min,Math.min(max,preferredOutlineWidth)));}
function saveOutlineWidth(){localStorage.setItem('markatlas:outline-width',String(preferredOutlineWidth));}
function resizeOutline(width){const {min,max}=outlineWidthBounds();preferredOutlineWidth=Math.max(min,Math.min(max,width));updateLayout();codeEditor.measure();positionComposer();}
function openOutlineMenu(event){event.preventDefault();outlineMenu.hidden=false;outlineMenu.style.left=`${Math.max(8,Math.min(event.clientX,viewWidth()-170))}px`;outlineMenu.style.top=`${Math.max(8,Math.min(event.clientY,viewHeight()-90))}px`;outlineMenu.querySelector(`[data-side=${outlineSide}]`).focus();}
$('document-nav').addEventListener('contextmenu',openOutlineMenu);$('document-nav-toggle').addEventListener('contextmenu',openOutlineMenu);
for(const button of outlineMenu.querySelectorAll('button'))button.addEventListener('click',()=>{outlineSide=button.dataset.side;localStorage.setItem('markatlas:outline-side',outlineSide);outlineMenu.hidden=true;navigationOpen=true;renderNavigation();updateLayout();codeEditor.measure();positionComposer();});
document.addEventListener('pointerdown',event=>{if(!outlineMenu.contains(event.target))outlineMenu.hidden=true;});outlineMenu.addEventListener('keydown',event=>{if(event.key==='Escape'){outlineMenu.hidden=true;$('document-nav-toggle').focus();}});
outlineHandle.addEventListener('pointerdown',event=>{if(event.button!==0)return;event.preventDefault();outlineDrag={id:event.pointerId,x:event.clientX,width:outlineWidth()};outlineHandle.setPointerCapture?.(event.pointerId);document.body.classList.add('resizing-outline');});
window.addEventListener('pointermove',event=>{if(outlineDrag && event.pointerId===outlineDrag.id)resizeOutline(outlineDrag.width+(outlineSide==='left'?1:-1)*(event.clientX-outlineDrag.x));});
function finishOutlineDrag(event){if(!outlineDrag || event.pointerId!==outlineDrag.id)return;outlineDrag=null;document.body.classList.remove('resizing-outline');saveOutlineWidth();}
window.addEventListener('pointerup',finishOutlineDrag);window.addEventListener('pointercancel',finishOutlineDrag);
outlineHandle.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const {min,max}=outlineWidthBounds();resizeOutline(event.key==='Home'?min:event.key==='End'?max:outlineWidth()+(event.key==='ArrowRight'?1:-1)*(outlineSide==='left'?16:-16));saveOutlineWidth();});
let fullWidth=localStorage.getItem('markatlas:full-width')==='true';
function updateLayout(){
  document.body.classList.toggle('pane-narrow',viewWidth()<900);fitBreadcrumb(document.querySelector('.breadcrumb'));
  document.documentElement.style.setProperty("--panel-top",`${document.querySelector("header").getBoundingClientRect().height}px`);
  const tree=document.body.classList.contains('project-open')?parseFloat(document.documentElement.style.getPropertyValue('--tree-width'))||280:0;
  const comments=!document.body.classList.contains('split-open') && document.body.classList.contains('comments-open')?commentsWidth():0;
  document.body.classList.toggle('pdf-layout',!!pdfDocument);$('width-mode').hidden=!!pdfDocument;
  const sourceView=isSourceView();$('wrap-lines').hidden=!sourceView;$('wrap-lines').disabled=!sourceView;
  document.body.dataset.treeSide=treeSide;document.body.classList.toggle('full-width',fullWidth);document.body.classList.toggle('wrap-lines',sourceView && wrapLines);
  const nav=navigationOpen && (!!pdfDocument || isMarkdown(fileName))?outlineWidth():0;
  document.documentElement.style.setProperty('--pdf-canvas-width',`${Math.max(100,viewWidth()-tree-nav-48)}px`);
  document.documentElement.style.setProperty('--nav-left',`${treeSide==='left'?tree:0}px`);
  document.body.dataset.outlineSide=outlineSide;
  document.documentElement.style.setProperty('--nav-right',`${comments+(treeSide==='right'?tree:0)}px`);
  document.documentElement.style.setProperty('--outline-width',`${nav}px`);
  outlineHandle.hidden=!nav;const outlineBounds=outlineWidthBounds();outlineHandle.setAttribute('aria-valuemin',outlineBounds.min);outlineHandle.setAttribute('aria-valuemax',outlineBounds.max);outlineHandle.setAttribute('aria-valuenow',outlineWidth());
  document.documentElement.style.setProperty('--left-space',`${(treeSide==='left'?tree:0)+(outlineSide==='left'?nav:0)}px`);
  document.documentElement.style.setProperty('--right-space',`${comments+(treeSide==='right'?tree:0)+(outlineSide==='right'?nav:0)}px`);
  document.documentElement.style.setProperty('--comments-space',`${comments}px`);
  commentsHandle.hidden=!!paneConfig || !comments;const bounds=commentsWidthBounds();commentsHandle.setAttribute('aria-valuemin',bounds.min);commentsHandle.setAttribute('aria-valuemax',bounds.max);commentsHandle.setAttribute('aria-valuenow',commentsWidth());
  toolbarIcon('width-mode',fullWidth?'Full Width':'Readable',fullWidth?'wide':'readable');
  toolbarIcon('wrap-lines',wrapLines?'Wrap lines':'No wrap',wrapLines?'wrap':'nowrap');
  $('wrap-lines').setAttribute('aria-pressed',String(wrapLines));
  const toolbar=document.querySelector('.toolbar'),toggle=$('tree-toggle');
  if(treeSide==='left'){if(toolbar.firstElementChild!==toggle)toolbar.prepend(toggle);}else if(toolbar.lastElementChild!==toggle)toolbar.append(toggle);
}
$('width-mode').addEventListener('click',()=>{fullWidth=!fullWidth;localStorage.setItem('markatlas:full-width',String(fullWidth));updateLayout();requestAnimationFrame(positionComposer);});
$('wrap-lines').addEventListener('click',()=>{
  if(!isSourceView())return;
  wrapLines=!wrapLines;updateLayout();codeEditor.setLineWrapping(wrapLines);
  requestAnimationFrame(()=>{codeEditor.measure();positionComposer();});
  try{localStorage.setItem('markatlas:wrap-lines',String(wrapLines));}catch{}
});
$('mode-cycle').addEventListener('click',()=>{if(pdfDocument){openPdfSource();return;}preserveViewport(()=>{
  close();editHistory.boundary();
  if(isMarkdown(fileName)){
    if(mode==='source'){mode='rendered';codeMode='review';}
    else if(codeMode==='review'){mode='rendered';codeMode='edit';}
    else {mode='source';codeMode='edit';}
  }else if(/\.html?$/i.test(fileName)){
    mode=mode==='source'?'rendered':'source';codeMode=mode==='source'?'edit':'review';
  }else return;
  render();
});});
$('tree-toggle').addEventListener('contextmenu',event=>{
  event.preventDefault();const menu=$('tree-position-menu');menu.hidden=false;
  menu.style.left=`${Math.max(8,Math.min(event.clientX,viewWidth()-190))}px`;
  menu.style.top=`${Math.min(event.clientY,viewHeight()-100)}px`;
  menu.querySelector(`[data-side=${treeSide}]`).focus();
});
for(const button of $('tree-position-menu').querySelectorAll('button'))button.addEventListener('click',()=>{
  treeSide=button.dataset.side;localStorage.setItem('markatlas:tree-side',treeSide);$('tree-position-menu').hidden=true;setProjectOpen(true);requestAnimationFrame(positionComposer);
});
document.addEventListener('pointerdown',event=>{if(!$('tree-position-menu').contains(event.target))$('tree-position-menu').hidden=true;});
$('tree-position-menu').addEventListener('keydown',event=>{if(event.key==='Escape'){$('tree-position-menu').hidden=true;$('tree-toggle').focus();}});

try{const stored=Number(localStorage.getItem('markdown-review:tree-width'));if(stored>=120 && stored<=640)preferredTreeWidth=stored;}catch{}
function treeWidthBounds(){const comments=!pdfDocument && !document.body.classList.contains('split-open') && document.body.classList.contains('comments-open')?commentsWidth():0;const max=Math.max(80,Math.min(640,viewWidth()-comments-160));return {min:Math.min(180,max),max};}
function applyTreeWidth(value){
  const {min,max}=treeWidthBounds(),width=Math.round(Math.max(min,Math.min(max,value)));
  document.documentElement.style.setProperty('--tree-width',`${width}px`);
  const handle=$('tree-resize');handle.setAttribute('aria-valuemin',min);handle.setAttribute('aria-valuemax',max);handle.setAttribute('aria-valuenow',width);if(typeof treeSide!=='undefined')updateLayout();return width;
}
function rememberTreeWidth(){try{localStorage.setItem('markdown-review:tree-width',preferredTreeWidth);}catch{}}
$('tree-resize').addEventListener('pointerdown',event=>{
  if(event.button!==0)return;event.preventDefault();
  treeDrag={id:event.pointerId,x:event.clientX,width:applyTreeWidth(preferredTreeWidth)};
  $('tree-resize').setPointerCapture?.(event.pointerId);document.body.classList.add('resizing-tree');
});
window.addEventListener('pointermove',event=>{
  if(!treeDrag || event.pointerId!==treeDrag.id)return;
  preferredTreeWidth=applyTreeWidth(treeDrag.width+(treeSide==='left'?event.clientX-treeDrag.x:treeDrag.x-event.clientX));positionComposer();
});
function finishTreeDrag(event){if(!treeDrag || event.pointerId!==treeDrag.id)return;treeDrag=null;document.body.classList.remove('resizing-tree');rememberTreeWidth();}
window.addEventListener('pointerup',finishTreeDrag);window.addEventListener('pointercancel',finishTreeDrag);
$('tree-resize').addEventListener('keydown',event=>{
  if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();
  const {min,max}=treeWidthBounds(),width=applyTreeWidth(preferredTreeWidth);
  preferredTreeWidth=applyTreeWidth(event.key==='Home'?min:event.key==='End'?max:width+(event.key==='ArrowLeft'?-1:1)*(treeSide==='left'?16:-16));rememberTreeWidth();positionComposer();
});
function setProjectOpen(value) {
  if(!value)$('file-context-menu').hidden=true;
  $('tree-toggle').setAttribute('aria-expanded',String(value));$('tree-toggle').setAttribute('aria-label',value ? 'Hide file tree' : 'Show file tree');$('tree-toggle').title=value ? 'Hide file tree' : 'Show file tree';
  $('tree-resize').hidden=!value;$('project-drawer').hidden=!value;$('project-toggle').setAttribute('aria-expanded',String(value));
  document.body.classList.toggle('project-open',value);positionDrawer();
}
function positionDrawer() {
  applyTreeWidth(preferredTreeWidth);updateLayout();
  document.documentElement.style.setProperty('--project-top',`${document.querySelector('header').getBoundingClientRect().bottom}px`);
}
async function flushPane(){
 if(displayWork)await displayWork;if(hashWork)await hashWork;await saveCode();
 if(saveConflict)throw Error('Resolve the file conflict before closing or moving this pane. Your edits remain open.');
 if(!fileName)return;
 const closingIdentity=identity,closingText=source,closingNotes=JSON.stringify(items);
 const cached=persist();clearTimeout(projectSaveTimer);
 // Browser storage is a recovery cache; a confirmed project save is durable too.
 const projectSaved=await flushProjectState();await syncAnnotations();
 if(identity!==closingIdentity)throw Error('The file changed while saving. Please close the pane again.');
 if(source!==closingText || JSON.stringify(items)!==closingNotes)return flushPane();
 const draft=projectDrafts[identity];
 if(!cached && !(projectSaved && draft?.text===source))throw Error('Cannot save a recovery copy of this file. Keep the pane open and save your edits.');
}
async function openPaneFile(root,path){if(!await canLeaveFile())throw Error('Cannot leave this file until its edits are preserved.');const tree=await serverData('list_markdown_project',{folderPath:root});if(!await acceptWorkspace(tree,{allowDefault:false}))throw Error('Cannot switch projects while a draft is unsaved.');connectedFolder=root;await openProjectFile(path);if(fileName!==path)throw Error('Could not open '+path);}
const splitView=paneConfig?null:createSplitView({readHtml:args=>serverData('read_markatlas_pane',args),host:{context:()=>app.getHostContext() || {},tool:params=>app.callServerTool(params),send:params=>extensions.message.send(params),resource:params=>extensions.resources.read(params),file:path=>extensions.files.open(path),display:params=>app.requestDisplayMode(params),closePane:()=>splitView.close('secondary')},getCurrent:()=>({root:project?.rootPath,path:activeProjectPath || fileName}),openPrimary:openPaneFile,flushPrimary:flushPane,onResize:()=>{applyTreeWidth(preferredTreeWidth);updateLayout();codeEditor.measure();},onError:showPdfError});
if(paneBridge){paneBridge.handle('open',async({root,path})=>{await flushPane();await openPaneFile(root,path);setProjectOpen(false);});paneBridge.handle('flush',flushPane);paneBridge.handle('locateReview',entry=>locateReviewEntry(entry,true));paneBridge.handle('jumpLine',jumpToSearchResult);for(const event of ['pointerdown','focusin'])document.addEventListener(event,()=>paneBridge.call('focus').catch(()=>{}),true);window.addEventListener('blur',()=>{if(document.activeElement?.tagName==='IFRAME')paneBridge.call('focus').catch(()=>{});});document.body.classList.add('companion-pane');$('filename').addEventListener('dragstart',event=>{event.dataTransfer.setData(PANE_DRAG,'secondary');paneBridge.call('drag').catch(()=>{});});document.addEventListener('dragend',()=>paneBridge.call('dragend').catch(()=>{}));}
$('close-pane').addEventListener('click',async()=>{try{if(paneBridge)await paneBridge.call('closePane');else if(splitView.isOpen())await splitView.close('primary');else{await flushPane();clearWorkspaceDocument();renderBreadcrumb();}}catch(error){showPdfError(error);}});
if(!paneConfig)document.body.append($('review-batch'));
async function jumpToSearchResult({root,path,line}){await openPaneFile(root,path);if(activeProjectPath!==path || !Number.isInteger(line))return;mode='source';codeMode='edit';render();const offset=source.split('\n').slice(0,line-1).reduce((sum,text)=>sum+text.length+1,0);codeEditor.findSpan(offset,offset);}
function currentSearchSnapshot(){return fileName && filePreview?.kind!=='image'?{root:project?.rootPath,path:activeProjectPath || fileName,name:fileName,identity,text:source}:null;}
async function jumpToCurrentSearchResult(match){
 if(!await patchReview.canLeave())return;
 if(identity!==match.identity)throw Error('The current file changed. Search again.');
 if(!Number.isInteger(match.from) || match.from<0 || match.to>source.length || source.slice(match.from,match.to)!==match.quote)throw Error('The text changed. Search again.');
 if(pdfDocument){pdfViewer.findSpan(match.from,match.to);return;}
 if($('document').querySelector('.cm-editor')){codeEditor.findSpan(match.from,match.to);return;}
 if(mapping){mapping.selectSpan(match.from,match.to,true);return;}
 if(filePreview?.kind==='word')throw Error('Text matches are available, but jumping inside this document is not supported yet.');
}
if(paneBridge){paneBridge.handle('searchSnapshot',currentSearchSnapshot);paneBridge.handle('jumpCurrentSearch',jumpToCurrentSearchResult);}
const nativeNavigation=createNativeNavigation({getProject:()=>project,getCurrentFile:async()=>splitView?.activePane()==='secondary'?{...await splitView.call('searchSnapshot'),pane:'secondary'}:currentSearchSnapshot(),jumpCurrent:match=>match.pane==='secondary'?splitView.call('jumpCurrentSearch',match):jumpToCurrentSearchResult(match),readFile:(root,path)=>serverData('read_markdown_project_file',{root,path}),openFile:path=>openProjectFile(path),jump:result=>splitView?.activePane()==='secondary'?splitView.call('jumpLine',result):jumpToSearchResult(result)});
const toolbarActions=document.createElement('div');toolbarActions.className='toolbar-actions';toolbarActions.setAttribute('role','group');toolbarActions.setAttribute('aria-label','File actions');$('document-nav-toggle').before(toolbarActions);for(const id of ['document-nav-toggle','project-search-toggle','comments-toggle','width-mode','wrap-lines','mode-cycle','view-toggle','code-edit','comment','pdf-screenshot'])toolbarActions.append($(id));
if(typeof ResizeObserver!=='undefined')new ResizeObserver(()=>fitBreadcrumb(document.querySelector('.breadcrumb'))).observe(document.querySelector('.breadcrumb-space'));document.fonts?.ready.then(()=>fitBreadcrumb(document.querySelector('.breadcrumb')));
const fileMenu=createFileMenu({tree:$('project-tree'),menu:$('file-context-menu'),root:()=>project?.rootPath,
  onRename:renameTreeEntry,onCreate:(kind,folder)=>newTreeEntry(kind,folder),onDelete:deleteTreeEntry,
  onReveal:path=>serverData('reveal_review_project_file',{root:project.rootPath,path}),
  onSplit:splitView?((path,edge)=>splitView.open(project.rootPath,path,edge)):null,
  onWebPreview:async path=>{await openProjectFile(path);mode='rendered';codeMode='review';render();},
  onError:error=>{$('project-status').hidden=false;$('project-status').textContent=error.message;}});
let showHiddenFiles=localStorage.getItem('markatlas:show-hidden-files')!=='false';
function updateHiddenFilesToggle(){
  toolbarIcon('hidden-files-toggle',showHiddenFiles?'Hidden files visible — click to hide':'Hidden files hidden — click to show','preview');
  $('hidden-files-toggle').setAttribute('aria-label','Show hidden files');
  $('hidden-files-toggle').setAttribute('aria-pressed',String(showHiddenFiles));
  if(!showHiddenFiles)$('hidden-files-toggle').querySelector('svg').insertAdjacentHTML('beforeend','<path d="M3 3 21 21"/>');
}
updateHiddenFilesToggle();
$('hidden-files-toggle').addEventListener('click',()=>{showHiddenFiles=!showHiddenFiles;localStorage.setItem('markatlas:show-hidden-files',String(showHiddenFiles));updateHiddenFilesToggle();renderProjectTree();});
const treePreferences=createTreePreferences($('tree-sort-toggle'),$('tree-sort-menu'),()=>renderProjectTree());
function renderProjectTree() {
  fileMenu.close();
  const container=$('project-tree');
  const expanded=new Set([...container.querySelectorAll('details[open]')].map(node=>node.dataset.projectFolder));
  container.replaceChildren();if(!project){$('git-summary').hidden=true;return;}
  function children(nodes,parent) {
    const list=document.createElement('ul');parent.append(list);
    for(const node of treePreferences.sort(nodes)) {
      if(node.deleted)continue;
      const row=document.createElement('li');list.append(row);
      if(node.type==='directory') {
        const folder=document.createElement('details'),title=document.createElement('summary');folder.dataset.projectFolder=node.path;folder.open=expanded.has(node.path) || (treeAutoExpand && (node.path===breadcrumbFolder || !!breadcrumbFolder?.startsWith(`${node.path}/`) || !!activeProjectPath?.startsWith(`${node.path}/`)));const label=document.createElement('span');label.className='file-label';label.textContent=node.name;title.append(label);if(viewerPreferences.showGitChanges)appendGitBadge(title,node.git);if(node.path===breadcrumbFolder)title.dataset.breadcrumbActive='true';folder.append(title);row.append(folder);children(node.children,folder);
      } else {
        const button=document.createElement('button');button.type='button';button.dataset.projectPath=node.path;button.setAttribute('aria-disabled',String(node.deleted || !node.supported));
        if(node.deleted)button.dataset.deleted='true';
        button.draggable=!!project.rootPath && !project.singleFile && !node.deleted;
        button.title=node.deleted ? `${node.path} · Deleted file` : node.supported ? node.path : `${node.path} · Unsupported file type`;
        if(node.path===activeProjectPath)button.setAttribute('aria-current','page');
        const symbol=document.createElement('span');symbol.className='file-symbol';symbol.dataset.kind=isImage(node.name)?'image':isMarkdown(node.name)?'markdown':/\.svg$/i.test(node.name)?'vector':'code';symbol.setAttribute('aria-hidden','true');symbol.textContent=isImage(node.name)?'▧':isMarkdown(node.name)?'M↓':/\.svg$/i.test(node.name)?'▣':'#';
        const name=document.createElement('span');name.className='file-label';name.textContent=node.name;button.append(symbol,name);if(viewerPreferences.showGitChanges)appendGitBadge(button,node.git);row.append(button);
      }
    }
  }
  const query=$('project-filter').value.trim().toLowerCase();
  function filtered(nodes){return nodes.flatMap(node=>{if(!showHiddenFiles && node.name.startsWith('.'))return [];if(node.type==='directory'){const children=filtered(node.children);return !query || children.length ? [{...node,children}] : [];}return node.path.toLowerCase().includes(query) ? [node] : [];});}
  const summary=$('git-summary');summary.replaceChildren();summary.hidden=!project.git || !viewerPreferences.showGitChanges;if(project.git && viewerPreferences.showGitChanges){summary.append('Git changes');appendGitBadge(summary,project.root.git || {added:0,removed:0});}
  children(filtered(project.root.children),container);
  if(query && treeAutoExpand)container.querySelectorAll('details').forEach(node=>node.open=true);
}
$('project-toggle').addEventListener('click',()=>{if(project)browseFolder('',$('project-toggle'));else{setOpenMenu($('open-menu').hidden,$('project-toggle'));if(!$('open-menu').hidden)$('open-file-action').focus();}});
$('tree-toggle').addEventListener('click',()=>{const opening=$('project-drawer').hidden;setProjectOpen(opening);if(opening)loadWorkspace();});
$('project-filter').addEventListener('input',()=>{treeAutoExpand=true;renderProjectTree();});
const treeToolButtons=document.createElement('div');treeToolButtons.className='tree-tool-buttons';const treeTools=document.querySelector('.tree-tools');treeTools.append(treeToolButtons);for(const button of [...treeTools.querySelectorAll(':scope > button')])treeToolButtons.append(button);
function treeTool(id,label,path){const button=document.createElement('button');button.id=id;button.className='folder-button';button.title=label;button.setAttribute('aria-label',label);button.innerHTML=`<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="${path}"/></svg>`;return button;}
const filterToggle=treeTool('tree-filter-toggle','Filter files','M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14m5 12 6 6');treeToolButtons.prepend(filterToggle);filterToggle.setAttribute('aria-controls','project-filter');filterToggle.setAttribute('aria-expanded','false');$('project-filter').hidden=true;
function toggleTreeFilter(open){$('project-filter').hidden=!open;filterToggle.setAttribute('aria-expanded',String(open));if(open)$('project-filter').focus();else{$('project-filter').value='';renderProjectTree();filterToggle.focus();}}
filterToggle.addEventListener('click',()=>toggleTreeFilter($('project-filter').hidden));$('project-filter').addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();toggleTreeFilter(false);}});
const collapseTree=treeTool('tree-collapse-all','Collapse all folders','M12 3v5m-3-3 3 3 3-3M12 21v-5m-3 3 3-3 3 3M4 12h16');treeToolButtons.insertBefore(collapseTree,$('open-single-file'));collapseTree.addEventListener('click',()=>{treeAutoExpand=false;for(const folder of $('project-tree').querySelectorAll('details'))folder.open=false;});
const locateTree=treeTool('tree-locate-file','Locate current file','M12 2v4m0 12v4M2 12h4m12 0h4M12 5a7 7 0 1 0 0 14 7 7 0 0 0 0-14m0 4a3 3 0 1 0 0 6 3 3 0 0 0 0-6');treeToolButtons.insertBefore(locateTree,$('open-single-file'));locateTree.addEventListener('click',()=>{
 const path=activeProjectPath || (project?.singleFile?project.singlePath:null);if(!path)return;
 $('project-filter').value='';if(path.split('/').some(part=>part.startsWith('.'))){showHiddenFiles=true;localStorage.setItem('markatlas:show-hidden-files','true');updateHiddenFilesToggle();}
 treeAutoExpand=true;setProjectOpen(true);renderProjectTree();const button=[...$('project-tree').querySelectorAll('[data-project-path]')].find(node=>node.dataset.projectPath===path);if(!button)return;
 for(let parent=button.parentElement;parent && parent!==$('project-tree');parent=parent.parentElement)if(parent.tagName==='DETAILS')parent.open=true;
 button.scrollIntoView({block:'center',inline:'nearest'});button.focus({preventScroll:true});
});

let selectedCreationFolder=null;
const entryDialog=createEntryDialog(async({root,folder,name,kind})=>{
 const created=await serverData('create_review_project_entry',{root,folder,name,kind});
 if(project?.rootPath!==root)return;
 $('project-filter').value='';if(name.startsWith('.')){showHiddenFiles=true;updateHiddenFilesToggle();}
 breadcrumbFolder=kind==='directory'?created.path:folder;treeAutoExpand=true;
 try{await loadWorkspace();
 if(kind==='file' && !/\.(pdf|png|apng|jpe?g|gif|webp|bmp|ico|avif|docx|xlsx|pptx|zip|bin)$/i.test(name))await openProjectFile(created.path);
 }catch(error){showPdfError(new Error('Created successfully, but could not open it: '+error.message));}
});
const newFolder=treeTool('new-folder','New folder','M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM12 10v8m-4-4h8');
treeToolButtons.insertBefore(newFolder,$('open-folder'));newFolder.addEventListener('click',()=>newTreeEntry('directory'));
async function newTreeEntry(kind,targetFolder){
 if(!project?.rootPath || project.singleFile)await openFolderDialog();
 if(!project?.rootPath || project.singleFile)return;
 const folder=targetFolder ?? selectedCreationFolder ?? breadcrumbFolder ?? (activeProjectPath?.includes('/')?activeProjectPath.slice(0,activeProjectPath.lastIndexOf('/')):'');
 entryDialog.open({root:project.rootPath,folder,kind});
}
$('project-tree').addEventListener('click',event=>{
 if(event.target.closest('input'))return;
 const folder=event.target.closest('summary')?.parentElement;
 if(folder){selectedCreationFolder=folder.dataset.projectFolder;return;}
 const file=event.target.closest('[data-project-path]');if(file){const path=file.dataset.projectPath;selectedCreationFolder=path.includes('/')?path.slice(0,path.lastIndexOf('/')):'';}
});
$('project-toggle').addEventListener('click',()=>{selectedCreationFolder='';});
let treeOpenTimer;
$('project-tree').addEventListener('click',event=>{if(event.target.closest('input'))return;const button=event.target.closest('[data-project-path]');if(!button)return;clearTimeout(treeOpenTimer);if(event.detail===0){if(button.getAttribute('aria-disabled')!=='true')openProjectFile(button.dataset.projectPath);return;}if(event.detail<2)treeOpenTimer=setTimeout(()=>{if(button.getAttribute('aria-disabled')!=='true')openProjectFile(button.dataset.projectPath);},500);});
$('project-tree').addEventListener('dblclick',()=>clearTimeout(treeOpenTimer),true);
let draggedProjectFile=null,movingProjectFile=false;
const clearDropTarget=()=>document.querySelectorAll('[data-file-drop]').forEach(el=>el.removeAttribute('data-file-drop'));
$('project-tree').addEventListener('dragstart',event=>{
  const file=event.target.closest('[data-project-path]');
  if(!file || !project?.rootPath || project.singleFile || movingProjectFile){event.preventDefault();return;}
  draggedProjectFile={root:project.rootPath,path:file.dataset.projectPath};
  event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',file.dataset.projectPath);event.dataTransfer.setData(FILE_DRAG,JSON.stringify(draggedProjectFile));
});
document.addEventListener('dragend',()=>{draggedProjectFile=null;clearDropTarget();});
function dropFolder(event){
  if(event.currentTarget===$('project-toggle'))return {element:$('project-toggle'),path:''};
  const folder=event.target.closest('summary')?.parentElement;
  if(folder?.dataset.projectFolder!==undefined)return {element:folder.querySelector('summary'),path:folder.dataset.projectFolder};
  if(event.target===$('project-tree') || event.target===$('project-drawer'))return {element:$('project-tree'),path:''};
  return null;
}
async function applyTreeRename({root,from,to}){
  if(project?.rootPath!==root)return;
  const map=renamePaths(root,from,to);clearTimeout(projectSaveTimer);
  projectDrafts=map.rewrite(projectDrafts);
  for(const key of [...dirtyIdentities]){dirtyIdentities.delete(key);dirtyIdentities.add(map.identity(key));}
  for(const [id,entry] of batchEntries)if(entry.root===root)batchEntries.set(id,map.rewrite(entry));
  for(const entry of fileHistory)if(entry.root===root)entry.path=map.path(entry.path);
  for(const key of Object.keys(localStorage)){
    const next=map.storage(key);
    if(next!==key){try{localStorage.setItem(next,JSON.stringify(map.rewrite(JSON.parse(localStorage.getItem(key)))));localStorage.removeItem(key);}catch{}}
  }
  const changed=map.path(activeProjectPath)!==activeProjectPath;
  activeProjectPath=map.path(activeProjectPath);fileName=map.path(fileName);sourcePath=map.absolute(sourcePath);identity=map.identity(identity);breadcrumbFolder=map.path(breadcrumbFolder);selectedCreationFolder=map.path(selectedCreationFolder);
  items=map.rewrite(items);linkedPdf=map.rewrite(linkedPdf);
  if(changed){fileRefresh.stop();clearTimeout(pdfPoll);pdfDocument=map.rewrite(pdfDocument);currentEtag=null;}
  project=await serverData('list_markdown_project',{folderPath:root});
  saveBatchQueue();persist();await flushProjectState();await syncAnnotations();renderBreadcrumb();renderProjectTree();renderBatch();render();
  if(changed){const previousMode=mode,previousCodeMode=codeMode,path=activeProjectPath;activeProjectPath=null;await openProjectFile(path);mode=previousMode;codeMode=previousCodeMode;render();}
  if(paneBridge)await paneBridge.call('location',{root,path:activeProjectPath});
}
if(paneBridge)paneBridge.handle('renamed',applyTreeRename);
async function applyTreeDeletion({root,path}){
 if(project?.rootPath!==root)return;
 const affected=value=>value===path || value?.startsWith(path+'/');
 if(affected(activeProjectPath))clearWorkspaceDocument();
 fileHistory=fileHistory.filter(entry=>entry.root!==root || !affected(entry.path));historyIndex=Math.min(historyIndex,fileHistory.length-1);updateFileHistory();
 if(affected(selectedCreationFolder))selectedCreationFolder=null;
 if(affected(breadcrumbFolder))breadcrumbFolder=null;
 // Remove the confirmed deletion immediately; never reload an unrelated host root.
 const selected=project,request=++workspaceRequest;
 const prune=node=>{if(node.children)node.children=node.children.filter(child=>!affected(child.path)).map(prune);return node;};
 prune(project.root);renderBreadcrumb();renderProjectTree();
 try{
  const tree=await serverData('list_markdown_project',{folderPath:root});
  if(request===workspaceRequest && project===selected)await acceptWorkspace(tree,{allowDefault:false});
 }catch(error){
  if(request===workspaceRequest && project===selected){$('project-status').hidden=false;$('project-status').textContent='Moved to Trash. Could not refresh the remaining files: '+error.message;}
 }

}
if(paneBridge)paneBridge.handle('deleted',applyTreeDeletion);
const deleteEntryDialog=createDeleteEntryDialog(async({root,path})=>{
 if(movingProjectFile)throw Error('Please wait for the current file operation.');
 if(project?.rootPath!==root)throw Error('The project changed. Close this dialog and select the item again.');
 movingProjectFile=true;
 try{
  await flushPane();if(splitView?.isOpen())await splitView.call('flush');
  await serverData('delete_review_project_entry',{root,path});
  await applyTreeDeletion({root,path});
  if(splitView?.isOpen())await splitView.call('deleted',{root,path});
 }finally{movingProjectFile=false;}
});
async function deleteTreeEntry(path){
 if(movingProjectFile)throw Error('Please wait for the current file operation.');
 if(!project?.rootPath || project.singleFile)throw Error('Open a project folder before deleting.');
 deleteEntryDialog.open({root:project.rootPath,path});
}
async function renameTreeEntry(path,name){
  if(movingProjectFile)throw Error('Please wait for the current file operation.');
  if(!project?.rootPath || project.singleFile)throw Error('Open a project folder before renaming.');
  movingProjectFile=true;const root=project.rootPath;
  try{
    await flushPane();if(splitView?.isOpen())await splitView.call('flush');
    const result=await serverData('rename_review_project_file',{root,path,name});
    await applyTreeRename({root,from:path,to:result.path});
    if(splitView?.isOpen())await splitView.call('renamed',{root,from:path,to:result.path});
    if(result.warning)throw Error(result.warning);
  }finally{movingProjectFile=false;}
}
async function moveTreeFile(path,folder){
  if(movingProjectFile || !project?.rootPath)return;
  const selected=project,root=project.rootPath;movingProjectFile=true;
  try{
    await saveCode();if(source!==diskSource)throw Error('Save or resolve the current draft before moving a file.');
    await syncAnnotations();
    const result=await serverData('move_review_project_file',{root,path,folder});
    if(result.path===path)return;
    const oldAbsolute=root+'/'+path,newAbsolute=root+'/'+result.path;
    const rewrite=value=>{
      if(Array.isArray(value))return value.map(rewrite);
      if(!value || typeof value!=='object')return value;
      const next={...value};
      for(const key of Object.keys(next))if(typeof next[key]==='object')next[key]=rewrite(next[key]);
      if(next.sourcePath===oldAbsolute)next.sourcePath=newAbsolute;
      if(next.sourceName===path)next.sourceName=result.path;
      if(next.root===root && next.path===path)next.path=result.path;
      if(next.pdf?.root===root && next.pdf.path===path)next.pdf.path=result.path;
      return next;
    };
    const identities=['project:','pdf:'].map(prefix=>[prefix+oldAbsolute,prefix+newAbsolute]);
    const replaceKey=key=>typeof key!=='string'?key:identities.reduce((out,[from,to])=>out.replace(from,to),key);
    for(const key of Object.keys(localStorage))if(identities.some(([id])=>key.includes(id))){
      try{const nextKey=replaceKey(key),data=rewrite(JSON.parse(localStorage.getItem(key)));localStorage.setItem(nextKey,JSON.stringify(data));if(nextKey!==key)localStorage.removeItem(key);}catch{updateStatus('File moved; some local draft metadata could not be updated.');}
    }
    for(const [id,entry] of batchEntries)if(entry.root===root && entry.path===path)batchEntries.set(id,{...rewrite(entry),identity:replaceKey(entry.identity),storage:replaceKey(entry.storage),working:replaceKey(entry.working),etag:null});
    saveBatchQueue();
    for(const entry of fileHistory)if(entry.root===root && entry.path===path)entry.path=result.path;
    if(project!==selected)return;
    beginFileChange();activeProjectPath=null;
    const tree=await serverData('list_markdown_project',{folderPath:root});await acceptWorkspace(tree,{allowDefault:false});
    await openProjectFile(result.path);await syncAnnotations();setProjectOpen(true);
    updateStatus('Moved to '+result.path);
  }catch(error){$('project-status').hidden=false;$('project-status').textContent='Cannot move file: '+error.message;}
  finally{movingProjectFile=false;draggedProjectFile=null;clearDropTarget();}
}
for(const target of [$('project-drawer'),$('project-toggle')]){
  target.addEventListener('dragover',event=>{const folder=dropFolder(event);if(!draggedProjectFile || draggedProjectFile.root!==project?.rootPath || !folder)return;event.preventDefault();event.dataTransfer.dropEffect='move';clearDropTarget();folder.element.dataset.fileDrop='true';});
  target.addEventListener('dragleave',event=>{if(!target.contains(event.relatedTarget))clearDropTarget();});
  target.addEventListener('drop',event=>{const folder=dropFolder(event),file=draggedProjectFile;if(!file || !folder || file.root!==project?.rootPath)return;event.preventDefault();event.stopPropagation();clearDropTarget();moveTreeFile(file.path,folder.path);});
}
let fileHistory=[],historyIndex=-1,historyMoving=false;
function updateFileHistory(){ $('file-back').disabled=historyIndex<=0;$('file-forward').disabled=historyIndex>=fileHistory.length-1;}
async function moveFileHistory(step){const next=historyIndex+step;if(next<0||next>=fileHistory.length||historyMoving)return;const target=fileHistory[next];historyMoving=true;try{await openProjectFile(target.path);if(activeProjectPath===target.path){historyIndex=next;scrollViewport(0,target.scroll);}}finally{historyMoving=false;updateFileHistory();}}
$('file-back').addEventListener('click',()=>moveFileHistory(-1));$('file-forward').addEventListener('click',()=>moveFileHistory(1));
document.addEventListener('keydown',event=>{if((event.metaKey||event.ctrlKey)&&['[',']'].includes(event.key)&&!event.altKey){event.preventDefault();event.stopImmediatePropagation();moveFileHistory(event.key==='['?-1:1);}},true);
async function openProjectFile(path,sourceLine){
  if(!project)return;
  const find=node=>node.path===path?node:(node.children || []).map(find).find(Boolean);
  if(find(project.root)?.deleted){
    $('project-status').hidden=false;$('project-status').textContent=`Cannot open ${path}: This file has been deleted from disk. It is shown only as a Git change.`;return;
  }
  if(path===activeProjectPath && !sourceLine)return;
  if(!(await canLeaveFile()))return;
  if(fileHistory[historyIndex])fileHistory[historyIndex].scroll=viewport().scrollTop;
  const selectedProject=project,file=selectedProject.files?.get(path);if(!file && !selectedProject.rootPath)return;
  if(/\.(docx|xlsx)$/i.test(path)){
    try{
      if(!extensions.files?.open)throw Error('The built-in Word and Excel viewers are available inside the app. This browser preview cannot open them.');
      if(!selectedProject.rootPath)throw Error('Open the folder containing this file first.');
      const target=await serverData('resolve_native_office_file',{root:selectedProject.rootPath,path});
      if(selectedProject!==project)return;
      await extensions.files.open(target.path);
      $('project-status').hidden=true;$('project-status').textContent='';
    }catch(error){$('project-status').hidden=false;$('project-status').textContent=`Cannot open ${path}: ${error.message}`;}
    return;
  }
  beginFileChange();const current=++incomingRevision;if(isPdf(path))setDocumentLoading(true);$('project-status').textContent=`Opening ${path}…`;
  try {
    if(selectedProject.rootPath && !selectedProject.singleFile && path.includes('/')){
      await flushProjectState();
      const saved=await serverData('review_project_state',{root:selectedProject.rootPath,path});
      if(current!==incomingRevision || selectedProject!==project)return;
      const merged=mergeProjectState({entries:[...batchEntries],drafts:projectDrafts,removedIds:[...removedNoteIds]},{...saved,changedIdentities:[...new Set([...Object.keys(saved.drafts || {}),...(saved.entries || []).map(([,entry])=>entry.identity)])]});
      projectDrafts=merged.drafts;batchEntries=new Map(merged.entries);removedNoteIds=new Set(merged.removedIds);renderBatch();
    }
    if(isPdf(path)){
      if(!selectedProject.rootPath)throw Error('Open the folder containing this PDF to review it.');
      const result=await serverData('read_latex_pdf',{root:selectedProject.rootPath,path});
      if(current===incomingRevision && selectedProject===project){
        setProjectOpen(false);pdfViewer.setZoom(1);await displayPdf(result);
      }
      return;
    }
    const snapshot=selectedProject.rootPath ? await serverData('read_markdown_project_file',{root:selectedProject.rootPath,path}) : await localSnapshot(file);
    if(current!==incomingRevision || selectedProject!==project)return;
    await displaySnapshot(path,snapshot,`project:${selectedProject.rootPath || selectedProject.root.name}/${path}`,selectedProject.rootPath ? `${selectedProject.rootPath.replace(/[\\/]+$/,'')}/${path}` : null);
    if(current!==incomingRevision || selectedProject!==project)return;
    activeProjectPath=path;currentEtag=snapshot.etag;updateBatchDraft();
    if(!historyMoving){if(fileHistory[historyIndex]?.root!==selectedProject.rootPath){fileHistory=[];historyIndex=-1;}fileHistory.splice(historyIndex+1);fileHistory.push({root:selectedProject.rootPath,path,scroll:0});historyIndex=fileHistory.length-1;}updateFileHistory();scheduleSave();updateEditorControls();renderBreadcrumb();if(Number.isInteger(sourceLine))codeEditor.focusLine(sourceLine);
    if(selectedProject.rootPath && !snapshot.readOnly)fileRefresh.watch({text:snapshot.kind==='word' ? snapshot.data : snapshot.kind==='image' ? snapshot.url : source,etag:snapshot.etag,async read(etag){
      if(selectedProject.singleFile && selectedProject.resourceUri)await importSingleFile(path.split('/').at(-1),await resourceBytes(selectedProject.resourceUri),selectedProject.resourceUri);
      const result=await serverData('read_markdown_project_file',{root:selectedProject.rootPath,path,...(etag?{ifNoneMatch:etag}:{})});
      if(result.notModified)return result;
      if(result.readOnly)throw Error('File is no longer UTF-8 text. Reopen it for a read-only preview.');
      return {...result,text:result.kind==='word' ? result.data : result.kind==='image' ? result.url : normalize(result.text)};
    }});
    renderProjectTree();
    $('project-status').hidden=true;$('project-status').textContent='';

  } catch(error){if(current===incomingRevision){$('project-status').hidden=false;$('project-status').textContent=`Cannot open ${path}: ${error.message}`;showPdfError(error);}}
}
window.addEventListener('resize',()=>{positionDrawer();positionComposer();});
window.addEventListener('scroll',positionComposer,{capture:true});
if(typeof ResizeObserver!=='undefined'){new ResizeObserver(positionComposer).observe($('composer'));new ResizeObserver(()=>{updateLayout();positionDrawer();}).observe(document.querySelector('header'));}

async function serverData(name,args={}) {
  const result=await app.callServerTool({name,arguments:args});
  if(result.isError)throw Error(result.content?.find(c=>c.type==='text')?.text || 'Project access unavailable.');
  if(!result.structuredContent)throw Error('Project data is unavailable.');
  return result.structuredContent;
}
let recentRoots=[];try{recentRoots=JSON.parse(localStorage.getItem(recentRootsKey)||'[]').filter(root=>typeof root==='string').slice(0,10);}catch{}
function renderRecentRoots(){const node=$('recent-projects');node.replaceChildren();node.hidden=!!project || !!fileName || !recentRoots.length;if(node.hidden)return;const heading=document.createElement('p');heading.textContent='Recently opened';node.append(heading);for(const root of recentRoots){const button=document.createElement('button');button.textContent=root.split('/').filter(Boolean).at(-1)||root;button.title=root;button.setAttribute('aria-label',`Open recent project ${button.textContent}`);button.addEventListener('click',async()=>{try{if(!await canLeaveFile())return;const tree=await serverData('list_markdown_project',{folderPath:root});if(await acceptWorkspace(tree,{selectDefault:true}))connectedFolder=tree.rootPath;}catch(error){$('project-status').hidden=false;$('project-status').textContent=error.message;}});node.append(button);}}
function rememberRoot(root){if(!root)return;recentRoots=[root,...recentRoots.filter(value=>value!==root)].slice(0,10);try{localStorage.setItem(recentRootsKey,JSON.stringify(recentRoots));}catch{}renderRecentRoots();}
renderRecentRoots();
let workspaceRequest=0;
function clearWorkspaceDocument() {
  ++incomingRevision;beginFileChange();close();filePreview=null;source='';diskSource='';diskHash='';codeFile=false;codeMode='edit';currentEtag=null;fileName='';sourcePath=null;identity='';documentHash='';items=[];activeProjectPath=null;
  $('filename').textContent='MarkAtlas';$('comment').disabled=true;render();
  $('status').textContent='';
}
async function acceptWorkspace(tree,{selectDefault=false,allowDefault=true}={}) {
  const initial=!project;
  const changed=project && (project.rootPath!==tree.rootPath || !!project.singleFile!==!!tree.singleFile || (tree.singleFile && project.singlePath!==tree.singlePath));
  if(changed && !(await canLeaveFile()))return false;
  if(changed){selectedCreationFolder=null;treeAutoExpand=true;await flushProjectState();dirtyIdentities.clear();projectDrafts={};linkedPdf=null;currentEtag=null;clearWorkspaceDocument();breadcrumbFolder=null;$('project-filter').value='';$('project-tree').replaceChildren();}
  if(project && !changed)Object.assign(project,tree);else project=tree;
  if((initial || changed) && !tree.singleFile){try{const saved=await serverData('review_project_state',{root:tree.rootPath});for(const id of saved.removedIds || []){removedNoteIds.add(id);batchEntries.delete(id);}projectDrafts=saved.drafts || {};for(const [key,draft] of Object.entries(projectDrafts)){const prefix='project:'+tree.rootPath.replace(/\/+$/,'')+'/';if(!key.startsWith(prefix))continue;for(const item of draft.items || [])if(item.kind==='explanation' && !removedNoteIds.has(item.id))batchEntries.set(item.id,{identity:key,root:tree.rootPath,path:key.slice(prefix.length),item});}for(const [id,entry] of saved.entries || [])if(entryRoot(entry)===normalizedRoot(tree.rootPath))batchEntries.set(id,entry);}catch(error){updateStatus(`Cannot load project notes: ${error.message}`);}}
  if(!tree.singleFile && (initial || changed || selectDefault))rememberRoot(tree.rootPath);
  $('project-status').hidden=true;$('project-status').textContent='';
  renderBreadcrumb();renderProjectTree();renderBatch();
  // Only choose a default when connecting a folder, never on focus/tree refresh.
  if(allowDefault && (selectDefault || ((initial || changed) && !fileName))){
    const names=['readme.md','readme.markdown','readme','readme.txt','readme.rst'];
    const readme=tree.root.children.filter(node=>node.type==='file' && names.includes(node.name.toLowerCase()))
      .sort((a,b)=>names.indexOf(a.name.toLowerCase())-names.indexOf(b.name.toLowerCase()) || a.name.localeCompare(b.name))[0];
    if(readme)await openProjectFile(readme.path);
  }
  return true;
}
let choosingFolder=false;
async function openFolderDialog(){
  if(choosingFolder){serverData('choose_markdown_project_folder').catch(()=>{});return;}
  choosingFolder=true;
  const request=++workspaceRequest;$('open-folder').setAttribute('aria-busy','true');
  $('project-status').hidden=false;$('project-status').textContent='Choose a folder in the macOS dialog. Click the folder button again to bring it forward.';setProjectOpen(true);
  try {
    const tree=await serverData('choose_markdown_project_folder');
    if(request!==workspaceRequest)return;
    if(tree.cancelled){$('project-status').hidden=true;$('project-status').textContent='';return;}
    if(await acceptWorkspace(tree,{selectDefault:true}))connectedFolder=tree.rootPath;
    setProjectOpen(true);
  } catch(error){$('project-status').hidden=false;$('project-status').textContent=error.message;setProjectOpen(true);}
  finally {choosingFolder=false;$('open-folder').removeAttribute('aria-busy');}
}
$('open-folder').addEventListener('click',openFolderDialog);
function setOpenMenu(open,anchor=$('project-toggle')){
  $('open-menu').hidden=!open;
  if(open){const rect=anchor.getBoundingClientRect();Object.assign($('open-menu').style,{position:'fixed',left:`${Math.max(8,Math.min(rect.left,viewWidth()-172))}px`,top:`${rect.bottom+7}px`,right:'auto'});}
}
let choosingFile=false;
async function openFileDialog(){
  setOpenMenu(false);if(choosingFile){serverData('choose_review_file').catch(()=>{});return;}
  choosingFile=true;
  try{const tree=await serverData('choose_review_file');if(!tree.cancelled)await openSingleWorkspace(tree);}
  catch(error){if(/macOS only|Unknown tool|not found|unsupported/i.test(error.message))$('picker').click();else showPdfError(error);}
  finally{choosingFile=false;}
}
$('open-file-action').addEventListener('click',openFileDialog);
$('open-single-file').addEventListener('click',()=>newTreeEntry('file'));
$('open-folder-action').addEventListener('click',()=>{setOpenMenu(false);openFolderDialog();});
document.addEventListener('click',e=>{if(!e.target.closest?.('.open-control') && !e.target.closest?.('#project-toggle'))setOpenMenu(false);});
$('open-menu').addEventListener('keydown',e=>{
  if(e.key==='Escape'){e.preventDefault();setOpenMenu(false);$('project-toggle').focus();}
  if(['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();(document.activeElement===$('open-file-action') ? $('open-folder-action') : $('open-file-action')).focus();}
});
async function loadWorkspace() {
  if(choosingFolder || project?.singleFile)return;

  const request=++workspaceRequest;
  $('project-status').textContent='Reading current workspace…';
  try {
    const tree=await serverData('list_markdown_project',connectedFolder ? {folderPath:connectedFolder} : {});
    if(request!==workspaceRequest)return;
    await acceptWorkspace(tree);
  } catch(error) {
    if(request!==workspaceRequest)return;
    if(!(await canLeaveFile()))return;
    if(project)clearWorkspaceDocument();project=null;$('project-tree').replaceChildren();
    renderBreadcrumb();
    const emptyWorkspace=error.message.includes('No workspace folder was shared by the app.');$('project-status').hidden=emptyWorkspace;$('project-status').textContent=emptyWorkspace?'':error.message;
  }
}
function resourceText(resource) {
  const content=resource.contents?.[0];
  if(typeof content?.text==='string')return normalize(content.text);
  if(typeof content?.blob==='string')return normalize(new TextDecoder().decode(Uint8Array.from(atob(content.blob),c=>c.charCodeAt(0))));
  throw Error('Unsupported file representation.');
}
function watchResource(uri,text) {
  const api=extensions.resources;if(!api)return;
  const dispose=api.addUpdateHandler?.(({params})=>{if(params.uri===uri)fileRefresh.check();});
  api.subscribe?.({uri}).catch(()=>{});
  fileRefresh.watch({text,async read(){return {text:resourceText(await api.read({uri}))};},dispose(){
    dispose?.();api.unsubscribe?.({uri}).catch(()=>{});
  }});
}
window.addEventListener('focus',()=>{loadWorkspace();fileRefresh.check();});
document.addEventListener('visibilitychange',()=>{if(!document.hidden){loadWorkspace();fileRefresh.check();}});
window.addEventListener('pagehide',()=>{clearTimeout(pdfPoll);persist();saveCode();if(syncTimer!==null){clearTimeout(syncTimer);syncTimer=null;syncAnnotations().catch(()=>{});}fileRefresh.stop();});
const updateHostBottomInset=trackHostBottomInset();
let lastAccentContext=null;
function applyHostContext(context) {
  updateHostBottomInset(context);
  if(context?.styles?.variables)lastAccentContext=context;
  document.documentElement.style.removeProperty('--markatlas-accent');document.documentElement.style.removeProperty('--markatlas-accent-soft');
  applyHostAccent(lastAccentContext || context);
  applyThemeColor(viewerPreferences.themeColor,context);
  $('inline-mode').textContent=context?.displayMode==='inline'?'Expand view':'Inline view';
  if(['light','dark'].includes(context?.theme)){document.documentElement.dataset.theme=context.theme;document.querySelectorAll('.markdown-rendered').forEach(el=>{el.classList.toggle('theme-dark',context.theme==='dark');el.classList.toggle('theme-light',context.theme==='light');});}

}
async function refreshViewerSettings(){
 if(settingsRequest)return settingsRequest;
 settingsRequest=(async()=>{try{
  const result=await serverData('markatlas_settings_read');if(!result?.values)return;
  const values=result.preferences || result.values;
  if(['left','right'].includes(values.treePosition) && (!lastSettings || values.treePosition!==lastSettings.treePosition))treeSide=values.treePosition;
  if(['left','right'].includes(values.outlinePosition) && (!lastSettings || values.outlinePosition!==lastSettings.outlinePosition))outlineSide=values.outlinePosition;
  viewerPreferences={themeColor:values.themeColor || 'host',showGitChanges:values.showGitChanges!==false};
  const changed=JSON.stringify(lastSettings)!==JSON.stringify(values);lastSettings={...values};
  if(syncRecentHistory(localStorage,result.recentHistoryRevision)){recentRoots=[];renderRecentRoots();}
  if(changed){applyHostContext(app.getHostContext());renderProjectTree();updateLayout();codeEditor.measure();positionComposer();}
 }catch(error){console.warn('MarkAtlas settings unavailable:',error.message);}finally{settingsRequest=null;}})();return settingsRequest;
}
window.addEventListener('focus',()=>{refreshViewerSettings();});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshViewerSettings();});
window.addEventListener('storage',event=>{if(event.key===recentRootsKey){try{recentRoots=JSON.parse(event.newValue||'[]');renderRecentRoots();}catch{}}});
const settingsPoll=setInterval(()=>{if(!document.hidden)refreshViewerSettings();},3000);
window.addEventListener('pagehide',()=>clearInterval(settingsPoll));
app.onhostcontextchanged = context=>{applyHostContext(context);loadWorkspace();};
createTreeToolbar(treeToolButtons);
setProjectOpen(true);
app.connect().then(async()=>{await refreshViewerSettings();applyHostContext(app.getHostContext());if(paneConfig){await openPaneFile(paneConfig.root,paneConfig.path);setProjectOpen(false);await paneBridge.call('ready');}else await loadWorkspace();}).catch(error=>{$('status').textContent = `Host connection unavailable: ${error.message}. You can still open a local file.`;});

// Capture before editor and host bubbling shortcuts. Each pane handles its own focus.
window.addEventListener('keydown',event=>{
  if(!(event.metaKey||event.ctrlKey)||event.altKey||event.shiftKey||event.isComposing)return;
  if(event.key.toLowerCase()==='o'){event.preventDefault();event.stopImmediatePropagation();if(!event.repeat)$('open-folder').click();return;}
  if(!(event.key==='/'||event.code==='Slash'))return;
  const button=$('mode-cycle');if(button.hidden||button.disabled||!isMarkdown(fileName))return;
  event.preventDefault();event.stopImmediatePropagation();if(!event.repeat)button.click();
},true);
