import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import postcss from 'postcss';
import {transform} from 'esbuild';
import safeParser from 'postcss-safe-parser';
import selectorParser from 'postcss-selector-parser';
const root=':where(#document.markdown-rendered, #explanation-answer.markdown-rendered)';
const sources=['blue-topaz.css','notation-purple.css'];
let personalCSS='';
let output=`
:where(#document,#explanation-answer).markdown-rendered table{border-collapse:collapse;margin:1em 0;max-width:100%;font-variant-numeric:tabular-nums}
:where(#document,#explanation-answer).markdown-rendered :is(th,td){border:1px solid var(--edge);padding:8px 14px}
:where(#document,#explanation-answer).markdown-rendered th{font-weight:650;background:var(--surface)}
:where(#document,#explanation-answer).markdown-rendered .task-list-item-checkbox:checked::after{content:'';position:absolute;display:block;mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='black' d='m5 12 4 4L19 6l2 2L9 20l-6-6z'/%3E%3C/svg%3E") center/65% no-repeat}
`;
for(const name of sources){
 const source=readFileSync(new URL(`assets/obsidian/${name}`,import.meta.url),'utf8');
 // Obsidian-only decorative assets include malformed SVG URLs in this theme.
 // Keep originals intact; omit those declarations from the browser adaptation.
 const cleaned=name==='notation-purple.css'?source:source.replace(/^.*(?:url\(|@import|^[ \t]*content\s*:).*$/gm,'').replace(/and\(/g,'and (');
 const css=name==='notation-purple.css'?postcss.parse(cleaned):safeParser(cleaned);
 css.walkAtRules('import',r=>r.remove());
 css.walk(node=>{node.raws={};});
 css.walkComments(node=>{if(!/MIT License|Copyright|Partial style|sourced or adapted/.test(node.text))node.remove();});
 css.walkRules(rule=>{
   if(!rule.selector?.trim()){rule.remove();return;}
   if(rule.parent?.type==='atrule' && /keyframes$/i.test(rule.parent.name))return;
   rule.selector=rule.selector.replace(/(?:body|html|:root)\s+(?::is\(\.markdown-rendered,\s*\.markdown-source-view\)|\.markdown-rendered|\.markdown-preview-view)/g,'.markdown-rendered');
   try{rule.selector=selectorParser(selectors=>selectors.each(selector=>{
     let anchored=false;
     selector.walk(node=>{
       if((node.type==='tag' && ['body','html'].includes(node.value)) || (node.type==='pseudo' && node.value===':root')){node.replaceWith(selectorParser.pseudo({value:root}));anchored=true;}
     });
     // Obsidian root classes must apply to the preview itself, not the host body.
     const first=selector.nodes[0];
     if(!anchored && first?.type==='class' && ['theme-light','theme-dark','markdown-rendered','markdown-preview-view','markdown-reading-view'].includes(first.value)){first.spaces.before='';selector.prepend(selectorParser.pseudo({value:root}));anchored=true;}
     if(!anchored){selector.prepend(selectorParser.combinator({value:' '}));selector.prepend(selectorParser.pseudo({value:root}));}
   })).processSync(rule.selector);}catch{rule.remove();}
 });
 const rules=await Promise.all(css.nodes.map(async node=>{const result=await transform(node.toString(),{loader:'css',minify:true,logLevel:'silent'});return result.warnings.length?'':result.code;}));
 const adapted=`/* ${name}: copied from the user's active Obsidian configuration */\n`+rules.join('\n');
 if(name==='notation-purple.css')personalCSS=adapted;else output+=adapted;
}
let katex=readFileSync(new URL('node_modules/katex/dist/katex.min.css',import.meta.url),'utf8');
katex=katex.replace(/,url\(fonts\/[^)]+\.woff\) format\("woff"\)|,url\(fonts\/[^)]+\.ttf\) format\("truetype"\)/g,'');
katex=katex.replace(/url\((fonts\/[^)]+)\)/g,(_,name)=>`url(data:font/${name.endsWith('.woff2')?'woff2':name.endsWith('.woff')?'woff':'ttf'};base64,${readFileSync(new URL(`node_modules/katex/dist/${name}`,import.meta.url)).toString('base64')})`);
output+=katex+readFileSync(new URL('node_modules/highlight.js/styles/github.css',import.meta.url),'utf8');
output+=`\n#document.markdown-rendered{--font-text:system-ui,sans-serif;--font-monospace:ui-monospace,monospace;--text-normal:var(--fg);--background-primary:var(--bg);--text-muted:var(--muted);--interactive-accent:#6158df;--text-accent:var(--notation-purple);--text-faint:var(--muted);--checkbox-size:16px;--checkbox-border-color:#9aa0a6;--tag-size:0.9em;font-size:calc(14px * var(--text-scale,1));line-height:1.5;color:var(--fg);background:var(--bg)}
#document.markdown-rendered p{margin-block:.6em}#document.markdown-rendered :is(ul,ol){margin-block:.5em}#document.markdown-rendered li>p{margin-block:.2em}#document.markdown-rendered img{max-width:100%;height:auto}#document.markdown-rendered .callout{margin:1em 0}#document.markdown-rendered .callout-title{font-weight:650;cursor:pointer}#document.markdown-rendered .task-list-item{list-style:none;margin:.15em 0;padding-left:0}#document.markdown-rendered .task-list-item>p{display:inline;margin:0}#document.markdown-rendered .task-list-item-checkbox{vertical-align:middle;flex-shrink:0;cursor:pointer;opacity:1}#document.markdown-rendered .task-list-item-checkbox{margin-right:8px}#document.markdown-rendered mark:not([data-annotation]){background:#ffd99a;color:inherit}#document.markdown-rendered .image-embed.internal-embed{border:0;padding:0;display:inline-block;max-width:100%}#document.markdown-rendered .internal-embed{border:1px solid var(--edge);border-radius:8px;padding:12px;display:block}#document.markdown-rendered .mermaid svg{max-width:100%;height:auto}#document.markdown-rendered .metadata{font:12px ui-monospace,monospace;white-space:pre-wrap;color:var(--muted)}
`;
for(const [state,symbol] of Object.entries({'+':'+',B:'✦',a:'◷',n:'▤',R:'↻',t:'◴',L:'♥'}))output+=`
#document.markdown-rendered input.task-list-item-checkbox[data-task="${state}"]{border:0;border-radius:0;background:transparent}#document.markdown-rendered input.task-list-item-checkbox[data-task="${state}"]::after{content:"${symbol}";display:block;position:absolute;inset:0;line-height:16px;text-align:center;color:var(--notation-purple);font:700 16px/16px system-ui;mask:none;background:transparent}`;
output+='\n'+readFileSync(new URL('node_modules/highlight.js/styles/github.css',import.meta.url),'utf8').replace(/(^|})([^{}]+)\{/g,(_m,end,selectors)=>end+selectors.split(',').map(selector=>'#document '+selector.trim()).join(',')+'{');
// Live Preview widgets are independent rendering roots, just like the reading view.

