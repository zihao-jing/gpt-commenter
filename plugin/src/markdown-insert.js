export const markdownActions={
  table:{label:'Add table',template:'|  |  |  |\n| --- | --- | --- |\n|  |  |  |'},
  bullets:{label:'Bulleted list',prefix:()=>'- '},
  numbers:{label:'Numbered list',prefix:index=>`${index+1}. `},
  callout:{label:'Callout',header:'> [!note]'},
  quote:{label:'Block quote',prefix:()=>'> '},
  task:{label:'Task list',prefix:()=>'- [ ] '},
  code:{label:'Code block'}
};

export function insertMarkdownAction(view,action){
  if(view.state.readOnly || !markdownActions[action])return false;
  const doc=view.state.doc,selection=view.state.selection.main;
  const start=doc.lineAt(selection.from),end=doc.lineAt(selection.to);
  const last=selection.to>start.from && selection.to===end.from ? doc.line(end.number-1) : end;
  const from=action==='table' || selection.empty?selection.from:start.from,to=action==='table' || selection.empty?selection.to:last.to;
  const selected=selection.empty?'':doc.sliceString(from,to);
  let insert;
  if(action==='table')insert=`${from && doc.sliceString(from-1,from)!=='\n'?'\n':''}${markdownActions.table.template}${to<doc.length && doc.sliceString(to,to+1)!=='\n'?'\n':''}`;
  else if(action==='code')insert=`\`\`\`\n${selected}\n\`\`\``;
  else if(action==='callout')insert=`> [!note]\n${selected ? selected.split('\n').map(line=>`> ${line}`).join('\n') : '> '}`;
  else insert=(selected || '').split('\n').map((line,index)=>`${markdownActions[action].prefix(index)}${line}`).join('\n');
  if(selection.empty && action!=='table')insert=`${from && doc.sliceString(from-1,from)!=='\n'?'\n':''}${insert}${to<doc.length && doc.sliceString(to,to+1)!=='\n'?'\n':''}`;
  view.dispatch({changes:{from,to,insert},selection:{anchor:from+insert.length},scrollIntoView:true,userEvent:'input.markdown-format'});
  view.focus();return true;
}
