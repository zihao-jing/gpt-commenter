import {EditorState,Prec} from '@codemirror/state';
import {EditorView,keymap} from '@codemirror/view';
export function wrapMarkdownSelection(view,marker){
 if(view.state.readOnly)return false;
 const selection=view.state.selection.main;if(selection.empty)return false;
 const {from,to}=selection,text=view.state.doc.toString();
 const unwrap=from>=marker.length && text.slice(from-marker.length,from)===marker && text.slice(to,to+marker.length)===marker;
 view.dispatch({changes:unwrap?[{from:from-marker.length,to:from,insert:''},{from:to,to:to+marker.length,insert:''}]:[{from,insert:marker},{from:to,insert:marker}],selection:{anchor:from+(unwrap?-marker.length:marker.length),head:to+(unwrap?-marker.length:marker.length)},userEvent:'input.markdown-format'});
 return true;
}
export function markdownShortcuts(){
 let equals=null;
 return [Prec.highest(keymap.of([{key:'Mod-b',run:view=>wrapMarkdownSelection(view,'**')},{key:'Mod-i',run:view=>wrapMarkdownSelection(view,'*')}])) ,EditorView.domEventHandlers({keydown(event,view){
  if(event.isComposing || event.metaKey || event.ctrlKey || event.altKey || view.state.readOnly)return false;
  const selection=view.state.selection.main;
  if((event.key==='$' || event.key==='`') && !selection.empty){event.preventDefault();equals=null;return wrapMarkdownSelection(view,event.key);}
  if(event.key==='=' && !selection.empty){
   event.preventDefault();const signature=`${selection.from}:${selection.to}:${view.state.doc.toString()}`;
   if(equals?.signature===signature && Date.now()-equals.at<900){equals=null;return wrapMarkdownSelection(view,'==');}
   equals={signature,at:Date.now()};return true;
  }
  equals=null;return false;
 }})];
}
