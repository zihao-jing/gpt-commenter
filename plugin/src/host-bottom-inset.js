// Host context notifications are partial: unrelated updates must retain the inset.
export function trackHostBottomInset(win=window){
 let inset=0;
 function render(){
  const viewport=win.visualViewport;
  const covered=viewport && Math.abs((viewport.scale ?? 1)-1)<.01?Math.max(0,win.innerHeight-viewport.height-viewport.offsetTop):0;
  win.document.documentElement.style.setProperty('--host-bottom-inset',`${Math.max(inset,covered)}px`);
 }
 win.addEventListener('resize',render);
 win.visualViewport?.addEventListener('resize',render);
 win.visualViewport?.addEventListener('scroll',render);
 render();
 return context=>{
  if(context && Object.hasOwn(context,'safeAreaInsets')){
   const bottom=context.safeAreaInsets?.bottom;
   if(bottom===undefined || bottom===null)inset=0;
   else if(Number.isFinite(bottom))inset=Math.max(0,bottom);
  }
  render();
 };
}