output+=`
#document :is(.cm-markdown-preview),#document.markdown-rendered{line-height:1.65}
#document .cm-content[aria-label="Markdown live editor"]{line-height:1.65!important}
#document :is(.cm-markdown-preview) p,#document.markdown-rendered p{margin-block:.4em!important;line-height:1.65}
#document :is(.cm-markdown-preview) :is(ul,ol),#document.markdown-rendered :is(ul,ol){margin-block:.35em!important}
#document .cm-markdown-preview{overflow-x:auto;font-family:system-ui,sans-serif}
#document .cm-markdown-preview.cm-markdown-math{overflow:visible}
#document :is(.katex-display,.cm-markdown-math .katex-display){overflow:visible}
#document .cm-content[aria-label="Markdown live editor"] .cm-markdown-gap{min-height:1.65em!important;line-height:1.65!important;font-size:inherit!important}
#document .cm-markdown-preview table{display:table!important}
#document .cm-markdown-table-row table{max-width:none!important;margin:0!important;border-bottom:0!important}
#document .cm-markdown-table-row[data-row-stripe=even] tbody tr{background:var(--surface)!important}
#document .cm-markdown-table-row[data-row-stripe=odd] tbody tr{background:var(--bg)!important}
#document :is(.cm-markdown-preview) table,#document.markdown-rendered table{border-collapse:collapse!important;border-spacing:0!important;margin:.5em 0!important;width:auto;max-width:100%;font-variant-numeric:tabular-nums;border:0!important;border-bottom:0!important;box-shadow:none!important}
#document :is(.cm-markdown-preview) :is(th,td),#document.markdown-rendered :is(th,td){padding:3px 10px!important;line-height:1.5!important;height:auto!important;border:0!important;white-space:nowrap;font-size:inherit}
#document :is(.cm-markdown-preview) th,#document.markdown-rendered th{background:var(--markatlas-accent-soft,color-mix(in srgb,#1687d9 10%,var(--bg)))!important;color:var(--fg)!important;font-weight:650}
#document :is(.cm-markdown-preview) tbody tr:nth-child(odd),#document.markdown-rendered tbody tr:nth-child(odd){background:var(--bg)!important}
#document :is(.cm-markdown-preview) tbody tr:nth-child(even),#document.markdown-rendered tbody tr:nth-child(even){background:var(--surface)!important}
#document :is(.cm-markdown-preview) td,#document.markdown-rendered td{background:transparent!important}
:root[data-theme=dark] #document :is(th){background:var(--markatlas-accent-soft,color-mix(in srgb,#1687d9 18%,var(--bg)))!important}
`;
// Each Live Preview list line/table row is a separate rendering root.
// Override whole-block spacing with equal specificity after the common rules.
output+=`
#document .cm-markdown-preview.markdown-rendered> :is(ul,ol),
#document .cm-markdown-preview.markdown-rendered :is(li,li>p){margin-block:0!important;padding-block:0!important;line-height:1.65!important}
#document.markdown-rendered :is(li,li>p){margin-block:0!important;padding-block:0!important;line-height:1.65!important}
#document .cm-markdown-preview.markdown-rendered> :first-child{margin-top:0!important}
#document .cm-markdown-preview.markdown-rendered> :last-child{margin-bottom:0!important}
#document .cm-markdown-preview.cm-markdown-table-row table{margin:0!important;border-bottom:0!important}
#document .cm-markdown-preview.cm-markdown-table-row[data-row-stripe=even] tbody tr{background:var(--surface)!important}
#document .cm-markdown-preview.cm-markdown-table-row[data-row-stripe=odd] tbody tr{background:var(--bg)!important}
#document :is(.cm-markdown-preview.markdown-rendered) :is(th,td),#document.markdown-rendered :is(th,td){padding:3px 10px!important;line-height:1.5!important}
#document :is(.cm-markdown-preview.markdown-rendered) th,#document.markdown-rendered th{text-align:left}
#document :is(.cm-markdown-preview.markdown-rendered) :is(h1,h2,h3,h4,h5,h6),#document.markdown-rendered :is(h1,h2,h3,h4,h5,h6){line-height:1.3;color:var(--fg)}
`;
for(const [index,size] of [1.65,1.5,1.35,1.22,1.12,1.06].entries())output+=`\n#document :is(.cm-markdown-preview.markdown-rendered) h${index+1},#document.markdown-rendered h${index+1}{font-size:${size}em!important;font-weight:650}`;
output+=`
#document .metadata-properties{font:calc(14px * var(--text-scale,1))/1.5 system-ui,sans-serif!important;white-space:normal!important;color:var(--fg)!important;margin:0 0 16px;padding:4px 0;max-width:760px}
#document .metadata-properties>summary{font-size:1.05em;font-weight:600;cursor:pointer;margin-bottom:10px;list-style:none}
#document .metadata-properties>summary::-webkit-details-marker{display:none}
#document .metadata-properties dl{display:grid;grid-template-columns:minmax(90px,28%) minmax(0,1fr);gap:8px 14px;margin:0;align-items:start}
#document .metadata-properties dt{display:flex;align-items:center;gap:9px;color:var(--muted);margin:0;min-height:26px;overflow-wrap:anywhere}
#document .metadata-properties dt svg{width:17px;height:17px;flex:none}
#document .metadata-properties dd{display:flex;align-items:center;flex-wrap:wrap;gap:5px 8px;min-width:0;min-height:26px;margin:0;overflow-wrap:anywhere}
#document .metadata-properties .metadata-tag{color:var(--notation-tag-color,#7a4ce6);background:var(--notation-tag-bg,#f1edfc);border-radius:999px;padding:1px 10px}
#document .metadata-properties .metadata-chip{padding:1px 0}
#document .metadata-properties .metadata-value{white-space:pre-wrap}
`;
// Personal snippet is the final layer, after theme and viewer adaptations.
output+='\n'+personalCSS;
output+=`\n#document.markdown-rendered pre>code,#explanation-answer.markdown-rendered pre>code{color:var(--fg)!important}\n`;
output+=`\n#document.markdown-rendered mark:not([data-annotation]),#explanation-answer.markdown-rendered mark:not([data-annotation]){background:#ffd99a!important;color:inherit;border-radius:3px;padding-inline:2px}\n`;
output+=`
#document.markdown-rendered input.task-list-item-checkbox,#explanation-answer.markdown-rendered input.task-list-item-checkbox{--checkbox-size:min(1em,.8lh);font:inherit!important;width:var(--checkbox-size)!important;height:var(--checkbox-size)!important;min-width:0!important;min-height:0!important;padding:0!important;margin-block:0!important;vertical-align:-.12em!important;box-sizing:border-box!important}
#document.markdown-rendered input.task-list-item-checkbox::after,#explanation-answer.markdown-rendered input.task-list-item-checkbox::after{inset:0!important;width:100%!important;height:100%!important;font-size:1em!important;line-height:1!important}
#document.markdown-rendered input.task-list-item-checkbox:is([data-task="x"],[data-task="X"])::after,#explanation-answer.markdown-rendered input.task-list-item-checkbox:is([data-task="x"],[data-task="X"])::after{content:''!important;display:block!important;background:white!important;mask:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='black' d='m5 12 4 4L19 6l2 2L9 20l-6-6z'/%3E%3C/svg%3E") center/70% no-repeat!important}

`;

