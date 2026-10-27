import {markdownEnter} from './markdown-enter.js';
import {markdownShortcuts} from './markdown-shortcuts.js';
import {insertMarkdownAction,markdownActions} from './markdown-insert.js';
import {fallbackHighlight} from './code-highlight.js';
import {properties} from '@codemirror/legacy-modes/mode/properties';
import {diff} from '@codemirror/legacy-modes/mode/diff';
import {dockerFile} from '@codemirror/legacy-modes/mode/dockerfile';
import {powerShell} from '@codemirror/legacy-modes/mode/powershell';
import {r} from '@codemirror/legacy-modes/mode/r';
import {perl} from '@codemirror/legacy-modes/mode/perl';
import {lua} from '@codemirror/legacy-modes/mode/lua';
import {swift} from '@codemirror/legacy-modes/mode/swift';
import {toml} from '@codemirror/legacy-modes/mode/toml';
import {ruby} from '@codemirror/legacy-modes/mode/ruby';
import {go} from '@codemirror/legacy-modes/mode/go';
import {shell} from '@codemirror/legacy-modes/mode/shell';
import {yaml} from '@codemirror/legacy-modes/mode/yaml';
import {githubLight} from '@uiw/codemirror-theme-github';
import {liveMarkdown,liveNotes,revealBlock} from './live-markdown.js';
import {EditorView,basicSetup} from 'codemirror';
import {Compartment,EditorState,StateEffect,StateField,Prec} from '@codemirror/state';
import {Decoration,keymap} from '@codemirror/view';
import {MergeView} from '@codemirror/merge';
import {javascript} from '@codemirror/lang-javascript';
import {python} from '@codemirror/lang-python';
import {json} from '@codemirror/lang-json';
import {html} from '@codemirror/lang-html';
import {css} from '@codemirror/lang-css';
import {cpp} from '@codemirror/lang-cpp';
import {rust} from '@codemirror/lang-rust';
import {sql} from '@codemirror/lang-sql';
import {markdown} from '@codemirror/lang-markdown';
import {java} from '@codemirror/lang-java';
import {StreamLanguage,indentUnit} from '@codemirror/language';
import {indentMore,indentLess} from '@codemirror/commands';
import {stex} from '@codemirror/legacy-modes/mode/stex';
import {sourceSelection} from './markdown.js';
function insertIndent(view){
 if(view.state.readOnly)return false;
 if(view.state.selection.ranges.some(range=>!range.empty))return indentMore(view);
 view.dispatch(view.state.update(view.state.replaceSelection('    '),{scrollIntoView:true,userEvent:'input.indent'}));return true;
}
const notesEffect=StateEffect.define();
const latexLanguage=StreamLanguage.define(stex);
function language(name){
  const legacy=/\.(yaml|yml)$/i.test(name)?yaml:/\.(sh|bash|zsh|fish)$/i.test(name)?shell:/\.go$/i.test(name)?go:/\.(rb|rake)$/i.test(name)?ruby:/\.toml$/i.test(name)?toml:/\.swift$/i.test(name)?swift:/\.lua$/i.test(name)?lua:/\.(pl|pm)$/i.test(name)?perl:/\.r$/i.test(name)?r:/\.(ps1|psm1)$/i.test(name)?powerShell:/(^|\/)dockerfile(\..*)?$/i.test(name)?dockerFile:/\.(diff|patch)$/i.test(name)?diff:/\.(ini|conf|properties)$/i.test(name)?properties:null;
  if(legacy)return StreamLanguage.define(legacy);

  if(/\.(tex|ltx|latex|sty|cls|dtx|ins)$/i.test(name))return [latexLanguage];
  if(/\.(md|markdown)$/i.test(name))return markdown();
  if(/\.[cm]?[jt]sx?$/i.test(name))return javascript({typescript:/\.[cm]?tsx?$/i.test(name),jsx:/\.[jt]sx$/i.test(name)});
  if(/\.py$/i.test(name))return python();if(/\.json$/i.test(name))return json();
  if(/\.html?$/i.test(name))return html();if(/\.s?css$/i.test(name))return css();
  if(/\.(c|h|cc|cpp|hpp)$/i.test(name))return cpp();if(/\.rs$/i.test(name))return rust();
  if(/\.sql$/i.test(name))return sql();if(/\.java$/i.test(name))return java();return fallbackHighlight(name);
}
const theme=EditorView.theme({
  '&':{backgroundColor:'var(--bg)',color:'var(--fg)',fontSize:'calc(13px * var(--text-scale, 1))'},
  '.cm-content':{fontFamily:'ui-monospace, SFMono-Regular, Menlo, monospace',lineHeight:'1.7',padding:'12px 0'},
  '.cm-gutters':{backgroundColor:'var(--bg)',color:'var(--muted)',border:'none'},
  '.cm-activeLine':{backgroundColor:'color-mix(in srgb, var(--accent) 5%, transparent)'},
  '.cm-activeLineGutter':{backgroundColor:'var(--surface)'},
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground':{backgroundColor:'var(--selection) !important'},
  '.cm-content ::selection':{backgroundColor:'var(--selection)'},
  '.cm-review-note.pending-selection':{backgroundColor:'var(--selection)'},
  '.cm-cursor':{borderLeftColor:'var(--fg)'},
  '.cm-review-note':{backgroundColor:'var(--highlight)',borderRadius:'2px'},
  '&.cm-focused':{outline:'none'},'.cm-scroller':{overflow:'auto'}
});
export function createCodeEditor(container,{onChange,onSelection,onNote,onSave,onPasteImage,onError=()=>{}}) {
  let current=null,key='',lastOriginal='',noteItems=[],markdownBottomClick=false;
  let wrapLines=false;
  const wrapping=new Compartment();
  const menu=document.createElement('div');menu.className='markdown-insert-menu';menu.setAttribute('role','menu');menu.setAttribute('aria-label','Insert Markdown');menu.hidden=true;document.body.append(menu);
  for(const [action,{label}] of Object.entries(markdownActions)){const button=document.createElement('button');button.type='button';button.setAttribute('role','menuitem');button.textContent=label;button.addEventListener('mousedown',event=>event.preventDefault());button.addEventListener('click',()=>{menu.hidden=true;if(current instanceof EditorView)insertMarkdownAction(current,action);});menu.append(button);}
  const closeMenu=event=>{if(!menu.contains(event.target))menu.hidden=true;};document.addEventListener('pointerdown',closeMenu);
  const blankSurface=container.parentElement?.tagName==='MAIN'?container.parentElement:container;
  blankSurface.addEventListener('mousedown',event=>{
    if(!markdownBottomClick || !(current instanceof EditorView) || event.button!==0 || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey)return;
    const view=current;
    if(![blankSurface,container,view.dom,view.scrollDOM,view.contentDOM].includes(event.target))return;
    const end=view.state.doc.length;
    if(view.viewport.to<end || event.clientY<view.documentTop+view.lineBlockAt(end).bottom)return;
    event.preventDefault();event.stopPropagation();
    view.dispatch({selection:{anchor:end},effects:revealBlock.of(end)});view.focus();
  },true);
  function destroy(){menu.hidden=true;current?.destroy();current=null;key='';container.replaceChildren();}
  function marks(items){noteItems=items;const ranges=[];for(const item of items){if(item.pdf?.region || item.startOffset<0 || item.endOffset<=item.startOffset || item.endOffset>current.state.doc.length)continue;ranges.push(Decoration.mark({class:item.temporary?'cm-review-note pending-selection':'cm-review-note',attributes:item.temporary?{}:{'data-annotation':item.id,'data-note-kind':item.kind,role:'button',tabindex:'0','aria-label':`Review note on lines ${item.startLine}–${item.endLine}`},inclusiveEnd:true}).range(item.startOffset,item.endOffset));}return Decoration.set(ranges,true);}
  const notes=StateField.define({create:()=>Decoration.none,update(value,tr){for(const effect of tr.effects)if(effect.is(notesEffect))return marks(effect.value);return value.map(tr.changes);},provide:field=>EditorView.decorations.from(field)});
  function extensions(name,readOnly,review){return [basicSetup,githubLight,theme,wrapping.of(wrapLines?EditorView.lineWrapping:[]),language(name),indentUnit.of('    '),EditorState.tabSize.of(4),Prec.highest(keymap.of([{key:'Tab',run:insertIndent,shift:indentLess},{key:'Mod-[',run:indentLess},{key:'Mod-]',run:indentMore}])),...(!readOnly && /\.(md|markdown)$/i.test(name)?markdownShortcuts():[]),EditorState.readOnly.of(readOnly),EditorView.editable.of(!readOnly),keymap.of([{key:'Mod-s',run:()=>{onSave();return true;}}]),...(review?[notes]:[])];}
  return {
    show({name,text,original,mode,items=[],live=false,markdownOptions={}}) {
      markdownBottomClick=mode==='edit' && live && /\.(md|markdown)$/i.test(name);
      const nextKey=`${name}:${mode}:${live}`;
      const same=current && key===nextKey && (mode==='changes' ? lastOriginal===original && current.b.state.doc.toString()===text : current.state.doc.toString()===text);
      if(!same){destroy();key=nextKey;lastOriginal=original;
        if(mode==='changes') {
          current=new MergeView({parent:container,a:{doc:original,extensions:extensions(name,true,false)},b:{doc:text,extensions:extensions(name,true,false)},highlightChanges:true,gutter:true,collapseUnchanged:{margin:3,minSize:8}});
        } else {
          current=new EditorView({parent:container,doc:text,extensions:[...extensions(name,mode!=='edit',true),...(live?[...liveMarkdown(markdownOptions),Prec.highest(keymap.of([{key:'Enter',run:markdownEnter}]))]:[]),EditorView.contentAttributes.of({'aria-label':mode==='edit' ? (/\.(md|markdown)$/i.test(name)?(live?'Markdown live editor':'Markdown source editor'):'Code editor') : 'Source review'}),EditorView.updateListener.of(update=>{if(update.docChanged){const updated=onChange(update.state.doc.toString(),update.changes,update.startState.selection.main.head);if(updated)queueMicrotask(()=>{if(current===update.view && current.state.doc===update.state.doc)current.dispatch({effects:[notesEffect.of(updated.filter(item=>item.anchorStatus!=='deleted')),liveNotes.of(updated.filter(item=>item.anchorStatus!=='deleted'))]});});}}),EditorView.domEventHandlers({contextmenu:(event,view)=>{if(mode!=='edit' || !/\.(md|markdown)$/i.test(name))return false;event.preventDefault();menu.hidden=false;menu.style.left=`${Math.max(4,Math.min(event.clientX,window.innerWidth-menu.offsetWidth-4))}px`;menu.style.top=`${Math.max(4,Math.min(event.clientY,window.innerHeight-menu.offsetHeight-4))}px`;return true;},paste:(event,view)=>{if(mode!=='edit' || !/\.(md|markdown)$/i.test(name))return false;const image=[...event.clipboardData?.items||[]].find(item=>item.kind==='file' && /^image\/(png|jpeg|gif|webp)$/.test(item.type));if(!image)return false;event.preventDefault();const file=image.getAsFile(),selection=view.state.selection.main;Promise.resolve().then(()=>onPasteImage(file)).then(reference=>{if(reference && current===view){view.dispatch({changes:{from:selection.from,to:selection.to,insert:reference},selection:{anchor:selection.from+reference.length},userEvent:'input.paste'});view.focus();}}).catch(onError);return true;},click:(event,view)=>{const target=event.target.closest?.('.cm-review-note[data-annotation]');if(!target || !view.state.selection.main.empty)return false;const note=noteItems.find(item=>item.id===target.dataset.annotation);if(!note)return false;event.preventDefault();event.stopPropagation();onNote(note,target.getBoundingClientRect());return true;},pointerup:(e,view)=>{if(e.target.closest?.('.annotation-icon'))return false;if(mode!=='changes')queueMicrotask(()=>capture(view));return false;},keyup:(_e,view)=>{if(mode!=='changes')capture(view);return false;}})]});
        }
      }

      if(mode!=='changes')current.dispatch({effects:[notesEffect.of(items),liveNotes.of(items)]});
    },
    destroy,
    setLineWrapping(enabled){
      wrapLines=enabled;
      const effect=wrapping.reconfigure(enabled?EditorView.lineWrapping:[]);
      if(current instanceof EditorView)current.dispatch({effects:effect});
      else if(current){current.a.dispatch({effects:effect});current.b.dispatch({effects:effect});}
    },
    setNotes(items){if(current instanceof EditorView)current.dispatch({effects:[notesEffect.of(items),liveNotes.of(items)]});},
    clearSelection(){if(current instanceof EditorView)current.dispatch({selection:{anchor:current.state.selection.main.head}});},
    capture(){return current instanceof EditorView?{selection:current.state.selection,top:current.scrollDOM.scrollTop,left:current.scrollDOM.scrollLeft}:null;},
    restore(saved){if(current instanceof EditorView){current.dispatch({selection:saved.selection});current.scrollDOM.scrollTop=saved.top;current.scrollDOM.scrollLeft=saved.left;}},
    findSpan(from,to){if(current instanceof EditorView)current.dispatch({selection:{anchor:from,head:to},effects:EditorView.scrollIntoView(from,{y:'center'})});},
    measure(){if(current instanceof EditorView)current.requestMeasure();else if(current){current.a.requestMeasure();current.b.requestMeasure();}},
    selectSpan(from,to){if(current instanceof EditorView){current.focus();current.dispatch({selection:{anchor:from,head:to}});}},
    focusLine(line){if(current instanceof EditorView){const position=current.state.doc.line(Math.max(1,Math.min(line,current.state.doc.lines))).from;current.dispatch({selection:{anchor:position},effects:EditorView.scrollIntoView(position,{y:'center'})});current.focus();}},
    caret(){return current instanceof EditorView ? current.state.selection.main.head : 0;},
    focusAt(position){if(current instanceof EditorView){current.dispatch({selection:{anchor:Math.min(position,current.state.doc.length)}});current.focus();}},
    focus(){if(current instanceof EditorView){const selection=current.state.selection;current.contentDOM.focus({preventScroll:true});current.dispatch({selection});}}
  };
  function capture(view){const selection=view.state.selection.main;if(selection.empty)return;const text=view.state.doc.toString();onSelection({...sourceSelection(text,selection.from,selection.to),mappingStatus:'exact'},view.coordsAtPos(selection.to));}
}
