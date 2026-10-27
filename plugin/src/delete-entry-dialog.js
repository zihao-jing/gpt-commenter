// Host webviews may suppress window.confirm; keep confirmation inside the app.
export function createDeleteEntryDialog(remove){
 const overlay=document.createElement('div');overlay.id='delete-entry-dialog';overlay.className='entry-dialog';overlay.hidden=true;
 overlay.innerHTML='<form role="dialog" aria-modal="true" aria-labelledby="delete-entry-title"><h2 id="delete-entry-title">Move to Trash?</h2><p id="delete-entry-path"></p><p>This item and any contents will be moved to Trash. You can restore them from Finder.</p><p id="delete-entry-error" role="alert"></p><div class="create-entry-actions"><button type="button" id="delete-entry-cancel">Cancel</button><button type="submit" id="delete-entry-submit">Move to Trash</button></div></form>';
 document.body.append(overlay);
 const form=overlay.querySelector('form'),cancel=overlay.querySelector('#delete-entry-cancel'),submit=overlay.querySelector('#delete-entry-submit'),error=overlay.querySelector('#delete-entry-error');let context,opener,busy=false;
 function close(){if(busy)return;overlay.hidden=true;opener?.focus();}
 cancel.addEventListener('click',close);
 overlay.addEventListener('keydown',event=>{event.stopPropagation();if(event.key==='Escape'){event.preventDefault();close();}if(event.key==='Tab'){event.preventDefault();if(!busy)(document.activeElement===cancel?submit:cancel).focus();}});
 form.addEventListener('submit',async event=>{event.preventDefault();if(busy)return;busy=true;cancel.disabled=submit.disabled=true;submit.textContent='Moving…';error.textContent='';form.setAttribute('aria-busy','true');
 try{await remove(context);busy=false;close();}catch(failure){error.textContent=failure.message || 'Could not move this item to Trash.';}
 finally{busy=false;cancel.disabled=submit.disabled=false;submit.textContent='Move to Trash';form.removeAttribute('aria-busy');if(!overlay.hidden)cancel.focus();}
 });
 return {open(value){if(busy || !overlay.hidden)return;context=value;opener=document.activeElement;error.textContent='';overlay.querySelector('#delete-entry-path').textContent=value.root+'/'+value.path;overlay.hidden=false;cancel.focus();}};
}