output+=`\n#document.markdown-rendered,#explanation-answer.markdown-rendered{--notation-emphasis:var(--markatlas-accent,#1687d9)}\n`;
// Shared wrapping and marker geometry for reading view and independent live widgets.
output+=`
#document.markdown-rendered table{display:table!important;table-layout:fixed!important;width:100%!important;max-width:100%!important;overflow:visible!important}
#document.markdown-rendered :is(th,td){min-width:0!important;width:auto!important;white-space:normal!important;overflow-wrap:anywhere!important;word-break:normal!important}
#document.markdown-rendered :is(th,td) :is(code,a){white-space:normal!important;overflow-wrap:anywhere!important}
#document .cm-markdown-table-row{overflow:visible!important;min-width:0}
#document.markdown-rendered :is(ul,ol){padding-inline-start:1.5em!important;list-style-position:outside!important}
#document.markdown-rendered li{position:relative;padding-inline-start:0!important}
#document.markdown-rendered ul>li{list-style:none!important}
#document.markdown-rendered ul>li:not(.task-list-item)::before{content:''!important;position:absolute;left:-1.2em;top:.7em;width:.4em;height:.4em;border-radius:50%;background:var(--muted);border:0!important;transform:none!important}
#document.markdown-rendered .task-list-item>input.task-list-item-checkbox,#document.markdown-rendered .task-list-item>p>input.task-list-item-checkbox{position:absolute!important;left:-1.5em!important;top:.325em!important;margin:0!important;float:none!important}
#document.markdown-rendered li>:is(ul,ol){position:relative;padding-inline-start:2em!important;margin-block:0!important}
#document.markdown-rendered li>:is(ul,ol)::before{content:'';position:absolute;left:-1em;top:0;bottom:0;border-left:1px solid var(--edge);pointer-events:none}
#document .cm-markdown-list-line{position:relative;overflow:visible!important}
#document .cm-list-indent-guide{position:absolute;top:0;bottom:0;border-left:1px solid var(--edge);pointer-events:none}
`;
output+=`
#document.markdown-rendered table tbody tr:hover>td{background:var(--markatlas-accent-soft,color-mix(in srgb,#1687d9 10%,var(--bg)))!important}
`;
output=output.replaceAll('#document.markdown-rendered',':is(#document.markdown-rendered,#document .cm-markdown-preview.markdown-rendered)');
mkdirSync(new URL('dist/',import.meta.url),{recursive:true});writeFileSync(new URL('dist/obsidian.css',import.meta.url),output);

